import semver from 'semver'
import { formatCompactSemverRange } from '@/lib/semver-display'
import { getRequiredPeerDependencies, getSharedDependencyRequirement, getSharedDependencyRequirements } from './state-helpers'
import { setStateVersion, syncPeerGraph } from './pass-state'
import type { PackageState } from './types'
import type { ResolutionContext } from './pass-context'

function getDependentsForPeer(ctx: ResolutionContext, peerName: string): Array<{ dependent: PackageState; requiredRange: string }> {
  return Array.from(ctx.states.values())
    .flatMap(state => state.peerDependencies[peerName] ? [{ dependent: state, requiredRange: state.peerDependencies[peerName].range }] : [])
}

function getCandidateSearchOrder(state: PackageState): string[] {
  return Array.from(new Set(state.candidateVersions))
}

function getDependentsForSharedDependency(
  ctx: ResolutionContext,
  dependencyName: string,
): Array<{ dependent: PackageState; requiredRange: string }> {
  return Array.from(ctx.states.values()).flatMap(state => {
    if (state.name === dependencyName) return []
    const requirement = getSharedDependencyRequirement(state.manifest, dependencyName)
    return requirement && semver.validRange(requirement) ? [{ dependent: state, requiredRange: requirement }] : []
  })
}

function findCompatibleDowngrade(state: PackageState, dependents: Array<{ requiredRange: string }>): string | null {
  return getCandidateSearchOrder(state).find(candidate =>
    dependents.every(({ requiredRange }) => semver.satisfies(candidate, requiredRange)),
  ) ?? null
}

async function findDependentVersionForPeer(ctx: ResolutionContext, dependent: PackageState, peerName: string, peerVersion: string): Promise<string | null> {
  const packument = await ctx.getPackumentCached(dependent.name)
  for (const candidate of getCandidateSearchOrder(dependent)) {
    const requiredRange = getRequiredPeerDependencies(packument.versions[candidate])[peerName]?.range
    if (!requiredRange || semver.satisfies(peerVersion, requiredRange)) return candidate
  }
  return null
}

async function findDependentVersionForSharedDependency(ctx: ResolutionContext, dependent: PackageState, dependencyName: string, dependencyVersion: string): Promise<string | null> {
  const packument = await ctx.getPackumentCached(dependent.name)
  for (const candidate of getCandidateSearchOrder(dependent)) {
    const requiredRange = getSharedDependencyRequirement(packument.versions[candidate], dependencyName)
    if (!requiredRange || !semver.validRange(requiredRange) || semver.satisfies(dependencyVersion, requiredRange)) return candidate
  }
  return null
}

function findFirstPeerConflict(ctx: ResolutionContext): { dependent: PackageState; peer: PackageState; requiredRange: string } | null {
  for (const dependent of ctx.states.values()) {
    for (const [peerName, requirement] of Object.entries(dependent.peerDependencies)) {
      const peer = ctx.states.get(peerName)
      if (peer && !semver.satisfies(peer.currentVersion, requirement.range)) return { dependent, peer, requiredRange: requirement.range }
    }
  }
  return null
}

function findFirstSharedDependencyConflict(ctx: ResolutionContext): { dependent: PackageState; dependency: PackageState; requiredRange: string } | null {
  for (const dependent of ctx.states.values()) {
    for (const [dependencyName, requiredRange] of Object.entries(getSharedDependencyRequirements(dependent.manifest))) {
      const dependency = ctx.states.get(dependencyName)
      if (dependency && dependencyName !== dependent.name && semver.validRange(requiredRange) && !semver.satisfies(dependency.currentVersion, requiredRange)) {
        return { dependent, dependency, requiredRange }
      }
    }
  }
  return null
}

async function stabilizeSharedDependencyConflicts(ctx: ResolutionContext): Promise<void> {
  for (let pass = 0; pass < 200; pass++) {
    const conflict = findFirstSharedDependencyConflict(ctx)
    if (!conflict) break
    const dependencyDowngrade = findCompatibleDowngrade(conflict.dependency, getDependentsForSharedDependency(ctx, conflict.dependency.name))
    if (dependencyDowngrade && dependencyDowngrade !== conflict.dependency.currentVersion && await setStateVersion(ctx, conflict.dependency.name, dependencyDowngrade)) {
      await syncPeerGraph(ctx)
      continue
    }
    const dependentDowngrade = await findDependentVersionForSharedDependency(ctx, conflict.dependent, conflict.dependency.name, conflict.dependency.currentVersion)
    if (dependentDowngrade && dependentDowngrade !== conflict.dependent.currentVersion && await setStateVersion(ctx, conflict.dependent.name, dependentDowngrade)) {
      await syncPeerGraph(ctx)
      continue
    }
    break
  }
}

async function stabilizePeerConflicts(ctx: ResolutionContext): Promise<void> {
  for (let pass = 0; pass < 200; pass++) {
    const conflict = findFirstPeerConflict(ctx)
    if (!conflict) break
    const peerDowngrade = findCompatibleDowngrade(conflict.peer, getDependentsForPeer(ctx, conflict.peer.name))
    if (peerDowngrade && peerDowngrade !== conflict.peer.currentVersion && await setStateVersion(ctx, conflict.peer.name, peerDowngrade)) {
      await syncPeerGraph(ctx)
      continue
    }
    const dependentDowngrade = await findDependentVersionForPeer(ctx, conflict.dependent, conflict.peer.name, conflict.peer.currentVersion)
    if (dependentDowngrade && dependentDowngrade !== conflict.dependent.currentVersion && await setStateVersion(ctx, conflict.dependent.name, dependentDowngrade)) {
      await syncPeerGraph(ctx)
      continue
    }

    const recommendedUnfreezes = [ctx.isStateRestricted(conflict.dependent) ? conflict.dependent.name : null, ctx.isStateRestricted(conflict.peer) ? conflict.peer.name : null]
      .filter((value): value is string => Boolean(value))
    for (const name of recommendedUnfreezes) {
      ctx.recommendUnfreeze(name, `it is participating in the unresolved peer conflict between ${conflict.dependent.name} and ${conflict.peer.name}`)
    }
    ctx.conflicts.push(`${conflict.dependent.name}@${conflict.dependent.currentVersion} requires ${conflict.peer.name}@${formatCompactSemverRange(conflict.requiredRange)}, but resolved ${conflict.peer.name}@${conflict.peer.currentVersion}${recommendedUnfreezes.length > 0 ? ` Recommended fix: remove the override/freeze for ${recommendedUnfreezes.join(' or ')} and rerun Apply Fixes.` : ''}`)
    break
  }
}

function getResolutionGraphSnapshot(ctx: ResolutionContext): string {
  return Array.from(ctx.states.values()).map(state => `${state.name}@${state.currentVersion}`).sort((left, right) => left.localeCompare(right)).join('|')
}

export async function stabilizeResolutionGraph(ctx: ResolutionContext): Promise<void> {
  for (let pass = 0; pass < 50; pass++) {
    const previousSnapshot = getResolutionGraphSnapshot(ctx)
    await stabilizeSharedDependencyConflicts(ctx)
    await stabilizePeerConflicts(ctx)
    if (getResolutionGraphSnapshot(ctx) === previousSnapshot) break
  }
}
