import { isNpmSupportAligned, isPinnedNpmVersion, parsePackageManager, type PackageJson } from '@/lib/package-json'
import type { DeclaredNpmValue, EngineValidationIssue, PackageManagerValidationIssue } from './types'

export function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getPinnedPackageManagerVersion(value: unknown): string | null {
  const parsed = parsePackageManager(value)
  if (parsed?.name !== 'npm' || !parsed.version || !isPinnedNpmVersion(parsed.version)) {
    return null
  }
  return parsed.version
}

export function hasMisalignedNpmSupport(
  pkg: PackageJson,
  packageManagerIssue: PackageManagerValidationIssue | null,
): boolean {
  const engineNpm = getTrimmedString(pkg.engines?.npm)
  const packageManager = getTrimmedString(pkg.packageManager)
  if (!engineNpm || !packageManager || packageManagerIssue) {
    return false
  }
  return !isNpmSupportAligned(engineNpm, packageManager)
}

export function selectDeclaredNpmValue(
  pkg: PackageJson,
  engineIssues: EngineValidationIssue[],
  packageManagerIssue: PackageManagerValidationIssue | null,
): DeclaredNpmValue {
  const engineNpm = getTrimmedString(pkg.engines?.npm)
  const parsedPackageManager = parsePackageManager(pkg.packageManager)
  const packageManagerNpm = parsedPackageManager?.name === 'npm' ? parsedPackageManager.version : null
  const npmEngineIssue = engineIssues.find(issue => issue.engine === 'npm')

  if (engineNpm && !npmEngineIssue) return { value: engineNpm, source: 'engines.npm' }
  if (packageManagerNpm && !packageManagerIssue) return { value: packageManagerNpm, source: 'packageManager' }
  if (engineNpm) return { value: engineNpm, source: 'engines.npm' }
  if (packageManagerNpm) return { value: packageManagerNpm, source: 'packageManager' }
  return { value: undefined, source: null }
}
