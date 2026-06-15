import {
  getDependencyVersion,
  getStringOverrides,
  type PackageJson,
} from '@/lib/package-json'
import type { ResolvedManifest } from '@/lib/resolver'
import type { VersionChangeEntry } from './index'
import { normalizeVersion } from './helpers'

function createOverridePinReason(
  name: string,
  overrideVersion: string,
  manifestsByName: Map<string, ResolvedManifest>,
): string {
  const latestVersion = manifestsByName.get(name)?.latestVersion
  const normalizedOverrideVersion = normalizeVersion(overrideVersion)

  if (latestVersion && normalizedOverrideVersion && latestVersion !== normalizedOverrideVersion) {
    return `pinned in overrides to keep ${overrideVersion} instead of floating to ${latestVersion}`
  }

  return `pinned in overrides to keep ${overrideVersion}`
}

export function createVersionChangeOverridesSummary(
  inputPackage: PackageJson,
  displayPackage: PackageJson | null,
  manifestsByName: Map<string, ResolvedManifest>,
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
      reason: createOverridePinReason(name, overrideVersion, manifestsByName),
      outputTone: 'override',
    })
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name))
}
