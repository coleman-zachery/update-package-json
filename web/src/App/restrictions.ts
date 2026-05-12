import type { RootDependencySection } from '@/lib/package-json'
import { detectFrozenDependencyNames, parsePackageJson } from '@/lib/package-json'
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
  const defaultStrictEngineRestriction = detectDefaultStrictEngineRestriction(input)
  const frozenDependencyNames = detectFrozenDependencyNames(input)
  const hasDetachedPackageManagerEntry = restrictableEntries.some(
    entry => entry.key === PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  )
  const combinedNpmRestriction = Boolean(
    current[ENGINE_NPM_RESTRICTION_KEY]
    || current[PACKAGE_MANAGER_NPM_RESTRICTION_KEY]
    || defaultStrictEngineRestriction,
  )

  const next = Object.fromEntries(
    restrictableEntries.map(entry => [
      entry.key,
      isDependencyRestrictionSection(entry.section)
        ? frozenDependencyNames.has(entry.name)
        : entry.key === PACKAGE_MANAGER_NPM_RESTRICTION_KEY
          ? current[PACKAGE_MANAGER_NPM_RESTRICTION_KEY] ?? current[ENGINE_NPM_RESTRICTION_KEY] ?? defaultStrictEngineRestriction
          : entry.key === ENGINE_NPM_RESTRICTION_KEY && !hasDetachedPackageManagerEntry
            ? combinedNpmRestriction
            : current[entry.key] ?? defaultStrictEngineRestriction,
    ]),
  )

  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  if (currentKeys.length === nextKeys.length && nextKeys.every(key => current[key] === next[key])) {
    return current
  }

  return next
}

function detectDefaultStrictEngineRestriction(input: string): boolean {
  if (!input.trim()) {
    return false
  }

  try {
    const pkg = parsePackageJson(input)
    return pkg.engineStrict === true
  } catch {
    return false
  }
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
