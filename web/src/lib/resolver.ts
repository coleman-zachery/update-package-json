import semver from 'semver'
import { fetchPackageAuditReports, type PackageAuditReport } from '@/lib/audit'
import {
  formatNpmPackageManager,
  getDependencyVersion,
  getStringOverrides,
  isNpmSupportAligned,
  isPinnedNpmVersion,
  isUnpinnedSemverRange,
  parsePackageJson,
  parsePackageManager,
  sortDependencies,
  type NpmDeclarationSource,
  type PackageJson,
} from '@/lib/package-json'
import {
  fetchLatestNodeVersion,
  fetchLatestNpmVersion,
  fetchPackument,
  fetchNodeVersions,
  getAllVersions,
  getPreferredStableVersions,
  type VersionManifest,
} from '@/lib/npm'
import {
  ENGINE_NPM_RESTRICTION_KEY,
  PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  getRestrictionKey,
  type RestrictionState,
} from '@/lib/restrictions'
import {
  filterStable,
  newestSatisfying,
  isEngineCompatible,
} from '@/lib/semver-utils'
import { formatCompactSemverRange } from '@/lib/semver-display'

export interface ResolveOptions {
  respectEnginesNode: boolean
  respectEnginesNpm: boolean
  addOptionalPeerDeps: boolean
  avoidLatestVersions: boolean
  addEnginesNode: boolean
  addEnginesNpm: boolean
}

export type EngineName = 'node' | 'npm'

export interface VersionChange {
  name: string
  from: string
  to: string
  section: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'engines'
}

export interface AddedPeerDep {
  name: string
  version: string
  source: string
  unresolved?: boolean // true when no compatible version found (e.g. engine mismatch)
}

export interface ResolveResult {
  updatedPackage: PackageJson
  auditStatus: AuditStatus
  latestDependencyNames: string[]
  staleDependencyNames: string[]
  changes: VersionChange[]
  addedPeerDeps: AddedPeerDep[]
  conflicts: string[]
  engineWarnings: string[]
  engineOverrides: string[]
  recommendedUnfreezeNames: string[]
  fixRecommendations: string[]
}

export interface EngineValidationIssue {
  engine: EngineName
  value: string
  kind: 'invalid-range' | 'no-published-version'
}

export interface InputValidationState {
  errors: string[]
  warnings: string[]
  engineIssues: EngineValidationIssue[]
}

export interface AuditStatus {
  state: 'pass' | 'warning' | 'failure'
  summary: string
  details: string[]
  warnings: number
  vulnerabilities: number
  recommendedUnfreezeNames: string[]
}

interface PackageManagerValidationIssue {
  value: string
  kind: 'invalid-format' | 'unsupported-manager' | 'invalid-version' | 'no-published-version'
}

function createUnavailableAuditStatus(detail?: string): AuditStatus {
  return {
    state: 'warning',
    summary: 'Audit status could not be fully verified',
    details: [
      detail || 'The OSV audit service could not be reached while resolving package versions.',
    ],
    warnings: 1,
    vulnerabilities: 0,
    recommendedUnfreezeNames: [],
  }
}

function formatAuditFinding(report: PackageAuditReport): string {
  const advisoryLabels = report.advisories
    .slice(0, 2)
    .map(advisory => advisory.id)
    .join(', ')
  const advisorySuffix = report.advisories.length > 2 ? ', ...' : ''
  return `${report.name}@${report.version}: ${report.advisories.length} advisories (${advisoryLabels}${advisorySuffix})`
}

function formatEngineIssue(issue: EngineValidationIssue, overrideLatest?: string): string {
  const target = issue.engine === 'node' ? 'Node.js' : 'npm'
  const base = issue.kind === 'invalid-range'
    ? `engines.${issue.engine} "${issue.value}" is not a valid semver range`
    : `engines.${issue.engine} "${issue.value}" does not match any published ${target} version`

  return overrideLatest ? `using ${issue.engine} latest ${overrideLatest}. ${base}` : base
}

function formatPackageManagerIssue(
  issue: PackageManagerValidationIssue,
  overrideLatest?: string,
): string {
  const base = issue.kind === 'invalid-format'
    ? `packageManager "${issue.value}" must look like "npm@x.y.z"`
    : issue.kind === 'unsupported-manager'
      ? `packageManager "${issue.value}" is not an npm packageManager declaration`
      : issue.kind === 'invalid-version'
        ? `packageManager "${issue.value}" must pin an exact npm version like "npm@11.7.0"`
        : `packageManager "${issue.value}" does not match any published npm version`

  return overrideLatest ? `using npm latest ${overrideLatest}. ${base}` : base
}

function formatNpmAlignmentWarning(engineNpm: string, packageManager: string): string {
  return `engines.npm "${engineNpm}" and packageManager "${packageManager}" are misaligned; packageManager should satisfy engines.npm`
}

function formatOutputNpmAlignmentWarning(engineNpm: string, packageManager: string): string {
  return `output packageManager "${packageManager}" does not satisfy engines.npm "${engineNpm}"`
}

function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getPinnedPackageManagerVersion(value: unknown): string | null {
  const parsedPackageManager = parsePackageManager(value)
  if (parsedPackageManager?.name !== 'npm' || !parsedPackageManager.version || !isPinnedNpmVersion(parsedPackageManager.version)) {
    return null
  }

  return parsedPackageManager.version
}

function hasMisalignedNpmSupport(
  pkg: PackageJson,
  packageManagerIssue: PackageManagerValidationIssue | null,
): boolean {
  const engineNpm = getTrimmedString(pkg.engines?.npm)
  const packageManager = getTrimmedString(pkg.packageManager)

  if (!engineNpm || !packageManager || packageManagerIssue) {
    return false
  }

  return !isNpmSupportAligned(engineNpm, packageManager)
}

async function validateDeclaredEngine(
  engineName: EngineName,
  value: string | undefined,
): Promise<EngineValidationIssue | null> {
  if (!value) {
    return null
  }

  if (!semver.validRange(value)) {
    return { engine: engineName, value, kind: 'invalid-range' }
  }

  try {
    const versions = engineName === 'node'
      ? await fetchNodeVersions()
      : filterStable(getAllVersions(await fetchPackument('npm')))
    if (!newestSatisfying(versions, value)) {
      return { engine: engineName, value, kind: 'no-published-version' }
    }
  } catch {
    // ignore validation fetch failures
  }

  return null
}

async function validateDeclaredEngines(
  rootNode: string | undefined,
  rootNpm: string | undefined,
): Promise<EngineValidationIssue[]> {
  const issues = await Promise.all([
    validateDeclaredEngine('node', rootNode),
    validateDeclaredEngine('npm', rootNpm),
  ])

  return issues.filter((issue): issue is EngineValidationIssue => Boolean(issue))
}

