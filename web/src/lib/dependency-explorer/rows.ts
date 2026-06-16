import semver from 'semver'
import type { VersionManifest } from '@/lib/npm'
import { DEPENDENCY_EXPLORER_SAME_VALUE } from './constants'
import { getTrimmedString } from './context'
import { getDirectDependencies } from './dependencies'
import type { DependencyExplorerColumnKind, DependencyExplorerDependencyCell, DependencyExplorerRow } from './types'

const COLUMN_KIND_ORDER: Record<DependencyExplorerColumnKind, number> = {
  peer: 0,
  required: 1,
  optional: 2,
  platform: 3,
}

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
  dependencyCells: Record<string, DependencyExplorerDependencyCell>,
): string {
  return JSON.stringify({
    node: getTrimmedString(manifest.engines?.node),
    npm: getTrimmedString(manifest.engines?.npm),
    directDependencies: Object.entries(dependencyCells)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, cell]) => `${name}:${cell.value}:${cell.kinds.join('|')}`),
  })
}

export function buildRowData(manifest: VersionManifest, version: string) {
  const directDependencies = getDirectDependencies(manifest, version)
  const dependencyCellsByName = new Map<string, {
    kinds: Set<DependencyExplorerColumnKind>
    values: string[]
  }>()

  for (const entry of directDependencies) {
    const current = dependencyCellsByName.get(entry.columnKey) ?? {
      kinds: new Set<DependencyExplorerColumnKind>(),
      values: [],
    }

    for (const kind of entry.columnKinds) {
      current.kinds.add(kind)
    }

    const nextValue = entry.matchesPackageVersion ? DEPENDENCY_EXPLORER_SAME_VALUE : entry.displayRange
    if (!current.values.includes(nextValue)) {
      current.values.push(nextValue)
    }

    dependencyCellsByName.set(entry.columnKey, current)
  }

  const dependencyCells = Object.fromEntries(
    Array.from(dependencyCellsByName.entries()).map(([name, cell]) => {
      const orderedKinds = Array.from(cell.kinds).sort((left, right) => COLUMN_KIND_ORDER[left] - COLUMN_KIND_ORDER[right])
      const orderedValues = [...cell.values].sort((left, right) => {
        if (left === DEPENDENCY_EXPLORER_SAME_VALUE) {
          return -1
        }

        if (right === DEPENDENCY_EXPLORER_SAME_VALUE) {
          return 1
        }

        return left.localeCompare(right)
      })

      return [name, {
        value: orderedValues.join(' · '),
        kinds: orderedKinds,
      } satisfies DependencyExplorerDependencyCell]
    }),
  )

  return {
    directDependencies,
    dependencyCells,
    engineNode: getTrimmedString(manifest.engines?.node),
    engineNpm: getTrimmedString(manifest.engines?.npm),
  }
}

export function finalizeRows(rows: DependencyExplorerRow[]): DependencyExplorerRow[] {
  return rows.map(row => {
    const descending = [...row.versions].sort(compareVersionsDescending)
    return {
      ...row,
      versions: descending,
      newestVersion: descending[0] ?? row.newestVersion,
      oldestVersion: [...row.versions].sort((left, right) => semver.compare(left, right))[0] ?? row.oldestVersion,
    }
  })
}

export function getVisibleRowVersions(row: DependencyExplorerRow, visibleMajors: Set<number>): string[] {
  return row.versions.filter(version => {
    const parsed = semver.parse(version)
    return Boolean(parsed && visibleMajors.has(parsed.major))
  })
}
