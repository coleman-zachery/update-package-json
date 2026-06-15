import semver from 'semver'
import { fetchPackument, getPreferredStableVersions, type Packument } from '@/lib/npm'
import type { PackageJson, RootDependencySection } from '@/lib/package-json'
import { ROOT_DEPENDENCY_SECTIONS } from '@/lib/package-json/sections'
import { newestSatisfying } from '@/lib/semver-utils'

export interface InputDependencyEntry {
  name: string
  section: RootDependencySection
  spec: string
}

export interface InputDependencyAnalysisEntry {
  missing: boolean
  resolvedVersion: string | null
  dependencyRanges: Record<string, string>
}

export interface InputDependencyAnalysisResult {
  lineSignatures: Map<string, string>
  analyses: Map<string, InputDependencyAnalysisEntry>
  entries: InputDependencyEntry[]
  transitiveDependencyNames: string[]
  unresolvedDependencyNames: string[]
}

function resolveDeclaredVersion(packument: Packument, spec: string): string | null {
  if (semver.validRange(spec)) {
    return newestSatisfying(getPreferredStableVersions(packument), spec)
  }

  if (spec in packument['dist-tags']) {
    return packument['dist-tags'][spec] ?? null
  }

  return null
}

export function collectInputDependencyEntries(pkg: PackageJson): InputDependencyEntry[] {
  const entries = new Map<string, InputDependencyEntry>()

  for (const section of ROOT_DEPENDENCY_SECTIONS) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (!entries.has(name)) {
        entries.set(name, { name, section, spec })
      }
    }
  }

  return Array.from(entries.values()).sort((left, right) => left.name.localeCompare(right.name))
}

export function collectDependencyLineSignatures(raw: string): Map<string, string> {
  const signatures = new Map<string, string[]>()
  let currentSection: RootDependencySection | null = null

  for (const line of raw.split('\n')) {
    const sectionMatch = line.match(/^\s*"(dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:\s*{\s*$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1] as RootDependencySection
      continue
    }

    if (currentSection && /^\s*},?\s*$/.test(line)) {
      currentSection = null
      continue
    }

    if (!currentSection) {
      continue
    }

    const valueMatch = line.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/)
    if (!valueMatch) {
      continue
    }

    const [, name, spec] = valueMatch
    const current = signatures.get(name) ?? []
    current.push(`${currentSection}:${name}:${spec}`)
    signatures.set(name, current)
  }

  return new Map(
    Array.from(signatures.entries()).map(([name, values]) => [name, values.join('|')]),
  )
}

export async function analyzeInputDependency(
  entry: InputDependencyEntry,
  signal?: AbortSignal,
): Promise<InputDependencyAnalysisEntry> {
  try {
    const packument = await fetchPackument(entry.name, signal)
    const resolvedVersion = resolveDeclaredVersion(packument, entry.spec)
    const manifest = resolvedVersion ? packument.versions[resolvedVersion] : undefined

    return {
      missing: false,
      resolvedVersion,
      dependencyRanges: {
        ...(manifest?.dependencies ?? {}),
        ...(manifest?.optionalDependencies ?? {}),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const normalizedMessage = message.toLowerCase()
    if (
      normalizedMessage.includes('404')
      || normalizedMessage.includes('not found')
      || normalizedMessage.includes('do not have permission')
      || normalizedMessage.includes('403')
      || normalizedMessage.includes('401')
    ) {
      return {
        missing: true,
        resolvedVersion: null,
        dependencyRanges: {},
      }
    }

    throw error
  }
}
