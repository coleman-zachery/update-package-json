import semver from 'semver'
import {
  fetchPreferredNodeVersions,
  fetchPackument,
  getAllVersions,
} from '@/lib/npm'
import { filterStable } from '@/lib/semver-utils'
import { throwIfAborted } from '../abort'
import type {
  EngineName,
  ResolvedManifest,
} from '../types'

interface FormatCompatibleEngineRangeOptions {
  engineName: EngineName
  declaredValue: string | undefined
  resolvedManifests: ResolvedManifest[]
  limitToDeclaredRange: boolean
  signal?: AbortSignal
}

function sortAscending(versions: string[]): string[] {
  return [...versions].sort((left, right) => semver.compare(left, right))
}

function sameVersions(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function buildVersionSetRange(versions: string[]): string {
  return versions.join(' || ')
}

function simplifyVersionSetRange(
  universe: string[],
  allowed: string[],
): string | null {
  if (allowed.length === 0) {
    return null
  }

  const simplified = semver.simplifyRange(universe, buildVersionSetRange(allowed))
  if (!simplified) {
    return null
  }

  return String(simplified)
}

function getMajorGroups(versions: string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>()

  for (const version of versions) {
    const major = semver.major(version)
    const group = groups.get(major) ?? []
    group.push(version)
    groups.set(major, group)
  }

  return groups
}

function isMajorSuffixRange(
  universe: string[],
  allowed: string[],
): boolean {
  if (universe.length === 0 || allowed.length === 0) {
    return false
  }

  const allowedSet = new Set(allowed)
  const firstAllowed = allowed[0]
  let reachedAllowed = false

  for (const version of universe) {
    const isAllowed = allowedSet.has(version)
    if (!reachedAllowed) {
      if (!isAllowed) {
        continue
      }
      if (version !== firstAllowed) {
        return false
      }
      reachedAllowed = true
      continue
    }

    if (!isAllowed) {
      return false
    }
  }

  return reachedAllowed
}

function formatNodeAllowedRange(
  universe: string[],
  allowed: string[],
): string | null {
  const universeByMajor = getMajorGroups(universe)
  const allowedByMajor = getMajorGroups(allowed)
  const majorParts = Array.from(allowedByMajor.entries())
    .sort(([left], [right]) => left - right)
    .map(([major, majorAllowedVersions]) => {
      const universeVersions = universeByMajor.get(major) ?? []
      const allowedVersions = sortAscending(majorAllowedVersions)
      if (universeVersions.length > 0 && sameVersions(sortAscending(universeVersions), allowedVersions)) {
        return `^${major}`
      }

      if (isMajorSuffixRange(sortAscending(universeVersions), allowedVersions)) {
        return `^${allowedVersions[0]}`
      }

      const simplified = simplifyVersionSetRange(universeVersions, allowedVersions)
      if (simplified && /[<>]=?\s*\d/.test(simplified) && !simplified.includes('<')) {
        return `>=${allowedVersions[0]} <${major + 1}.0.0-0`
      }

      return simplified
    })
    .filter((value): value is string => Boolean(value))

  return majorParts.length > 0 ? majorParts.join(' || ') : null
}

function formatNpmAllowedRange(
  universe: string[],
  allowed: string[],
): string | null {
  const allowedByMajor = getMajorGroups(allowed)
  const selectedMajorSet = new Set(
    Array.from(allowedByMajor.keys())
      .sort((left, right) => left - right)
      .slice(-2),
  )
  const limitedUniverse = universe.filter(version => selectedMajorSet.has(semver.major(version)))
  const limitedAllowed = allowed.filter(version => selectedMajorSet.has(semver.major(version)))
  const universeByMajor = getMajorGroups(limitedUniverse)
  const majorEntries = Array.from(getMajorGroups(limitedAllowed).entries()).sort(([left], [right]) => left - right)
  const fullyAllowedMajors = majorEntries
    .filter(([major, majorAllowedVersions]) => {
      const universeVersions = universeByMajor.get(major) ?? []
      return universeVersions.length > 0
        && sameVersions(sortAscending(universeVersions), sortAscending(majorAllowedVersions))
    })
    .map(([major]) => major)

  if (
    fullyAllowedMajors.length > 0
    && fullyAllowedMajors.length === majorEntries.length
    && fullyAllowedMajors.every((major, index) => index === 0 || major === fullyAllowedMajors[index - 1] + 1)
  ) {
    if (fullyAllowedMajors.length === 1) {
      return `^${fullyAllowedMajors[0]}`
    }

    return `${fullyAllowedMajors[0]} - ${fullyAllowedMajors[fullyAllowedMajors.length - 1]}`
  }

  return simplifyVersionSetRange(limitedUniverse, limitedAllowed)
}

async function getPublishedVersions(
  engineName: EngineName,
  signal?: AbortSignal,
): Promise<string[]> {
  throwIfAborted(signal)
  if (engineName === 'node') {
    return sortAscending(await fetchPreferredNodeVersions(signal))
  }

  const npmPackument = await fetchPackument('npm', signal)
  return sortAscending(filterStable(getAllVersions(npmPackument)))
}

function getCompatibleVersions(
  versions: string[],
  resolvedManifests: ResolvedManifest[],
  engineName: EngineName,
  declaredValue: string | undefined,
  limitToDeclaredRange: boolean,
): string[] {
  const requiredRanges = resolvedManifests
    .map(entry => entry.manifest.engines?.[engineName])
    .filter((value): value is string => Boolean(value && semver.validRange(value)))

  const declaredRange = limitToDeclaredRange && declaredValue && semver.validRange(declaredValue)
    ? declaredValue
    : null

  return versions.filter(version => {
    if (declaredRange && !semver.satisfies(version, declaredRange)) {
      return false
    }

    return requiredRanges.every(range => semver.satisfies(version, range))
  })
}

export async function formatCompatibleEngineRange(
  options: FormatCompatibleEngineRangeOptions,
): Promise<string | undefined> {
  const publishedVersions = await getPublishedVersions(options.engineName, options.signal)
  const allCompatibleVersions = getCompatibleVersions(
    publishedVersions,
    options.resolvedManifests,
    options.engineName,
    options.declaredValue,
    options.limitToDeclaredRange,
  )

  if (allCompatibleVersions.length === 0) {
    return undefined
  }

  if (options.engineName === 'node') {
    return formatNodeAllowedRange(publishedVersions, allCompatibleVersions) ?? undefined
  }

  return formatNpmAllowedRange(publishedVersions, allCompatibleVersions) ?? undefined
}
