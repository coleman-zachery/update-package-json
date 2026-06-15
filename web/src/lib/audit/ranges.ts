import semver from 'semver'

interface OsvRangeEvent {
  introduced?: string
  fixed?: string
  last_affected?: string
  limit?: string
}

function isConcreteVersion(value: string | undefined): value is string {
  return Boolean(value && value !== '0' && semver.valid(value))
}

function toBound(event: OsvRangeEvent, key: 'fixed' | 'last_affected' | 'limit'): string | null {
  const value = event[key]
  return isConcreteVersion(value) ? value : null
}

export function toOsvSemverRanges(events: OsvRangeEvent[] | undefined): string[] {
  if (!events || events.length === 0) {
    return []
  }

  const ranges: string[] = []
  let introduced: string | null = null

  for (const event of events) {
    if (isConcreteVersion(event.introduced)) {
      introduced = event.introduced
      continue
    }

    if (event.introduced === '0') {
      introduced = null
      continue
    }

    const fixed = toBound(event, 'fixed')
    if (fixed) {
      ranges.push(`${introduced ? `>=${introduced} ` : ''}<${fixed}`.trim())
      introduced = null
      continue
    }

    const lastAffected = toBound(event, 'last_affected')
    if (lastAffected) {
      ranges.push(`${introduced ? `>=${introduced} ` : ''}<=${lastAffected}`.trim())
      introduced = null
      continue
    }

    const limit = toBound(event, 'limit')
    if (limit) {
      ranges.push(`${introduced ? `>=${introduced} ` : ''}<${limit}`.trim())
      introduced = null
    }
  }

  if (introduced) {
    ranges.push(`>=${introduced}`)
  }

  return ranges.filter(Boolean)
}

export function normalizeStableVersionDisplay(value: string): string {
  const parsed = semver.parse(value)
  if (!parsed) {
    return value
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

export function normalizeStableRangeDisplay(value: string): string {
  return value.replace(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g, token => {
    return semver.valid(token) ? normalizeStableVersionDisplay(token) : token
  })
}

export function summarizeAffectedVersionRange(versions: string[]): string | null {
  const stableVersions = versions
    .filter(version => semver.valid(version) && !semver.prerelease(version))
    .sort((left, right) => semver.compare(left, right))

  if (stableVersions.length === 0) {
    return null
  }

  const first = normalizeStableVersionDisplay(stableVersions[0])
  const last = normalizeStableVersionDisplay(stableVersions[stableVersions.length - 1])
  return first === last ? first : `${first} - ${last}`
}
