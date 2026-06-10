import { fetchPackument, getPreferredStableVersions } from '@/lib/npm'
import { formatCompactSemverRange, formatVersionWindow } from '@/lib/semver-display'
import { getContextDependencySections, getContextDependencyValue } from './context'
import { finalizeRows, getDistinctMajorSeries, getSignatureKey, buildRowData } from './rows'
import type { DependencyExplorerReport, DependencyExplorerRow } from './types'

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
  const rowsByKey = new Map<string, DependencyExplorerRow>()
  const dependencyColumns = new Set<string>()

  for (const version of stableVersions) {
    try {
      const manifest = packument.versions[version]
      if (!manifest) continue
      const rowData = buildRowData(manifest, version)
      Object.keys(rowData.dependencyValues).forEach(name => dependencyColumns.add(name))
      const signatureKey = getSignatureKey(manifest, rowData.dependencyValues)
      const existing = rowsByKey.get(signatureKey)
      if (existing) {
        existing.versions.push(version)
        existing.oldestVersion = version < existing.oldestVersion ? version : existing.oldestVersion
        continue
      }
      rowsByKey.set(signatureKey, {
        key: signatureKey,
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

  return {
    packageName: packument.name,
    latestVersion,
    stableVersionCount: stableVersions.length,
    currentVersion: getContextDependencyValue(pkg, normalizedPackageName),
    currentSections: getContextDependencySections(pkg, normalizedPackageName),
    majorSeries: getDistinctMajorSeries(stableVersions),
    dependencyColumns: Array.from(dependencyColumns).sort((left, right) => left.localeCompare(right)),
    rows: finalizeRows(rowsByKey),
  }
}

export function formatDependencyExplorerVersionWindow(versions: string[]): string {
  return formatVersionWindow(versions)
}
