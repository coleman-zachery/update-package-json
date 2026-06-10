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

export interface OsvBatchResponse {
  results?: Array<{
    vulns?: Array<{
      id: string
      summary?: string
      details?: string
      severity?: Array<{ type?: string; score?: string }>
      database_specific?: { severity?: string }
      ecosystem_specific?: { severity?: string }
      references?: Array<{ url?: string }>
    }>
  }>
}

export interface CachedAuditReport extends PackageAuditReport {
  fetchedAt: number
}
