import semver from 'semver'

export interface RangeBounds {
  min: semver.SemVer
  maxExclusive: semver.SemVer | null
}
