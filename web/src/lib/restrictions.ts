import { isUnpinnedSemverRange, parsePackageManager } from '@/lib/package-json'

export type RestrictableSection =
  | 'engines'
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'
  | 'overrides'

export interface RestrictableEntry {
  key: string
  section: RestrictableSection
  name: string
  label: string
  value: string
  line: number
}

export type RestrictionState = Record<string, boolean>

const RESTRICTABLE_SECTIONS = new Set<RestrictableSection>([
  'engines',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
])

export function getRestrictionKey(section: RestrictableSection, name: string): string {
  return section === 'engines' ? `${section}:${name}` : `dependency:${name}`
}

export const ENGINE_NPM_RESTRICTION_KEY = getRestrictionKey('engines', 'npm')
export const PACKAGE_MANAGER_NPM_RESTRICTION_KEY = getRestrictionKey('engines', 'packageManager')

export function isDependencyRestrictionSection(section: RestrictableSection): boolean {
  return section !== 'engines'
}

function detectEngineNpmValue(raw: string): string {
  const lines = raw.split('\n')
  let currentSection: RestrictableSection | null = null

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*"([^"]+)"\s*:\s*{\s*$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1] as RestrictableSection
      currentSection = RESTRICTABLE_SECTIONS.has(sectionName) ? sectionName : null
      continue
    }

    if (!currentSection) continue

    if (/^\s*},?\s*$/.test(line)) {
      currentSection = null
      continue
    }

    if (currentSection !== 'engines') continue

    const valueMatch = line.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/)
    if (!valueMatch) continue

    const [, name, value] = valueMatch
    if (name === 'npm') {
      return value.trim()
    }
  }

  return ''
}

export function detectRestrictableEntries(raw: string): RestrictableEntry[] {
  const lines = raw.split('\n')
  const entries: RestrictableEntry[] = []
  let currentSection: RestrictableSection | null = null
  const hasDetachedNpmRange = isUnpinnedSemverRange(detectEngineNpmValue(raw))

  for (const [lineIndex, line] of lines.entries()) {
    if (!currentSection) {
      const packageManagerMatch = line.match(/^\s*"packageManager"\s*:\s*"([^"]*)"\s*,?\s*$/)
      if (packageManagerMatch) {
        const parsed = parsePackageManager(packageManagerMatch[1])

        if (parsed?.name === 'npm' && parsed.version) {
          entries.push({
            key: hasDetachedNpmRange ? PACKAGE_MANAGER_NPM_RESTRICTION_KEY : ENGINE_NPM_RESTRICTION_KEY,
            section: 'engines',
            name: hasDetachedNpmRange ? 'packageManager' : 'npm',
            label: hasDetachedNpmRange ? 'packageManager' : 'packageManager (engines.npm)',
            value: parsed.version,
            line: lineIndex,
          })
        }

        continue
      }
    }

    const sectionMatch = line.match(/^\s*"([^"]+)"\s*:\s*{\s*$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1] as RestrictableSection
      currentSection = RESTRICTABLE_SECTIONS.has(sectionName) ? sectionName : null
      continue
    }

    if (!currentSection) continue

    if (/^\s*},?\s*$/.test(line)) {
      currentSection = null
      continue
    }

    const valueMatch = line.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/)
    if (!valueMatch) continue

    const [, name, value] = valueMatch
    entries.push({
      key: getRestrictionKey(currentSection, name),
      section: currentSection,
      name,
      label: `${currentSection}.${name}`,
      value,
      line: lineIndex,
    })
  }

  return entries
}
