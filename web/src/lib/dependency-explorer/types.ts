import type { PackageJson } from '@/lib/package-json'

export type DependencyExplorerContextSection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export type DependencyExplorerDependencyKind =
  | 'dependency'
  | 'peer-required'
  | 'peer-optional'
  | 'optional'
  | 'platform-optional'

export interface DependencyExplorerDependencyEntry {
  key: string
  columnKey: string
  displayRange: string
  rawRange: string
  name: string
  kind: DependencyExplorerDependencyKind
  matchesPackageVersion: boolean
}

export interface DependencyExplorerColumn {
  key: string
  name: string
  kind: Extract<DependencyExplorerDependencyKind, 'dependency' | 'peer-required' | 'optional'>
}

export interface DependencyExplorerPlatformDependency {
  name: string
  versions: string[]
}

export interface DependencyExplorerRow {
  key: string
  versions: string[]
  newestVersion: string
  oldestVersion: string
  engineNode: string
  engineNpm: string
  directDependencies: DependencyExplorerDependencyEntry[]
  dependencyValues: Record<string, string>
}

export interface DependencyExplorerReport {
  packageName: string
  latestVersion: string
  stableVersionCount: number
  currentVersion: string | null
  currentResolvedVersion: string | null
  currentSections: DependencyExplorerContextSection[]
  majorSeries: number[]
  dependencyColumns: DependencyExplorerColumn[]
  requiredPeerColumns: DependencyExplorerColumn[]
  optionalDependencyColumns: DependencyExplorerColumn[]
  platformDependencies: DependencyExplorerPlatformDependency[]
  rows: DependencyExplorerRow[]
}

export interface InspectDependencyPackageContext {
  packageName: string
  pkg: PackageJson
}
