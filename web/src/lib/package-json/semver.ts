import semver from 'semver'
import { parsePackageManager } from './serialization'

export function isPinnedNpmVersion(value: string): boolean {
  return Boolean(semver.valid(value))
}

export function isUnpinnedSemverRange(value: string): boolean {
  return Boolean(value && semver.validRange(value) && !isPinnedNpmVersion(value))
}

export function isNpmSupportAligned(engineNpm: string, packageManager: unknown): boolean {
  if (!engineNpm) {
    return false
  }

  const parsedPackageManager = parsePackageManager(packageManager)
  if (parsedPackageManager?.name !== 'npm' || !parsedPackageManager.version || !isPinnedNpmVersion(parsedPackageManager.version)) {
    return false
  }

  if (isPinnedNpmVersion(engineNpm)) {
    return parsedPackageManager.version === engineNpm
  }

  const engineRange = semver.validRange(engineNpm)
  return Boolean(engineRange && semver.satisfies(parsedPackageManager.version, engineRange))
}
