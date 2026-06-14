import type { PackageJson } from '@/lib/package-json'
import {
  extractPlatformSuffix,
} from '../platform-targets'
import type { ResolutionContext } from '../pass-context'
import type { DependencySection } from '../types'

const ROOT_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
]

export interface NativeOptionalDependencyEntry {
  rootDependencyName: string
  rootDependencyVersion: string
  dependencyName: string
  dependencyVersion: string
  optionalName: string
  optionalRange: string
  section: DependencySection
  suffix: string
}

export function hasRootPackage(pkg: PackageJson, name: string): boolean {
  return ROOT_SECTIONS.some(section => typeof pkg[section]?.[name] === 'string')
}

export function collectExplicitPlatformSuffixes(pkg: PackageJson): Set<string> {
  const suffixes = new Set<string>()

  for (const section of ROOT_SECTIONS) {
    const values = pkg[section]
    if (!values) {
      continue
    }

    for (const name of Object.keys(values)) {
      const suffix = extractPlatformSuffix(name)
      if (suffix) {
        suffixes.add(suffix)
      }
    }
  }

  return suffixes
}

export async function collectNativeOptionalDependencyEntries(
  ctx: ResolutionContext,
): Promise<NativeOptionalDependencyEntry[]> {
  const entries: NativeOptionalDependencyEntry[] = []

  function addOptionalEntries(
    rootDependencyName: string,
    rootDependencyVersion: string,
    dependencyName: string,
    dependencyVersion: string,
    section: DependencySection,
    optionalDependencies: Record<string, string> | undefined,
  ) {
    if (!optionalDependencies) {
      return
    }

    for (const [optionalName, optionalRange] of Object.entries(optionalDependencies)) {
      const suffix = extractPlatformSuffix(optionalName)
      if (!suffix) {
        continue
      }

      entries.push({
        rootDependencyName,
        rootDependencyVersion,
        dependencyName,
        dependencyVersion,
        optionalName,
        optionalRange,
        section,
        suffix,
      })
    }
  }

  for (const state of ctx.states.values()) {
    ctx.throwIfAborted()
    if (!state.root) {
      continue
    }

    addOptionalEntries(
      state.name,
      state.currentVersion,
      state.name,
      state.currentVersion,
      state.section,
      state.manifest.optionalDependencies,
    )

    for (const [dependencyName, dependencyRange] of Object.entries(state.manifest.dependencies ?? {})) {
      ctx.throwIfAborted()
      const analysis = await ctx.getInstallTargetAnalysis(dependencyName, dependencyRange)
      const installedVersion = analysis.latestEngineCompatibleVersion ?? analysis.latestSatisfyingVersion
      if (!installedVersion) {
        continue
      }

      const dependencyManifest = (await ctx.getPackumentCached(dependencyName)).versions[installedVersion]
      addOptionalEntries(
        state.name,
        state.currentVersion,
        dependencyName,
        installedVersion,
        state.section,
        dependencyManifest?.optionalDependencies,
      )
    }
  }

  return entries
}
