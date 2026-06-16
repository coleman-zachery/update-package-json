import semver from 'semver'
import { isEngineCompatible, newestSatisfying } from '@/lib/semver-utils'
import { getPreferredCandidateIndex, getPreferredSection, getRequiredPeerDependencies, getPeerRequirementSection, shouldEnforcePeerRequirement } from './state-helpers'
import type { CandidateVersionAnalysis, DependencySection, PackageState } from './types'
import type { ResolutionContext } from './pass-context'

export async function buildPackageState(
  ctx: ResolutionContext,
  name: string,
  section: DependencySection,
  currentValue: string | undefined,
  restrictedRange: string | undefined,
  root: boolean,
): Promise<PackageState | null> {
  ctx.throwIfAborted()
  const packument = await ctx.getPackumentCached(name)
  const allStableVersions = ctx.getSortedStableVersions(packument)
  const latestVersion = allStableVersions[0]
  const engineCompatibleVersions = allStableVersions.filter(version =>
    isEngineCompatible(packument.versions[version]?.engines, ctx.rootNode, ctx.rootNpm, ctx.respectNode, ctx.respectNpm),
  )
  let candidateVersions = restrictedRange && semver.validRange(restrictedRange)
    ? engineCompatibleVersions.filter(version => semver.satisfies(version, restrictedRange))
    : engineCompatibleVersions
  let noInstallableDependencyGraph = false
  let selectedViaTransitiveOverrideFallback = false
  const transitiveOverridePlans: Record<string, Record<string, string>> = {}

  async function analyzeCandidateVersions(versions: string[], allowOverrideCompatible: boolean): Promise<CandidateVersionAnalysis> {
    const dependencyCompatibleCandidates: string[] = []
    const overrideCompatibleCandidates: string[] = []
    for (const version of versions) {
      ctx.throwIfAborted()
      const overridePlan = await ctx.getTransitiveOverridePlan(packument.versions[version])
      if (!overridePlan) continue
      transitiveOverridePlans[version] = overridePlan
      if (Object.keys(overridePlan).length === 0) dependencyCompatibleCandidates.push(version)
      else if (allowOverrideCompatible) overrideCompatibleCandidates.push(version)
    }
    return { dependencyCompatibleCandidates, overrideCompatibleCandidates }
  }

  if (candidateVersions.length > 0) {
    const analysis = await analyzeCandidateVersions(candidateVersions, ctx.shouldAutoTransitiveEngineOverrides && root)
    if (analysis.dependencyCompatibleCandidates.length > 0) candidateVersions = analysis.dependencyCompatibleCandidates
    else if (analysis.overrideCompatibleCandidates.length > 0) {
      candidateVersions = analysis.overrideCompatibleCandidates
      selectedViaTransitiveOverrideFallback = true
    } else {
      noInstallableDependencyGraph = true
      candidateVersions = []
    }
  }

  const preferredIndex = getPreferredCandidateIndex(candidateVersions, ctx.options.avoidLatestVersions)
  let currentVersion: string | undefined = candidateVersions[preferredIndex]
  if (!currentVersion) {
    const fallback = currentValue && semver.validRange(currentValue) ? newestSatisfying(allStableVersions, currentValue) : null
    const normalizedCurrentValue = currentValue?.replace(/^[\^~]/, '').trim() ?? ''
    currentVersion = fallback ?? (normalizedCurrentValue && packument.versions[normalizedCurrentValue] ? normalizedCurrentValue : undefined)
    if (!currentVersion) return null

    if (restrictedRange) {
      ctx.recommendUnfreeze(name, noInstallableDependencyGraph
        ? 'it is blocking versions whose direct dependency graph stays compatible with the current engine constraints'
        : 'it is blocking versions compatible with the current engine constraints')
    }
    const suffix = restrictedRange ? ` Recommended fix: remove the override/freeze for ${name} and rerun Apply Fixes.` : ''
    ctx.engineWarnings.push(`${noInstallableDependencyGraph ? `${name}: no version found whose direct dependency ranges stay compatible with engine constraints` : `${name}: no compatible version found for engine constraints`}${suffix}`)
    candidateVersions = [currentVersion]
  }

  const resolvedVersion = currentVersion
  const manifest = packument.versions[resolvedVersion]
  if (!manifest) return null

  if (restrictedRange && root && selectedViaTransitiveOverrideFallback) {
    const unrestrictedAnalysis = await analyzeCandidateVersions(engineCompatibleVersions, false)
    if (unrestrictedAnalysis.dependencyCompatibleCandidates.length > 0) {
      const overridePlan = transitiveOverridePlans[resolvedVersion] ?? {}
      const names = Object.keys(overridePlan).sort((left, right) => left.localeCompare(right))
      const transitiveLabel = names.length === 0 ? 'transitive engine overrides' : names.length === 1 ? `a transitive engine override for ${names[0]}` : `transitive engine overrides for ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''}`
      const frozenLabel = currentValue ? `"${currentValue}"` : `"${currentVersion}"`
      ctx.recommendUnfreeze(name, `it is frozen to ${frozenLabel}, which requires ${transitiveLabel}; unfreezing lets the resolver choose a cleaner engine-compatible version`)
    }
  }

  if (!candidateVersions.includes(resolvedVersion)) candidateVersions = [resolvedVersion, ...candidateVersions]
  return { name, section, root, latestVersion, candidateVersions, currentIndex: candidateVersions.indexOf(resolvedVersion), currentVersion: resolvedVersion, manifest, peerDependencies: getRequiredPeerDependencies(manifest), transitiveOverridePlans }
}

