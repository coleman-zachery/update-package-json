import semver from 'semver'
import { fetchPackument, getAllVersions, getPreferredStableVersions } from '@/lib/npm'
import { getRestrictionKey, type RestrictionState } from '@/lib/restrictions'
import { isEngineCompatible } from '@/lib/semver-utils'
import { getDependencyRangeCandidates, getPreferredSection } from './state-helpers'
import type {
  DependencySection,
  PackageState,
  ResolvePreferences,
  ResolveProgress,
  ResolveOptions,
  UnresolvedPeerRequest,
} from './types'
import type { PackageJson } from '@/lib/package-json'
import type { PlatformSelection } from './platform-targets'

interface InstallTargetAnalysis {
  latestSatisfyingVersion: string | null
  latestEngineCompatibleVersion: string | null
  latestSatisfyingIsEngineCompatible: boolean
}

const PROGRESS_ROOT_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
]

function countInitialTraversalTargets(pkg: PackageJson): number {
  const names = new Set<string>()

  for (const section of PROGRESS_ROOT_SECTIONS) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      names.add(name)
    }
  }

  return names.size
}

export interface ResolutionContext {
  pkg: PackageJson
  options: ResolveOptions
  restrictions: RestrictionState
  rootNode: string | undefined
  rootNpm: string | undefined
  respectNode: boolean
  respectNpm: boolean
  deps: Record<string, string>
  devDeps: Record<string, string>
  peerDeps: Record<string, string>
  conflicts: string[]
  engineWarnings: string[]
  states: Map<string, PackageState>
  unresolvedPeerRequests: Map<string, UnresolvedPeerRequest>
  shouldAutoTransitiveEngineOverrides: boolean
  requestedPlatformSelection: PlatformSelection
  recommendedUnfreezeNames: Set<string>
  fixRecommendations: Set<string>
  registerTraversal(name: string): void
  completeTraversal(name: string): void
  getPackumentCached(name: string): Promise<Awaited<ReturnType<typeof fetchPackument>>>
  getSortedStableVersions(packument: Awaited<ReturnType<typeof fetchPackument>>): string[]
  recommendUnfreeze(name: string, reason: string): void
  getInstallTargetAnalysis(name: string, range: string): Promise<InstallTargetAnalysis>
  getTransitiveOverridePlan(manifest: PackageState['manifest'] | undefined): Promise<Record<string, string> | null>
  recordUnresolvedPeerRequest(name: string, range: string, section: DependencySection, source?: string): void
  isStateRestricted(state: PackageState): boolean
  assignResolvedVersion(section: DependencySection, name: string, version: string): void
  getPeerSourceLabel(peerName: string): string
}

