import type { PackageJson } from '@/lib/package-json'
import type {
  DependencySection,
  ResolveProgress,
} from '../types'

const PROGRESS_ROOT_SECTIONS: DependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
]

function countInitialTraversalTargets(pkg: PackageJson): number {
  const names = new Set<string>()

  for (const section of PROGRESS_ROOT_SECTIONS) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      names.add(name)
    }
  }

  return names.size
}

export function createTraversalProgressTracker(
  pkg: PackageJson,
  onProgress?: (progress: ResolveProgress) => void,
): {
  registerTraversal(name: string): void
  completeTraversal(name: string): void
  emitInitial(): void
} {
  const initialTraversalTotal = countInitialTraversalTargets(pkg)
  const discoveredTraversalNames = new Set<string>()
  const completedTraversalNames = new Set<string>()

  function emitProgress() {
    onProgress?.({
      completed: completedTraversalNames.size,
      total: Math.max(
        initialTraversalTotal,
        discoveredTraversalNames.size,
        completedTraversalNames.size,
      ),
    })
  }

  return {
    registerTraversal(name) {
      if (discoveredTraversalNames.has(name)) {
        return
      }

      discoveredTraversalNames.add(name)
      emitProgress()
    },
    completeTraversal(name) {
      if (!discoveredTraversalNames.has(name) || completedTraversalNames.has(name)) {
        return
      }

      completedTraversalNames.add(name)
      emitProgress()
    },
    emitInitial() {
      emitProgress()
    },
  }
}
