import type { ReactNode } from 'react'
import type { EngineName, ResolveOptions } from '@/lib/resolver'
import './index.css'

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

interface Props {
  engineButtons: EngineControlButton[]
  optionButtons: OptionControlButton[]
  utility?: ReactNode
  onEngineClick: (engineName: EngineName) => void
  onOptionClick: (key: keyof ResolveOptions) => void
}

export function OptionsBar({
  engineButtons,
  optionButtons,
  utility,
  onEngineClick,
  onOptionClick,
}: Props) {
  return (
    <div className="options-bar">
      <div className="options-bar__toggles">
        {engineButtons.map(button => (
          <button
            key={button.engineName}
            type="button"
            className={`options-toggle options-toggle--engine${button.active ? ' options-toggle--active' : ''}${button.warning ? ' options-toggle--warning' : ''}${button.danger ? ' options-toggle--danger' : ''}`}
            onClick={() => onEngineClick(button.engineName)}
            disabled={button.disabled}
            aria-pressed={button.hasInput ? button.active : undefined}
          >
            <span className="options-toggle__label">{button.label}</span>
            <span className="options-toggle__meta">{button.meta}</span>
          </button>
        ))}

        {optionButtons.map(button => (
          <button
            key={button.key}
            type="button"
            className={`options-toggle${button.active ? ' options-toggle--active' : ''}${button.warning ? ' options-toggle--warning' : ''}`}
            onClick={() => onOptionClick(button.key)}
            disabled={button.disabled}
            aria-pressed={button.pressed}
          >
            <span className="options-toggle__label">{button.label}</span>
            <span className="options-toggle__meta">{button.meta}</span>
          </button>
        ))}

        {utility ? (
          <div className="options-bar__utility">
            {utility}
          </div>
        ) : null}
      </div>
    </div>
  )
}
