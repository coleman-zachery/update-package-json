import semver from 'semver'
import { throwIfAborted } from '@/lib/resolver/abort'
import { isStable, newestStable } from '@/lib/semver-utils'

export interface VersionManifest {
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  devDependencies?: Record<string, string>
  engines?: {
    node?: string
    npm?: string
    [key: string]: string | undefined
  }
  deprecated?: string
}

export interface Packument {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, VersionManifest>
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const REGISTRY = 'https://registry.npmjs.org'

interface CacheEntry {
  data: Packument
  fetchedAt: number
}

function cacheKey(pkg: string) {
  return `npm-packument:${pkg}`
}

function getFromCache(pkg: string): Packument | null {
  try {
    const raw = localStorage.getItem(cacheKey(pkg))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(pkg))
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

function saveToCache(pkg: string, data: Packument) {
  try {
    const entry: CacheEntry = { data, fetchedAt: Date.now() }
    localStorage.setItem(cacheKey(pkg), JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — ignore
  }
}

export async function fetchPackument(pkg: string, signal?: AbortSignal): Promise<Packument> {
  throwIfAborted(signal)
  const cached = getFromCache(pkg)
  if (cached) return cached

  const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkg)}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
    signal,
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch metadata for "${pkg}": ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as Packument
  saveToCache(pkg, data)
  return data
}

export function getAllVersions(packument: Packument): string[] {
  return Object.keys(packument.versions)
}

export function getLatestVersion(packument: Packument): string {
  return packument['dist-tags']?.latest ?? ''
}

export function isDeprecatedVersion(manifest: VersionManifest | undefined): boolean {
  return Boolean(manifest?.deprecated?.trim())
}

export function getPreferredStableVersions(packument: Packument): string[] {
  const stableVersions = getAllVersions(packument).filter(isStable)
  const sortedStableVersions = stableVersions.sort((a, b) => semver.rcompare(a, b))

  const preferredVersions = sortedStableVersions.filter(version => !isDeprecatedVersion(packument.versions[version]))
  const deprecatedVersions = sortedStableVersions.filter(version => isDeprecatedVersion(packument.versions[version]))

  return preferredVersions.length > 0 ? [...preferredVersions, ...deprecatedVersions] : deprecatedVersions
}

interface NodeVersionsCache {
  versions: string[]
  fetchedAt: number
}

const NODE_VERSIONS_CACHE_KEY = 'node-release-versions'
const NODE_RELEASE_SCHEDULE_CACHE_KEY = 'node-release-schedule'

interface NodeReleaseScheduleEntry {
  start?: string
  lts?: string
  maintenance?: string
  end?: string
  codename?: string
  alpha?: string
}

interface NodeReleaseScheduleCache {
  schedule: Record<string, NodeReleaseScheduleEntry>
  fetchedAt: number
}

export interface NodeReleaseLine {
  major: number
  latestVersion: string
  supported: boolean
  ltsActive: boolean
  oddSupported: boolean
}

function parseIsoDate(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function getNowTimestamp(): number {
  return Date.now()
}

async function fetchNodeReleaseSchedule(signal?: AbortSignal): Promise<Record<string, NodeReleaseScheduleEntry>> {
  throwIfAborted(signal)

  try {
    const raw = localStorage.getItem(NODE_RELEASE_SCHEDULE_CACHE_KEY)
    if (raw) {
      const entry = JSON.parse(raw) as NodeReleaseScheduleCache
      if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
        return entry.schedule
      }
    }
  } catch {
    // ignore cache failures
  }

  const res = await fetch('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json', { signal })
  if (!res.ok) {
    throw new Error(`Failed to fetch Node.js release schedule: ${res.status}`)
  }

  const schedule = await res.json() as Record<string, NodeReleaseScheduleEntry>

  try {
    const entry: NodeReleaseScheduleCache = { schedule, fetchedAt: Date.now() }
    localStorage.setItem(NODE_RELEASE_SCHEDULE_CACHE_KEY, JSON.stringify(entry))
  } catch {
    // ignore cache failures
  }

  return schedule
}

export async function fetchNodeReleaseLines(signal?: AbortSignal): Promise<NodeReleaseLine[]> {
  throwIfAborted(signal)
  const [versions, schedule] = await Promise.all([
    fetchNodeVersions(signal),
    fetchNodeReleaseSchedule(signal),
  ])

  const latestVersionByMajor = new Map<number, string>()
  for (const version of versions) {
    const major = semver.major(version)
    const current = latestVersionByMajor.get(major)
    if (!current || semver.gt(version, current)) {
      latestVersionByMajor.set(major, version)
    }
  }

  const now = getNowTimestamp()
  const highestMajor = Math.max(...latestVersionByMajor.keys())
  const lines = Array.from(latestVersionByMajor.entries())
    .map(([major, latestVersion]) => {
      const entry = schedule[`v${major}`]
      const end = parseIsoDate(entry?.end)
      const lts = parseIsoDate(entry?.lts)
      const supported = end === null || end >= now
      const ltsActive = Boolean(lts !== null && lts <= now && supported)
      const oddSupported = supported && major % 2 === 1 && major === highestMajor
      return {
        major,
        latestVersion,
        supported,
        ltsActive,
        oddSupported,
      }
    })
    .sort((left, right) => left.major - right.major)

  return lines
}

export async function fetchPreferredNodeVersions(signal?: AbortSignal): Promise<string[]> {
  const [versions, lines] = await Promise.all([
    fetchNodeVersions(signal),
    fetchNodeReleaseLines(signal),
  ])
  const allowedMajors = new Set(
    lines
      .filter(line => line.ltsActive || line.oddSupported)
      .map(line => line.major),
  )

  if (allowedMajors.size === 0) {
    return versions
  }

  return versions.filter(version => allowedMajors.has(semver.major(version)))
}

export async function fetchNodeVersions(signal?: AbortSignal): Promise<string[]> {
  throwIfAborted(signal)
  try {
    const raw = localStorage.getItem(NODE_VERSIONS_CACHE_KEY)
    if (raw) {
      const entry = JSON.parse(raw) as NodeVersionsCache
      if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.versions
    }
  } catch { /* ignore */ }

  const res = await fetch('https://nodejs.org/dist/index.json', { signal })
  if (!res.ok) throw new Error(`Failed to fetch Node.js versions: ${res.status}`)
  const data = await res.json() as Array<{ version: string }>

  const versions = data
    .map(r => r.version.replace(/^v/, ''))
    .filter(v => !v.includes('-')) // exclude pre-release

  try {
    const entry: NodeVersionsCache = { versions, fetchedAt: Date.now() }
    localStorage.setItem(NODE_VERSIONS_CACHE_KEY, JSON.stringify(entry))
  } catch { /* ignore */ }

  return versions
}

export async function fetchLatestNodeVersion(signal?: AbortSignal): Promise<string> {
  const latest = newestStable(await fetchPreferredNodeVersions(signal))
  if (!latest) throw new Error('Unable to determine the latest Node.js version')
  return latest
}

export async function fetchLatestNpmVersion(signal?: AbortSignal): Promise<string> {
  const npmPackument = await fetchPackument('npm', signal)
  const latest = getPreferredStableVersions(npmPackument)[0] || newestStable(getAllVersions(npmPackument))
  if (!latest) throw new Error('Unable to determine the latest npm version')
  return latest
}
