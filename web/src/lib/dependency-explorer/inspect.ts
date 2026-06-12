import semver from 'semver'
import { fetchPackument, getPreferredStableVersions } from '@/lib/npm'
import { formatCompactSemverRange, formatVersionWindow } from '@/lib/semver-display'
import { newestSatisfying } from '@/lib/semver-utils'
import { getContextDependencySections, getContextDependencyValue } from './context'
import { buildRowData, finalizeRows, getDistinctMajorSeries, getSignatureKey } from './rows'
import type {
  DependencyExplorerColumn,
  DependencyExplorerColumnKind,
  DependencyExplorerReport,
  DependencyExplorerRow,
} from './types'

function createColumn(
  name: string,
): DependencyExplorerColumn {
  return {
    key: name,
    name,
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
  const columns = new Map<string, Set<DependencyExplorerColumnKind>>()
  let previousSignatureKey: string | null = null

  for (const version of stableVersions) {
    try {
      const manifest = packument.versions[version]
      if (!manifest) continue

      const rowData = buildRowData(manifest, version)
      for (const dependency of rowData.directDependencies) {
        const currentKinds = columns.get(dependency.name) ?? new Set<DependencyExplorerColumnKind>()
        for (const kind of dependency.columnKinds) {
          currentKinds.add(kind)
        }
        columns.set(dependency.name, currentKinds)
      }

      const signatureKey = getSignatureKey(manifest, rowData.dependencyCells)
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
        dependencyCells: rowData.dependencyCells,
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
    columns: Array.from(columns.keys())
      .sort((left, right) => left.localeCompare(right))
      .map(name => createColumn(name)),
    rows: finalizeRows(rows),
  }
}

export function formatDependencyExplorerVersionWindow(versions: string[]): string {
  return formatVersionWindow(versions)
}
