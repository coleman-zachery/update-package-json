import {
  getDependencyVersion,
  getStringOverrides,
} from '@/lib/package-json'
import { sortOverrideEntries } from '../state-helpers'
import { isMeaningfulDependencyChange } from '../state-helpers'
import { throwIfAborted } from '../abort'
import type { PackageJson } from '@/lib/package-json'
import type {
  ResolutionPass,
  VersionChange,
} from '../types'

export function syncResolvedOverrides(
  pkg: PackageJson,
  updated: PackageJson,
  resolution: ResolutionPass,
  changes: VersionChange[],
  signal?: AbortSignal,
) {
  if (resolution.transitiveOverrides.length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = !updated.overrides
    for (const override of resolution.transitiveOverrides) {
      throwIfAborted(signal)
      if (nextOverrides[override.name] === override.version) {
        continue
      }

      nextOverrides[override.name] = override.version
      overridesChanged = true
    }
    if (overridesChanged) {
      updated.overrides = sortOverrideEntries(nextOverrides)
    }
  }

  if (Object.keys(getStringOverrides(updated)).length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = false
    for (const name of Object.keys(getStringOverrides(updated))) {
      throwIfAborted(signal)
      const mirroredVersion = getDependencyVersion(updated, name)
      if (!mirroredVersion || nextOverrides[name] === mirroredVersion) {
        continue
      }

      nextOverrides[name] = mirroredVersion
      overridesChanged = true
    }
    if (overridesChanged) {
      updated.overrides = sortOverrideEntries(nextOverrides)
    }
  }

  const originalOverrides = getStringOverrides(pkg)
  const updatedOverrides = getStringOverrides(updated)
  for (const [name, nextValue] of Object.entries(updatedOverrides)) {
    const previousValue = originalOverrides[name]
    if (isMeaningfulDependencyChange(previousValue, nextValue)) {
      changes.push({
        name,
        from: previousValue ?? '(none)',
        to: nextValue,
        section: 'overrides',
      })
    }
  }
}
