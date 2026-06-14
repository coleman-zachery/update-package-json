import semver from 'semver'
import {
  createSpaceIndentStyle,
  getEffectiveIndentStyle,
  type SpaceIndentSize,
} from '@/lib/indentation'
import { serializePackageJson, parsePackageJson, parsePackageManager, formatNpmPackageManager } from './serialization'
import { isNpmSupportAligned, isPinnedNpmVersion, isUnpinnedSemverRange } from './semver'
import type { NpmSupportState, PackageJson } from './types'

function withSyncedNpmSupport(pkg: PackageJson, version: string): PackageJson {
  return {
    ...pkg,
    packageManager: formatNpmPackageManager(version),
    engines: { ...(pkg.engines ?? {}), npm: version },
  }
}

function withoutSyncedNpmSupport(pkg: PackageJson): PackageJson {
  const next: PackageJson = { ...pkg }
  if (next.engines) {
    const { npm: _npm, ...remainingEngines } = next.engines
    if (Object.keys(remainingEngines).length > 0) next.engines = remainingEngines
    else delete next.engines
  }
  delete next.packageManager
  return next
}

function withoutPackageManager(pkg: PackageJson): PackageJson {
  const next: PackageJson = { ...pkg }
  delete next.packageManager
  return next
}

function getNpmSupportState(pkg: PackageJson): NpmSupportState {
  const parsedPackageManager = parsePackageManager(pkg.packageManager)
  return {
    engineNpm: typeof pkg.engines?.npm === 'string' ? pkg.engines.npm.trim() : '',
    packageManagerRaw: typeof pkg.packageManager === 'string' ? pkg.packageManager.trim() : '',
    packageManagerVersion: parsedPackageManager?.name === 'npm' && parsedPackageManager.version ? parsedPackageManager.version : '',
  }
}

function withEngineNpmRangePreservingPackageManager(pkg: PackageJson, range: string): PackageJson {
  const updated: PackageJson = { ...pkg, engines: { ...(pkg.engines ?? {}), npm: range } }
  const parsedPackageManager = parsePackageManager(pkg.packageManager)
  if (parsedPackageManager?.name !== 'npm' || !parsedPackageManager.version || !isPinnedNpmVersion(parsedPackageManager.version)) {
    return updated
  }
  const validRange = semver.validRange(range)
  if (!validRange || !semver.satisfies(parsedPackageManager.version, validRange)) {
    return updated
  }
  updated.packageManager = formatNpmPackageManager(parsedPackageManager.version)
  return updated
}

function withNormalizedPackageManager(pkg: PackageJson, version: string): PackageJson {
  return { ...pkg, packageManager: formatNpmPackageManager(version) }
}

export function upsertEngineValue(raw: string, engineName: 'node' | 'npm', value: string, spaceIndentSize?: SpaceIndentSize): string {
  const pkg = raw.trim() ? parsePackageJson(raw) : {}
  const indentStyle = getEffectiveIndentStyle(raw, spaceIndentSize)
  const updated = engineName === 'npm'
    ? withSyncedNpmSupport(pkg, value)
    : { ...pkg, engines: { ...(pkg.engines ?? {}), [engineName]: value } }

  return serializePackageJson(updated, indentStyle, {
    packageManagerBeforeEngines: Boolean(updated.engines) || typeof updated.packageManager === 'string',
  })
}

export function upsertNpmSupport(raw: string, value: string, spaceIndentSize?: SpaceIndentSize): string {
  return upsertEngineValue(raw, 'npm', value, spaceIndentSize)
}

export function syncNpmSupportAfterInputChange(previousRaw: string, nextRaw: string, spaceIndentSize?: SpaceIndentSize): string {
  if (!nextRaw.trim()) return nextRaw
  let nextPkg: PackageJson
  try { nextPkg = parsePackageJson(nextRaw) } catch { return nextRaw }
  const previousPkg = previousRaw.trim() ? (() => { try { return parsePackageJson(previousRaw) } catch { return {} } })() : {}
  const previous = getNpmSupportState(previousPkg)
  const next = getNpmSupportState(nextPkg)
  const engineChanged = previous.engineNpm !== next.engineNpm
  const packageManagerChanged = previous.packageManagerRaw !== next.packageManagerRaw
  const hasDetachedNpmSupport = isUnpinnedSemverRange(next.engineNpm)
  if (engineChanged === packageManagerChanged) return nextRaw

  const indentStyle = getEffectiveIndentStyle(nextRaw, spaceIndentSize)
  const shouldPlacePackageManagerBeforeEngines = typeof nextPkg.packageManager !== 'string'
  if (engineChanged) {
    const updated = hasDetachedNpmSupport
      ? next.packageManagerVersion ? withNormalizedPackageManager(nextPkg, next.packageManagerVersion) : nextPkg
      : !next.engineNpm ? withoutSyncedNpmSupport(nextPkg)
        : isPinnedNpmVersion(next.engineNpm) ? withSyncedNpmSupport(nextPkg, next.engineNpm)
          : withEngineNpmRangePreservingPackageManager(nextPkg, next.engineNpm)
    return serializePackageJson(updated, indentStyle, { packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || 'packageManager' in updated })
  }

  if (!next.packageManagerRaw) {
    const updated = hasDetachedNpmSupport ? withoutPackageManager(nextPkg) : withoutSyncedNpmSupport(nextPkg)
    return serializePackageJson(updated, indentStyle, { packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || 'packageManager' in nextPkg })
  }

  if (!next.packageManagerVersion) return nextRaw
  if (hasDetachedNpmSupport) return serializePackageJson(withNormalizedPackageManager(nextPkg, next.packageManagerVersion), indentStyle, { packageManagerBeforeEngines: true })

  const updated = isNpmSupportAligned(next.engineNpm, next.packageManagerRaw)
    ? withNormalizedPackageManager(nextPkg, next.packageManagerVersion)
    : withSyncedNpmSupport(nextPkg, next.packageManagerVersion)
  return serializePackageJson(updated, indentStyle, { packageManagerBeforeEngines: true })
}

export function reformatPackageJson(raw: string, spaceIndentSize: SpaceIndentSize): string {
  if (!raw.trim()) return raw
  try {
    return serializePackageJson(parsePackageJson(raw), createSpaceIndentStyle(spaceIndentSize))
  } catch {
    return raw
  }
}
