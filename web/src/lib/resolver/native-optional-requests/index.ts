import type { PackageJson } from '@/lib/package-json'
import {
  reconcilePlatformTargetsDetailed,
  resolvePlatformSelection,
} from '../platform-targets'
import type { RootPackageRequest } from '../companions'
import type { PlatformOptionalFamily, PlatformSupport } from '../types'
import type { ResolutionContext } from '../pass-context'
import {
  collectExplicitPlatformSuffixes,
  collectNativeOptionalDependencyEntries,
  hasRootPackage,
} from './entries'

export async function collectNativeOptionalRootRequests(
  ctx: ResolutionContext,
  pkg: PackageJson,
): Promise<{ requests: RootPackageRequest[]; platformSupport: PlatformSupport }> {
  const inferredTargets = collectExplicitPlatformSuffixes(pkg)
  const availableTargets = new Set<string>()
  const familyMap = new Map<string, {
    optionalDependencyNames: Set<string>
    availableTargets: Set<string>
    selectedTargets: Set<string>
    issues: PlatformOptionalFamily['issues']
  }>()

  const requests = new Map<string, RootPackageRequest>()
  const entries = await collectNativeOptionalDependencyEntries(ctx)

  for (const entry of entries) {
    ctx.throwIfAborted()
    availableTargets.add(entry.suffix)
    const family = familyMap.get(entry.dependencyName) ?? {
      optionalDependencyNames: new Set<string>(),
      availableTargets: new Set<string>(),
      selectedTargets: new Set<string>(),
      issues: [],
    }
    family.optionalDependencyNames.add(entry.optionalName)
    family.availableTargets.add(entry.suffix)
    familyMap.set(entry.dependencyName, family)
  }

  const availableTargetList = Array.from(availableTargets)
    .sort((left, right) => left.localeCompare(right))
  const allIssues: PlatformOptionalFamily['issues'] = []

  for (const family of familyMap.values()) {
    ctx.throwIfAborted()
    const familyTargets = Array.from(family.availableTargets)
      .sort((left, right) => left.localeCompare(right))
    const inferredResolution = reconcilePlatformTargetsDetailed(
      Array.from(inferredTargets),
      familyTargets,
    )
    const userResolution = resolvePlatformSelection(
      ctx.requestedPlatformSelection,
      familyTargets,
    )

    for (const target of inferredResolution.selectedTargets) {
      family.selectedTargets.add(target)
    }

    for (const target of userResolution.selectedTargets) {
      family.selectedTargets.add(target)
    }

    family.issues = [...inferredResolution.issues, ...userResolution.issues]
    allIssues.push(...family.issues)
  }

  const selectedTargets = Array.from(new Set(
    Array.from(familyMap.values()).flatMap(family => Array.from(family.selectedTargets)),
  )).sort((left, right) => left.localeCompare(right))
  const unresolvedTargets = Array.from(new Set(allIssues.map(issue => issue.requested)))
    .sort((left, right) => left.localeCompare(right))
  const activeTargets = new Set<string>(selectedTargets)

  for (const entry of entries) {
    ctx.throwIfAborted()
    if (
      !activeTargets.has(entry.suffix)
      || hasRootPackage(pkg, entry.optionalName)
      || ctx.states.has(entry.optionalName)
      || requests.has(entry.optionalName)
    ) {
      continue
    }

    requests.set(entry.optionalName, {
      name: entry.optionalName,
      section: entry.section,
      sourceName: entry.dependencyName,
      sourceVersion: entry.dependencyVersion,
      rootSourceName: entry.rootDependencyName,
      rootSourceVersion: entry.rootDependencyVersion,
      currentValue: entry.optionalRange,
      requestedRange: entry.optionalRange,
    })
  }

  return {
    requests: Array.from(requests.values())
      .sort((left, right) => left.name.localeCompare(right.name)),
    platformSupport: {
      availableTargets: availableTargetList,
      selectedTargets,
      inferredTargets: Array.from(inferredTargets).sort((left, right) => left.localeCompare(right)),
      unresolvedTargets,
      families: Array.from(familyMap.entries())
        .map(([dependencyName, family]) => ({
          dependencyName,
          optionalDependencyNames: Array.from(family.optionalDependencyNames).sort((left, right) => left.localeCompare(right)),
          availableTargets: Array.from(family.availableTargets).sort((left, right) => left.localeCompare(right)),
          selectedTargets: Array.from(family.selectedTargets).sort((left, right) => left.localeCompare(right)),
          issues: family.issues,
        }))
        .sort((left, right) => left.dependencyName.localeCompare(right.dependencyName)),
    },
  }
}