async function validateDeclaredPackageManager(value: unknown): Promise<PackageManagerValidationIssue | null> {
  const raw = getTrimmedString(value)
  if (!raw) {
    return null
  }

  const parsed = parsePackageManager(raw)
  if (!parsed?.name || !parsed.version) {
    return { value: raw, kind: 'invalid-format' }
  }

  if (parsed.name !== 'npm') {
    return { value: raw, kind: 'unsupported-manager' }
  }

  if (!semver.valid(parsed.version)) {
    return { value: raw, kind: 'invalid-version' }
  }

  try {
    const npmVersions = filterStable(getAllVersions(await fetchPackument('npm')))
    if (!npmVersions.includes(parsed.version)) {
      return { value: raw, kind: 'no-published-version' }
    }
  } catch {
    // ignore validation fetch failures
  }

  return null
}

function selectDeclaredNpmValue(
  pkg: PackageJson,
  engineIssues: EngineValidationIssue[],
  packageManagerIssue: PackageManagerValidationIssue | null,
): { value: string | undefined; source: NpmDeclarationSource | null } {
  const engineNpm = getTrimmedString(pkg.engines?.npm)
  const parsedPackageManager = parsePackageManager(pkg.packageManager)
  const packageManagerNpm = parsedPackageManager?.name === 'npm' ? parsedPackageManager.version : null
  const npmEngineIssue = engineIssues.find(issue => issue.engine === 'npm')

  if (engineNpm && !npmEngineIssue) {
    return { value: engineNpm, source: 'engines.npm' }
  }

  if (packageManagerNpm && !packageManagerIssue) {
    return { value: packageManagerNpm, source: 'packageManager' }
  }

  if (engineNpm) {
    return { value: engineNpm, source: 'engines.npm' }
  }

  if (packageManagerNpm) {
    return { value: packageManagerNpm, source: 'packageManager' }
  }

  return { value: undefined, source: null }
}

export async function validatePackageJsonInput(raw: string): Promise<InputValidationState> {
  if (!raw.trim()) {
    return { errors: [], warnings: [], engineIssues: [] }
  }

  try {
    const pkg = parsePackageJson(raw)
    const engineIssues = await validateDeclaredEngines(pkg.engines?.node, pkg.engines?.npm)
    const packageManagerIssue = await validateDeclaredPackageManager(pkg.packageManager)
    const warnings = [
      ...engineIssues.map(issue => formatEngineIssue(issue)),
      ...(packageManagerIssue ? [formatPackageManagerIssue(packageManagerIssue)] : []),
    ]

    if (hasMisalignedNpmSupport(pkg, packageManagerIssue)) {
      warnings.push(formatNpmAlignmentWarning(getTrimmedString(pkg.engines?.npm), getTrimmedString(pkg.packageManager)))
    }

    return {
      errors: [],
      warnings,
      engineIssues,
    }
  } catch (e) {
    return {
      errors: [e instanceof Error ? e.message : String(e)],
      warnings: [],
      engineIssues: [],
    }
  }
}

type DependencySection = 'dependencies' | 'devDependencies' | 'peerDependencies'

const SECTION_PRIORITY: Record<DependencySection, number> = {
  dependencies: 3,
  devDependencies: 2,
  peerDependencies: 1,
}

interface ResolvedManifest {
  name: string
  version: string
  manifest: VersionManifest
}

interface PackageState {
  name: string
  section: DependencySection
  root: boolean
  latestVersion: string | undefined
  candidateVersions: string[]
  currentIndex: number
  currentVersion: string
  manifest: VersionManifest
  peerDependencies: Record<string, { range: string; optional: boolean }>
  transitiveOverridePlans: Record<string, Record<string, string>>
}

interface UnresolvedPeerRequest {
  range: string
  sources: Set<string>
  section: DependencySection
}

interface ResolutionPass {
  deps: Record<string, string>
  devDeps: Record<string, string>
  peerDeps: Record<string, string>
  auditStatus: AuditStatus
  addedPeerDeps: AddedPeerDep[]
  conflicts: string[]
  engineWarnings: string[]
  latestDependencyNames: string[]
  staleDependencyNames: string[]
  resolvedManifests: ResolvedManifest[]
  transitiveOverrides: Array<{ name: string; version: string; source: string }>
  transitiveOverrideWarnings: string[]
  recommendedUnfreezeNames: string[]
  fixRecommendations: string[]
}

interface CandidateVersionAnalysis {
  dependencyCompatibleCandidates: string[]
  overrideCompatibleCandidates: string[]
}

function normalizeResolvedVersion(range: string): string {
  return range.replace(/^[\^~]/, '').trim()
}

function isMeaningfulDependencyChange(previousValue: string | undefined, nextValue: string): boolean {
  if (!previousValue) return true
  return normalizeResolvedVersion(previousValue) !== normalizeResolvedVersion(nextValue)
}

function getPreferredSection(current: DependencySection, candidate: DependencySection): DependencySection {
  return SECTION_PRIORITY[candidate] > SECTION_PRIORITY[current] ? candidate : current
}

function getRestrictionRange(
  restrictions: RestrictionState,
  section: DependencySection | 'engines',
  name: string,
  currentValue: string | undefined,
): string | undefined {
  return currentValue && restrictions[getRestrictionKey(section, name)] ? currentValue : undefined
}

function sortOverrideEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function getPreferredCandidateIndex(
  candidateVersions: string[],
  avoidLatestVersions: boolean,
): number {
  return avoidLatestVersions && candidateVersions.length > 1 ? 1 : 0
}

function getPreferredResolvedVersion(
  versions: string[],
  avoidLatestVersions: boolean,
): string | undefined {
  const sortedVersions = filterStable(versions).sort((left, right) => semver.rcompare(left, right))
  if (sortedVersions.length === 0) {
    return undefined
  }

  return sortedVersions[getPreferredCandidateIndex(sortedVersions, avoidLatestVersions)]
}

function getDependencyRangeCandidates(range: string, versions: string[]): string[] {
  const stableMatches = filterStable(versions)
    .sort((left, right) => semver.rcompare(left, right))
    .filter(version => semver.satisfies(version, range))

  if (stableMatches.length > 0) {
    return stableMatches
  }

  return [...versions]
    .sort((left, right) => semver.rcompare(left, right))
    .filter(version => semver.satisfies(version, range, { includePrerelease: true }))
}

