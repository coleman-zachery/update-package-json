import type { RootDependencySection } from '@/lib/package-json'
import { detectFrozenDependencyNames } from '@/lib/package-json'
import {
  ENGINE_NPM_RESTRICTION_KEY,
  PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  isDependencyRestrictionSection,
  type RestrictableEntry,
} from '@/lib/restrictions'

export function syncRestrictions(
  current: Record<string, boolean>,
  input: string,
  restrictableEntries: RestrictableEntry[],
): Record<string, boolean> {
  const frozenDependencyNames = detectFrozenDependencyNames(input)
  const hasDetachedPackageManagerEntry = restrictableEntries.some(
    entry => entry.key === PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  )
  const combinedNpmRestriction = Boolean(
    current[ENGINE_NPM_RESTRICTION_KEY] || current[PACKAGE_MANAGER_NPM_RESTRICTION_KEY],
  )

  const next = Object.fromEntries(
    restrictableEntries.map(entry => [
      entry.key,
      isDependencyRestrictionSection(entry.section)
        ? frozenDependencyNames.has(entry.name)
        : entry.key === PACKAGE_MANAGER_NPM_RESTRICTION_KEY
          ? current[PACKAGE_MANAGER_NPM_RESTRICTION_KEY] ?? current[ENGINE_NPM_RESTRICTION_KEY] ?? false
          : entry.key === ENGINE_NPM_RESTRICTION_KEY && !hasDetachedPackageManagerEntry
            ? combinedNpmRestriction
            : current[entry.key] ?? false,
    ]),
  )

  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  if (currentKeys.length === nextKeys.length && nextKeys.every(key => current[key] === next[key])) {
    return current
  }

  return next
}

export function getPreferredFrozenSection(
  section: RestrictableEntry['section'],
): RootDependencySection | undefined {
  return section === 'dependencies'
    || section === 'devDependencies'
    || section === 'peerDependencies'
    || section === 'optionalDependencies'
    ? section
    : undefined
}
