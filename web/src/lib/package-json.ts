import semver from 'semver'
import {
  createSpaceIndentStyle,
  detectIndentStyle,
  getEffectiveIndentStyle,
  getIndentText,
  type IndentStyle,
  type SpaceIndentSize,
} from '@/lib/indentation'

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

interface SerializePackageJsonOptions {
  packageManagerBeforeEngines?: boolean
}

interface NpmSupportState {
  engineNpm: string
  packageManagerRaw: string
  packageManagerVersion: string
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

const ROOT_DEPENDENCY_SECTIONS: RootDependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

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
  const normalized = options.packageManagerBeforeEngines ? reorderPackageManagerBeforeEngines(pkg) : pkg
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

export function isUnpinnedSemverRange(value: string): boolean {
  return Boolean(value && semver.validRange(value) && !isPinnedNpmVersion(value))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clonePackageJsonForMutation(pkg: PackageJson): PackageJson {
  return {
    ...pkg,
    dependencies: pkg.dependencies ? { ...pkg.dependencies } : pkg.dependencies,
    devDependencies: pkg.devDependencies ? { ...pkg.devDependencies } : pkg.devDependencies,
    peerDependencies: pkg.peerDependencies ? { ...pkg.peerDependencies } : pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies ? { ...pkg.optionalDependencies } : pkg.optionalDependencies,
    overrides: isPlainObject(pkg.overrides) ? { ...pkg.overrides } : pkg.overrides,
    engines: pkg.engines ? { ...pkg.engines } : pkg.engines,
  }
}

function getDependencySectionValues(
  pkg: PackageJson,
  section: RootDependencySection,
): Record<string, string> | undefined {
  return pkg[section]
}

function getDependencySectionsForPackage(
  pkg: PackageJson,
  name: string,
): RootDependencySection[] {
  return ROOT_DEPENDENCY_SECTIONS.filter(section => typeof getDependencySectionValues(pkg, section)?.[name] === 'string')
}

function getPreferredDependencySection(
  nextPkg: PackageJson,
  previousPkg: PackageJson,
  name: string,
  preferredSection?: RootDependencySection,
): RootDependencySection {
  if (preferredSection) {
    return preferredSection
  }

  return getDependencySectionsForPackage(nextPkg, name)[0]
    ?? getDependencySectionsForPackage(previousPkg, name)[0]
    ?? 'dependencies'
}

function ensureDependencyValue(
  pkg: PackageJson,
  previousPkg: PackageJson,
  name: string,
  value: string,
  preferredSection?: RootDependencySection,
) {
  const sections = getDependencySectionsForPackage(pkg, name)
  const targetSections = sections.length > 0
    ? sections
    : [getPreferredDependencySection(pkg, previousPkg, name, preferredSection)]

  for (const section of targetSections) {
    const existing = getDependencySectionValues(pkg, section) ?? {}
    pkg[section] = {
      ...existing,
      [name]: value,
    }
  }
}

function sortObjectEntries<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  ) as T
}

function cleanupEmptyDependencySections(pkg: PackageJson) {
  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const values = getDependencySectionValues(pkg, section)
    if (values && Object.keys(values).length === 0) {
      delete pkg[section]
    }
  }
}

