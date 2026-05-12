import semver from 'semver'

interface RangeBounds {
  min: semver.SemVer
  maxExclusive: semver.SemVer | null
}

function formatVersionPiece(version: semver.SemVer): string {
  if (version.patch !== 0) {
    return `${version.major}.${version.minor}.${version.patch}`
  }

  if (version.minor !== 0) {
    return `${version.major}.${version.minor}`
  }

  return `${version.major}`
}

function formatExactDisplayVersion(version: string): string {
  const parsed = semver.parse(version)
  return parsed ? formatVersionPiece(parsed) : version
}

function incrementPatch(version: semver.SemVer): semver.SemVer {
  return new semver.SemVer(`${version.major}.${version.minor}.${version.patch + 1}`)
}

function normalizeComparatorVersion(version: semver.SemVer): semver.SemVer {
  if (version.prerelease.length === 0) {
    return version
  }

  return new semver.SemVer(`${version.major}.${version.minor}.${version.patch}`)
}

function parseRangeBounds(range: string): RangeBounds[] | null {
  const trimmed = range.trim()
  if (!trimmed || !semver.validRange(trimmed)) {
    return null
  }

  const parts = trimmed
    .split('||')
    .map(part => part.trim())
    .filter(Boolean)

  const bounds = parts.map(part => {
    const exact = semver.valid(part)
    if (exact) {
      const parsedExact = new semver.SemVer(exact)
      return {
        min: parsedExact,
        maxExclusive: incrementPatch(parsedExact),
      }
    }

    const parsedRange = new semver.Range(part)
    const comparators = parsedRange.set[0]
    const min = semver.minVersion(part)

    if (!comparators || !min) {
      return null
    }

    let maxExclusive: semver.SemVer | null = null

    for (const comparator of comparators) {
      const version = normalizeComparatorVersion(comparator.semver)

      if (!version || comparator.value === '') {
        continue
      }

      if (comparator.operator === '<') {
        if (!maxExclusive || semver.lt(version, maxExclusive)) {
          maxExclusive = version
        }
      }

      if (comparator.operator === '<=') {
        const inclusiveUpper = incrementPatch(version)
        if (!maxExclusive || semver.lt(inclusiveUpper, maxExclusive)) {
          maxExclusive = inclusiveUpper
        }
      }
    }

    return {
      min,
      maxExclusive,
    }
  })

  return bounds.every(Boolean) ? bounds as RangeBounds[] : null
}

function formatUpperRangeValue(maxExclusive: semver.SemVer | null): string | null {
  if (!maxExclusive) {
    return null
  }

  if (maxExclusive.minor === 0 && maxExclusive.patch === 0 && maxExclusive.major > 0) {
    return `${maxExclusive.major - 1}`
  }

  if (maxExclusive.patch === 0 && maxExclusive.minor > 0) {
    return `${maxExclusive.major}.${maxExclusive.minor - 1}`
  }

  if (maxExclusive.patch > 0) {
    return formatVersionPiece(new semver.SemVer(
      `${maxExclusive.major}.${maxExclusive.minor}.${maxExclusive.patch - 1}`,
    ))
  }

  return formatVersionPiece(maxExclusive)
}

function getCaretUpperBound(min: semver.SemVer): semver.SemVer {
  if (min.major > 0) {
    return new semver.SemVer(`${min.major + 1}.0.0`)
  }

  if (min.minor > 0) {
    return new semver.SemVer(`0.${min.minor + 1}.0`)
  }

  return new semver.SemVer(`0.0.${min.patch + 1}`)
}

function getTildeUpperBound(min: semver.SemVer): semver.SemVer {
  return new semver.SemVer(`${min.major}.${min.minor + 1}.0`)
}

function tryFormatSingleBoundAsShortRange(
  min: semver.SemVer,
  maxExclusive: semver.SemVer | null,
): string | null {
  if (!maxExclusive) {
    return null
  }

  if (semver.eq(maxExclusive, incrementPatch(min))) {
    return formatExactDisplayVersion(min.version)
  }

  if (semver.eq(maxExclusive, getTildeUpperBound(min))) {
    return min.patch === 0 ? `~${min.major}.${min.minor}` : `~${formatExactDisplayVersion(min.version)}`
  }

  if (semver.eq(maxExclusive, getCaretUpperBound(min))) {
    if (min.minor === 0 && min.patch === 0 && min.major > 0) {
      return `${min.major}`
    }

    return `^${formatExactDisplayVersion(min.version)}`
  }

  return null
}

function formatRangeFromBounds(
  min: semver.SemVer,
  maxExclusive: semver.SemVer | null,
): string {
  if (!maxExclusive) {
    return `${formatVersionPiece(min)} - *`
  }

  const shorthand = tryFormatSingleBoundAsShortRange(min, maxExclusive)
  if (shorthand) {
    return shorthand
  }

  const upper = formatUpperRangeValue(maxExclusive)
  return upper ? `${formatVersionPiece(min)} - ${upper}` : `${formatVersionPiece(min)} - *`
}

function areContiguousMajors(bounds: RangeBounds[]): boolean {
  const distinctMajors = Array.from(new Set(bounds.map(bound => bound.min.major)))
    .sort((left, right) => left - right)

  if (distinctMajors.length <= 1) {
    return true
  }

  return distinctMajors.every((major, index) => {
    if (index === 0) {
      return true
    }

    return major === distinctMajors[index - 1] + 1
  })
}

export function formatCompactSemverRange(range: string): string {
  const trimmed = range.trim()
  if (!trimmed) {
    return trimmed
  }

  const exact = semver.valid(trimmed)
  if (exact) {
    return formatExactDisplayVersion(exact)
  }

  const bounds = parseRangeBounds(trimmed)
  if (!bounds) {
    return trimmed
  }

  if (bounds.length === 1) {
    return formatRangeFromBounds(bounds[0].min, bounds[0].maxExclusive)
  }

  const sortedBounds = [...bounds].sort((left, right) => semver.compare(left.min, right.min))
  if (areContiguousMajors(sortedBounds)) {
    const globalMax = sortedBounds.reduce<semver.SemVer | null>((current, bound) => {
      if (!bound.maxExclusive) {
        return current
      }

      if (!current || semver.gt(bound.maxExclusive, current)) {
        return bound.maxExclusive
      }

      return current
    }, null)

    return formatRangeFromBounds(sortedBounds[0].min, globalMax)
  }

  return sortedBounds
    .map(bound => formatRangeFromBounds(bound.min, bound.maxExclusive))
    .join(' || ')
}

export function formatVersionWindow(versions: string[]): string {
  if (versions.length === 0) {
    return ''
  }

  if (versions.length === 1) {
    return versions[0]
  }

  const sortedAscending = [...versions].sort((left, right) => semver.compare(left, right))
  return `${sortedAscending[0]} - ${sortedAscending[sortedAscending.length - 1]}`
}
