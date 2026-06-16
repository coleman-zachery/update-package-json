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

export type DependencyExplorerColumnKind =
  | 'peer'
  | 'required'
  | 'optional'
  | 'platform'

export interface DependencyExplorerDependencyCell {
  value: string
  kinds: DependencyExplorerColumnKind[]
}

export interface DependencyExplorerDependencyEntry {
  key: string
  columnKey: string
  columnKinds: DependencyExplorerColumnKind[]
  displayRange: string
  rawRange: string
  name: string
  kind: DependencyExplorerDependencyKind
  matchesPackageVersion: boolean
}

export interface DependencyExplorerColumn {
  key: string
  name: string
}

export interface DependencyExplorerRow {
  key: string
  versions: string[]
  newestVersion: string
  oldestVersion: string
  engineNode: string
  engineNpm: string
  directDependencies: DependencyExplorerDependencyEntry[]
  dependencyCells: Record<string, DependencyExplorerDependencyCell>
}

export interface DependencyExplorerReport {
  packageName: string
  latestVersion: string
  stableVersionCount: number
  currentVersion: string | null
  currentResolvedVersion: string | null
  currentSections: DependencyExplorerContextSection[]
  majorSeries: number[]
  columns: DependencyExplorerColumn[]
  rows: DependencyExplorerRow[]
}

export interface InspectDependencyPackageContext {
  packageName: string
  pkg: PackageJson
}
