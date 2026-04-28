export type AuditSeverity = 'low' | 'moderate' | 'high' | 'critical' | 'unknown'

export interface AuditRequest {
  name: string
  version: string
}

export interface PackageAuditAdvisory {
  id: string
  summary: string
  severity: AuditSeverity
  url?: string
}

export interface PackageAuditReport {
  name: string
  version: string
  advisories: PackageAuditAdvisory[]
}

interface OsvBatchResponse {
  results?: Array<{
    vulns?: Array<{
      id: string
      summary?: string
      details?: string
      severity?: Array<{ type?: string; score?: string }>
      database_specific?: {
        severity?: string
      }
      ecosystem_specific?: {
        severity?: string
      }
      references?: Array<{
        url?: string
      }>
    }>
  }>
}

interface CachedAuditReport extends PackageAuditReport {
  fetchedAt: number
}

const OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch'
const AUDIT_CACHE_TTL_MS = 60 * 60 * 1000
const AUDIT_BATCH_SIZE = 100

function getAuditCacheKey(name: string, version: string): string {
  return `osv-audit:${name}@${version}`
}

function getRequestKey(name: string, version: string): string {
  return `${name}@${version}`
}

function normalizeSeverity(value: string | undefined): AuditSeverity {
  switch (value?.trim().toLowerCase()) {
    case 'low':
      return 'low'
    case 'moderate':
    case 'medium':
      return 'moderate'
    case 'high':
      return 'high'
    case 'critical':
      return 'critical'
    default:
      return 'unknown'
  }
}

function getSeverityRank(severity: AuditSeverity): number {
  switch (severity) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'moderate':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function deriveSeverity(vuln: NonNullable<NonNullable<OsvBatchResponse['results']>[number]['vulns']>[number]): AuditSeverity {
  const normalizedDatabaseSeverity = normalizeSeverity(vuln.database_specific?.severity)
  if (normalizedDatabaseSeverity !== 'unknown') {
    return normalizedDatabaseSeverity
  }

  const normalizedEcosystemSeverity = normalizeSeverity(vuln.ecosystem_specific?.severity)
  if (normalizedEcosystemSeverity !== 'unknown') {
    return normalizedEcosystemSeverity
  }

  for (const entry of vuln.severity ?? []) {
    const score = Number.parseFloat(entry.score ?? '')
    if (Number.isNaN(score)) continue
    if (score >= 9) return 'critical'
    if (score >= 7) return 'high'
    if (score >= 4) return 'moderate'
    if (score > 0) return 'low'
  }

  return 'unknown'
}

function toPackageAuditReport(request: AuditRequest, result: NonNullable<OsvBatchResponse['results']>[number] | undefined): PackageAuditReport {
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

function readCachedReport(name: string, version: string): PackageAuditReport | null {
  try {
    const raw = localStorage.getItem(getAuditCacheKey(name, version))
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedAuditReport
    if (Date.now() - cached.fetchedAt > AUDIT_CACHE_TTL_MS) {
      localStorage.removeItem(getAuditCacheKey(name, version))
      return null
    }

    return {
      name: cached.name,
      version: cached.version,
      advisories: cached.advisories,
    }
  } catch {
    return null
  }
}

function writeCachedReport(report: PackageAuditReport) {
  try {
    const cached: CachedAuditReport = {
      ...report,
      fetchedAt: Date.now(),
    }
    localStorage.setItem(getAuditCacheKey(report.name, report.version), JSON.stringify(cached))
  } catch {
    // localStorage full or unavailable
  }
}

export async function fetchPackageAuditReports(
  requests: AuditRequest[],
): Promise<Map<string, PackageAuditReport>> {
  const reports = new Map<string, PackageAuditReport>()
  const dedupedRequests = Array.from(
    new Map(
      requests.map(request => [getRequestKey(request.name, request.version), request]),
    ).values(),
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: chunk.map(request => ({
          package: {
            ecosystem: 'npm',
            name: request.name,
          },
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
