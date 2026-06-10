import semver from 'semver'
import type { VersionManifest } from '@/lib/npm'
import { formatCompactSemverRange } from '@/lib/semver-display'
import type { DependencyExplorerDependencyEntry } from './types'

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
  optional: boolean,
  packageVersion: string,
): DependencyExplorerDependencyEntry {
  const compactRange = safeFormatCompactSemverRange(range)
  return {
    key: `${name}:${range}:${optional ? 'optional' : 'direct'}`,
    displayRange: `${compactRange}${optional ? ' (optional)' : ''}`,
    rawRange: range,
    name,
    optional,
    matchesPackageVersion: semver.valid(range) === packageVersion,
  }
}

export function getDirectDependencies(
  manifest: VersionManifest,
  packageVersion: string,
): DependencyExplorerDependencyEntry[] {
  return [
    ...Object.entries(manifest.dependencies ?? {}).map(([name, range]) => buildDependencyEntry(name, range, false, packageVersion)),
    ...Object.entries(manifest.optionalDependencies ?? {}).map(([name, range]) => buildDependencyEntry(name, range, true, packageVersion)),
  ].sort((left, right) => left.name.localeCompare(right.name))
}
