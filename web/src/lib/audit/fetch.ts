import { AUDIT_BATCH_SIZE, getRequestKey, OSV_QUERY_BATCH_URL } from './constants'
import { readCachedReport, writeCachedReport } from './cache'
import { toPackageAuditReport } from './report'
import type { AuditRequest, OsvBatchResponse, PackageAuditReport } from './types'

export async function fetchPackageAuditReports(
  requests: AuditRequest[],
): Promise<Map<string, PackageAuditReport>> {
  const reports = new Map<string, PackageAuditReport>()
  const dedupedRequests = Array.from(
    new Map(requests.map(request => [getRequestKey(request.name, request.version), request])).values(),
  )
  const uncached: AuditRequest[] = []

  for (const request of dedupedRequests) {
    const cached = readCachedReport(request.name, request.version)
    if (cached) {
      reports.set(getRequestKey(request.name, request.version), cached)
      continue
    }
    uncached.push(request)
  }

  for (let index = 0; index < uncached.length; index += AUDIT_BATCH_SIZE) {
    const chunk = uncached.slice(index, index + AUDIT_BATCH_SIZE)
    const response = await fetch(OSV_QUERY_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: chunk.map(request => ({
          package: { ecosystem: 'npm', name: request.name },
          version: request.version,
        })),
      }),
    })

    if (!response.ok) {
      throw new Error(`OSV query failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as OsvBatchResponse
    const results = Array.isArray(data.results) ? data.results : []

    for (const [resultIndex, request] of chunk.entries()) {
      const report = toPackageAuditReport(request, results[resultIndex])
      reports.set(getRequestKey(request.name, request.version), report)
      writeCachedReport(report)
    }
  }

  return reports
}
