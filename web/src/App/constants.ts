import type { ResolveOptions } from '@/lib/resolver'

export const DEFAULT_OPTIONS: ResolveOptions = {
  respectEnginesNode: false,
  respectEnginesNpm: false,
  addOptionalPeerDeps: false,
  avoidLatestVersions: false,
  addEnginesNode: true,
  addEnginesNpm: true,
}

export const ENGINE_NAMES = ['node', 'npm'] as const

export const OPTION_BUTTONS: Array<{
  key: keyof ResolveOptions
  label: string
  activeLabel?: string
  inactiveLabel?: string
  activeMeta: string
  inactiveMeta: string
  activeTone?: 'accent' | 'warning'
  inactiveTone?: 'default' | 'accent' | 'warning'
}> = [
  {
    key: 'addOptionalPeerDeps',
    label: 'Optional peerDependencies',
    activeMeta: 'including optional peers',
    inactiveMeta: 'skipping optional peers',
  },
  {
    key: 'avoidLatestVersions',
    label: 'Prefer Latest',
    activeLabel: 'Avoid Latest',
    inactiveLabel: 'Prefer Latest',
    activeMeta: 'avoiding latest engines and packages',
    inactiveMeta: 'allowing latest engines and packages',
    activeTone: 'warning',
    inactiveTone: 'accent',
  },
]
