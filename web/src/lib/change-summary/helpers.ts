import { getDependencyVersion, getStringOverrides, type PackageJson } from '@/lib/package-json'
import semver from 'semver'
import type {
  AddedPeerDep,
  ChangeSourceHint,
  ResolvedManifest,
  VersionChange,
} from '@/lib/resolver'
import type {
  VersionChangeDirection,
  VersionChangeEntry,
} from './index'

export function normalizeVersion(value: string | null | undefined): string | null {
  if (!value || value === '(none)') {
    return null
  }

  const normalized = value.replace(/^[\^~]/, '').trim()
  if (semver.valid(normalized)) {
    return normalized
  }

  return semver.minVersion(value)?.version ?? null
}

export function getChangeDirection(change: VersionChange): VersionChangeDirection | null {
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

function splitSourceNames(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

function createPinnedSourceLabels(
  candidates: ResolvedManifest[],
  sourceHint?: ChangeSourceHint,
): string[] {
  const rootCandidates = candidates
    .filter(candidate => candidate.root)
    .map(candidate => candidate.name)

  if (rootCandidates.length > 0) {
    return Array.from(new Set(rootCandidates)).sort((left, right) => left.localeCompare(right))
  }

  if (sourceHint) {
    const sources = splitSourceNames(sourceHint.source)
    const rootSources = splitSourceNames(sourceHint.rootSource)

    if (rootSources.length === 1 && sources.length === 1 && rootSources[0] !== sources[0]) {
      return [`${rootSources[0]} via ${sources[0]}`]
    }

    const preferredSources = rootSources.length > 0 ? rootSources : sources
    if (preferredSources.length > 0) {
      return Array.from(new Set(preferredSources)).sort((left, right) => left.localeCompare(right))
    }
  }

  return Array.from(new Set(
    candidates.map(candidate => candidate.name),
  )).sort((left, right) => left.localeCompare(right))
}

export function createPinnedBelowLatestReason(
  name: string,
  resolvedVersion: string | null | undefined,
  latestVersion: string | undefined,
  manifests: ResolvedManifest[],
  sourceHint?: ChangeSourceHint,
): string | undefined {
  if (!resolvedVersion || !latestVersion || !semver.valid(resolvedVersion) || !semver.valid(latestVersion)) {
    return undefined
  }

  if (!semver.lt(resolvedVersion, latestVersion)) {
    return undefined
  }

  const candidates = manifests.filter(manifest => {
    if (manifest.name === name) {
      return false
    }

    const requiredRange = getConstraintRange(manifest.manifest, name)
    return Boolean(
      requiredRange
      && semver.satisfies(resolvedVersion, requiredRange)
      && !semver.satisfies(latestVersion, requiredRange),
    )
  })

  const viaLabels = createPinnedSourceLabels(candidates, sourceHint)
  if (viaLabels.length === 0) {
    return undefined
  }

  return `pinned below latest ${latestVersion} via ${viaLabels.join(', ')}`
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

      return {
        manifest,
        index,
        matchesHint: sourceHint?.source === manifest.name,
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

function getDisplayedVersion(
  change: VersionChange,
  displayPackage: PackageJson | null | undefined,
): string {
  if (!displayPackage) {
    return change.to
  }

  return getDependencyVersion(displayPackage, change.name)
    ?? getStringOverrides(displayPackage)[change.name]
    ?? change.to
}

function getOutputResolvedVersion(
  change: VersionChange,
  displayPackage: PackageJson | null,
): string | null {
  if (!displayPackage) {
    return null
  }

  return normalizeVersion(getDisplayedVersion(change, displayPackage))
}

export function createVersionChangeEntry(
  change: VersionChange,
  manifests: ResolvedManifest[],
  manifestsByName: Map<string, ResolvedManifest>,
  sourceHintsByName: Map<string, ChangeSourceHint>,
  displayPackage: PackageJson | null = null,
): VersionChangeEntry | null {
  const direction = getChangeDirection(change)
  if (!direction) {
    return null
  }

  const resolvedManifest = manifestsByName.get(change.name)
  const sourceHint = sourceHintsByName.get(change.name)
  const finalVersion = normalizeVersion(change.to)
  const outputResolvedVersion = getOutputResolvedVersion(change, displayPackage)
  const pinnedReason = createPinnedBelowLatestReason(
    change.name,
    outputResolvedVersion,
    resolvedManifest?.latestVersion,
    manifests,
    sourceHint,
  )
  const isLatestStable = Boolean(
    finalVersion
    && resolvedManifest?.latestVersion
    && semver.valid(resolvedManifest.latestVersion)
    && !semver.lt(finalVersion, resolvedManifest.latestVersion),
  )
  const outputTone = pinnedReason ? 'downgrade' : isLatestStable ? 'upgrade' : 'downgrade'
  const reason = direction === 'added'
    ? (
        pinnedReason
        ?? (sourceHint ? createSourceLabel(sourceHint, manifestsByName, change.to) : undefined)
      )
    : pinnedReason
      ?? (outputTone === 'downgrade'
      ? findDowngradeReason(change, manifests, manifestsByName, resolvedManifest?.latestVersion, sourceHint)
      : undefined)

  return {
    name: change.name,
    from: change.from === '(none)' ? null : change.from,
    to: change.to,
    displayTo: getDisplayedVersion(change, displayPackage),
    direction: direction === 'added' ? 'added' : outputTone === 'upgrade' ? 'upgraded' : 'downgraded',
    isPlatform: sourceHint?.kind === 'platform',
    reason,
    outputTone,
  }
}
export function getUnresolvedPeerNames(
  unresolvedPeerDependencies: AddedPeerDep[],
): Set<string> {
  return new Set(unresolvedPeerDependencies.map(peerDep => peerDep.name))
}
