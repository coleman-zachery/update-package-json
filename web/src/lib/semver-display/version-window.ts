import semver from 'semver'

export function formatVersionWindow(versions: string[]): string {
  if (versions.length === 0) return ''
  if (versions.length === 1) return versions[0]
  const sortedAscending = [...versions].sort((left, right) => semver.compare(left, right))
  return `${sortedAscending[0]} - ${sortedAscending[sortedAscending.length - 1]}`
}
