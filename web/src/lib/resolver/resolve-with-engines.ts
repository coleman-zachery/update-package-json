import type { PackageJson } from '@/lib/package-json'
import type { RestrictionState } from '@/lib/restrictions'
import { createResolutionContext } from './pass-context'
import { stabilizeResolutionGraph } from './pass-conflicts'
import { runAuditPass } from './audit-pass'
import { ensureState, syncPeerGraph } from './pass-state'
import { getRestrictionRange } from './state-helpers'
import type { AddedPeerDep, DependencySection, ResolutionPass, ResolveOptions } from './types'

export async function resolveWithEngines(
  pkg: PackageJson,
  options: ResolveOptions,
  restrictions: RestrictionState,
  rootNode: string | undefined,
  rootNpm: string | undefined,
  respectNode: boolean,
  respectNpm: boolean,
): Promise<ResolutionPass> {
  const ctx = createResolutionContext(pkg, options, restrictions, rootNode, rootNpm, respectNode, respectNpm)
  const rootSections: Array<[DependencySection, Record<string, string> | undefined]> = [['dependencies', pkg.dependencies], ['devDependencies', pkg.devDependencies], ['peerDependencies', pkg.peerDependencies]]

  for (const [sectionName, sectionValues] of rootSections) {
    if (!sectionValues) continue
    for (const [name, currentValue] of Object.entries(sectionValues)) {
      await ensureState(ctx, name, sectionName, currentValue, getRestrictionRange(restrictions, sectionName, name, currentValue), true)
    }
  }

  await syncPeerGraph(ctx)
  await stabilizeResolutionGraph(ctx)
  const auditStatus = await runAuditPass(ctx)
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

  for (const state of ctx.states.values()) {
    if (!state.root) continue
    for (const [name, version] of Object.entries(state.transitiveOverridePlans[state.currentVersion] ?? {})) {
      const existing = transitiveOverrideMap.get(name)
      if (!existing) { transitiveOverrideMap.set(name, { version, sources: new Set([state.name]) }); continue }
      existing.sources.add(state.name)
      if (existing.version !== version) transitiveOverrideWarnings.push(`Transitive override conflict for ${name}: ${Array.from(existing.sources).sort().join(', ')} require both ${existing.version} and ${version} under current engine constraints.`)
    }
  }

  return {
    deps: ctx.deps,
    devDeps: ctx.devDeps,
    peerDeps: ctx.peerDeps,
    auditStatus,
    addedPeerDeps,
    conflicts: ctx.conflicts,
    engineWarnings: ctx.engineWarnings,
    latestDependencyNames,
    staleDependencyNames,
    resolvedManifests: Array.from(ctx.states.values()).map(state => ({ name: state.name, version: state.currentVersion, manifest: state.manifest })),
    transitiveOverrides: Array.from(transitiveOverrideMap.entries()).map(([name, entry]) => ({ name, version: entry.version, source: Array.from(entry.sources).sort((left, right) => left.localeCompare(right)).join(', ') })).sort((left, right) => left.name.localeCompare(right.name)),
    transitiveOverrideWarnings,
    recommendedUnfreezeNames: Array.from(ctx.recommendedUnfreezeNames).sort((left, right) => left.localeCompare(right)),
    fixRecommendations: Array.from(ctx.fixRecommendations).sort((left, right) => left.localeCompare(right)),
  }
}
