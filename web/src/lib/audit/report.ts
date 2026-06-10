import { getSeverityRank, deriveSeverity } from './severity'
import type { AuditRequest, OsvBatchResponse, PackageAuditReport } from './types'

export function toPackageAuditReport(
  request: AuditRequest,
  result: NonNullable<OsvBatchResponse['results']>[number] | undefined,
): PackageAuditReport {
  const advisories = (result?.vulns ?? [])
    .map(vuln => ({
      id: vuln.id,
      summary: vuln.summary?.trim() || vuln.details?.trim() || vuln.id,
      severity: deriveSeverity(vuln),
      url: vuln.references?.find(reference => typeof reference.url === 'string' && reference.url.length > 0)?.url,
    }))
    .sort((left, right) => {
      const severityDelta = getSeverityRank(right.severity) - getSeverityRank(left.severity)
      return severityDelta !== 0 ? severityDelta : left.id.localeCompare(right.id)
    })

  return {
    name: request.name,
    version: request.version,
    advisories,
  }
}
