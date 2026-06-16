import semver from 'semver'
import { parsePackageJson, parsePackageManager } from '@/lib/package-json'
import { fetchNodeVersions, fetchPackument, getAllVersions } from '@/lib/npm'
import { filterStable, newestSatisfying } from '@/lib/semver-utils'
import { formatEngineIssue, formatNpmAlignmentWarning, formatPackageManagerIssue } from './messages'
import { getTrimmedString, hasMisalignedNpmSupport } from './package-manager'
import { isAbortError, throwIfAborted } from './abort'
import type { EngineName, EngineValidationIssue, InputValidationState, PackageManagerValidationIssue } from './types'

async function validateDeclaredEngine(
  engineName: EngineName,
  value: string | undefined,
  signal?: AbortSignal,
): Promise<EngineValidationIssue | null> {
  throwIfAborted(signal)
  if (!value) return null
  if (!semver.validRange(value)) return { engine: engineName, value, kind: 'invalid-range' }

  try {
    const versions = engineName === 'node'
      ? await fetchNodeVersions(signal)
      : filterStable(getAllVersions(await fetchPackument('npm', signal)))
    if (!newestSatisfying(versions, value)) {
      return { engine: engineName, value, kind: 'no-published-version' }
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    // ignore validation fetch failures
  }

  return null
}

export async function validateDeclaredEngines(
  rootNode: string | undefined,
  rootNpm: string | undefined,
  signal?: AbortSignal,
): Promise<EngineValidationIssue[]> {
  const issues = await Promise.all([
    validateDeclaredEngine('node', rootNode, signal),
    validateDeclaredEngine('npm', rootNpm, signal),
  ])
  return issues.filter((issue): issue is EngineValidationIssue => Boolean(issue))
}

export async function validateDeclaredPackageManager(value: unknown, signal?: AbortSignal): Promise<PackageManagerValidationIssue | null> {
  throwIfAborted(signal)
  const raw = getTrimmedString(value)
  if (!raw) return null

  const parsed = parsePackageManager(raw)
  if (!parsed?.name || !parsed.version) return { value: raw, kind: 'invalid-format' }
  if (parsed.name !== 'npm') return { value: raw, kind: 'unsupported-manager' }
  if (!semver.valid(parsed.version)) return { value: raw, kind: 'invalid-version' }

  try {
    const npmVersions = filterStable(getAllVersions(await fetchPackument('npm', signal)))
    if (!npmVersions.includes(parsed.version)) {
      return { value: raw, kind: 'no-published-version' }
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    // ignore validation fetch failures
  }

  return null
}

export async function validatePackageJsonInput(raw: string): Promise<InputValidationState> {
  if (!raw.trim()) return { errors: [], warnings: [], engineIssues: [] }

  try {
    const pkg = parsePackageJson(raw)
    const engineIssues = await validateDeclaredEngines(pkg.engines?.node, pkg.engines?.npm)
    const packageManagerIssue = await validateDeclaredPackageManager(pkg.packageManager)
    const warnings = [
      ...engineIssues.map(issue => formatEngineIssue(issue)),
      ...(packageManagerIssue ? [formatPackageManagerIssue(packageManagerIssue)] : []),
    ]

    if (hasMisalignedNpmSupport(pkg, packageManagerIssue)) {
      warnings.push(formatNpmAlignmentWarning(getTrimmedString(pkg.engines?.npm), getTrimmedString(pkg.packageManager)))
    }

    return { errors: [], warnings, engineIssues }
  } catch (e) {
    return {
      errors: [e instanceof Error ? e.message : String(e)],
      warnings: [],
      engineIssues: [],
    }
  }
}
