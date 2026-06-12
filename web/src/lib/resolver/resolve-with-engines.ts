import type { PackageJson } from '@/lib/package-json'
import type { RestrictionState } from '@/lib/restrictions'
import { createResolutionContext } from './pass-context'
import { stabilizeResolutionGraph } from './pass-conflicts'
import { runAuditPass } from './audit-pass'
import { collectCompanionRequestsFromRootRequests, collectCompanionRootRequests, type RootPackageRequest } from './companions'
import { collectNativeOptionalRootRequests } from './native-optional-requests'
import { ensureState, syncPeerGraph } from './pass-state'
import { getRestrictionRange } from './state-helpers'
import type { AddedPeerDep, ChangeSourceHint, DependencySection, PlatformSupport, ResolutionPass, ResolveOptions, ResolvePreferences } from './types'

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
  const ctx = createResolutionContext(pkg, options, restrictions, rootNode, rootNpm, respectNode, respectNpm, preferences)
  const rootSections: Array<[DependencySection, Record<string, string> | undefined]> = [['dependencies', pkg.dependencies], ['devDependencies', pkg.devDependencies], ['peerDependencies', pkg.peerDependencies]]
  const companionRootRequests = collectCompanionRootRequests(pkg)
  const appliedCompanionRootRequests: RootPackageRequest[] = []
  const appliedNativeOptionalRequests: RootPackageRequest[] = []

  for (const [sectionName, sectionValues] of rootSections) {
    ctx.throwIfAborted()
    if (!sectionValues) continue
    for (const [name, currentValue] of Object.entries(sectionValues)) {
      await ensureState(ctx, name, sectionName, currentValue, getRestrictionRange(restrictions, sectionName, name, currentValue), true)
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
  for (const state of ctx.states.values()) ctx.assignResolvedVersion(state.section, state.name, state.currentVersion)
  for (const [name, request] of ctx.unresolvedPeerRequests.entries()) ctx.assignResolvedVersion(request.section, name, request.range)

  const addedPeerDeps: AddedPeerDep[] = [
    ...Array.from(ctx.states.values()).filter(state => !state.root).map(state => ({ name: state.name, version: state.currentVersion, source: ctx.getPeerSourceLabel(state.name) })).sort((a, b) => a.name.localeCompare(b.name)),
    ...Array.from(ctx.unresolvedPeerRequests.entries()).map(([name, request]) => ({ name, version: request.range, source: Array.from(request.sources).sort((a, b) => a.localeCompare(b)).join(', ') || 'unknown', unresolved: true })).sort((a, b) => a.name.localeCompare(b.name)),
  ]
  const staleDependencyNames = Array.from(ctx.states.values()).filter(state => state.latestVersion && state.currentVersion !== state.latestVersion).map(state => state.name).sort((left, right) => left.localeCompare(right))
  const latestDependencyNames = Array.from(ctx.states.values()).filter(state => state.latestVersion && state.currentVersion === state.latestVersion).map(state => state.name).sort((left, right) => left.localeCompare(right))
  const transitiveOverrideMap = new Map<string, { version: string; sources: Set<string> }>()
  const transitiveOverrideWarnings: string[] = []
  const changeSourceMap = new Map<string, ChangeSourceHint>()

  for (const request of [...companionRootRequests, ...appliedCompanionRootRequests]) {
    if (!changeSourceMap.has(request.name)) {
      changeSourceMap.set(request.name, {
        name: request.name,
        source: request.sourceName,
        kind: 'companion',
        sourceVersion: request.sourceVersion,
        rootSource: request.rootSourceName,
        rootSourceVersion: request.rootSourceVersion,
      })
    }
  }

  for (const request of appliedNativeOptionalRequests) {
    if (!changeSourceMap.has(request.name)) {
      changeSourceMap.set(request.name, {
        name: request.name,
        source: request.sourceName,
        kind: 'platform',
        sourceVersion: request.sourceVersion,
        rootSource: request.rootSourceName,
        rootSourceVersion: request.rootSourceVersion,
      })
    }
  }

  for (const peerDep of addedPeerDeps) {
    if (!peerDep.unresolved && !changeSourceMap.has(peerDep.name)) {
      changeSourceMap.set(peerDep.name, {
        name: peerDep.name,
        source: peerDep.source,
        kind: 'peer',
      })
    }
  }

  for (const state of ctx.states.values()) {
    ctx.throwIfAborted()
    if (!state.root) continue
    for (const [name, version] of Object.entries(state.transitiveOverridePlans[state.currentVersion] ?? {})) {
      const existing = transitiveOverrideMap.get(name)
      if (!existing) { transitiveOverrideMap.set(name, { version, sources: new Set([state.name]) }); continue }
      existing.sources.add(state.name)
      if (existing.version !== version) transitiveOverrideWarnings.push(`Transitive override conflict for ${name}: ${Array.from(existing.sources).sort().join(', ')} require both ${existing.version} and ${version} under current engine constraints.`)
    }
  }

  for (const [name, entry] of transitiveOverrideMap.entries()) {
    if (changeSourceMap.has(name)) {
      continue
    }

    const sources = Array.from(entry.sources).sort((left, right) => left.localeCompare(right))
    if (sources.length === 1) {
      const sourceName = sources[0]
      const sourceState = ctx.states.get(sourceName)
      changeSourceMap.set(name, {
        name,
        source: sourceName,
        kind: 'override',
        sourceVersion: sourceState?.currentVersion,
      })
      continue
    }

    changeSourceMap.set(name, {
      name,
      source: sources.join(', '),
      kind: 'override',
    })
  }

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
    changeSources: Array.from(changeSourceMap.values()),
    transitiveOverrides: Array.from(transitiveOverrideMap.entries()).map(([name, entry]) => ({ name, version: entry.version, source: Array.from(entry.sources).sort((left, right) => left.localeCompare(right)).join(', ') })).sort((left, right) => left.name.localeCompare(right.name)),
    transitiveOverrideWarnings,
    recommendedUnfreezeNames: Array.from(ctx.recommendedUnfreezeNames).sort((left, right) => left.localeCompare(right)),
    fixRecommendations: Array.from(ctx.fixRecommendations).sort((left, right) => left.localeCompare(right)),
    platformSupport,
  }
}
