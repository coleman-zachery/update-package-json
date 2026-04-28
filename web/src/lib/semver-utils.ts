import semver from 'semver'

export function isStable(version: string): boolean {
  const sv = semver.parse(version)
  if (!sv) return false
  return sv.prerelease.length === 0
}

export function filterStable(versions: string[]): string[] {
  return versions.filter(isStable)
}

export function filterCompatible(versions: string[], range: string): string[] {
  return versions.filter(v => semver.satisfies(v, range, { includePrerelease: false }))
}

export function newestSatisfying(versions: string[], range: string): string | null {
  const filtered = filterCompatible(filterStable(versions), range)
  if (filtered.length === 0) return null
  return filtered.sort((a, b) => semver.rcompare(a, b))[0] ?? null
}

export function newestStable(versions: string[]): string | null {
  const stable = filterStable(versions)
  if (stable.length === 0) return null
  return stable.sort((a, b) => semver.rcompare(a, b))[0] ?? null
}

export function isEngineCompatible(
  depEngines: Record<string, string | undefined> | undefined,
  rootNode: string | undefined,
  rootNpm: string | undefined,
  respectNode: boolean,
  respectNpm: boolean,
): boolean {
  if (!depEngines) return true

  if (respectNode && rootNode && depEngines.node) {
    // The dep's engines.node must not be incompatible with our rootNode
    // rootNode is something like ">=20", dep's engines.node is like ">=18"
    // We find the minimum node version we support and check that it satisfies dep's engine range
    const minRoot = semver.minVersion(rootNode)
    if (minRoot && !semver.satisfies(minRoot, depEngines.node)) {
      return false
    }
  }

  if (respectNpm && rootNpm && depEngines.npm) {
    const minRoot = semver.minVersion(rootNpm)
    if (minRoot && !semver.satisfies(minRoot, depEngines.npm)) {
      return false
    }
  }

  return true
}