export function getDependencyVersion(pkg: PackageJson, name: string): string | undefined {
  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const value = getDependencySectionValues(pkg, section)?.[name]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function shouldPlacePackageManagerBeforeEngines(pkg: PackageJson): boolean {
  return typeof pkg.packageManager === 'string' && Boolean(pkg.engines)
}

export function getStringOverrides(pkg: PackageJson): Record<string, string> {
  if (!isPlainObject(pkg.overrides)) {
    return {}
  }

  const entries = Object.entries(pkg.overrides).filter(([, value]) => typeof value === 'string')
  return Object.fromEntries(entries) as Record<string, string>
}

export function hasDependencyOverride(pkg: PackageJson, name: string): boolean {
  return typeof getStringOverrides(pkg)[name] === 'string'
}

export function detectFrozenDependencyNames(raw: string): Set<string> {
  if (!raw.trim()) {
    return new Set()
  }

  try {
    return new Set(Object.keys(getStringOverrides(parsePackageJson(raw))))
  } catch {
    return new Set()
  }
}

function syncDependencyOverridesInPackage(
  previousPkg: PackageJson,
  nextPkg: PackageJson,
): PackageJson {
  const stringOverrides = getStringOverrides(nextPkg)
  const overrideNames = Object.keys(stringOverrides)

  if (overrideNames.length === 0) {
    return nextPkg
  }

  const previousOverrides = getStringOverrides(previousPkg)
  const updated = clonePackageJsonForMutation(nextPkg)
  const mutableOverrides = isPlainObject(updated.overrides) ? updated.overrides : {}
  let changed = !isPlainObject(updated.overrides)

  for (const name of overrideNames) {
    const nextOverrideValue = stringOverrides[name]
    const previousOverrideValue = previousOverrides[name]
    const nextDependencyValue = getDependencyVersion(nextPkg, name)
    const previousDependencyValue = getDependencyVersion(previousPkg, name)
    const dependencyChanged = nextDependencyValue !== previousDependencyValue
    const overrideChanged = nextOverrideValue !== previousOverrideValue
    const desiredValue = !nextDependencyValue
      ? nextOverrideValue
      : dependencyChanged && !overrideChanged
        ? nextDependencyValue
        : nextOverrideValue

    if (getDependencyVersion(updated, name) !== desiredValue) {
      ensureDependencyValue(updated, previousPkg, name, desiredValue)
      changed = true
    }

    const dependencySections = getDependencySectionsForPackage(updated, name)
    if (dependencySections.some(section => getDependencySectionValues(updated, section)?.[name] !== desiredValue)) {
      ensureDependencyValue(updated, previousPkg, name, desiredValue)
      changed = true
    }

    if (mutableOverrides[name] !== desiredValue) {
      mutableOverrides[name] = desiredValue
      changed = true
    }
  }

  if (!changed) {
    return nextPkg
  }

  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    const values = getDependencySectionValues(updated, section)
    if (values) {
      updated[section] = sortDependencies(values)
    }
  }

  updated.overrides = sortObjectEntries(mutableOverrides)
  cleanupEmptyDependencySections(updated)

  return updated
}

function serializeMutatedPackage(
  raw: string,
  pkg: PackageJson,
  spaceIndentSize?: SpaceIndentSize,
): string {
  return serializePackageJson(pkg, getEffectiveIndentStyle(raw, spaceIndentSize), {
    packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines(pkg),
  })
}

export function isPinnedNpmVersion(value: string): boolean {
  return Boolean(semver.valid(value))
}

export function isNpmSupportAligned(engineNpm: string, packageManager: unknown): boolean {
  if (!engineNpm) {
    return false
  }

  const parsedPackageManager = parsePackageManager(packageManager)
  if (parsedPackageManager?.name !== 'npm' || !parsedPackageManager.version || !isPinnedNpmVersion(parsedPackageManager.version)) {
    return false
  }

  if (isPinnedNpmVersion(engineNpm)) {
    return parsedPackageManager.version === engineNpm
  }

  const engineRange = semver.validRange(engineNpm)
  return Boolean(engineRange && semver.satisfies(parsedPackageManager.version, engineRange))
}

function withSyncedNpmSupport(pkg: PackageJson, version: string): PackageJson {
  return {
    ...pkg,
    packageManager: formatNpmPackageManager(version),
    engines: {
      ...(pkg.engines ?? {}),
      npm: version,
    },
  }
}

function withoutSyncedNpmSupport(pkg: PackageJson): PackageJson {
  const next: PackageJson = { ...pkg }

  if (next.engines) {
    const { npm: _npm, ...remainingEngines } = next.engines
    if (Object.keys(remainingEngines).length > 0) {
      next.engines = remainingEngines
    } else {
      delete next.engines
    }
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
    packageManagerVersion: parsedPackageManager?.name === 'npm' && parsedPackageManager.version
      ? parsedPackageManager.version
      : '',
  }
}

function withEngineNpmRangePreservingPackageManager(pkg: PackageJson, range: string): PackageJson {
  const updated: PackageJson = {
    ...pkg,
    engines: {
      ...(pkg.engines ?? {}),
      npm: range,
    },
  }

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
  return {
    ...pkg,
    packageManager: formatNpmPackageManager(version),
  }
}

