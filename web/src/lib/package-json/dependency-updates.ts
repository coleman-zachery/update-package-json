import { isPinnedNpmVersion } from './semver'
import { serializeMutatedPackage } from './mutation-io'
import {
  cleanupEmptyDependencySections,
  clonePackageJsonForMutation,
  ensureDependencyValue,
  getDependencySectionValues,
  isPlainObject,
  ROOT_DEPENDENCY_SECTIONS,
  sortDependencies,
  sortObjectEntries,
} from './sections'
import { parsePackageJson } from './serialization'
import type {
  PackageJson,
  RootDependencySection,
} from './types'
import type { SpaceIndentSize } from '@/lib/indentation'

export function applyMajorBuildRanges(pkg: PackageJson, names: string[]): PackageJson {
  if (names.length === 0) {
    return pkg
  }

  const updated = clonePackageJsonForMutation(pkg)
  let changed = false

  for (const name of names) {
    for (const section of ROOT_DEPENDENCY_SECTIONS) {
      const sectionValues = getDependencySectionValues(updated, section)
      const currentValue = sectionValues?.[name]
      if (!sectionValues || !currentValue || !isPinnedNpmVersion(currentValue)) {
        continue
      }

      sectionValues[name] = `^${currentValue}`
      changed = true
    }
  }

  return changed ? updated : pkg
}

export function upsertDependencyValue(
  raw: string,
  name: string,
  value: string,
  spaceIndentSize?: SpaceIndentSize,
  preferredSection?: RootDependencySection,
): string {
  const pkg = raw.trim() ? parsePackageJson(raw) : {}
  const updated = clonePackageJsonForMutation(pkg)

  ensureDependencyValue(updated, pkg, name, value, preferredSection)

  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const sectionValues = getDependencySectionValues(updated, section)
    if (sectionValues) {
      updated[section] = sortDependencies(sectionValues)
    }
  }

  if (isPlainObject(updated.overrides) && typeof updated.overrides[name] === 'string') {
    updated.overrides = sortObjectEntries({
      ...updated.overrides,
      [name]: value,
    })
  }

  cleanupEmptyDependencySections(updated)
  return serializeMutatedPackage(raw, updated, spaceIndentSize)
}
