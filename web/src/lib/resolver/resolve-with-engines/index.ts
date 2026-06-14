import type { PackageJson } from '@/lib/package-json'
import type { RestrictionState } from '@/lib/restrictions'
import { createResolutionContext } from '../pass-context'
import { stabilizeResolutionGraph } from '../pass-conflicts'
import { runAuditPass } from '../audit-pass'
import {
  collectCompanionRequestsFromRootRequests,
  collectCompanionRootRequests,
  type RootPackageRequest,
} from '../companions'
import { collectNativeOptionalRootRequests } from '../native-optional-requests'
import { ensureState, syncPeerGraph } from '../pass-state'
import { getRestrictionRange } from '../state-helpers'
import type {
  DependencySection,
  PlatformSupport,
  ResolutionPass,
  ResolveOptions,
  ResolvePreferences,
} from '../types'
import { createAddedPeerDeps } from './added-peer-deps'
import { buildChangeSourceState } from './change-sources'

function dedupePreservingOrder(values: string[]): string[] {
  return Array.from(new Set(values))
}

export async function resolveWithEngines(
  pkg: PackageJson,
  options: ResolveOptions,
  restrictions: RestrictionState,
  rootNode: string | undefined,
  rootNpm: string | undefined,
  respectNode: boolean,
  respectNpm: boolean,
  preferences: ResolvePreferences = {},
): Promise<ResolutionPass> {
  const ctx = createResolutionContext(
    pkg,
    options,
    restrictions,
    rootNode,
    rootNpm,
    respectNode,
    respectNpm,
    preferences,
  )
  const rootSections: Array<[DependencySection, Record<string, string> | undefined]> = [
    ['dependencies', pkg.dependencies],
    ['devDependencies', pkg.devDependencies],
    ['peerDependencies', pkg.peerDependencies],
  ]
  const companionRootRequests = collectCompanionRootRequests(pkg)
  const appliedCompanionRootRequests: RootPackageRequest[] = []
  const appliedNativeOptionalRequests: RootPackageRequest[] = []

  for (const [sectionName, sectionValues] of rootSections) {
    ctx.throwIfAborted()
    if (!sectionValues) {
      continue
    }

    for (const [name, currentValue] of Object.entries(sectionValues)) {
      await ensureState(
        ctx,
        name,
        sectionName,
        currentValue,
        getRestrictionRange(restrictions, sectionName, name, currentValue),
        true,
      )
    }
  }

  for (const request of companionRootRequests) {
    ctx.throwIfAborted()
    await ensureState(
      ctx,
      request.name,
      request.section,
      request.currentValue,
      request.requestedRange,
      true,
      request.sourceName,
    )
  }

  let platformSupport: PlatformSupport = {
    availableTargets: [],
    selectedTargets: [],
    inferredTargets: [],
    unresolvedTargets: [],
    families: [],
  }

  while (true) {
    ctx.throwIfAborted()
    const nativeOptionalResult = await collectNativeOptionalRootRequests(ctx, pkg)
    platformSupport = nativeOptionalResult.platformSupport

    const derivedCompanionRootRequests = collectCompanionRequestsFromRootRequests(
      pkg,
      nativeOptionalResult.requests,
      ctx.states.keys(),
    )

    if (derivedCompanionRootRequests.length > 0) {
      for (const request of derivedCompanionRootRequests) {
        ctx.throwIfAborted()
        await ensureState(
          ctx,
          request.name,
          request.section,
          request.currentValue,
          request.requestedRange,
          true,
          request.sourceName,
        )
        appliedCompanionRootRequests.push(request)
      }
      continue
    }

    if (nativeOptionalResult.requests.length > 0) {
      for (const request of nativeOptionalResult.requests) {
        ctx.throwIfAborted()
        await ensureState(
          ctx,
          request.name,
          request.section,
          request.currentValue,
          request.requestedRange,
          true,
          request.sourceName,
        )
        appliedNativeOptionalRequests.push(request)
      }
      continue
    }

    break
  }

  await syncPeerGraph(ctx)
  await stabilizeResolutionGraph(ctx)
  const auditStatus = await runAuditPass(ctx)
  ctx.throwIfAborted()
  for (const state of ctx.states.values()) {
    ctx.assignResolvedVersion(state.section, state.name, state.currentVersion)
  }
  for (const [name, request] of ctx.unresolvedPeerRequests.entries()) {
    ctx.assignResolvedVersion(request.section, name, request.range)
  }

  const addedPeerDeps = createAddedPeerDeps(ctx)
  const staleDependencyNames = Array.from(ctx.states.values())
    .filter(state => state.latestVersion && state.currentVersion !== state.latestVersion)
    .map(state => state.name)
    .sort((left, right) => left.localeCompare(right))
  const latestDependencyNames = Array.from(ctx.states.values())
    .filter(state => state.latestVersion && state.currentVersion === state.latestVersion)
    .map(state => state.name)
    .sort((left, right) => left.localeCompare(right))
  const changeSourceState = buildChangeSourceState(
    ctx,
    addedPeerDeps,
    companionRootRequests,
    appliedCompanionRootRequests,
    appliedNativeOptionalRequests,
  )

  return {
    deps: ctx.deps,
    devDeps: ctx.devDeps,
    peerDeps: ctx.peerDeps,
    auditStatus,
    addedPeerDeps,
    conflicts: dedupePreservingOrder(ctx.conflicts),
    engineWarnings: ctx.engineWarnings,
    latestDependencyNames,
    staleDependencyNames,
    resolvedManifests: Array.from(ctx.states.values()).map(state => ({
      name: state.name,
      version: state.currentVersion,
      latestVersion: state.latestVersion,
      section: state.section,
      root: state.root,
      manifest: state.manifest,
    })),
    changeSources: changeSourceState.changeSources,
    transitiveOverrides: changeSourceState.transitiveOverrides,
    transitiveOverrideWarnings: changeSourceState.transitiveOverrideWarnings,
    recommendedUnfreezeNames: Array.from(ctx.recommendedUnfreezeNames).sort((left, right) => left.localeCompare(right)),
    fixRecommendations: Array.from(ctx.fixRecommendations).sort((left, right) => left.localeCompare(right)),
    platformSupport,
  }
}
