import type { ReactNode } from 'react'
import type { EngineName, ResolveOptions } from '@/lib/resolver'
import type { PlatformSelection } from '@/lib/resolver'
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
  platformSelectors?: {
    osOptions: Array<{ value: string; label: string }>
    archOptions: Array<{ value: string; label: string }>
    runtimeOptions: Array<{ value: string; label: string }>
    selection: PlatformSelection
    disabled: boolean
    onChange: (key: keyof PlatformSelection, value: string) => void
  }
  utility?: ReactNode
  onEngineClick: (engineName: EngineName) => void
  onOptionClick: (key: keyof ResolveOptions) => void
}

export function OptionsBar({
  engineButtons,
  optionButtons,
  platformSelectors,
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

        {platformSelectors ? (
          <div className="options-bar__platform-selectors">
            <label className="options-bar__platform-field">
              <span className="options-bar__platform-label">OS</span>
              <select
                value={platformSelectors.selection.os ?? ''}
                onChange={event => platformSelectors.onChange('os', event.target.value)}
                disabled={platformSelectors.disabled}
              >
                {platformSelectors.osOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="options-bar__platform-field">
              <span className="options-bar__platform-label">Arch</span>
              <select
                value={platformSelectors.selection.arch ?? ''}
                onChange={event => platformSelectors.onChange('arch', event.target.value)}
                disabled={platformSelectors.disabled}
              >
                {platformSelectors.archOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="options-bar__platform-field">
              <span className="options-bar__platform-label">Runtime</span>
              <select
                value={platformSelectors.selection.runtime ?? ''}
                onChange={event => platformSelectors.onChange('runtime', event.target.value)}
                disabled={platformSelectors.disabled}
              >
                {platformSelectors.runtimeOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {utility ? (
          <div className="options-bar__utility">
            {utility}
          </div>
        ) : null}
      </div>
    </div>
  )
}
