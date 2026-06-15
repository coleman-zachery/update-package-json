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
