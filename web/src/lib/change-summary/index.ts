import type { PackageJson } from '@/lib/package-json'
import type {
  AddedPeerDep,
  ResolveResult,
  VersionChange,
} from '@/lib/resolver'
import {
  createVersionChangeEntry,
  getUnresolvedPeerNames,
} from './helpers'
import { createVersionChangeOverridesSummary } from './override-summary'

export type VersionChangeDirection = 'added' | 'upgraded' | 'downgraded'

export interface VersionChangeEntry {
  name: string
  from: string | null
  to: string
  displayTo: string
  direction: VersionChangeDirection
  isPlatform: boolean
  reason?: string
  outputTone: 'upgrade' | 'downgrade' | 'override'
}

export interface ChangeSummary {
  hasAnything: boolean
  engineChanges: VersionChange[]
  versionChanges: VersionChangeEntry[]
  unresolvedPeerDependencies: AddedPeerDep[]
}

export function createChangeSummary(
  result: ResolveResult,
  options: {
    inputPackage?: PackageJson
    displayPackage?: PackageJson | null
  } = {},
): ChangeSummary {
  const unresolvedPeerDependencies = result.addedPeerDeps.filter(peerDep => peerDep.unresolved)
  const unresolvedPeerNames = getUnresolvedPeerNames(unresolvedPeerDependencies)
  const manifestsByName = new Map(result.resolvedManifests.map(manifest => [manifest.name, manifest]))
  const sourceHintsByName = new Map(result.changeSources.map(hint => [hint.name, hint]))
  const orderedChanges = Array.from(new Map(
    result.changes
      .filter(change => change.section !== 'engines' && !unresolvedPeerNames.has(change.name))
      .map(change => [change.name, change]),
  ).values())

  const versionChanges = orderedChanges
    .map(change => createVersionChangeEntry(
      change,
      result.resolvedManifests,
      manifestsByName,
      sourceHintsByName,
      options.displayPackage ?? null,
    ))
    .filter((entry): entry is VersionChangeEntry => Boolean(entry))
  const versionChangesByName = new Map(versionChanges.map(change => [change.name, change]))
  const overrideSummaries = createVersionChangeOverridesSummary(
    options.inputPackage ?? {},
    options.displayPackage ?? null,
    manifestsByName,
  )

  for (const overrideSummary of overrideSummaries) {
    const existing = versionChangesByName.get(overrideSummary.name)
    if (existing) {
      if (!existing.reason) {
        existing.reason = overrideSummary.reason
      } else if (overrideSummary.reason && !existing.reason.includes(overrideSummary.reason)) {
        existing.reason = `${existing.reason}; ${overrideSummary.reason}`
      }
      continue
    }

    versionChanges.push(overrideSummary)
    versionChangesByName.set(overrideSummary.name, overrideSummary)
  }

  return {
    hasAnything:
      result.auditStatus.state !== 'pass'
      || result.changes.length > 0
      || result.addedPeerDeps.length > 0
      || result.conflicts.length > 0
      || result.engineWarnings.length > 0
      || result.engineOverrides.length > 0
      || result.fixRecommendations.length > 0,
    engineChanges: result.changes.filter(change => change.section === 'engines'),
    versionChanges,
    unresolvedPeerDependencies,
  }
}
