import semver from 'semver'
import { incrementPatch, normalizeComparatorVersion } from './version-format'
import type { RangeBounds } from './types'

export function parseRangeBounds(range: string): RangeBounds[] | null {
  const trimmed = range.trim()
  if (!trimmed || !semver.validRange(trimmed)) return null

  const parts = trimmed.split('||').map(part => part.trim()).filter(Boolean)
  const bounds = parts.map(part => {
    const exact = semver.valid(part)
    if (exact) {
      const parsedExact = new semver.SemVer(exact)
      return { min: parsedExact, maxExclusive: incrementPatch(parsedExact) }
    }

    const comparators = new semver.Range(part).set[0]
    const min = semver.minVersion(part)
    if (!comparators || !min) return null

    let maxExclusive: semver.SemVer | null = null
    for (const comparator of comparators) {
      const version = normalizeComparatorVersion(comparator.semver)
      if (!version || comparator.value === '') continue
      if (comparator.operator === '<' && (!maxExclusive || semver.lt(version, maxExclusive))) maxExclusive = version
      if (comparator.operator === '<=') {
        const inclusiveUpper = incrementPatch(version)
        if (!maxExclusive || semver.lt(inclusiveUpper, maxExclusive)) maxExclusive = inclusiveUpper
      }
    }

    return { min, maxExclusive }
  })

  return bounds.every(Boolean) ? bounds as RangeBounds[] : null
}

export function areContiguousMajors(bounds: RangeBounds[]): boolean {
  const distinctMajors = Array.from(new Set(bounds.map(bound => bound.min.major))).sort((left, right) => left - right)
  return distinctMajors.length <= 1 || distinctMajors.every((major, index) => index === 0 || major === distinctMajors[index - 1] + 1)
}
