import type { PackageJson } from '@/lib/package-json'
import { inferCompanionPackageName } from './native-package-helpers'
import type { DependencySection } from './types'

export interface RootPackageRequest {
  name: string
  section: DependencySection
  sourceName: string
  sourceVersion?: string
  rootSourceName?: string
  rootSourceVersion?: string
  currentValue: string
  requestedRange: string
}

const ROOT_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
]

function hasRootPackage(pkg: PackageJson, name: string): boolean {
  return ROOT_SECTIONS.some(section => typeof pkg[section]?.[name] === 'string')
}

export function collectCompanionRootRequests(pkg: PackageJson): RootPackageRequest[] {
  const requests = new Map<string, RootPackageRequest>()

  for (const section of ROOT_SECTIONS) {
    const values = pkg[section]
    if (!values) {
      continue
    }

    for (const [name, version] of Object.entries(values)) {
      const companionName = inferCompanionPackageName(name)
      if (!companionName || hasRootPackage(pkg, companionName)) {
        continue
      }

      if (!requests.has(companionName)) {
        requests.set(companionName, {
          name: companionName,
          section,
          sourceName: name,
          sourceVersion: version,
          rootSourceName: name,
          rootSourceVersion: version,
          currentValue: version,
          requestedRange: version,
        })
      }
    }
  }

  return Array.from(requests.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

export function collectCompanionRequestsFromRootRequests(
  pkg: PackageJson,
  requests: RootPackageRequest[],
  existingNames: Iterable<string> = [],
): RootPackageRequest[] {
  const existing = new Set(existingNames)
  const companionRequests = new Map<string, RootPackageRequest>()

  for (const request of requests) {
    const companionName = inferCompanionPackageName(request.name)
    if (!companionName || hasRootPackage(pkg, companionName) || existing.has(companionName)) {
      continue
    }

    if (!companionRequests.has(companionName)) {
      companionRequests.set(companionName, {
        name: companionName,
        section: request.section,
        sourceName: request.name,
        sourceVersion: request.currentValue,
        rootSourceName: request.name,
        rootSourceVersion: request.currentValue,
        currentValue: request.currentValue,
        requestedRange: request.requestedRange,
      })
    }
  }

  return Array.from(companionRequests.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}