function getRequiredPeerDependencies(
  manifest: VersionManifest | undefined,
  addOptionalPeerDeps: boolean,
): Record<string, { range: string; optional: boolean }> {
  if (!manifest?.peerDependencies) return {}

  return Object.fromEntries(
    Object.entries(manifest.peerDependencies)
      .filter(([peerName]) => {
        return addOptionalPeerDeps || manifest.peerDependenciesMeta?.[peerName]?.optional !== true
      })
      .map(([peerName, range]) => [
        peerName,
        {
          range,
          optional: manifest.peerDependenciesMeta?.[peerName]?.optional === true,
        },
      ])
  )
}

function getPeerRequirementSection(
  sourceSection: DependencySection,
  optional: boolean,
): DependencySection {
  return optional ? 'peerDependencies' : sourceSection
}

async function pickCompatibleEngineVersion(
  engineName: EngineName,
  declaredValue: string | undefined,
  resolvedManifests: ResolvedManifest[],
  respectEngine: boolean,
  restricted: boolean,
  addMissingEngine: boolean,
  avoidLatestVersions: boolean,
): Promise<string | undefined> {
  if (!declaredValue && !addMissingEngine && !respectEngine) {
    return undefined
  }

  let versions = engineName === 'node'
    ? await fetchNodeVersions()
    : filterStable(getAllVersions(await fetchPackument('npm')))

  const declaredRange = declaredValue && semver.validRange(declaredValue)
  if (declaredRange && (respectEngine || restricted)) {
    versions = versions.filter(version => semver.satisfies(version, declaredRange))
  }

  const requiredRanges = resolvedManifests
    .map(entry => entry.manifest.engines?.[engineName])
    .filter((value): value is string => Boolean(value))

  versions = versions.filter(version => requiredRanges.every(range => semver.satisfies(version, range)))
  return getPreferredResolvedVersion(versions, avoidLatestVersions)
}