export function upsertEngineValue(
  raw: string,
  engineName: 'node' | 'npm',
  value: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  const pkg = raw.trim() ? parsePackageJson(raw) : {}
  const engines = pkg.engines ?? {}
  const indentStyle = getEffectiveIndentStyle(raw, spaceIndentSize)
  const shouldPlacePackageManagerBeforeEngines = engineName === 'npm' && typeof pkg.packageManager !== 'string'

  const updated = engineName === 'npm'
    ? withSyncedNpmSupport(pkg, value)
    : {
        ...pkg,
        engines: {
          ...engines,
          [engineName]: value,
        },
      }

  return serializePackageJson(updated, indentStyle, {
    packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines,
  })
}

export function upsertNpmSupport(raw: string, value: string, spaceIndentSize?: SpaceIndentSize): string {
  return upsertEngineValue(raw, 'npm', value, spaceIndentSize)
}

export function syncDependencyOverridesAfterInputChange(
  previousRaw: string,
  nextRaw: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  if (!nextRaw.trim()) {
    return nextRaw
  }

  let nextPkg: PackageJson

  try {
    nextPkg = parsePackageJson(nextRaw)
  } catch {
    return nextRaw
  }

  const previousPkg = previousRaw.trim()
    ? (() => {
        try {
          return parsePackageJson(previousRaw)
        } catch {
          return {}
        }
      })()
    : {}

  const updated = syncDependencyOverridesInPackage(previousPkg, nextPkg)
  return updated === nextPkg ? nextRaw : serializeMutatedPackage(nextRaw, updated, spaceIndentSize)
}

export function setDependencyFrozen(
  raw: string,
  name: string,
  enabled: boolean,
  spaceIndentSize?: SpaceIndentSize,
  preferredSection?: RootDependencySection,
): string {
  const pkg = raw.trim() ? parsePackageJson(raw) : {}
  const updated = clonePackageJsonForMutation(pkg)
  const overrides = isPlainObject(updated.overrides) ? { ...updated.overrides } : {}

  if (enabled) {
    const currentValue = preferredSection
      ? getDependencySectionValues(updated, preferredSection)?.[name] ?? getDependencyVersion(updated, name)
      : getDependencyVersion(updated, name)
    const overrideValue = typeof overrides[name] === 'string' ? overrides[name] as string : undefined
    const nextValue = currentValue ?? overrideValue

    if (!nextValue) {
      return raw
    }

    ensureDependencyValue(updated, pkg, name, nextValue, preferredSection)
    overrides[name] = nextValue
    updated.overrides = sortObjectEntries(overrides)
    cleanupEmptyDependencySections(updated)
    return serializeMutatedPackage(raw, updated, spaceIndentSize)
  }

  if (!(name in overrides)) {
    return raw
  }

  delete overrides[name]
  updated.overrides = Object.keys(overrides).length > 0 ? sortObjectEntries(overrides) : undefined
  cleanupEmptyDependencySections(updated)
  return serializeMutatedPackage(raw, updated, spaceIndentSize)
}

export function forceDependenciesIntoOverrides(
  pkg: PackageJson,
  names: string[],
): PackageJson {
  if (names.length === 0) {
    return pkg
  }

  const updated = clonePackageJsonForMutation(pkg)
  const overrides = isPlainObject(updated.overrides) ? { ...updated.overrides } : {}
  let changed = false

  for (const name of names) {
    const version = getDependencyVersion(updated, name)
    if (!version || overrides[name] === version) {
      continue
    }

    overrides[name] = version
    changed = true
  }

  if (!changed) {
    return pkg
  }

  updated.overrides = sortObjectEntries(overrides)
  return updated
}

export function removeDependencyOverrides(
  pkg: PackageJson,
  names: string[],
): PackageJson {
  if (names.length === 0 || !isPlainObject(pkg.overrides)) {
    return pkg
  }

  const updated = clonePackageJsonForMutation(pkg)
  const overrides = { ...(updated.overrides as Record<string, unknown>) }
  let changed = false

  for (const name of names) {
    if (!(name in overrides)) {
      continue
    }

    delete overrides[name]
    changed = true
  }

  if (!changed) {
    return pkg
  }

  updated.overrides = Object.keys(overrides).length > 0 ? sortObjectEntries(overrides) : undefined
  return updated
}

