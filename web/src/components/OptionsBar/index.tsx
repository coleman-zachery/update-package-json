import type { ReactNode } from 'react'
import type { EngineName, ResolveOptions } from '@/lib/resolver'
import { OptionToggle } from './OptionToggle'
import { PlatformSelectors } from './PlatformSelectors'
import type {
  EngineControlButton,
  OptionControlButton,
  PlatformSelectorControls,
} from './types'
import './index.css'

interface Props {
  engineButtons: EngineControlButton[]
  optionButtons: OptionControlButton[]
  platformSelectors?: PlatformSelectorControls
  utility?: ReactNode
  onEngineClick: (engineName: EngineName) => void
  onOptionClick: (key: keyof ResolveOptions) => void
}

export type {
  EngineControlButton,
  OptionControlButton,
  PlatformSelectorControls,
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
          <OptionToggle
            key={button.engineName}
            className=" options-toggle--engine"
            active={button.active}
            warning={button.warning}
            danger={button.danger}
            disabled={button.disabled}
            ariaPressed={button.hasInput ? button.active : undefined}
            onClick={() => onEngineClick(button.engineName)}
            label={button.label}
            meta={button.meta}
          />
        ))}

        {optionButtons.map(button => (
          <OptionToggle
            key={button.key}
            active={button.active}
            warning={button.warning}
            disabled={button.disabled}
            ariaPressed={button.pressed}
            onClick={() => onOptionClick(button.key)}
            label={button.label}
            meta={button.meta}
          />
        ))}

        {platformSelectors ? <PlatformSelectors platformSelectors={platformSelectors} /> : null}
        {utility ? <div className="options-bar__utility">{utility}</div> : null}
      </div>
    </div>
  )
}
