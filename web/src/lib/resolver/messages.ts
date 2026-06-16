import type { PackageAuditReport } from '@/lib/audit'
import type { AuditStatus, EngineValidationIssue, PackageManagerValidationIssue } from './types'

export function createUnavailableAuditStatus(detail?: string): AuditStatus {
  return {
    state: 'warning',
    summary: 'Audit status could not be fully verified',
    details: [detail || 'The OSV audit service could not be reached while resolving package versions.'],
    warnings: 1,
    vulnerabilities: 0,
    recommendedUnfreezeNames: [],
    recommendedRemovalNames: [],
  }
}

export function formatAuditFinding(report: PackageAuditReport): string {
  const advisoryLabels = report.advisories.slice(0, 2).map(advisory => advisory.id).join(', ')
  const advisorySuffix = report.advisories.length > 2 ? ', ...' : ''
  return `${report.name}@${report.version}: ${report.advisories.length} advisories (${advisoryLabels}${advisorySuffix})`
}

export function formatEngineIssue(issue: EngineValidationIssue, overrideLatest?: string): string {
  const target = issue.engine === 'node' ? 'Node.js' : 'npm'
  const base = issue.kind === 'invalid-range'
    ? `engines.${issue.engine} "${issue.value}" is not a valid semver range`
    : `engines.${issue.engine} "${issue.value}" does not match any published ${target} version`
  return overrideLatest ? `using ${issue.engine} latest ${overrideLatest}. ${base}` : base
}

export function formatPackageManagerIssue(
  issue: PackageManagerValidationIssue,
  overrideLatest?: string,
): string {
  const base = issue.kind === 'invalid-format'
    ? `packageManager "${issue.value}" must look like "npm@x.y.z"`
    : issue.kind === 'unsupported-manager'
      ? `packageManager "${issue.value}" is not an npm packageManager declaration`
      : issue.kind === 'invalid-version'
        ? `packageManager "${issue.value}" must pin an exact npm version like "npm@11.7.0"`
        : `packageManager "${issue.value}" does not match any published npm version`
  return overrideLatest ? `using npm latest ${overrideLatest}. ${base}` : base
}

export function formatNpmAlignmentWarning(engineNpm: string, packageManager: string): string {
  return `engines.npm "${engineNpm}" and packageManager "${packageManager}" are misaligned; packageManager should satisfy engines.npm`
}

export function formatOutputNpmAlignmentWarning(engineNpm: string, packageManager: string): string {
  return `output packageManager "${packageManager}" does not satisfy engines.npm "${engineNpm}"`
}