export async function ensureState(
  ctx: ResolutionContext,
  name: string,
  section: DependencySection,
  currentValue: string | undefined,
  restrictedRange: string | undefined,
  root: boolean,
  source?: string,
): Promise<PackageState | null> {
  ctx.throwIfAborted()
  const existing = ctx.states.get(name)
  if (existing) {
    if (root && !existing.root) { existing.root = true; existing.section = section }
    else if (!root && !existing.root) existing.section = getPreferredSection(existing.section, section)
    ctx.unresolvedPeerRequests.delete(name)
    return existing
  }

  ctx.registerTraversal(name)

  try {
    const nextState = await buildPackageState(ctx, name, section, currentValue, restrictedRange, root)
    if (!nextState) {
      if (root) ctx.conflicts.push(`${name}: unable to resolve a published version`)
      else ctx.recordUnresolvedPeerRequest(name, currentValue ?? '', section, source)
      ctx.completeTraversal(name)
      return null
    }
    ctx.states.set(name, nextState)
    ctx.unresolvedPeerRequests.delete(name)
    ctx.completeTraversal(name)
    return nextState
  } catch (e) {
    if (root) ctx.conflicts.push(`${name}: ${(e as Error).message}`)
    else ctx.recordUnresolvedPeerRequest(name, currentValue ?? '', section, source)
    ctx.completeTraversal(name)
    return null
  }
}

export async function setStateVersion(ctx: ResolutionContext, name: string, nextVersion: string): Promise<boolean> {
  ctx.throwIfAborted()
  const state = ctx.states.get(name)
  if (!state || state.currentVersion === nextVersion) return false
  const manifest = (await ctx.getPackumentCached(name)).versions[nextVersion]
  if (!manifest) { ctx.conflicts.push(`${name}@${nextVersion}: missing published manifest`); return false }
  state.currentVersion = nextVersion
  state.currentIndex = state.candidateVersions.indexOf(nextVersion) >= 0 ? state.candidateVersions.indexOf(nextVersion) : state.currentIndex
  state.manifest = manifest
  state.peerDependencies = getRequiredPeerDependencies(manifest)
  if (!(nextVersion in state.transitiveOverridePlans)) {
    const overridePlan = await ctx.getTransitiveOverridePlan(manifest)
    if (overridePlan) state.transitiveOverridePlans[nextVersion] = overridePlan
  }
  return true
}

export async function syncPeerGraph(ctx: ResolutionContext): Promise<void> {
  let changed = true
  while (changed) {
    ctx.throwIfAborted()
    changed = false
    const requiredPeers = new Map<string, { range: string; sources: Set<string>; section: DependencySection }>()
    for (const state of ctx.states.values()) {
      for (const [peerName, peerRequirement] of Object.entries(state.peerDependencies)) {
        if (!shouldEnforcePeerRequirement(peerRequirement, peerName, ctx.options.addOptionalPeerDeps, ctx.states)) continue
        const peerSection = getPeerRequirementSection(state.section, peerRequirement.optional)
        const request = requiredPeers.get(peerName) ?? { range: peerRequirement.range, sources: new Set<string>(), section: peerSection }
        request.range = peerRequirement.range
        request.section = getPreferredSection(request.section, peerSection)
        request.sources.add(state.name)
        requiredPeers.set(peerName, request)
      }
    }

    for (const [peerName, request] of requiredPeers) {
      ctx.throwIfAborted()
      const existing = ctx.states.get(peerName)
      if (existing) {
        if (!existing.root) existing.section = getPreferredSection(existing.section, request.section)
        ctx.unresolvedPeerRequests.delete(peerName)
        continue
      }
      const added = await ensureState(ctx, peerName, request.section, request.range, undefined, false, Array.from(request.sources).sort()[0])
      if (added) changed = true
    }

    for (const [name, request] of Array.from(ctx.unresolvedPeerRequests.entries())) {
      const currentRequest = requiredPeers.get(name)
      if (!currentRequest) { ctx.unresolvedPeerRequests.delete(name); changed = true; continue }
      request.range = currentRequest.range
      request.sources = currentRequest.sources
      request.section = currentRequest.section
    }

    for (const [name, state] of Array.from(ctx.states.entries())) {
      if (state.root || requiredPeers.has(name)) continue
      ctx.states.delete(name)
      ctx.unresolvedPeerRequests.delete(name)
      changed = true
    }
  }
}
