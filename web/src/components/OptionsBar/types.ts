import type { EngineName, ResolveOptions } from '@/lib/resolver'
import type { PlatformOption } from '@/lib/resolver/platform-targets'

export interface EngineControlButton {
  engineName: EngineName
  label: string
  active: boolean
  warning: boolean
  danger: boolean
  hasInput: boolean
  meta: string
  disabled: boolean
}

export interface OptionControlButton {
  key: keyof ResolveOptions
  label: string
  active: boolean
  warning: boolean
  meta: string
  disabled: boolean
  pressed: boolean
}

export interface PlatformSelectorControls {
  options: PlatformOption[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}
