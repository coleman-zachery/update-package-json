import type { PackageJson, NpmDeclarationSource } from '@/lib/package-json'
import type { VersionManifest } from '@/lib/npm'
import type { PlatformSelection } from './platform-targets'

export interface ResolveOptions {
  respectEnginesNode: boolean
  respectEnginesNpm: boolean
  addOptionalPeerDeps: boolean
  avoidLatestVersions: boolean
  addEnginesNode: boolean
  addEnginesNpm: boolean
}

export type EngineName = 'node' | 'npm'
export type DependencySection = 'dependencies' | 'devDependencies' | 'peerDependencies'
export type ChangeSourceKind = 'peer' | 'platform' | 'companion' | 'override'

export interface VersionChange {
  name: string
  from: string
  to: string
  section: DependencySection | 'overrides' | 'engines'
}

export interface ChangeSourceHint {
  name: string
  source: string
  kind: ChangeSourceKind
  sourceVersion?: string
  rootSource?: string
  rootSourceVersion?: string
}

export interface AddedPeerDep {
  name: string
  version: string
  source: string
  unresolved?: boolean
}

export interface AuditStatus {
  state: 'pass' | 'warning' | 'failure'
  summary: string
  details: string[]
  warnings: number
  vulnerabilities: number
  recommendedUnfreezeNames: string[]
}

export interface ResolveResult {
  updatedPackage: PackageJson
  auditStatus: AuditStatus
  latestDependencyNames: string[]
  staleDependencyNames: string[]
  changes: VersionChange[]
  resolvedManifests: ResolvedManifest[]
  changeSources: ChangeSourceHint[]
  addedPeerDeps: AddedPeerDep[]
  conflicts: string[]
  engineWarnings: string[]
  engineOverrides: string[]
  recommendedUnfreezeNames: string[]
  fixRecommendations: string[]
  platformSupport: PlatformSupport
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

export interface PackageManagerValidationIssue {
  value: string
  kind: 'invalid-format' | 'unsupported-manager' | 'invalid-version' | 'no-published-version'
}

export interface DeclaredNpmValue {
  value: string | undefined
  source: NpmDeclarationSource | null
}

export interface ResolvedManifest {
  name: string
  version: string
  latestVersion: string | undefined
  section: DependencySection
  root: boolean
  manifest: VersionManifest
}

export interface PackageState {
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

export interface UnresolvedPeerRequest {
  range: string
  sources: Set<string>
  section: DependencySection
}

export interface ResolutionPass {
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
  changeSources: ChangeSourceHint[]
  transitiveOverrides: Array<{ name: string; version: string; source: string }>
  transitiveOverrideWarnings: string[]
  recommendedUnfreezeNames: string[]
  fixRecommendations: string[]
  platformSupport: PlatformSupport
}

export interface CandidateVersionAnalysis {
  dependencyCompatibleCandidates: string[]
  overrideCompatibleCandidates: string[]
}

export interface ResolveProgress {
  completed: number
  total: number
}

export interface ResolvePreferences {
  platformSelection?: PlatformSelection
  onProgress?: (progress: ResolveProgress) => void
  signal?: AbortSignal
}

export interface PlatformResolutionIssue {
  source: 'toolbar' | 'inferred'
  requested: string
  reason: 'ambiguous' | 'no-match'
  candidates: string[]
}

export interface PlatformOptionalFamily {
  dependencyName: string
  optionalDependencyNames: string[]
  availableTargets: string[]
  selectedTargets: string[]
  issues: PlatformResolutionIssue[]
}

export interface PlatformSupport {
  availableTargets: string[]
  selectedTargets: string[]
  inferredTargets: string[]
  unresolvedTargets: string[]
  families: PlatformOptionalFamily[]
}
