import {
  getDependencyVersion,
  getStringOverrides,
  type PackageJson,
} from '@/lib/package-json'
import type {
  ChangeSourceHint,
  ResolvedManifest,
} from '@/lib/resolver'
import type { VersionChangeEntry } from './index'
import {
  createPinnedBelowLatestReason,
  normalizeVersion,
} from './helpers'

function createOverridePinReason(
  name: string,
  overrideVersion: string,
  manifests: ResolvedManifest[],
  manifestsByName: Map<string, ResolvedManifest>,
  sourceHint?: ChangeSourceHint,
): string {
  const latestVersion = manifestsByName.get(name)?.latestVersion
  const normalizedOverrideVersion = normalizeVersion(overrideVersion)
  const pinnedReason = createPinnedBelowLatestReason(
    name,
    normalizedOverrideVersion,
    latestVersion,
    manifests,
    sourceHint,
  )

  if (pinnedReason) {
    return pinnedReason
  }

  return `pinned in overrides to ${overrideVersion}`
}

export function createVersionChangeOverridesSummary(
  inputPackage: PackageJson,
  displayPackage: PackageJson | null,
  manifests: ResolvedManifest[],
  manifestsByName: Map<string, ResolvedManifest>,
  sourceHintsByName: Map<string, ChangeSourceHint>,
): VersionChangeEntry[] {
  if (!displayPackage) {
    return []
  }

  const inputOverrides = getStringOverrides(inputPackage)
  const displayOverrides = getStringOverrides(displayPackage)
  const entries: VersionChangeEntry[] = []

  for (const [name, overrideVersion] of Object.entries(displayOverrides)) {
    if (inputOverrides[name]) {
      continue
    }

    const originalVersion = getDependencyVersion(inputPackage, name)
    if (!originalVersion) {
      continue
    }

    entries.push({
      name,
      from: originalVersion,
      to: overrideVersion,
      displayTo: overrideVersion,
      direction: 'added',
      isPlatform: false,
      reason: createOverridePinReason(
        name,
        overrideVersion,
        manifests,
        manifestsByName,
        sourceHintsByName.get(name),
      ),
      outputTone: 'override',
    })
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name))
}
