import { getStringOverrides, type PackageJson } from '@/lib/package-json'
import { ROOT_DEPENDENCY_SECTIONS } from '@/lib/package-json/sections'
import type { ResolveResult } from '@/lib/resolver'
import { extractPlatformSuffix } from '@/lib/resolver/platform-targets'

export interface PackageSemanticHighlights {
  overriddenDependencyNames: string[]
  platformDependencyNames: string[]
  transitiveDependencyNames: string[]
  unresolvedDependencyNames: string[]
}

function sortNames(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function collectDeclaredDependencyNames(pkg: PackageJson): string[] {
  const names = new Set<string>()

  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      names.add(name)
    }
  }

  return sortNames(names)
}

function parseConflictPackageName(conflict: string): string | null {
  const subject = conflict.split(':', 1)[0]?.trim()
  if (!subject) {
    return null
  }

  if (subject.startsWith('@')) {
    const versionIndex = subject.indexOf('@', 1)
    return versionIndex > 0 ? subject.slice(0, versionIndex) : subject
  }

  const versionIndex = subject.lastIndexOf('@')
  return versionIndex > 0 ? subject.slice(0, versionIndex) : subject
}

function collectUnresolvedConflictNames(
  conflicts: string[],
  declaredNames: Set<string>,
): Set<string> {
  const names = new Set<string>()

  for (const conflict of conflicts) {
    const packageName = parseConflictPackageName(conflict)
    if (packageName && declaredNames.has(packageName)) {
      names.add(packageName)
    }
  }

  return names
}

export function getPendingForcedOverrideNames(result: ResolveResult): string[] {
  const existingOverrideNames = new Set(Object.keys(getStringOverrides(result.updatedPackage)))
  return result.staleDependencyNames.filter(name => !existingOverrideNames.has(name))
}

export function getOutputOverrideNames(result: ResolveResult): string[] {
  return sortNames([
    ...Object.keys(getStringOverrides(result.updatedPackage)),
    ...getPendingForcedOverrideNames(result),
  ])
}

export function collectPackageSemanticHighlights(
  pkg: PackageJson,
  options: {
    overrideNames?: string[]
    result?: ResolveResult | null
    transitiveDependencyNames?: string[]
    unresolvedDependencyNames?: string[]
  } = {},
): PackageSemanticHighlights {
  const declaredDependencyNames = collectDeclaredDependencyNames(pkg)
  const declaredDependencyNameSet = new Set(declaredDependencyNames)
  const resolvedNames = new Set(options.result?.resolvedManifests.map(manifest => manifest.name) ?? [])
  const unresolvedConflictNames = options.result
    ? collectUnresolvedConflictNames(options.result.conflicts, declaredDependencyNameSet)
    : new Set<string>()

  return {
    overriddenDependencyNames: sortNames(
      options.overrideNames ?? Object.keys(getStringOverrides(pkg)),
    ),
    platformDependencyNames: declaredDependencyNames.filter(name => Boolean(extractPlatformSuffix(name))),
    transitiveDependencyNames: sortNames(
      (options.transitiveDependencyNames ?? []).filter(name => declaredDependencyNameSet.has(name)),
    ),
    unresolvedDependencyNames: declaredDependencyNames.filter(name => (
      (options.unresolvedDependencyNames?.includes(name) ?? unresolvedConflictNames.has(name))
      && !resolvedNames.has(name)
      && !extractPlatformSuffix(name)
    )),
  }
}
