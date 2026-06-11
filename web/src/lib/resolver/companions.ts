import type { PackageJson } from '@/lib/package-json'
import { inferCompanionPackageName } from './native-package-helpers'
import type { DependencySection } from './types'

export interface RootPackageRequest {
  name: string
  section: DependencySection
  sourceName: string
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
