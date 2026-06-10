import type { SpaceIndentSize } from '@/lib/indentation'
import { serializeMutatedPackage } from './mutation-io'
import { parsePackageJson } from './serialization'
import {
  cleanupEmptyDependencySections,
  clonePackageJsonForMutation,
  ensureDependencyValue,
  getDependencySectionValues,
  getDependencyVersion,
  getDependencySectionsForPackage,
  isPlainObject,
  ROOT_DEPENDENCY_SECTIONS,
  sortDependencies,
  sortObjectEntries,
} from './sections'
import type { PackageJson, RootDependencySection } from './types'

export function getStringOverrides(pkg: PackageJson): Record<string, string> {
  if (!isPlainObject(pkg.overrides)) return {}
  return Object.fromEntries(
    Object.entries(pkg.overrides).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
}

export function hasDependencyOverride(pkg: PackageJson, name: string): boolean {
  return typeof getStringOverrides(pkg)[name] === 'string'
}

export function detectFrozenDependencyNames(raw: string): Set<string> {
  if (!raw.trim()) return new Set()
  try {
    return new Set(Object.keys(getStringOverrides(parsePackageJson(raw))))
  } catch {
    return new Set()
  }
}

function syncDependencyOverridesInPackage(previousPkg: PackageJson, nextPkg: PackageJson): PackageJson {
  const stringOverrides = getStringOverrides(nextPkg)
  const overrideNames = Object.keys(stringOverrides)
  if (overrideNames.length === 0) return nextPkg

  const previousOverrides = getStringOverrides(previousPkg)
  const updated = clonePackageJsonForMutation(nextPkg)
  const mutableOverrides = isPlainObject(updated.overrides) ? updated.overrides : {}
  let changed = !isPlainObject(updated.overrides)

  for (const name of overrideNames) {
    const nextOverrideValue = stringOverrides[name]
    const previousOverrideValue = previousOverrides[name]
    const nextDependencyValue = getDependencyVersion(nextPkg, name)
    const previousDependencyValue = getDependencyVersion(previousPkg, name)
    const dependencyChanged = nextDependencyValue !== previousDependencyValue
    const overrideChanged = nextOverrideValue !== previousOverrideValue
    const desiredValue = !nextDependencyValue ? nextOverrideValue : dependencyChanged && !overrideChanged ? nextDependencyValue : nextOverrideValue

    if (getDependencyVersion(updated, name) !== desiredValue) {
      ensureDependencyValue(updated, previousPkg, name, desiredValue)
      changed = true
    }

    const dependencySections = getDependencySectionsForPackage(updated, name)
    if (dependencySections.some(section => getDependencySectionValues(updated, section)?.[name] !== desiredValue)) {
      ensureDependencyValue(updated, previousPkg, name, desiredValue)
      changed = true
    }

    if (mutableOverrides[name] !== desiredValue) {
      mutableOverrides[name] = desiredValue
      changed = true
    }
  }

  if (!changed) return nextPkg

  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const values = getDependencySectionValues(updated, section)
    if (values) updated[section] = sortDependencies(values)
  }

  updated.overrides = sortObjectEntries(mutableOverrides)
  cleanupEmptyDependencySections(updated)
  return updated
}

export function syncDependencyOverridesAfterInputChange(
  previousRaw: string,
  nextRaw: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  if (!nextRaw.trim()) return nextRaw

  let nextPkg: PackageJson
  try {
    nextPkg = parsePackageJson(nextRaw)
  } catch {
    return nextRaw
  }

  const previousPkg = previousRaw.trim()
    ? (() => {
        try {
          return parsePackageJson(previousRaw)
        } catch {
          return {}
        }
      })()
    : {}

  const updated = syncDependencyOverridesInPackage(previousPkg, nextPkg)
  return updated === nextPkg ? nextRaw : serializeMutatedPackage(nextRaw, updated, spaceIndentSize)
}

export function setDependencyFrozen(
  raw: string,
  name: string,
  enabled: boolean,
  spaceIndentSize?: SpaceIndentSize,
  preferredSection?: RootDependencySection,
): string {
  const pkg = raw.trim() ? parsePackageJson(raw) : {}
  const updated = clonePackageJsonForMutation(pkg)
  const overrides = isPlainObject(updated.overrides) ? { ...updated.overrides } : {}

  if (enabled) {
    const currentValue = preferredSection
      ? getDependencySectionValues(updated, preferredSection)?.[name] ?? getDependencyVersion(updated, name)
      : getDependencyVersion(updated, name)
    const overrideValue = typeof overrides[name] === 'string' ? overrides[name] as string : undefined
    const nextValue = currentValue ?? overrideValue
    if (!nextValue) return raw

    ensureDependencyValue(updated, pkg, name, nextValue, preferredSection)
    overrides[name] = nextValue
    updated.overrides = sortObjectEntries(overrides)
    cleanupEmptyDependencySections(updated)
    return serializeMutatedPackage(raw, updated, spaceIndentSize)
  }

  if (!(name in overrides)) return raw

  delete overrides[name]
  updated.overrides = Object.keys(overrides).length > 0 ? sortObjectEntries(overrides) : undefined
  cleanupEmptyDependencySections(updated)
  return serializeMutatedPackage(raw, updated, spaceIndentSize)
}

export function forceDependenciesIntoOverrides(pkg: PackageJson, names: string[]): PackageJson {
  if (names.length === 0) return pkg
  const updated = clonePackageJsonForMutation(pkg)
  const overrides = isPlainObject(updated.overrides) ? { ...updated.overrides } : {}
  let changed = false

  for (const name of names) {
    const version = getDependencyVersion(updated, name)
    if (!version || overrides[name] === version) continue
    overrides[name] = version
    changed = true
  }

  if (!changed) return pkg
  updated.overrides = sortObjectEntries(overrides)
  return updated
}

export function removeDependencyOverrides(pkg: PackageJson, names: string[]): PackageJson {
  if (names.length === 0 || !isPlainObject(pkg.overrides)) return pkg
  const updated = clonePackageJsonForMutation(pkg)
  const overrides = { ...(updated.overrides as Record<string, unknown>) }
  let changed = false

  for (const name of names) {
    if (!(name in overrides)) continue
    delete overrides[name]
    changed = true
  }

  if (!changed) return pkg
  updated.overrides = Object.keys(overrides).length > 0 ? sortObjectEntries(overrides) : undefined
  return updated
}
