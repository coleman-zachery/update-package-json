import type { PackageJson } from '@/lib/package-json'

export type DependencyExplorerContextSection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export interface DependencyExplorerDependencyEntry {
  key: string
  displayRange: string
  rawRange: string
  name: string
  optional: boolean
  matchesPackageVersion: boolean
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
  currentSections: DependencyExplorerContextSection[]
  majorSeries: number[]
  dependencyColumns: string[]
  rows: DependencyExplorerRow[]
}

export interface InspectDependencyPackageContext {
  packageName: string
  pkg: PackageJson
}
