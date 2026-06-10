import type { DependencyExplorerContextSection } from './types'

export const CONTEXT_SECTION_ORDER: DependencyExplorerContextSection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

export const DEPENDENCY_EXPLORER_SAME_VALUE = 'same'
