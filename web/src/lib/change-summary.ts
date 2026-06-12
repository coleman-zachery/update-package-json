import semver from 'semver'
import type {
  AddedPeerDep,
  ChangeSourceHint,
  ResolvedManifest,
  ResolveResult,
  VersionChange,
} from '@/lib/resolver'

export type VersionChangeDirection = 'added' | 'upgraded' | 'downgraded'

export interface VersionChangeEntry {
  name: string
  from: string | null
  to: string
  direction: VersionChangeDirection
  isPlatform: boolean
  reason?: string
  outputTone: 'upgrade' | 'downgrade'
}

export interface ChangeSummary {
  hasAnything: boolean
  engineChanges: VersionChange[]
  versionChanges: VersionChangeEntry[]
  unresolvedPeerDependencies: AddedPeerDep[]
}

function normalizeVersion(value: string | null | undefined): string | null {
  if (!value || value === '(none)') {
    return null
  }

  const normalized = value.replace(/^[\^~]/, '').trim()
  if (semver.valid(normalized)) {
    return normalized
  }

  return semver.minVersion(value)?.version ?? null
}

function getChangeDirection(change: VersionChange): VersionChangeDirection | null {
  if (change.section === 'engines') {
    return null
  }

  if (change.from === '(none)') {
    return 'added'
  }

  const previousVersion = normalizeVersion(change.from)
  const nextVersion = normalizeVersion(change.to)
  if (!previousVersion || !nextVersion) {
    return null
  }

  return semver.lt(nextVersion, previousVersion) ? 'downgraded' : 'upgraded'
}

function getConstraintRange(
  manifest: ResolvedManifest['manifest'],
  dependencyName: string,
): string | null {
  const directRange = manifest.dependencies?.[dependencyName] ?? manifest.optionalDependencies?.[dependencyName]
  if (directRange && semver.validRange(directRange)) {
    return directRange
  }

  const peerRange = manifest.peerDependencies?.[dependencyName]
  return peerRange && semver.validRange(peerRange) ? peerRange : null
}

function createSourceLabel(
  hint: ChangeSourceHint,
  manifestsByName: Map<string, ResolvedManifest>,
  finalVersion?: string,
): string {
  const sourceManifest = manifestsByName.get(hint.source)
  const sourceVersion = sourceManifest?.version ?? hint.sourceVersion
  const rootSourceName = hint.rootSource && hint.rootSource !== hint.source
    ? hint.rootSource
    : null
  const rootSourceManifest = rootSourceName ? manifestsByName.get(rootSourceName) : null
  const rootSourceVersion = rootSourceManifest?.version ?? hint.rootSourceVersion
  const normalizedFinalVersion = normalizeVersion(finalVersion)
  const shouldShowImmediateVersion = !(
    hint.kind === 'platform'
    && sourceVersion
    && normalizedFinalVersion
    && normalizeVersion(sourceVersion) === normalizedFinalVersion
  )
  const immediateLabel = sourceVersion && shouldShowImmediateVersion
    ? `${hint.source} ${sourceVersion}`
    : hint.source
  const baseLabel = rootSourceName
    ? `${rootSourceVersion ? `${rootSourceName} ${rootSourceVersion}` : rootSourceName} via ${immediateLabel}`
    : immediateLabel
  if (hint.kind === 'platform') {
    return baseLabel
  }

  if (hint.kind === 'override') {
    return `${baseLabel} (override)`
  }

  return baseLabel
}

