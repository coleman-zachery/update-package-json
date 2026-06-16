import type { PackageJson } from '@/lib/package-json'
import { sortDependencies } from '@/lib/package-json'
import { isMeaningfulDependencyChange } from '../state-helpers'
import type {
  DependencySection,
  VersionChange,
} from '../types'

export interface ResolvedDependencySections {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

function pushSectionChanges(
  changes: VersionChange[],
  section: DependencySection,
  previousValues: Record<string, string> | undefined,
  nextValues: Record<string, string>,
) {
  for (const [name, nextValue] of Object.entries(nextValues)) {
    const previousValue = previousValues?.[name]
    if (isMeaningfulDependencyChange(previousValue, nextValue)) {
      changes.push({
        name,
        from: previousValue ?? '(none)',
        to: nextValue,
        section,
      })
    }
  }
}

export function applyResolvedSections(
  pkg: PackageJson,
  resolvedSections: ResolvedDependencySections,
  changes: VersionChange[],
): PackageJson {
  const updated = { ...pkg }

  if (Object.keys(resolvedSections.dependencies).length > 0) {
    updated.dependencies = sortDependencies(resolvedSections.dependencies)
  }
  if (Object.keys(resolvedSections.devDependencies).length > 0) {
    updated.devDependencies = sortDependencies(resolvedSections.devDependencies)
  }
  if (Object.keys(resolvedSections.peerDependencies).length > 0) {
    updated.peerDependencies = sortDependencies(resolvedSections.peerDependencies)
  }

  pushSectionChanges(changes, 'dependencies', pkg.dependencies, resolvedSections.dependencies)
  pushSectionChanges(changes, 'devDependencies', pkg.devDependencies, resolvedSections.devDependencies)
  pushSectionChanges(changes, 'peerDependencies', pkg.peerDependencies, resolvedSections.peerDependencies)

  return updated
}
