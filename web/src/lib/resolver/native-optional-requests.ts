import type { PackageJson } from '@/lib/package-json'
import type { ResolutionContext } from './pass-context'
import {
  extractPlatformSuffix,
  reconcilePlatformTargetsDetailed,
  resolvePlatformSelection,
} from './platform-targets'
import type { RootPackageRequest } from './companions'
import type { DependencySection, PlatformOptionalFamily, PlatformSupport } from './types'

const ROOT_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
]

function hasRootPackage(pkg: PackageJson, name: string): boolean {
  return ROOT_SECTIONS.some(section => typeof pkg[section]?.[name] === 'string')
}

function collectExplicitPlatformSuffixes(pkg: PackageJson): Set<string> {
  const suffixes = new Set<string>()
  for (const section of ROOT_SECTIONS) {
    const values = pkg[section]
    if (!values) continue
    for (const name of Object.keys(values)) {
      const suffix = extractPlatformSuffix(name)
      if (suffix) suffixes.add(suffix)
    }
  }
  return suffixes
}

async function collectNativeOptionalDependencyEntries(
  ctx: ResolutionContext,
): Promise<Array<{
  dependencyName: string
  optionalName: string
  optionalRange: string
  section: DependencySection
    suffix: string
  }>> {
  const entries: Array<{
    dependencyName: string
    optionalName: string
    optionalRange: string
    section: DependencySection
    suffix: string
  }> = []

  function addOptionalEntries(
    dependencyName: string,
    section: DependencySection,
    optionalDependencies: Record<string, string> | undefined,
  ) {
    if (!optionalDependencies) return
    for (const [optionalName, optionalRange] of Object.entries(optionalDependencies)) {
      const suffix = extractPlatformSuffix(optionalName)
      if (!suffix) continue
      entries.push({ dependencyName, optionalName, optionalRange, section, suffix })
    }
  }

  for (const state of ctx.states.values()) {
    if (!state.root) continue
    addOptionalEntries(state.name, state.section, state.manifest.optionalDependencies)
    for (const [dependencyName, dependencyRange] of Object.entries(state.manifest.dependencies ?? {})) {
      const analysis = await ctx.getInstallTargetAnalysis(dependencyName, dependencyRange)
      const installedVersion = analysis.latestEngineCompatibleVersion ?? analysis.latestSatisfyingVersion
      if (!installedVersion) continue
      const dependencyManifest = (await ctx.getPackumentCached(dependencyName)).versions[installedVersion]
      addOptionalEntries(dependencyName, state.section, dependencyManifest?.optionalDependencies)
    }
  }
  return entries
}

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

  const availableTargetList = Array.from(availableTargets).sort((left, right) => left.localeCompare(right))
  const allIssues: PlatformOptionalFamily['issues'] = []

  for (const family of familyMap.values()) {
    const familyTargets = Array.from(family.availableTargets).sort((left, right) => left.localeCompare(right))
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
      currentValue: entry.optionalRange,
      requestedRange: entry.optionalRange,
    })
  }

  return {
    requests: Array.from(requests.values()).sort((left, right) => left.name.localeCompare(right.name)),
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
