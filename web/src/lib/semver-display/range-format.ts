import semver from 'semver'
import { areContiguousMajors, parseRangeBounds } from './bounds'
import { formatExactDisplayVersion, formatVersionPiece, incrementPatch } from './version-format'

function formatUpperRangeValue(maxExclusive: semver.SemVer | null): string | null {
  if (!maxExclusive) return null
  if (maxExclusive.minor === 0 && maxExclusive.patch === 0 && maxExclusive.major > 0) return `${maxExclusive.major - 1}`
  if (maxExclusive.patch === 0 && maxExclusive.minor > 0) return `${maxExclusive.major}.${maxExclusive.minor - 1}`
  if (maxExclusive.patch > 0) return formatVersionPiece(new semver.SemVer(`${maxExclusive.major}.${maxExclusive.minor}.${maxExclusive.patch - 1}`))
  return formatVersionPiece(maxExclusive)
}

function getCaretUpperBound(min: semver.SemVer): semver.SemVer {
  if (min.major > 0) return new semver.SemVer(`${min.major + 1}.0.0`)
  if (min.minor > 0) return new semver.SemVer(`0.${min.minor + 1}.0`)
  return new semver.SemVer(`0.0.${min.patch + 1}`)
}

function getTildeUpperBound(min: semver.SemVer): semver.SemVer {
  return new semver.SemVer(`${min.major}.${min.minor + 1}.0`)
}

function tryFormatSingleBoundAsShortRange(min: semver.SemVer, maxExclusive: semver.SemVer | null): string | null {
  if (!maxExclusive) return null
  if (semver.eq(maxExclusive, incrementPatch(min))) return formatExactDisplayVersion(min.version)
  if (semver.eq(maxExclusive, getTildeUpperBound(min))) return min.patch === 0 ? `~${min.major}.${min.minor}` : `~${formatExactDisplayVersion(min.version)}`
  if (semver.eq(maxExclusive, getCaretUpperBound(min))) return min.minor === 0 && min.patch === 0 && min.major > 0 ? `${min.major}` : `^${formatExactDisplayVersion(min.version)}`
  return null
}

function formatRangeFromBounds(min: semver.SemVer, maxExclusive: semver.SemVer | null): string {
  if (!maxExclusive) return `${formatVersionPiece(min)} - *`
  const shorthand = tryFormatSingleBoundAsShortRange(min, maxExclusive)
  if (shorthand) return shorthand
  const upper = formatUpperRangeValue(maxExclusive)
  return upper ? `${formatVersionPiece(min)} - ${upper}` : `${formatVersionPiece(min)} - *`
}

export function formatCompactSemverRange(range: string): string {
  const trimmed = range.trim()
  if (!trimmed) return trimmed
  const exact = semver.valid(trimmed)
  if (exact) return formatExactDisplayVersion(exact)

  const bounds = parseRangeBounds(trimmed)
  if (!bounds) return trimmed
  if (bounds.length === 1) return formatRangeFromBounds(bounds[0].min, bounds[0].maxExclusive)

  const sortedBounds = [...bounds].sort((left, right) => semver.compare(left.min, right.min))
  if (areContiguousMajors(sortedBounds)) {
    const globalMax = sortedBounds.reduce<semver.SemVer | null>((current, bound) => {
      if (!bound.maxExclusive) return current
      if (!current || semver.gt(bound.maxExclusive, current)) return bound.maxExclusive
      return current
    }, null)
    return formatRangeFromBounds(sortedBounds[0].min, globalMax)
  }

  return sortedBounds.map(bound => formatRangeFromBounds(bound.min, bound.maxExclusive)).join(' || ')
}
