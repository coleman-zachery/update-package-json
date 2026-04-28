import type { AddedPeerDep, ResolveResult, VersionChange } from '@/lib/resolver'

export type AddedDependencySection = 'dependencies' | 'devDependencies' | 'peerDependencies'

export type AddedDependencyChange = VersionChange & {
  source?: string
}

export const ADDED_SECTION_LABELS: Record<AddedDependencySection, string> = {
  dependencies: 'Added dependencies',
  devDependencies: 'Added devDependencies',
  peerDependencies: 'Added peerDependencies',
}

export interface ChangeSummary {
  hasAnything: boolean
  engineChanges: VersionChange[]
  dependencyChanges: VersionChange[]
  addedDependenciesBySection: Record<AddedDependencySection, AddedDependencyChange[]>
  unresolvedPeerDependencies: AddedPeerDep[]
}

function withPeerSource(
  change: VersionChange,
  addedPeerDepsByName: Map<string, AddedPeerDep>,
): AddedDependencyChange {
  return {
    ...change,
    source: addedPeerDepsByName.get(change.name)?.source,
  }
}

export function createChangeSummary(result: ResolveResult): ChangeSummary {
  const addedPeerDeps = result.addedPeerDeps.filter(peerDep => !peerDep.unresolved)
  const addedPeerDepsByName = new Map(addedPeerDeps.map(peerDep => [peerDep.name, peerDep]))
  const unresolvedPeerDependencies = result.addedPeerDeps.filter(peerDep => peerDep.unresolved)

  return {
    hasAnything:
      result.auditStatus.state !== 'pass' ||
      result.changes.length > 0 ||
      result.addedPeerDeps.length > 0 ||
      result.conflicts.length > 0 ||
      result.engineWarnings.length > 0 ||
      result.engineOverrides.length > 0,
    engineChanges: result.changes.filter(change => change.section === 'engines'),
    dependencyChanges: result.changes.filter(change => change.section !== 'engines' && change.from !== '(none)'),
    addedDependenciesBySection: {
      dependencies: result.changes
        .filter(change => change.section === 'dependencies' && change.from === '(none)')
        .map(change => withPeerSource(change, addedPeerDepsByName)),
      devDependencies: result.changes
        .filter(change => change.section === 'devDependencies' && change.from === '(none)')
        .map(change => withPeerSource(change, addedPeerDepsByName)),
      peerDependencies: result.changes
        .filter(change => change.section === 'peerDependencies' && change.from === '(none)')
        .map(change => withPeerSource(change, addedPeerDepsByName)),
    },
    unresolvedPeerDependencies,
  }
}