export function createResolutionContext(
  pkg: PackageJson,
  options: ResolveOptions,
  restrictions: RestrictionState,
  rootNode: string | undefined,
  rootNpm: string | undefined,
  respectNode: boolean,
  respectNpm: boolean,
  preferences: ResolvePreferences = {},
): ResolutionContext {
  const packumentCache = new Map<string, Awaited<ReturnType<typeof fetchPackument>>>()
  const installTargetCache = new Map<string, InstallTargetAnalysis>()
  const initialTraversalTotal = countInitialTraversalTargets(pkg)
  const discoveredTraversalNames = new Set<string>()
  const completedTraversalNames = new Set<string>()

  function emitProgress() {
    preferences.onProgress?.({
      completed: completedTraversalNames.size,
      total: Math.max(initialTraversalTotal, discoveredTraversalNames.size, completedTraversalNames.size),
    } satisfies ResolveProgress)
  }

  const ctx: ResolutionContext = {
    pkg,
    options,
    restrictions,
    rootNode,
    rootNpm,
    respectNode,
    respectNpm,
    deps: { ...(pkg.dependencies ?? {}) },
    devDeps: { ...(pkg.devDependencies ?? {}) },
    peerDeps: { ...(pkg.peerDependencies ?? {}) },
    conflicts: [],
    engineWarnings: [],
    states: new Map(),
    unresolvedPeerRequests: new Map(),
    shouldAutoTransitiveEngineOverrides: pkg.engineStrict === true,
    requestedPlatformSelection: preferences.platformSelection ?? {},
    recommendedUnfreezeNames: new Set(),
    fixRecommendations: new Set(),
    registerTraversal(name) {
      if (discoveredTraversalNames.has(name)) {
        return
      }

      discoveredTraversalNames.add(name)
      emitProgress()
    },
    completeTraversal(name) {
      if (!discoveredTraversalNames.has(name) || completedTraversalNames.has(name)) {
        return
      }

      completedTraversalNames.add(name)
      emitProgress()
    },
    async getPackumentCached(name) {
      const cached = packumentCache.get(name)
      if (cached) return cached
      const packument = await fetchPackument(name)
      packumentCache.set(name, packument)
      return packument
    },
    getSortedStableVersions(packument) {
      return getPreferredStableVersions(packument)
    },
    recommendUnfreeze(name, reason) {
      ctx.recommendedUnfreezeNames.add(name)
      ctx.fixRecommendations.add(`Remove the override/freeze for ${name}: ${reason}`)
    },
    async getInstallTargetAnalysis(name, range) {
      if (!semver.validRange(range)) {
        return { latestSatisfyingVersion: null, latestEngineCompatibleVersion: null, latestSatisfyingIsEngineCompatible: true }
      }
      const cacheKey = [name, range, rootNode ?? '', rootNpm ?? '', respectNode ? 'node' : '', respectNpm ? 'npm' : ''].join('|')
      const cached = installTargetCache.get(cacheKey)
      if (cached) return cached

      try {
        const packument = await ctx.getPackumentCached(name)
        const satisfyingVersions = getDependencyRangeCandidates(range, getAllVersions(packument))
        const latestSatisfyingVersion = satisfyingVersions[0] ?? null
        const latestEngineCompatibleVersion = satisfyingVersions.find(version =>
          Boolean(packument.versions[version] && isEngineCompatible(packument.versions[version].engines, rootNode, rootNpm, respectNode, respectNpm)),
        ) ?? null
        const next = {
          latestSatisfyingVersion,
          latestEngineCompatibleVersion,
          latestSatisfyingIsEngineCompatible: Boolean(latestSatisfyingVersion && latestSatisfyingVersion === latestEngineCompatibleVersion),
        }
        installTargetCache.set(cacheKey, next)
        return next
      } catch {
        const next = { latestSatisfyingVersion: null, latestEngineCompatibleVersion: null, latestSatisfyingIsEngineCompatible: false }
        installTargetCache.set(cacheKey, next)
        return next
      }
    },
    async getTransitiveOverridePlan(manifest) {
      if (!manifest) return null
      const overrides: Record<string, string> = {}
      const entries = [...Object.entries(manifest.dependencies ?? {}), ...Object.entries(manifest.optionalDependencies ?? {})]
      for (const [name, range] of entries) {
        const analysis = await ctx.getInstallTargetAnalysis(name, range)
        if (!analysis.latestSatisfyingVersion || !analysis.latestEngineCompatibleVersion) return null
        if (!analysis.latestSatisfyingIsEngineCompatible) overrides[name] = analysis.latestEngineCompatibleVersion
      }
      return overrides
    },
    recordUnresolvedPeerRequest(name, range, section, source) {
      if (!source) return
      const existing = ctx.unresolvedPeerRequests.get(name) ?? { range, sources: new Set<string>(), section }
      existing.range = range || existing.range
      existing.section = getPreferredSection(existing.section, section)
      existing.sources.add(source)
      ctx.unresolvedPeerRequests.set(name, existing)
    },
    isStateRestricted(state) {
      return Boolean(restrictions[getRestrictionKey(state.section, state.name)])
    },
    assignResolvedVersion(section, name, version) {
      if (section === 'dependencies') ctx.deps[name] = version
      if (section === 'devDependencies') ctx.devDeps[name] = version
      if (section === 'peerDependencies') ctx.peerDeps[name] = version
    },
    getPeerSourceLabel(peerName) {
      const sources = Array.from(ctx.states.values())
        .filter(state => state.peerDependencies[peerName])
        .map(state => state.name)
        .sort((a, b) => a.localeCompare(b))
      return sources.join(', ') || 'unknown'
    },
  }

  emitProgress()
  return ctx
}