async function resolveWithEngines(
  pkg: PackageJson,
  options: ResolveOptions,
  restrictions: RestrictionState,
  rootNode: string | undefined,
  rootNpm: string | undefined,
  respectNode: boolean,
  respectNpm: boolean,
): Promise<ResolutionPass> {
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}) }
  const devDeps: Record<string, string> = { ...(pkg.devDependencies ?? {}) }
  const peerDeps: Record<string, string> = { ...(pkg.peerDependencies ?? {}) }
  const conflicts: string[] = []
  const engineWarnings: string[] = []
  const states = new Map<string, PackageState>()
  const unresolvedPeerRequests = new Map<string, UnresolvedPeerRequest>()
  const packumentCache = new Map<string, Awaited<ReturnType<typeof fetchPackument>>>()
  const installTargetCache = new Map<string, {
    latestSatisfyingVersion: string | null
    latestEngineCompatibleVersion: string | null
    latestSatisfyingIsEngineCompatible: boolean
  }>()
  const shouldAutoTransitiveEngineOverrides = pkg.engineStrict === true
  const recommendedUnfreezeNames = new Set<string>()
  const fixRecommendations = new Set<string>()

  async function getPackumentCached(name: string) {
    const cached = packumentCache.get(name)
    if (cached) return cached

    const packument = await fetchPackument(name)
    packumentCache.set(name, packument)
    return packument
  }

  function getSortedStableVersions(packument: Awaited<ReturnType<typeof fetchPackument>>): string[] {
    return getPreferredStableVersions(packument)
  }

  function recommendUnfreeze(name: string, reason: string) {
    recommendedUnfreezeNames.add(name)
    fixRecommendations.add(`Remove the override/freeze for ${name}: ${reason}`)
  }

  async function getInstallTargetAnalysis(
    dependencyName: string,
    dependencyRange: string,
  ): Promise<{
    latestSatisfyingVersion: string | null
    latestEngineCompatibleVersion: string | null
    latestSatisfyingIsEngineCompatible: boolean
  }> {
    if (!semver.validRange(dependencyRange)) {
      return {
        latestSatisfyingVersion: null,
        latestEngineCompatibleVersion: null,
        latestSatisfyingIsEngineCompatible: true,
      }
    }

    const cacheKey = [
      dependencyName,
      dependencyRange,
      rootNode ?? '',
      rootNpm ?? '',
      respectNode ? 'node' : '',
      respectNpm ? 'npm' : '',
    ].join('|')
    const cached = installTargetCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const packument = await getPackumentCached(dependencyName)
      const satisfyingVersions = getDependencyRangeCandidates(
        dependencyRange,
        getAllVersions(packument),
      )
      const latestSatisfyingVersion = satisfyingVersions[0] ?? null
      const latestEngineCompatibleVersion = satisfyingVersions.find(version => {
        const manifest = packument.versions[version]
        return Boolean(
          manifest
          && isEngineCompatible(manifest.engines, rootNode, rootNpm, respectNode, respectNpm),
        )
      }) ?? null
      const nextAnalysis = {
        latestSatisfyingVersion,
        latestEngineCompatibleVersion,
        latestSatisfyingIsEngineCompatible: Boolean(
          latestSatisfyingVersion
          && latestSatisfyingVersion === latestEngineCompatibleVersion,
        ),
      }

      installTargetCache.set(cacheKey, nextAnalysis)
      return nextAnalysis
    } catch {
      const nextAnalysis = {
        latestSatisfyingVersion: null,
        latestEngineCompatibleVersion: null,
        latestSatisfyingIsEngineCompatible: false,
      }
      installTargetCache.set(cacheKey, nextAnalysis)
      return nextAnalysis
    }
  }

  async function getTransitiveOverridePlan(
    manifest: VersionManifest | undefined,
  ): Promise<Record<string, string> | null> {
    if (!manifest) {
      return null
    }

    const dependencyEntries = [
      ...Object.entries(manifest.dependencies ?? {}),
      ...Object.entries(manifest.optionalDependencies ?? {}),
    ]
    const overrides: Record<string, string> = {}

    for (const [dependencyName, dependencyRange] of dependencyEntries) {
      const analysis = await getInstallTargetAnalysis(dependencyName, dependencyRange)
      if (!analysis.latestSatisfyingVersion || !analysis.latestEngineCompatibleVersion) {
        return null
      }

      if (!analysis.latestSatisfyingIsEngineCompatible) {
        overrides[dependencyName] = analysis.latestEngineCompatibleVersion
      }
    }

    return overrides
  }

  function recordUnresolvedPeerRequest(
    name: string,
    range: string,
    section: DependencySection,
    source: string | undefined,
  ) {
    if (!source) return

    const existing = unresolvedPeerRequests.get(name) ?? { range, sources: new Set<string>(), section }
    existing.range = range || existing.range
    existing.section = getPreferredSection(existing.section, section)
    existing.sources.add(source)
    unresolvedPeerRequests.set(name, existing)
  }

  async function buildPackageState(
    name: string,
    section: DependencySection,
    currentValue: string | undefined,
    restrictedRange: string | undefined,
    root: boolean,
  ): Promise<PackageState | null> {
    const packument = await getPackumentCached(name)
    const allStableVersions = getSortedStableVersions(packument)
    const latestVersion = allStableVersions[0]
    const engineCompatibleVersions = allStableVersions.filter(version => {
      const manifest = packument.versions[version]
      return isEngineCompatible(manifest?.engines, rootNode, rootNpm, respectNode, respectNpm)
    })
    let candidateVersions = restrictedRange && semver.validRange(restrictedRange)
      ? engineCompatibleVersions.filter(version => semver.satisfies(version, restrictedRange))
      : engineCompatibleVersions

    let noInstallableDependencyGraph = false
    const transitiveOverridePlans: Record<string, Record<string, string>> = {}
    let selectedViaTransitiveOverrideFallback = false

    async function analyzeCandidateVersions(
      versions: string[],
      allowOverrideCompatible: boolean,
    ): Promise<CandidateVersionAnalysis> {
      const dependencyCompatibleCandidates: string[] = []
      const overrideCompatibleCandidates: string[] = []

      for (const version of versions) {
        const manifest = packument.versions[version]
        const overridePlan = await getTransitiveOverridePlan(manifest)
        if (!overridePlan) {
          continue
        }

        transitiveOverridePlans[version] = overridePlan
        if (Object.keys(overridePlan).length === 0) {
          dependencyCompatibleCandidates.push(version)
        } else if (allowOverrideCompatible) {
          overrideCompatibleCandidates.push(version)
        }
      }

      return {
        dependencyCompatibleCandidates,
        overrideCompatibleCandidates,
      }
    }

    if (candidateVersions.length > 0) {
      const restrictedAnalysis = await analyzeCandidateVersions(
        candidateVersions,
        shouldAutoTransitiveEngineOverrides && root,
      )

      if (restrictedAnalysis.dependencyCompatibleCandidates.length > 0) {
        candidateVersions = restrictedAnalysis.dependencyCompatibleCandidates
      } else if (restrictedAnalysis.overrideCompatibleCandidates.length > 0) {
        candidateVersions = restrictedAnalysis.overrideCompatibleCandidates
        selectedViaTransitiveOverrideFallback = true
      } else {
        noInstallableDependencyGraph = true
        candidateVersions = []
      }
    }

    const preferredCandidateIndex = getPreferredCandidateIndex(candidateVersions, options.avoidLatestVersions)
    let currentVersion: string | undefined = candidateVersions[preferredCandidateIndex]
    if (!currentVersion) {
      const fallbackFromCurrentRange = currentValue && semver.validRange(currentValue)
        ? newestSatisfying(allStableVersions, currentValue)
        : null
      const normalizedCurrentValue = currentValue ? normalizeResolvedVersion(currentValue) : ''

      currentVersion = fallbackFromCurrentRange
        ?? (normalizedCurrentValue && packument.versions[normalizedCurrentValue] ? normalizedCurrentValue : undefined)

      if (!currentVersion) {
        return null
      }

      let recommendedActionSuffix = ''
      if (restrictedRange) {
        recommendUnfreeze(
          name,
          noInstallableDependencyGraph
            ? 'it is blocking versions whose direct dependency graph stays compatible with the current engine constraints'
            : 'it is blocking versions compatible with the current engine constraints',
        )
        recommendedActionSuffix = ` Recommended fix: remove the override/freeze for ${name} and rerun Apply Fixes.`
      }

      engineWarnings.push(
        `${noInstallableDependencyGraph
          ? `${name}: no version found whose direct dependency ranges stay compatible with engine constraints`
          : `${name}: no compatible version found for engine constraints`}${recommendedActionSuffix}`,
      )
      candidateVersions = [currentVersion]
    }

    const manifest = packument.versions[currentVersion]
    if (!manifest) {
      return null
    }

    if (restrictedRange && root && selectedViaTransitiveOverrideFallback) {
      const unrestrictedAnalysis = await analyzeCandidateVersions(engineCompatibleVersions, false)
      if (unrestrictedAnalysis.dependencyCompatibleCandidates.length > 0) {
        const overridePlan = transitiveOverridePlans[currentVersion] ?? {}
        const transitiveNames = Object.keys(overridePlan).sort((left, right) => left.localeCompare(right))
        const transitiveLabel = transitiveNames.length === 0
          ? 'transitive engine overrides'
          : transitiveNames.length === 1
            ? `a transitive engine override for ${transitiveNames[0]}`
            : `transitive engine overrides for ${transitiveNames.slice(0, 3).join(', ')}${transitiveNames.length > 3 ? ', ...' : ''}`
        const frozenLabel = currentValue ? `"${currentValue}"` : `"${currentVersion}"`

        recommendUnfreeze(
          name,
          `it is frozen to ${frozenLabel}, which requires ${transitiveLabel}; unfreezing lets the resolver choose a cleaner engine-compatible version`,
        )
      }
    }

    if (!candidateVersions.includes(currentVersion)) {
      candidateVersions = [currentVersion, ...candidateVersions]
    }

    return {
      name,
      section,
      root,
      latestVersion,
      candidateVersions,
      currentIndex: candidateVersions.indexOf(currentVersion),
      currentVersion,
      manifest,
      peerDependencies: getRequiredPeerDependencies(manifest, options.addOptionalPeerDeps),
      transitiveOverridePlans,
    }
  }

  async function ensureState(
    name: string,
    section: DependencySection,
    currentValue: string | undefined,
    restrictedRange: string | undefined,
    root: boolean,
    source?: string,
  ): Promise<PackageState | null> {
    const existing = states.get(name)
    if (existing) {
      if (root && !existing.root) {
        existing.root = true
        existing.section = section
      }
      else if (!root && !existing.root) {
        existing.section = getPreferredSection(existing.section, section)
      }
      unresolvedPeerRequests.delete(name)
      return existing
    }

    try {
      const nextState = await buildPackageState(name, section, currentValue, restrictedRange, root)
      if (!nextState) {
        if (root) {
          conflicts.push(`${name}: unable to resolve a published version`)
        } else {
          recordUnresolvedPeerRequest(name, currentValue ?? '', section, source)
        }
        return null
      }

      states.set(name, nextState)
      unresolvedPeerRequests.delete(name)
      return nextState
    } catch (e) {
      if (root) {
        conflicts.push(`${name}: ${(e as Error).message}`)
      } else {
        recordUnresolvedPeerRequest(name, currentValue ?? '', section, source)
      }
      return null
    }
  }

  async function setStateVersion(name: string, nextVersion: string): Promise<boolean> {
    const state = states.get(name)
    if (!state || state.currentVersion === nextVersion) return false

    const packument = await getPackumentCached(name)
    const manifest = packument.versions[nextVersion]
    if (!manifest) {
      conflicts.push(`${name}@${nextVersion}: missing published manifest`)
      return false
    }

    const candidateIndex = state.candidateVersions.indexOf(nextVersion)
    state.currentVersion = nextVersion
    state.currentIndex = candidateIndex >= 0 ? candidateIndex : state.currentIndex
    state.manifest = manifest
    state.peerDependencies = getRequiredPeerDependencies(manifest, options.addOptionalPeerDeps)
    if (!(nextVersion in state.transitiveOverridePlans)) {
      const overridePlan = await getTransitiveOverridePlan(manifest)
      if (overridePlan) {
        state.transitiveOverridePlans[nextVersion] = overridePlan
      }
    }
    return true
  }

  async function syncPeerGraph(): Promise<void> {
    let changed = true

    while (changed) {
      changed = false
      const requiredPeers = new Map<string, UnresolvedPeerRequest>()

      for (const state of states.values()) {
        for (const [peerName, peerRequirement] of Object.entries(state.peerDependencies)) {
          const peerSection = getPeerRequirementSection(state.section, peerRequirement.optional)
          const request = requiredPeers.get(peerName) ?? { range: peerRequirement.range, sources: new Set<string>(), section: peerSection }
          request.range = peerRequirement.range
          request.section = getPreferredSection(request.section, peerSection)
          request.sources.add(state.name)
          requiredPeers.set(peerName, request)
        }
      }

      for (const [peerName, request] of requiredPeers) {
        const existing = states.get(peerName)
        if (existing) {
          if (!existing.root) {
            existing.section = getPreferredSection(existing.section, request.section)
          }
          unresolvedPeerRequests.delete(peerName)
          continue
        }

        const source = Array.from(request.sources).sort()[0]
        const added = await ensureState(peerName, request.section, request.range, undefined, false, source)
        if (added) {
          changed = true
        }
      }

      for (const [name, request] of Array.from(unresolvedPeerRequests.entries())) {
        const currentRequest = requiredPeers.get(name)
        if (!currentRequest) {
          unresolvedPeerRequests.delete(name)
          changed = true
          continue
        }

        request.range = currentRequest.range
        request.sources = currentRequest.sources
        request.section = currentRequest.section
      }

      for (const [name, state] of Array.from(states.entries())) {
        if (state.root || requiredPeers.has(name)) continue

        states.delete(name)
        unresolvedPeerRequests.delete(name)
        changed = true
      }
    }
  }

  function getDependentsForPeer(peerName: string): Array<{ dependent: PackageState; requiredRange: string }> {
    const dependents: Array<{ dependent: PackageState; requiredRange: string }> = []

    for (const state of states.values()) {
      const requirement = state.peerDependencies[peerName]
      if (requirement) {
        dependents.push({ dependent: state, requiredRange: requirement.range })
      }
    }

    return dependents
  }

  function findPeerDowngradeVersion(peer: PackageState): string | null {
    const dependents = getDependentsForPeer(peer.name)

    for (const candidate of peer.candidateVersions.slice(peer.currentIndex)) {
      if (dependents.every(({ requiredRange }) => semver.satisfies(candidate, requiredRange))) {
        return candidate
      }
    }

    return null
  }

  async function findDependentDowngradeVersion(
    dependent: PackageState,
    peerName: string,
    peerVersion: string,
  ): Promise<string | null> {
    const packument = await getPackumentCached(dependent.name)

    for (const candidate of dependent.candidateVersions.slice(dependent.currentIndex)) {
      const manifest = packument.versions[candidate]
      if (!manifest) continue

      const requiredPeers = getRequiredPeerDependencies(manifest, options.addOptionalPeerDeps)
      const requiredRange = requiredPeers[peerName]?.range
      if (!requiredRange || semver.satisfies(peerVersion, requiredRange)) {
        return candidate
      }
    }

    return null
  }

  function findFirstPeerConflict(): { dependent: PackageState; peer: PackageState; requiredRange: string } | null {
    for (const dependent of states.values()) {
      for (const [peerName, requirement] of Object.entries(dependent.peerDependencies)) {
        const peer = states.get(peerName)
        if (!peer) continue

        if (!semver.satisfies(peer.currentVersion, requirement.range)) {
          return { dependent, peer, requiredRange: requirement.range }
        }
      }
    }

    return null
  }

  function assignResolvedVersion(section: DependencySection, name: string, version: string) {
    if (section === 'dependencies') deps[name] = version
    if (section === 'devDependencies') devDeps[name] = version
    if (section === 'peerDependencies') peerDeps[name] = version
  }

  function getPeerSourceLabel(peerName: string): string {
    const sources = Array.from(states.values())
      .filter(state => state.peerDependencies[peerName])
      .map(state => state.name)
      .sort((a, b) => a.localeCompare(b))

    return sources.join(', ') || 'unknown'
  }

  function isStateRestricted(state: PackageState): boolean {
    return Boolean(restrictions[getRestrictionKey(state.section, state.name)])
  }

  const auditReports = new Map<string, PackageAuditReport>()

  function getAuditKey(name: string, version: string): string {
    return `${name}@${version}`
  }

  async function prefetchAuditReports(requests: Array<{ name: string; version: string }>) {
    const uncachedRequests = requests.filter(({ name, version }) => !auditReports.has(getAuditKey(name, version)))
    if (uncachedRequests.length === 0) {
      return
    }

    const fetchedReports = await fetchPackageAuditReports(uncachedRequests)
    for (const [key, report] of fetchedReports) {
      auditReports.set(key, report)
    }
  }

  async function getAuditReport(name: string, version: string): Promise<PackageAuditReport> {
    const key = getAuditKey(name, version)
    if (!auditReports.has(key)) {
      await prefetchAuditReports([{ name, version }])
    }

    const report = auditReports.get(key)
    if (!report) {
      throw new Error(`Missing audit report for ${name}@${version}`)
    }

    return report
  }

  async function findLatestSafeCandidate(state: PackageState): Promise<string | null> {
    const candidateVersions = state.candidateVersions.slice(state.currentIndex)
    await prefetchAuditReports(candidateVersions.map(version => ({
      name: state.name,
      version,
    })))

    for (const candidateVersion of candidateVersions) {
      const report = await getAuditReport(state.name, candidateVersion)
      if (report.advisories.length === 0) {
        return candidateVersion
      }
    }

    return null
  }

  async function stabilizePeerConflicts() {
    const MAX_CONFLICT_PASSES = 200
    for (let pass = 0; pass < MAX_CONFLICT_PASSES; pass++) {
      const peerConflict = findFirstPeerConflict()
      if (!peerConflict) break

      const peerDowngrade = findPeerDowngradeVersion(peerConflict.peer)
      if (peerDowngrade && peerDowngrade !== peerConflict.peer.currentVersion) {
        const changed = await setStateVersion(peerConflict.peer.name, peerDowngrade)
        if (changed) {
          await syncPeerGraph()
          continue
        }
      }

      const dependentDowngrade = await findDependentDowngradeVersion(
        peerConflict.dependent,
        peerConflict.peer.name,
        peerConflict.peer.currentVersion,
      )
      if (dependentDowngrade && dependentDowngrade !== peerConflict.dependent.currentVersion) {
        const changed = await setStateVersion(peerConflict.dependent.name, dependentDowngrade)
        if (changed) {
          await syncPeerGraph()
          continue
        }
      }

      const recommendedConflictUnfreezes = [
        isStateRestricted(peerConflict.dependent) ? peerConflict.dependent.name : null,
        isStateRestricted(peerConflict.peer) ? peerConflict.peer.name : null,
      ].filter((value): value is string => Boolean(value))

      for (const name of recommendedConflictUnfreezes) {
        recommendUnfreeze(
          name,
          `it is participating in the unresolved peer conflict between ${peerConflict.dependent.name} and ${peerConflict.peer.name}`,
        )
      }

      conflicts.push(
        `${peerConflict.dependent.name}@${peerConflict.dependent.currentVersion} requires ${peerConflict.peer.name}@${formatCompactSemverRange(peerConflict.requiredRange)}, but resolved ${peerConflict.peer.name}@${peerConflict.peer.currentVersion}${recommendedConflictUnfreezes.length > 0 ? ` Recommended fix: remove the override/freeze for ${recommendedConflictUnfreezes.join(' or ')} and rerun Apply Fixes.` : ''}`
      )
      break
    }
  }

  const rootSections: Array<[DependencySection, Record<string, string> | undefined]> = [
    ['dependencies', pkg.dependencies],
    ['devDependencies', pkg.devDependencies],
    ['peerDependencies', pkg.peerDependencies],
  ]

  for (const [sectionName, sectionValues] of rootSections) {
    if (!sectionValues) continue

    for (const [name, currentValue] of Object.entries(sectionValues)) {
      await ensureState(
        name,
        sectionName,
        currentValue,
        getRestrictionRange(restrictions, sectionName, name, currentValue),
        true,
      )
    }
  }

  await syncPeerGraph()
  await stabilizePeerConflicts()

  let auditStatus: AuditStatus

  try {
    await prefetchAuditReports(Array.from(states.values()).map(state => ({
      name: state.name,
      version: state.currentVersion,
    })))

    const MAX_AUDIT_PASSES = 200
    for (let pass = 0; pass < MAX_AUDIT_PASSES; pass++) {
      let changed = false
      const orderedStates = Array.from(states.values()).sort((left, right) => {
        if (left.root !== right.root) {
          return left.root ? -1 : 1
        }

        if (isStateRestricted(left) !== isStateRestricted(right)) {
          return isStateRestricted(left) ? 1 : -1
        }

        return left.name.localeCompare(right.name)
      })

      for (const state of orderedStates) {
        const currentReport = await getAuditReport(state.name, state.currentVersion)
        if (currentReport.advisories.length === 0 || isStateRestricted(state)) {
          continue
        }

        const safeVersion = await findLatestSafeCandidate(state)
        if (!safeVersion || safeVersion === state.currentVersion) {
          continue
        }

        const versionChanged = await setStateVersion(state.name, safeVersion)
        if (!versionChanged) {
          continue
        }

        await syncPeerGraph()
        await stabilizePeerConflicts()
        await prefetchAuditReports(Array.from(states.values()).map(nextState => ({
          name: nextState.name,
          version: nextState.currentVersion,
        })))
        changed = true
        break
      }

      if (!changed) {
        break
      }
    }

    const blockedVulnerabilities: string[] = []
    const blockedDependencyNames = new Set<string>()
    const residualWarnings: string[] = []
    const finalStates = Array.from(states.values()).sort((left, right) => left.name.localeCompare(right.name))
    await prefetchAuditReports(finalStates.map(state => ({
      name: state.name,
      version: state.currentVersion,
    })))

    for (const state of finalStates) {
      const report = await getAuditReport(state.name, state.currentVersion)
      if (report.advisories.length === 0) {
        continue
      }

      if (isStateRestricted(state)) {
        blockedDependencyNames.add(state.name)
        blockedVulnerabilities.push(`${formatAuditFinding(report)}. Unfreeze the package or remove its override to allow an audit-safe version.`)
      } else {
        residualWarnings.push(`${formatAuditFinding(report)}. No audit-safe version was found within the current engine and peer constraints.`)
      }
    }

    if (blockedVulnerabilities.length > 0) {
      auditStatus = {
        state: 'failure',
        summary: `${blockedVulnerabilities.length} vulnerable package${blockedVulnerabilities.length === 1 ? '' : 's'} remain because they are frozen by current restrictions or overrides`,
        details: [...blockedVulnerabilities, ...residualWarnings],
        warnings: residualWarnings.length,
        vulnerabilities: blockedVulnerabilities.length,
        recommendedUnfreezeNames: Array.from(blockedDependencyNames).sort((left, right) => left.localeCompare(right)),
      }
    } else if (residualWarnings.length > 0) {
      auditStatus = {
        state: 'warning',
        summary: `${residualWarnings.length} package${residualWarnings.length === 1 ? '' : 's'} still have known advisories under the current engine or peer constraints`,
        details: residualWarnings,
        warnings: residualWarnings.length,
        vulnerabilities: 0,
        recommendedUnfreezeNames: [],
      }
    } else {
      auditStatus = {
        state: 'pass',
        summary: '0 vulnerabilities and 0 warnings',
        details: [],
        warnings: 0,
        vulnerabilities: 0,
        recommendedUnfreezeNames: [],
      }
    }
  } catch (error) {
    auditStatus = createUnavailableAuditStatus(error instanceof Error ? error.message : String(error))
  }

  for (const state of states.values()) {
    assignResolvedVersion(state.section, state.name, state.currentVersion)
  }

  for (const [name, request] of unresolvedPeerRequests.entries()) {
    assignResolvedVersion(request.section, name, request.range)
  }

  const addedPeerDeps: AddedPeerDep[] = [
    ...Array.from(states.values())
      .filter(state => !state.root)
      .map(state => ({
        name: state.name,
        version: state.currentVersion,
        source: getPeerSourceLabel(state.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ...Array.from(unresolvedPeerRequests.entries())
      .map(([name, request]) => ({
        name,
        version: request.range,
        source: Array.from(request.sources).sort((a, b) => a.localeCompare(b)).join(', ') || 'unknown',
        unresolved: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ]

  const staleDependencyNames = Array.from(states.values())
    .filter(state => state.latestVersion && state.currentVersion !== state.latestVersion)
    .map(state => state.name)
    .sort((left, right) => left.localeCompare(right))
  const latestDependencyNames = Array.from(states.values())
    .filter(state => state.latestVersion && state.currentVersion === state.latestVersion)
    .map(state => state.name)
    .sort((left, right) => left.localeCompare(right))

  const transitiveOverrideMap = new Map<string, { version: string; sources: Set<string> }>()
  const transitiveOverrideWarnings: string[] = []

  for (const state of states.values()) {
    if (!state.root) {
      continue
    }

    const overridePlan = state.transitiveOverridePlans[state.currentVersion] ?? {}
    for (const [name, version] of Object.entries(overridePlan)) {
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

  const transitiveOverrides = Array.from(transitiveOverrideMap.entries())
    .map(([name, entry]) => ({
      name,
      version: entry.version,
      source: Array.from(entry.sources).sort((left, right) => left.localeCompare(right)).join(', '),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    deps,
    devDeps,
    peerDeps,
    auditStatus,
    addedPeerDeps,
    conflicts,
    engineWarnings,
    latestDependencyNames,
    staleDependencyNames,
    resolvedManifests: Array.from(states.values()).map(state => ({
      name: state.name,
      version: state.currentVersion,
      manifest: state.manifest,
    })),
    transitiveOverrides,
    transitiveOverrideWarnings,
    recommendedUnfreezeNames: Array.from(recommendedUnfreezeNames).sort((left, right) => left.localeCompare(right)),
    fixRecommendations: Array.from(fixRecommendations).sort((left, right) => left.localeCompare(right)),
  }
}

export async function resolvePackageJson(
  raw: string,
  options: ResolveOptions,
  restrictions: RestrictionState = {},
): Promise<ResolveResult> {
  const pkg = parsePackageJson(raw)
  const changes: VersionChange[] = []
  const engineIssues = await validateDeclaredEngines(pkg.engines?.node, pkg.engines?.npm)
  const packageManagerIssue = await validateDeclaredPackageManager(pkg.packageManager)
  const { value: declaredNpm, source: declaredNpmSource } = selectDeclaredNpmValue(pkg, engineIssues, packageManagerIssue)
  const declaredEngineNpm = getTrimmedString(pkg.engines?.npm)
  const inputPackageManagerVersion = getPinnedPackageManagerVersion(pkg.packageManager)
  const engineWarnings = [
    ...engineIssues.map(issue => formatEngineIssue(issue)),
    ...(packageManagerIssue ? [formatPackageManagerIssue(packageManagerIssue)] : []),
  ]
  const engineOverrides: string[] = []

  const rootNode = pkg.engines?.node
  const rootNpm = declaredNpm
  const selectedNpmIssue = declaredNpmSource === 'packageManager'
    ? packageManagerIssue
    : engineIssues.find(candidate => candidate.engine === 'npm') ?? null
  const respectNode = options.respectEnginesNode && !engineIssues.some(issue => issue.engine === 'node')
  const respectNpm = options.respectEnginesNpm && !selectedNpmIssue
  const restrictedNode = Boolean(restrictions[getRestrictionKey('engines', 'node')])
  const restrictedNpm = Boolean(restrictions[ENGINE_NPM_RESTRICTION_KEY])
  const hasDetachedNpmRange = isUnpinnedSemverRange(declaredEngineNpm)
  const restrictedPackageManagerNpm = Boolean(
    restrictions[hasDetachedNpmRange ? PACKAGE_MANAGER_NPM_RESTRICTION_KEY : ENGINE_NPM_RESTRICTION_KEY],
  )
  const shouldRetainDetachedPackageManager = hasDetachedNpmRange
    && restrictedPackageManagerNpm
    && !packageManagerIssue
    && Boolean(inputPackageManagerVersion)

  let workingRootNode = !respectNode ? await fetchLatestNodeVersion().catch(() => rootNode) : rootNode
  let workingRootNpm = !respectNpm ? await fetchLatestNpmVersion().catch(() => rootNpm) : rootNpm

  let resolution = await resolveWithEngines(pkg, options, restrictions, workingRootNode, workingRootNpm, Boolean(workingRootNode), Boolean(workingRootNpm))

  const MAX_ENGINE_PASSES = 3
  for (let pass = 0; pass < MAX_ENGINE_PASSES; pass++) {
    const nextRootNode = await pickCompatibleEngineVersion('node', rootNode, resolution.resolvedManifests, respectNode, restrictedNode, options.addEnginesNode, options.avoidLatestVersions)
    const nextRootNpm = await pickCompatibleEngineVersion('npm', rootNpm, resolution.resolvedManifests, respectNpm, restrictedNpm, options.addEnginesNpm, options.avoidLatestVersions)

    if ((nextRootNode ?? '') === (workingRootNode ?? '') && (nextRootNpm ?? '') === (workingRootNpm ?? '')) {
      break
    }

    workingRootNode = nextRootNode ?? workingRootNode
    workingRootNpm = nextRootNpm ?? workingRootNpm
    resolution = await resolveWithEngines(pkg, options, restrictions, workingRootNode, workingRootNpm, Boolean(workingRootNode), Boolean(workingRootNpm))
  }

  // Build updated package.json
  const resolvedSections = {
    dependencies: resolution.deps,
    devDependencies: resolution.devDeps,
    peerDependencies: resolution.peerDeps,
  }

  const updated: PackageJson = { ...pkg }
  if (Object.keys(resolvedSections.dependencies).length > 0) updated.dependencies = sortDependencies(resolvedSections.dependencies)
  if (Object.keys(resolvedSections.devDependencies).length > 0) updated.devDependencies = sortDependencies(resolvedSections.devDependencies)
  if (Object.keys(resolvedSections.peerDependencies).length > 0) updated.peerDependencies = sortDependencies(resolvedSections.peerDependencies)

  const originalSections: Array<[DependencySection, Record<string, string> | undefined, Record<string, string>]> = [
    ['dependencies', pkg.dependencies, resolvedSections.dependencies],
    ['devDependencies', pkg.devDependencies, resolvedSections.devDependencies],
    ['peerDependencies', pkg.peerDependencies, resolvedSections.peerDependencies],
  ]

  for (const [section, originalSection, resolvedSection] of originalSections) {
    for (const [name, nextValue] of Object.entries(resolvedSection)) {
      const previousValue = originalSection?.[name]
      if (isMeaningfulDependencyChange(previousValue, nextValue)) {
        changes.push({ name, from: previousValue ?? '(none)', to: nextValue, section })
      }
    }
  }

  const didOverrideNode = !respectNode && rootNode && workingRootNode && rootNode !== workingRootNode
  const didOverrideNpm = !respectNpm && rootNpm && workingRootNpm && rootNpm !== workingRootNpm

  const shouldRetainFrozenNodeValue = restrictedNode && Boolean(rootNode && semver.validRange(rootNode))
  const shouldRetainFrozenNpmValue = restrictedNpm && Boolean(rootNpm && semver.validRange(rootNpm))

  if (didOverrideNode) {
    const issue = engineIssues.find(candidate => candidate.engine === 'node')
    engineOverrides.push(issue ? formatEngineIssue(issue, workingRootNode) : `using node latest ${workingRootNode}. engines.node "${rootNode}" overridden during update`)
  }

  if (didOverrideNpm) {
    if (declaredNpmSource === 'packageManager' && packageManagerIssue) {
      engineOverrides.push(formatPackageManagerIssue(packageManagerIssue, workingRootNpm))
    } else {
      const issue = engineIssues.find(candidate => candidate.engine === 'npm')
      engineOverrides.push(issue ? formatEngineIssue(issue, workingRootNpm) : `using npm latest ${workingRootNpm}. engines.npm "${rootNpm}" overridden during update`)
    }
  }

  const overriddenEngines = new Set<EngineName>()
  if (didOverrideNode) overriddenEngines.add('node')
  if (didOverrideNpm) overriddenEngines.add('npm')

  if (shouldRetainFrozenNpmValue && rootNpm && isUnpinnedSemverRange(rootNpm) && workingRootNpm && !shouldRetainDetachedPackageManager) {
    engineWarnings.push(
      `packageManager will pin npm@${workingRootNpm} while retaining engines.npm "${rootNpm}" because packageManager does not support ranges`,
    )
  }

  const formattedEngineNode = shouldRetainFrozenNodeValue && rootNode ? rootNode : workingRootNode
  const formattedEngineNpm = shouldRetainFrozenNpmValue && rootNpm ? rootNpm : workingRootNpm
  const formattedPackageManager = restrictedPackageManagerNpm && inputPackageManagerVersion
    ? formatNpmPackageManager(inputPackageManagerVersion)
    : shouldRetainFrozenNpmValue && rootNpm
      ? shouldRetainDetachedPackageManager && inputPackageManagerVersion
      ? formatNpmPackageManager(inputPackageManagerVersion)
      : isPinnedNpmVersion(rootNpm)
      ? formatNpmPackageManager(rootNpm)
      : workingRootNpm
        ? formatNpmPackageManager(workingRootNpm)
        : undefined
    : formattedEngineNpm
      ? formatNpmPackageManager(formattedEngineNpm)
      : undefined

  if (formattedEngineNpm && formattedPackageManager && !isNpmSupportAligned(formattedEngineNpm, formattedPackageManager)) {
    engineWarnings.push(formatOutputNpmAlignmentWarning(formattedEngineNpm, formattedPackageManager))
  }

  if (formattedEngineNode && updated.engines?.node !== formattedEngineNode) {
    const oldNode = updated.engines?.node ?? '(none)'
    changes.push({ name: 'engines.node', from: oldNode, to: formattedEngineNode, section: 'engines' })
    updated.engines = { ...(updated.engines ?? {}), node: formattedEngineNode }
  }

  if (formattedEngineNpm && updated.engines?.npm !== formattedEngineNpm) {
    const oldNpm = updated.engines?.npm ?? '(none)'
    changes.push({ name: 'engines.npm', from: oldNpm, to: formattedEngineNpm, section: 'engines' })
    updated.engines = { ...(updated.engines ?? {}), npm: formattedEngineNpm }
  }

  if (formattedPackageManager && updated.packageManager !== formattedPackageManager) {
    const oldPackageManager = getTrimmedString(updated.packageManager) || '(none)'
    changes.push({ name: 'packageManager', from: oldPackageManager, to: formattedPackageManager, section: 'engines' })
    updated.packageManager = formattedPackageManager
  }

  const recommendedUnfreezeNames = Array.from(new Set([
    ...resolution.recommendedUnfreezeNames,
    ...resolution.auditStatus.recommendedUnfreezeNames,
  ])).sort((left, right) => left.localeCompare(right))

  const fixRecommendations = [
    ...resolution.fixRecommendations,
    ...resolution.auditStatus.recommendedUnfreezeNames.map(name =>
      `Remove the override/freeze for ${name}: it is blocking an available audit-safe version.`,
    ),
  ].sort((left, right) => left.localeCompare(right))

  if (resolution.transitiveOverrides.length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = !updated.overrides

    for (const override of resolution.transitiveOverrides) {
      if (nextOverrides[override.name] === override.version) {
        continue
      }

      nextOverrides[override.name] = override.version
      overridesChanged = true
    }

    if (overridesChanged) {
      updated.overrides = sortOverrideEntries(nextOverrides)
    }
  }

  const stringOverrides = getStringOverrides(updated)
  if (Object.keys(stringOverrides).length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = false

    for (const name of Object.keys(stringOverrides)) {
      const mirroredVersion = getDependencyVersion(updated, name)
      if (!mirroredVersion || nextOverrides[name] === mirroredVersion) {
        continue
      }

      nextOverrides[name] = mirroredVersion
      overridesChanged = true
    }

    if (overridesChanged) {
      updated.overrides = sortOverrideEntries(nextOverrides)
    }
  }

  return {
    updatedPackage: updated,
    auditStatus: resolution.auditStatus,
    latestDependencyNames: resolution.latestDependencyNames,
    staleDependencyNames: resolution.staleDependencyNames,
    changes,
    addedPeerDeps: resolution.addedPeerDeps,
    conflicts: resolution.conflicts,
    engineWarnings: [
      ...engineWarnings,
      ...resolution.engineWarnings,
      ...resolution.transitiveOverrideWarnings,
    ].filter(message => {
      if (message.startsWith('engines.node ') && overriddenEngines.has('node')) return false
      if (message.startsWith('engines.npm ') && overriddenEngines.has('npm')) return false
      if (message.startsWith('packageManager ') && didOverrideNpm && declaredNpmSource === 'packageManager') return false
      return true
    }),
    engineOverrides: [
      ...engineOverrides,
      ...resolution.transitiveOverrides.map(override =>
        `${override.source}: pinned transitive ${override.name}@${override.version} in overrides to satisfy engine constraints`,
      ),
    ],
    recommendedUnfreezeNames,
    fixRecommendations,
  }
}
