import semver from 'semver'
import type { VersionManifest } from '@/lib/npm'
import { DEPENDENCY_EXPLORER_SAME_VALUE } from './constants'
import { getTrimmedString } from './context'
import { getDirectDependencies } from './dependencies'
import type { DependencyExplorerRow } from './types'

export function getDistinctMajorSeries(versions: string[]): number[] {
  const majors = new Set<number>()
  for (const version of versions) {
    const parsed = semver.parse(version)
    if (parsed) majors.add(parsed.major)
  }
  return Array.from(majors).sort((left, right) => right - left)
}

export function compareVersionsDescending(left: string, right: string): number {
  return semver.rcompare(left, right)
}

export function getSignatureKey(
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

export function buildRowData(manifest: VersionManifest, version: string) {
  const directDependencies = getDirectDependencies(manifest, version)
  const dependencyValues = Object.fromEntries(directDependencies.map(entry => [
    entry.name,
    entry.matchesPackageVersion ? DEPENDENCY_EXPLORER_SAME_VALUE : entry.displayRange,
  ]))

  return {
    directDependencies,
    dependencyValues,
    engineNode: getTrimmedString(manifest.engines?.node),
    engineNpm: getTrimmedString(manifest.engines?.npm),
  }
}

export function finalizeRows(rowsByKey: Map<string, DependencyExplorerRow>): DependencyExplorerRow[] {
  return Array.from(rowsByKey.values())
    .map(row => {
      const descending = [...row.versions].sort(compareVersionsDescending)
      return {
        ...row,
        versions: descending,
        newestVersion: descending[0] ?? row.newestVersion,
        oldestVersion: [...row.versions].sort((left, right) => semver.compare(left, right))[0] ?? row.oldestVersion,
      }
    })
    .sort((left, right) => compareVersionsDescending(left.newestVersion, right.newestVersion))
}

export function getVisibleRowVersions(row: DependencyExplorerRow, visibleMajors: Set<number>): string[] {
  return row.versions.filter(version => {
    const parsed = semver.parse(version)
    return Boolean(parsed && visibleMajors.has(parsed.major))
  })
}
