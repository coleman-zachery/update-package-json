import {
  detectIndentStyle,
  getIndentText,
  type IndentStyle,
} from '@/lib/indentation'
import type {
  PackageJson,
  PackageManagerSpec,
  SerializePackageJsonOptions,
} from './types'

export function parsePackageJson(raw: string): PackageJson {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid package.json: top-level JSON value must be an object')
  }

  return parsed as PackageJson
}

function reorderPackageManagerBeforeEngines(pkg: PackageJson): PackageJson {
  if (!('packageManager' in pkg) || !('engines' in pkg)) {
    return pkg
  }

  const ordered: PackageJson = {}
  let insertedNpmBlock = false

  for (const key of Object.keys(pkg)) {
    if (key === 'packageManager' || key === 'engines') {
      if (key === 'engines' && !insertedNpmBlock) {
        ordered.packageManager = pkg.packageManager
        ordered.engines = pkg.engines
        insertedNpmBlock = true
      }
      continue
    }

    ordered[key] = pkg[key]
  }

  return ordered
}

export function serializePackageJson(
  pkg: PackageJson,
  indentStyle: IndentStyle = detectIndentStyle(''),
  options: SerializePackageJsonOptions = {},
): string {
  const normalized = options.packageManagerBeforeEngines
    ? reorderPackageManagerBeforeEngines(pkg)
    : pkg
  return JSON.stringify(normalized, null, getIndentText(indentStyle))
}

export function parsePackageManager(value: unknown): PackageManagerSpec | null {
  if (typeof value !== 'string') return null

  const raw = value.trim()
  const separatorIndex = raw.lastIndexOf('@')
  if (!raw || separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    return { raw, name: null, version: null }
  }

  const name = raw.slice(0, separatorIndex).trim()
  const versionToken = raw.slice(separatorIndex + 1).trim()
  const version = versionToken.split('+', 1)[0]?.trim() ?? ''

  if (!name || !version) {
    return { raw, name: null, version: null }
  }

  return { raw, name, version }
}

export function formatNpmPackageManager(version: string): string {
  return `npm@${version}`
}
