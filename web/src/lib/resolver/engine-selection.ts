import semver from 'semver'
import { fetchNodeVersions, fetchPackument, getAllVersions } from '@/lib/npm'
import { filterStable } from '@/lib/semver-utils'
import { getPreferredResolvedVersion } from './state-helpers'
import { throwIfAborted } from './abort'
import type { EngineName, ResolvedManifest } from './types'

export async function pickCompatibleEngineVersion(
  engineName: EngineName,
  declaredValue: string | undefined,
  resolvedManifests: ResolvedManifest[],
  respectEngine: boolean,
  restricted: boolean,
  addMissingEngine: boolean,
  avoidLatestVersions: boolean,
  signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfAborted(signal)
  if (!declaredValue && !addMissingEngine && !respectEngine) {
    return undefined
  }

  let versions = engineName === 'node'
    ? await fetchNodeVersions(signal)
    : filterStable(getAllVersions(await fetchPackument('npm', signal)))
  const declaredRange = declaredValue && semver.validRange(declaredValue)

  if (declaredRange && (respectEngine || restricted)) {
    versions = versions.filter(version => semver.satisfies(version, declaredRange))
  }

  const requiredRanges = resolvedManifests
    .map(entry => entry.manifest.engines?.[engineName])
    .filter((value): value is string => Boolean(value))
  versions = versions.filter(version => requiredRanges.every(range => semver.satisfies(version, range)))
  return getPreferredResolvedVersion(versions, avoidLatestVersions)
}
