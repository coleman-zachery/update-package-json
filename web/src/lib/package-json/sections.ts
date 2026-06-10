import type { PackageJson, RootDependencySection } from './types'

export const ROOT_DEPENDENCY_SECTIONS: RootDependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function clonePackageJsonForMutation(pkg: PackageJson): PackageJson {
  return {
    ...pkg,
    dependencies: pkg.dependencies ? { ...pkg.dependencies } : pkg.dependencies,
    devDependencies: pkg.devDependencies ? { ...pkg.devDependencies } : pkg.devDependencies,
    peerDependencies: pkg.peerDependencies ? { ...pkg.peerDependencies } : pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies ? { ...pkg.optionalDependencies } : pkg.optionalDependencies,
    overrides: isPlainObject(pkg.overrides) ? { ...pkg.overrides } : pkg.overrides,
    engines: pkg.engines ? { ...pkg.engines } : pkg.engines,
  }
}

export function getDependencySectionValues(
  pkg: PackageJson,
  section: RootDependencySection,
): Record<string, string> | undefined {
  return pkg[section]
}

export function getDependencySectionsForPackage(
  pkg: PackageJson,
  name: string,
): RootDependencySection[] {
  return ROOT_DEPENDENCY_SECTIONS.filter(section => typeof getDependencySectionValues(pkg, section)?.[name] === 'string')
}

function getPreferredDependencySection(
  nextPkg: PackageJson,
  previousPkg: PackageJson,
  name: string,
  preferredSection?: RootDependencySection,
): RootDependencySection {
  if (preferredSection) return preferredSection

  return getDependencySectionsForPackage(nextPkg, name)[0]
    ?? getDependencySectionsForPackage(previousPkg, name)[0]
    ?? 'dependencies'
}

export function ensureDependencyValue(
  pkg: PackageJson,
  previousPkg: PackageJson,
  name: string,
  value: string,
  preferredSection?: RootDependencySection,
) {
  const sections = getDependencySectionsForPackage(pkg, name)
  const targetSections = sections.length > 0
    ? sections
    : [getPreferredDependencySection(pkg, previousPkg, name, preferredSection)]

  for (const section of targetSections) {
    const existing = getDependencySectionValues(pkg, section) ?? {}
    pkg[section] = { ...existing, [name]: value }
  }
}

export function sortObjectEntries<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  ) as T
}

export function cleanupEmptyDependencySections(pkg: PackageJson) {
  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const values = getDependencySectionValues(pkg, section)
    if (values && Object.keys(values).length === 0) {
      delete pkg[section]
    }
  }
}

export function getDependencyVersion(pkg: PackageJson, name: string): string | undefined {
  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const value = getDependencySectionValues(pkg, section)?.[name]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

export function sortDependencies(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
}
