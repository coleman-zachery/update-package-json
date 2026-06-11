import semver from 'semver'
import type { VersionManifest } from '@/lib/npm'
import { formatCompactSemverRange } from '@/lib/semver-display'
import { extractPlatformSuffix } from '@/lib/resolver/platform-targets'
import type { DependencyExplorerDependencyEntry, DependencyExplorerDependencyKind } from './types'

function safeFormatCompactSemverRange(range: string): string {
  try {
    return formatCompactSemverRange(range)
  } catch {
    return range
  }
}

function buildDependencyEntry(
  name: string,
  range: string,
  kind: DependencyExplorerDependencyKind,
  packageVersion: string,
): DependencyExplorerDependencyEntry {
  const compactRange = safeFormatCompactSemverRange(range)
  return {
    key: `${kind}:${name}:${range}`,
    columnKey: `${kind}:${name}`,
    displayRange: compactRange,
    rawRange: range,
    name,
    kind,
    matchesPackageVersion: semver.valid(range) === packageVersion,
  }
}

export function getDirectDependencies(
  manifest: VersionManifest,
  packageVersion: string,
): DependencyExplorerDependencyEntry[] {
  return [
    ...Object.entries(manifest.peerDependencies ?? {}).map(([name, range]) => buildDependencyEntry(
      name,
      range,
      manifest.peerDependenciesMeta?.[name]?.optional === true ? 'peer-optional' : 'peer-required',
      packageVersion,
    )),
    ...Object.entries(manifest.dependencies ?? {}).map(([name, range]) => buildDependencyEntry(
      name,
      range,
      'dependency',
      packageVersion,
    )),
    ...Object.entries(manifest.optionalDependencies ?? {}).map(([name, range]) => buildDependencyEntry(
      name,
      range,
      extractPlatformSuffix(name) ? 'platform-optional' : 'optional',
      packageVersion,
    )),
  ].sort((left, right) => {
    const kindOrder: Record<DependencyExplorerDependencyKind, number> = {
      'peer-required': 0,
      dependency: 1,
      optional: 2,
      'peer-optional': 3,
      'platform-optional': 4,
    }

    if (kindOrder[left.kind] !== kindOrder[right.kind]) {
      return kindOrder[left.kind] - kindOrder[right.kind]
    }

    return left.name.localeCompare(right.name)
  })
}
