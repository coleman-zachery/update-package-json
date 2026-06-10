import semver from 'semver'

export function formatVersionPiece(version: semver.SemVer): string {
  if (version.patch !== 0) return `${version.major}.${version.minor}.${version.patch}`
  if (version.minor !== 0) return `${version.major}.${version.minor}`
  return `${version.major}`
}

export function formatExactDisplayVersion(version: string): string {
  const parsed = semver.parse(version)
  return parsed ? formatVersionPiece(parsed) : version
}

export function incrementPatch(version: semver.SemVer): semver.SemVer {
  return new semver.SemVer(`${version.major}.${version.minor}.${version.patch + 1}`)
}

export function normalizeComparatorVersion(version: semver.SemVer | null | undefined): semver.SemVer | null {
  if (!version) return null
  if (version.prerelease.length === 0) return version
  return new semver.SemVer(`${version.major}.${version.minor}.${version.patch}`)
}
