import semver from 'semver'
import { fetchPackument, getPreferredStableVersions } from '@/lib/npm'
import { formatCompactSemverRange, formatVersionWindow } from '@/lib/semver-display'
import { newestSatisfying } from '@/lib/semver-utils'
import { getContextDependencySections, getContextDependencyValue } from './context'
import { buildRowData, finalizeRows, getDistinctMajorSeries, getSignatureKey } from './rows'
import type {
  DependencyExplorerColumn,
  DependencyExplorerPlatformDependency,
  DependencyExplorerReport,
  DependencyExplorerRow,
} from './types'

function createColumn(
  name: string,
  kind: DependencyExplorerColumn['kind'],
): DependencyExplorerColumn {
  return {
    key: `${kind}:${name}`,
    name,
    kind,
  }
}

export async function inspectDependencyPackage(
  packageName: string,
  pkg: Parameters<typeof getContextDependencySections>[0],
): Promise<DependencyExplorerReport> {
  const normalizedPackageName = packageName.trim()
  if (!normalizedPackageName) {
    throw new Error('Enter a package name to inspect.')
  }

  const packument = await fetchPackument(normalizedPackageName)
  const stableVersions = getPreferredStableVersions(packument)
  const latestVersion = stableVersions[0] ?? packument['dist-tags']?.latest ?? ''
  const currentVersion = getContextDependencyValue(pkg, normalizedPackageName)
  const rows: DependencyExplorerRow[] = []
  const dependencyColumns = new Set<string>()
  const requiredPeerColumns = new Set<string>()
  const optionalDependencyColumns = new Set<string>()
  const platformDependencies = new Map<string, string[]>()
  let previousSignatureKey: string | null = null

  for (const version of stableVersions) {
    try {
      const manifest = packument.versions[version]
      if (!manifest) continue

      const rowData = buildRowData(manifest, version)
      for (const dependency of rowData.directDependencies) {
        if (dependency.kind === 'dependency') {
          dependencyColumns.add(dependency.name)
        } else if (dependency.kind === 'peer-required') {
          requiredPeerColumns.add(dependency.name)
        } else if (dependency.kind === 'optional') {
          optionalDependencyColumns.add(dependency.name)
        } else if (dependency.kind === 'platform-optional') {
          const versions = platformDependencies.get(dependency.name) ?? []
          versions.push(version)
          platformDependencies.set(dependency.name, versions)
        }
      }

      const signatureKey = getSignatureKey(manifest, rowData.dependencyValues)
      if (previousSignatureKey === signatureKey) {
        const previousRow = rows[rows.length - 1]
        if (previousRow) {
          previousRow.versions.push(version)
          previousRow.oldestVersion = version
          continue
        }
      }

      previousSignatureKey = signatureKey
      rows.push({
        key: `${signatureKey}:${rows.length}`,
        versions: [version],
        newestVersion: version,
        oldestVersion: version,
        engineNode: rowData.engineNode ? formatCompactSemverRange(rowData.engineNode) : '-',
        engineNpm: rowData.engineNpm ? formatCompactSemverRange(rowData.engineNpm) : '-',
        directDependencies: rowData.directDependencies,
        dependencyValues: rowData.dependencyValues,
      })
    } catch {
      continue
    }
  }

  const currentResolvedVersion = currentVersion && semver.validRange(currentVersion)
    ? newestSatisfying(stableVersions, currentVersion)
    : null

  return {
    packageName: packument.name,
    latestVersion,
    stableVersionCount: stableVersions.length,
    currentVersion,
    currentResolvedVersion,
    currentSections: getContextDependencySections(pkg, normalizedPackageName),
    majorSeries: getDistinctMajorSeries(stableVersions),
    dependencyColumns: Array.from(dependencyColumns)
      .sort((left, right) => left.localeCompare(right))
      .map(name => createColumn(name, 'dependency')),
    requiredPeerColumns: Array.from(requiredPeerColumns)
      .sort((left, right) => left.localeCompare(right))
      .map(name => createColumn(name, 'peer-required')),
    optionalDependencyColumns: Array.from(optionalDependencyColumns)
      .sort((left, right) => left.localeCompare(right))
      .map(name => createColumn(name, 'optional')),
    platformDependencies: Array.from(platformDependencies.entries())
      .map(([name, versions]) => ({
        name,
        versions: [...versions],
      } satisfies DependencyExplorerPlatformDependency))
      .sort((left, right) => left.name.localeCompare(right.name)),
    rows: finalizeRows(rows),
  }
}

export function formatDependencyExplorerVersionWindow(versions: string[]): string {
  return formatVersionWindow(versions)
}
