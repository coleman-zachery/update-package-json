import type { PackageJson } from '@/lib/package-json'
import { CONTEXT_SECTION_ORDER } from './constants'
import type { DependencyExplorerContextSection } from './types'

export function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getContextDependencySections(
  pkg: PackageJson,
  packageName: string,
): DependencyExplorerContextSection[] {
  return CONTEXT_SECTION_ORDER.filter(section => typeof pkg[section]?.[packageName] === 'string')
}

export function getContextDependencyValue(
  pkg: PackageJson,
  packageName: string,
): string | null {
  for (const section of CONTEXT_SECTION_ORDER) {
    const value = pkg[section]?.[packageName]
    if (typeof value === 'string') {
      return value
    }
  }

  return null
}
