import semver from 'semver'
import { isStable, newestStable } from '@/lib/semver-utils'

export interface VersionManifest {
  version: string
  dependencies?: Record<string, string>
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

export async function fetchPackument(pkg: string): Promise<Packument> {
  const cached = getFromCache(pkg)
  if (cached) return cached

  const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkg)}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
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
  const latest = getLatestVersion(packument)

  if (preferredVersions.includes(latest)) {
    return [latest, ...preferredVersions.filter(version => version !== latest), ...deprecatedVersions]
  }

  return preferredVersions.length > 0 ? [...preferredVersions, ...deprecatedVersions] : deprecatedVersions
}

interface NodeVersionsCache {
  versions: string[]
  fetchedAt: number
}

const NODE_VERSIONS_CACHE_KEY = 'node-release-versions'

export async function fetchNodeVersions(): Promise<string[]> {
  try {
    const raw = localStorage.getItem(NODE_VERSIONS_CACHE_KEY)
    if (raw) {
      const entry = JSON.parse(raw) as NodeVersionsCache
      if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.versions
    }
  } catch { /* ignore */ }

  const res = await fetch('https://nodejs.org/dist/index.json')
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

export async function fetchLatestNodeVersion(): Promise<string> {
  const latest = newestStable(await fetchNodeVersions())
  if (!latest) throw new Error('Unable to determine the latest Node.js version')
  return latest
}

export async function fetchLatestNpmVersion(): Promise<string> {
  const npmPackument = await fetchPackument('npm')
  const latest = getLatestVersion(npmPackument) || newestStable(getAllVersions(npmPackument))
  if (!latest) throw new Error('Unable to determine the latest npm version')
  return latest
}
