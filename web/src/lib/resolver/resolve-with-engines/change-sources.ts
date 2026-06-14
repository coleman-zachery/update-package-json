import type { ResolutionContext } from '../pass-context'
import type {
  AddedPeerDep,
  ChangeSourceHint,
} from '../types'
import type { RootPackageRequest } from '../companions'

export interface ChangeSourceState {
  changeSources: ChangeSourceHint[]
  transitiveOverrides: Array<{ name: string; version: string; source: string }>
  transitiveOverrideWarnings: string[]
}

export function buildChangeSourceState(
  ctx: ResolutionContext,
  addedPeerDeps: AddedPeerDep[],
  companionRootRequests: RootPackageRequest[],
  appliedCompanionRootRequests: RootPackageRequest[],
  appliedNativeOptionalRequests: RootPackageRequest[],
): ChangeSourceState {
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
    if (!state.root) {
      continue
    }

    for (const [name, version] of Object.entries(state.transitiveOverridePlans[state.currentVersion] ?? {})) {
      const existing = transitiveOverrideMap.get(name)
      if (!existing) {
        transitiveOverrideMap.set(name, { version, sources: new Set([state.name]) })
        continue
      }

      existing.sources.add(state.name)
      if (existing.version !== version) {
        transitiveOverrideWarnings.push(
          `Transitive override conflict for ${name}: ${Array.from(existing.sources).sort().join(', ')} require both ${existing.version} and ${version} under current engine constraints.`,
        )
      }
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
    changeSources: Array.from(changeSourceMap.values()),
    transitiveOverrides: Array.from(transitiveOverrideMap.entries())
      .map(([name, entry]) => ({
        name,
        version: entry.version,
        source: Array.from(entry.sources).sort((left, right) => left.localeCompare(right)).join(', '),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    transitiveOverrideWarnings,
  }
}
