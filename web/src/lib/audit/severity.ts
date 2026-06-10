import type { AuditSeverity, OsvBatchResponse } from './types'

type OsvVuln = NonNullable<NonNullable<OsvBatchResponse['results']>[number]['vulns']>[number]

export function normalizeSeverity(value: string | undefined): AuditSeverity {
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

export function getSeverityRank(severity: AuditSeverity): number {
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

export function deriveSeverity(vuln: OsvVuln): AuditSeverity {
  const normalizedDatabaseSeverity = normalizeSeverity(vuln.database_specific?.severity)
  if (normalizedDatabaseSeverity !== 'unknown') return normalizedDatabaseSeverity

  const normalizedEcosystemSeverity = normalizeSeverity(vuln.ecosystem_specific?.severity)
  if (normalizedEcosystemSeverity !== 'unknown') return normalizedEcosystemSeverity

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
