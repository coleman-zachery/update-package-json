import { getSeverityRank, deriveSeverity } from './severity'
import { toOsvSemverRanges } from './ranges'
import type { AuditRequest, OsvBatchResponse, PackageAuditReport } from './types'

function getAffectedRanges(
  request: AuditRequest,
  vuln: NonNullable<NonNullable<OsvBatchResponse['results']>[number]['vulns']>[number],
): string[] {
  return (vuln.affected ?? [])
    .filter(affected => affected.package?.ecosystem === 'npm' && affected.package?.name === request.name)
    .flatMap(affected => (affected.ranges ?? []))
    .filter(range => range.type === 'SEMVER')
    .flatMap(range => toOsvSemverRanges(range.events))
}

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
      affectedRanges: getAffectedRanges(request, vuln),
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
