import type { IndentStyle, SpaceIndentSize } from '@/lib/indentation'

export interface PackageJson {
  name?: string
  version?: string
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  overrides?: Record<string, unknown>
  engines?: {
    node?: string
    npm?: string
    [key: string]: string | undefined
  }
  [key: string]: unknown
}

export type NpmDeclarationSource = 'engines.npm' | 'packageManager'

export interface PackageManagerSpec {
  raw: string
  name: string | null
  version: string | null
}

export type RootDependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'

export interface TextReplacement {
  from: number
  to: number
  insert: string
}

export interface SerializePackageJsonOptions {
  packageManagerBeforeEngines?: boolean
}

export interface NpmSupportState {
  engineNpm: string
  packageManagerRaw: string
  packageManagerVersion: string
}

export interface SerializeMutationOptions {
  raw: string
  pkg: PackageJson
  spaceIndentSize?: SpaceIndentSize
  indentStyle?: IndentStyle
}
