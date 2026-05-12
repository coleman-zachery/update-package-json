import semver from 'semver'
import {
  fetchPackument,
  getPreferredStableVersions,
  type VersionManifest,
} from '@/lib/npm'
import {
  type PackageJson,
} from '@/lib/package-json'
import {
  formatCompactSemverRange,
  formatVersionWindow,
} from '@/lib/semver-display'

export type DependencyExplorerContextSection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export interface DependencyExplorerDependencyEntry {
  key: string
  displayRange: string
  rawRange: string
  name: string
  optional: boolean
  matchesPackageVersion: boolean
}

export interface DependencyExplorerRow {
  key: string
  versions: string[]
  newestVersion: string
  oldestVersion: string
  engineNode: string
  engineNpm: string
  directDependencies: DependencyExplorerDependencyEntry[]
  dependencyValues: Record<string, string>
}

export interface DependencyExplorerReport {
  packageName: string
  latestVersion: string
  stableVersionCount: number
  currentVersion: string | null
  currentSections: DependencyExplorerContextSection[]
  majorSeries: number[]
  dependencyColumns: string[]
  rows: DependencyExplorerRow[]
}

const CONTEXT_SECTION_ORDER: DependencyExplorerContextSection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

export const DEPENDENCY_EXPLORER_SAME_VALUE = 'same'

function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getContextDependencySections(
  pkg: PackageJson,
  packageName: string,
): DependencyExplorerContextSection[] {
  return CONTEXT_SECTION_ORDER.filter(section => typeof pkg[section]?.[packageName] === 'string')
}

function getContextDependencyValue(
  pkg: PackageJson,
  packageName: string,
): string | null {
  for (const section of CONTEXT_SECTION_ORDER) {
    const value = pkg[section]?.[packageName]
    if (typeof value === 'string') {
      return value
    }
  }

  return null
}

function buildDependencyEntry(
  name: string,
  range: string,
  optional: boolean,
  packageVersion: string,
): DependencyExplorerDependencyEntry {
  const compactRange = (() => {
    try {
      return formatCompactSemverRange(range)
    } catch {
      return range
    }
  })()
  const matchesPackageVersion = semver.valid(range) === packageVersion

  return {
    key: `${name}:${range}:${optional ? 'optional' : 'direct'}`,
    displayRange: `${compactRange}${optional ? ' (optional)' : ''}`,
    rawRange: range,
    name,
    optional,
    matchesPackageVersion,
  }
}

function getDirectDependencies(
  manifest: VersionManifest,
  packageVersion: string,
): DependencyExplorerDependencyEntry[] {
  return [
    ...Object.entries(manifest.dependencies ?? {}).map(([name, range]) => buildDependencyEntry(name, range, false, packageVersion)),
    ...Object.entries(manifest.optionalDependencies ?? {}).map(([name, range]) => buildDependencyEntry(name, range, true, packageVersion)),
  ].sort((left, right) => left.name.localeCompare(right.name))
}

function getDistinctMajorSeries(versions: string[]): number[] {
  const majors = new Set<number>()

  for (const version of versions) {
    const parsed = semver.parse(version)
    if (parsed) {
      majors.add(parsed.major)
    }
  }

  return Array.from(majors).sort((left, right) => right - left)
}

function compareVersionsDescending(left: string, right: string): number {
  return semver.rcompare(left, right)
}

function getSignatureKey(
  manifest: VersionManifest,
  dependencyValues: Record<string, string>,
): string {
  return JSON.stringify({
    node: getTrimmedString(manifest.engines?.node),
    npm: getTrimmedString(manifest.engines?.npm),
    directDependencies: Object.entries(dependencyValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}:${value}`),
  })
}

export async function inspectDependencyPackage(
  packageName: string,
  pkg: PackageJson,
): Promise<DependencyExplorerReport> {
  const normalizedPackageName = packageName.trim()
  if (!normalizedPackageName) {
    throw new Error('Enter a package name to inspect.')
  }

  const packument = await fetchPackument(normalizedPackageName)
  const stableVersions = getPreferredStableVersions(packument)
  const latestVersion = packument['dist-tags']?.latest ?? stableVersions[0] ?? ''
  const rowsByKey = new Map<string, DependencyExplorerRow>()
  const dependencyColumns = new Set<string>()

  for (const version of stableVersions) {
    const manifest = packument.versions[version]
    if (!manifest) {
      continue
    }

    const directDependencies = getDirectDependencies(manifest, version)
    const dependencyValues = Object.fromEntries(
      directDependencies.map(entry => {
        dependencyColumns.add(entry.name)
        return [
          entry.name,
          entry.matchesPackageVersion ? DEPENDENCY_EXPLORER_SAME_VALUE : entry.displayRange,
        ]
      }),
    )
    const signatureKey = getSignatureKey(manifest, dependencyValues)
    const existing = rowsByKey.get(signatureKey)

    if (existing) {
      existing.versions.push(version)
      existing.oldestVersion = semver.lt(version, existing.oldestVersion) ? version : existing.oldestVersion
      continue
    }

    rowsByKey.set(signatureKey, {
      key: signatureKey,
      versions: [version],
      newestVersion: version,
      oldestVersion: version,
      engineNode: getTrimmedString(manifest.engines?.node) ? formatCompactSemverRange(getTrimmedString(manifest.engines?.node)) : '-',
      engineNpm: getTrimmedString(manifest.engines?.npm) ? formatCompactSemverRange(getTrimmedString(manifest.engines?.npm)) : '-',
      directDependencies,
      dependencyValues,
    })
  }

  const rows = Array.from(rowsByKey.values())
    .map(row => ({
      ...row,
      versions: [...row.versions].sort(compareVersionsDescending),
      newestVersion: [...row.versions].sort(compareVersionsDescending)[0] ?? row.newestVersion,
      oldestVersion: [...row.versions].sort((left, right) => semver.compare(left, right))[0] ?? row.oldestVersion,
    }))
    .sort((left, right) => compareVersionsDescending(left.newestVersion, right.newestVersion))

  return {
    packageName: packument.name,
    latestVersion,
    stableVersionCount: stableVersions.length,
    currentVersion: getContextDependencyValue(pkg, normalizedPackageName),
    currentSections: getContextDependencySections(pkg, normalizedPackageName),
    majorSeries: getDistinctMajorSeries(stableVersions),
    dependencyColumns: Array.from(dependencyColumns).sort((left, right) => left.localeCompare(right)),
    rows,
  }
}

export function getVisibleRowVersions(
  row: DependencyExplorerRow,
  visibleMajors: Set<number>,
): string[] {
  return row.versions.filter(version => {
    const parsed = semver.parse(version)
    return Boolean(parsed && visibleMajors.has(parsed.major))
  })
}

export function formatDependencyExplorerVersionWindow(versions: string[]): string {
  return formatVersionWindow(versions)
}