export function syncNpmSupportAfterInputChange(
  previousRaw: string,
  nextRaw: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  if (!nextRaw.trim()) return nextRaw

  let nextPkg: PackageJson

  try {
    nextPkg = parsePackageJson(nextRaw)
  } catch {
    return nextRaw
  }

  const previousPkg = previousRaw.trim()
    ? (() => {
        try {
          return parsePackageJson(previousRaw)
        } catch {
          return {}
        }
      })()
    : {}

  const previous = getNpmSupportState(previousPkg)
  const next = getNpmSupportState(nextPkg)
  const engineChanged = previous.engineNpm !== next.engineNpm
  const packageManagerChanged = previous.packageManagerRaw !== next.packageManagerRaw
  const hasDetachedNpmSupport = isUnpinnedSemverRange(next.engineNpm)

  if (engineChanged === packageManagerChanged) {
    return nextRaw
  }

  const indentStyle = getEffectiveIndentStyle(nextRaw, spaceIndentSize)
  const shouldPlacePackageManagerBeforeEngines = typeof nextPkg.packageManager !== 'string'

  if (engineChanged) {
    if (hasDetachedNpmSupport) {
      const updated = next.packageManagerVersion
        ? withNormalizedPackageManager(nextPkg, next.packageManagerVersion)
        : nextPkg
      return serializePackageJson(updated, indentStyle, {
        packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || 'packageManager' in updated,
      })
    }

    const updated = !next.engineNpm
      ? withoutSyncedNpmSupport(nextPkg)
      : isPinnedNpmVersion(next.engineNpm)
        ? withSyncedNpmSupport(nextPkg, next.engineNpm)
        : withEngineNpmRangePreservingPackageManager(nextPkg, next.engineNpm)
    return serializePackageJson(updated, indentStyle, {
      packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || 'packageManager' in updated,
    })
  }

  if (!next.packageManagerRaw) {
    const updated = hasDetachedNpmSupport ? withoutPackageManager(nextPkg) : withoutSyncedNpmSupport(nextPkg)
    return serializePackageJson(updated, indentStyle, {
      packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || 'packageManager' in nextPkg,
    })
  }

  if (!next.packageManagerVersion) {
    return nextRaw
  }

  if (hasDetachedNpmSupport) {
    return serializePackageJson(withNormalizedPackageManager(nextPkg, next.packageManagerVersion), indentStyle, {
      packageManagerBeforeEngines: true,
    })
  }

  const updated = isNpmSupportAligned(next.engineNpm, next.packageManagerRaw)
    ? withNormalizedPackageManager(nextPkg, next.packageManagerVersion)
    : withSyncedNpmSupport(nextPkg, next.packageManagerVersion)

  return serializePackageJson(updated, indentStyle, {
    packageManagerBeforeEngines: shouldPlacePackageManagerBeforeEngines || true,
  })
}

export function reformatPackageJson(raw: string, spaceIndentSize: SpaceIndentSize): string {
  if (!raw.trim()) {
    return raw
  }

  try {
    return serializePackageJson(parsePackageJson(raw), createSpaceIndentStyle(spaceIndentSize))
  } catch {
    return raw
  }
}

export function syncPackageJsonAfterInputChange(
  previousRaw: string,
  nextRaw: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  const withSyncedOverrides = syncDependencyOverridesAfterInputChange(previousRaw, nextRaw, spaceIndentSize)
  return syncNpmSupportAfterInputChange(previousRaw, withSyncedOverrides, spaceIndentSize)
}

export function getTextReplacement(previousText: string, nextText: string): TextReplacement | null {
  if (previousText === nextText) {
    return null
  }

  let from = 0
  while (
    from < previousText.length &&
    from < nextText.length &&
    previousText.charCodeAt(from) === nextText.charCodeAt(from)
  ) {
    from += 1
  }

  let previousSuffix = previousText.length
  let nextSuffix = nextText.length
  while (
    previousSuffix > from &&
    nextSuffix > from &&
    previousText.charCodeAt(previousSuffix - 1) === nextText.charCodeAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1
    nextSuffix -= 1
  }

  return {
    from,
    to: previousSuffix,
    insert: nextText.slice(from, nextSuffix),
  }
}

export function sortDependencies(deps: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
}
