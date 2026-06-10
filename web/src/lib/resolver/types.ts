import type { PackageJson, NpmDeclarationSource } from '@/lib/package-json'
import type { VersionManifest } from '@/lib/npm'

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

export interface VersionChange {
  name: string
  from: string
  to: string
  section: DependencySection | 'engines'
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
  transitiveOverrides: Array<{ name: string; version: string; source: string }>
  transitiveOverrideWarnings: string[]
  recommendedUnfreezeNames: string[]
  fixRecommendations: string[]
}

export interface CandidateVersionAnalysis {
  dependencyCompatibleCandidates: string[]
  overrideCompatibleCandidates: string[]
}
