import {
  getEffectiveIndentStyle,
  type IndentStyle,
  type SpaceIndentSize,
} from '@/lib/indentation'
import { parsePackageJson, serializePackageJson } from './serialization'
import type { PackageJson } from './types'

export function shouldPlacePackageManagerBeforeEngines(pkg: PackageJson): boolean {
  return typeof pkg.packageManager === 'string' || Boolean(pkg.engines)
}

export function serializeMutatedPackage(
  raw: string,
  pkg: PackageJson,
  spaceIndentSize?: SpaceIndentSize,
  indentStyle?: IndentStyle,
): string {
  return serializePackageJson(pkg, indentStyle ?? getEffectiveIndentStyle(raw, spaceIndentSize), {
    packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines(pkg),
  })
}

export function parsePackageJsonOrEmpty(raw: string): PackageJson {
  return raw.trim() ? parsePackageJson(raw) : {}
}

export function parsePackageJsonSafely(raw: string): PackageJson | null {
  try {
    return parsePackageJson(raw)
  } catch {
    return null
  }
}
