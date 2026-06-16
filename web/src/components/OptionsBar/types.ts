import type { ReactNode } from 'react'
import type { ResolveOptions } from '@/lib/resolver'
import type { PlatformOption } from '@/lib/resolver/platform-targets'

export interface EngineControlCard {
  label: ReactNode
  active: boolean
  warning: boolean
  danger: boolean
  meta: ReactNode
  disabled: boolean
  pressed?: boolean
}

export interface OptionControlButton {
  key: keyof ResolveOptions
  label: ReactNode
  active: boolean
  warning: boolean
  meta: ReactNode
  disabled: boolean
  pressed: boolean
}

export interface PlatformSelectorControls {
  options: PlatformOption[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}
