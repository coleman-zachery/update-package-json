import type { PackageJson } from '@/lib/package-json'
import {
  fetchPackument,
  getPreferredStableVersions,
} from '@/lib/npm'
import {
  getRestrictionKey,
  type RestrictionState,
} from '@/lib/restrictions'
import { throwIfAborted } from '../abort'
import type { PlatformSelection } from '../platform-targets'
import { getPreferredSection } from '../state-helpers'
import type {
  DependencySection,
  PackageState,
  ResolveOptions,
  ResolvePreferences,
  UnresolvedPeerRequest,
} from '../types'
import {
  createInstallTargetHelpers,
  type InstallTargetAnalysis,
} from './install-targets'
import { createTraversalProgressTracker } from './progress'

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
  signal?: AbortSignal
  throwIfAborted(): void
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
  const progress = createTraversalProgressTracker(pkg, preferences.onProgress)

  function assertNotAborted() {
    throwIfAborted(preferences.signal)
  }

  async function getPackumentCached(name: string) {
    assertNotAborted()
    const cached = packumentCache.get(name)
    if (cached) {
      return cached
    }

    const packument = await fetchPackument(name, preferences.signal)
    packumentCache.set(name, packument)
    return packument
  }

  const installTargetHelpers = createInstallTargetHelpers({
    rootNode,
    rootNpm,
    respectNode,
    respectNpm,
    signal: preferences.signal,
    getPackumentCached,
  })

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
    signal: preferences.signal,
    throwIfAborted: assertNotAborted,
    registerTraversal: progress.registerTraversal,
    completeTraversal: progress.completeTraversal,
    getPackumentCached,
    getSortedStableVersions(packument) {
      return getPreferredStableVersions(packument)
    },
    recommendUnfreeze(name, reason) {
      ctx.recommendedUnfreezeNames.add(name)
      ctx.fixRecommendations.add(`Remove the override/freeze for ${name}: ${reason}`)
    },
    getInstallTargetAnalysis: installTargetHelpers.getInstallTargetAnalysis,
    getTransitiveOverridePlan: installTargetHelpers.getTransitiveOverridePlan,
    recordUnresolvedPeerRequest(name, range, section, source) {
      if (!source) {
        return
      }

      const existing = ctx.unresolvedPeerRequests.get(name) ?? {
        range,
        sources: new Set<string>(),
        section,
      }
      existing.range = range || existing.range
      existing.section = getPreferredSection(existing.section, section)
      existing.sources.add(source)
      ctx.unresolvedPeerRequests.set(name, existing)
    },
    isStateRestricted(state) {
      return Boolean(restrictions[getRestrictionKey(state.section, state.name)])
    },
    assignResolvedVersion(section, name, version) {
      if (section === 'dependencies') {
        ctx.deps[name] = version
      }
      if (section === 'devDependencies') {
        ctx.devDeps[name] = version
      }
      if (section === 'peerDependencies') {
        ctx.peerDeps[name] = version
      }
    },
    getPeerSourceLabel(peerName) {
      const sources = Array.from(ctx.states.values())
        .filter(state => state.peerDependencies[peerName])
        .map(state => state.name)
        .sort((a, b) => a.localeCompare(b))
      return sources.join(', ') || 'unknown'
    },
  }

  assertNotAborted()
  progress.emitInitial()
  return ctx
}