function findDowngradeReason(
  change: VersionChange,
  manifests: ResolvedManifest[],
  manifestsByName: Map<string, ResolvedManifest>,
  latestVersion: string | undefined,
  sourceHint?: ChangeSourceHint,
): string | undefined {
  const finalVersion = normalizeVersion(change.to)
  if (!finalVersion || !latestVersion || !semver.valid(latestVersion) || finalVersion === latestVersion) {
    return sourceHint ? createSourceLabel(sourceHint, manifestsByName, change.to) : undefined
  }

  const candidates = manifests
    .filter(manifest => manifest.name !== change.name)
    .map((manifest, index) => {
      const requiredRange = getConstraintRange(manifest.manifest, change.name)
      if (!requiredRange) {
        return null
      }

      if (!semver.satisfies(finalVersion, requiredRange) || semver.satisfies(latestVersion, requiredRange)) {
        return null
      }

      const matchesHint = sourceHint?.source === manifest.name
      return {
        manifest,
        index,
        matchesHint,
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => {
      if (left.matchesHint !== right.matchesHint) {
        return left.matchesHint ? -1 : 1
      }

      if (left.manifest.root !== right.manifest.root) {
        return left.manifest.root ? -1 : 1
      }

      return left.index - right.index
    })

  const selected = candidates[0]?.manifest
  if (selected) {
    return `${selected.name} ${selected.version}`
  }

  return sourceHint ? createSourceLabel(sourceHint, manifestsByName, change.to) : undefined
}

function createVersionChangeEntry(
  change: VersionChange,
  manifests: ResolvedManifest[],
  manifestsByName: Map<string, ResolvedManifest>,
  sourceHintsByName: Map<string, ChangeSourceHint>,
): VersionChangeEntry | null {
  const direction = getChangeDirection(change)
  if (!direction) {
    return null
  }

  const resolvedManifest = manifestsByName.get(change.name)
  const sourceHint = sourceHintsByName.get(change.name)
  const finalVersion = normalizeVersion(change.to)
  const isLatestStable = Boolean(
    finalVersion
    && resolvedManifest?.latestVersion
    && finalVersion === resolvedManifest.latestVersion,
  )
  const outputTone = isLatestStable ? 'upgrade' : 'downgrade'
  const reason = direction === 'added'
    ? (sourceHint ? createSourceLabel(sourceHint, manifestsByName, change.to) : undefined)
    : outputTone === 'downgrade'
      ? findDowngradeReason(change, manifests, manifestsByName, resolvedManifest?.latestVersion, sourceHint)
      : undefined

  return {
    name: change.name,
    from: change.from === '(none)' ? null : change.from,
    to: change.to,
    direction: direction === 'added' ? 'added' : outputTone === 'upgrade' ? 'upgraded' : 'downgraded',
    isPlatform: sourceHint?.kind === 'platform',
    reason,
    outputTone,
  }
}

export function createChangeSummary(result: ResolveResult): ChangeSummary {
  const unresolvedPeerDependencies = result.addedPeerDeps.filter(peerDep => peerDep.unresolved)
  const unresolvedPeerNames = new Set(unresolvedPeerDependencies.map(peerDep => peerDep.name))
  const manifestsByName = new Map(result.resolvedManifests.map(manifest => [manifest.name, manifest]))
  const sourceHintsByName = new Map(result.changeSources.map(hint => [hint.name, hint]))
  const orderedChanges = Array.from(new Map(
    result.changes
      .filter(change => change.section !== 'engines' && !unresolvedPeerNames.has(change.name))
      .map(change => [change.name, change]),
  ).values())

  const versionChanges = orderedChanges
    .map(change => createVersionChangeEntry(change, result.resolvedManifests, manifestsByName, sourceHintsByName))
    .filter((entry): entry is VersionChangeEntry => Boolean(entry))

  return {
    hasAnything:
      result.auditStatus.state !== 'pass' ||
      result.changes.length > 0 ||
      result.addedPeerDeps.length > 0 ||
      result.conflicts.length > 0 ||
      result.engineWarnings.length > 0 ||
      result.engineOverrides.length > 0 ||
      result.fixRecommendations.length > 0,
    engineChanges: result.changes.filter(change => change.section === 'engines'),
    versionChanges,
    unresolvedPeerDependencies,
  }
}
