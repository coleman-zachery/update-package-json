import semver from 'semver'
import { getRestrictionKey, type RestrictionState } from '@/lib/restrictions'
import { filterStable } from '@/lib/semver-utils'
import type { DependencySection, PackageState } from './types'
import type { VersionManifest } from '@/lib/npm'

const SECTION_PRIORITY: Record<DependencySection, number> = {
  dependencies: 3,
  devDependencies: 2,
  peerDependencies: 1,
}

export function normalizeResolvedVersion(range: string): string {
  return range.replace(/^[\^~]/, '').trim()
}

export function isMeaningfulDependencyChange(previousValue: string | undefined, nextValue: string): boolean {
  return !previousValue || normalizeResolvedVersion(previousValue) !== normalizeResolvedVersion(nextValue)
}

export function getPreferredSection(current: DependencySection, candidate: DependencySection): DependencySection {
  return SECTION_PRIORITY[candidate] > SECTION_PRIORITY[current] ? candidate : current
}

export function getRestrictionRange(
  restrictions: RestrictionState,
  section: DependencySection | 'engines',
  name: string,
  currentValue: string | undefined,
): string | undefined {
  return currentValue && restrictions[getRestrictionKey(section, name)] ? currentValue : undefined
}

export function sortOverrideEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
}

export function getPreferredCandidateIndex(candidateVersions: string[], avoidLatestVersions: boolean): number {
  return avoidLatestVersions && candidateVersions.length > 1 ? 1 : 0
}

export function getPreferredResolvedVersion(versions: string[], avoidLatestVersions: boolean): string | undefined {
  const sortedVersions = filterStable(versions).sort((left, right) => semver.rcompare(left, right))
  return sortedVersions[getPreferredCandidateIndex(sortedVersions, avoidLatestVersions)]
}

export function getDependencyRangeCandidates(range: string, versions: string[]): string[] {
  const stableMatches = filterStable(versions)
    .sort((left, right) => semver.rcompare(left, right))
    .filter(version => semver.satisfies(version, range))
  if (stableMatches.length > 0) {
    return stableMatches
  }
  return [...versions]
    .sort((left, right) => semver.rcompare(left, right))
    .filter(version => semver.satisfies(version, range, { includePrerelease: true }))
}

export function getRequiredPeerDependencies(
  manifest: VersionManifest | undefined,
): Record<string, { range: string; optional: boolean }> {
  if (!manifest?.peerDependencies) return {}
  return Object.fromEntries(Object.entries(manifest.peerDependencies).map(([peerName, range]) => [
    peerName,
    { range, optional: manifest.peerDependenciesMeta?.[peerName]?.optional === true },
  ]))
}

export function getSharedDependencyRequirements(manifest: VersionManifest | undefined): Record<string, string> {
  return { ...(manifest?.dependencies ?? {}), ...(manifest?.optionalDependencies ?? {}) }
}

export function getSharedDependencyRequirement(
  manifest: VersionManifest | undefined,
  dependencyName: string,
): string | undefined {
  return manifest?.dependencies?.[dependencyName] ?? manifest?.optionalDependencies?.[dependencyName]
}

export function getPeerRequirementSection(
  sourceSection: DependencySection,
  optional: boolean,
): DependencySection {
  return optional ? 'peerDependencies' : sourceSection
}

export function shouldEnforcePeerRequirement(
  peerRequirement: { optional: boolean },
  peerName: string,
  addOptionalPeerDeps: boolean,
  states: Map<string, PackageState>,
): boolean {
  return !peerRequirement.optional || addOptionalPeerDeps || states.has(peerName)
}
