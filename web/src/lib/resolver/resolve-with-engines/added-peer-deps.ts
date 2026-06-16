import type { ResolutionContext } from '../pass-context'
import type { AddedPeerDep } from '../types'

export function createAddedPeerDeps(ctx: ResolutionContext): AddedPeerDep[] {
  return [
    ...Array.from(ctx.states.values())
      .filter(state => !state.root)
      .map(state => ({
        name: state.name,
        version: state.currentVersion,
        source: ctx.getPeerSourceLabel(state.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    ...Array.from(ctx.unresolvedPeerRequests.entries())
      .map(([name, request]) => ({
        name,
        version: request.range,
        source: Array.from(request.sources).sort((a, b) => a.localeCompare(b)).join(', ') || 'unknown',
        unresolved: true,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  ]
}
