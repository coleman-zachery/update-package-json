import type { ReactNode } from 'react'
import type { ResolveOptions } from '@/lib/resolver'
import { OptionToggle } from './OptionToggle'
import { PlatformSelectors } from './PlatformSelectors'
import type {
  EngineControlCard,
  OptionControlButton,
  PlatformSelectorControls,
} from './types'
import './index.css'

interface Props {
  engineCard?: EngineControlCard
  optionButtons: OptionControlButton[]
  platformSelectors?: PlatformSelectorControls
  utility?: ReactNode
  onEngineClick: () => void
  onOptionClick: (key: keyof ResolveOptions) => void
}

export type {
  EngineControlCard,
  OptionControlButton,
  PlatformSelectorControls,
}

export function OptionsBar({
  engineCard,
  optionButtons,
  platformSelectors,
  utility,
  onEngineClick,
  onOptionClick,
}: Props) {
  const preferLatestButton = optionButtons.find(button => button.key === 'avoidLatestVersions')
  const trailingOptionButtons = optionButtons.filter(button => button.key !== 'avoidLatestVersions')

  return (
    <div className="options-bar">
      <div className="options-bar__toggles">
        {engineCard ? (
          <OptionToggle
            className=" options-toggle--engine options-toggle--engine-card"
            active={engineCard.active}
            warning={engineCard.warning}
            danger={engineCard.danger}
            disabled={engineCard.disabled}
            ariaPressed={engineCard.pressed}
            onClick={onEngineClick}
            label={engineCard.label}
            meta={engineCard.meta}
          />
        ) : null}

        {preferLatestButton ? (
          <OptionToggle
            key={preferLatestButton.key}
            active={preferLatestButton.active}
            warning={preferLatestButton.warning}
            disabled={preferLatestButton.disabled}
            ariaPressed={preferLatestButton.pressed}
            onClick={() => onOptionClick(preferLatestButton.key)}
            label={preferLatestButton.label}
            meta={preferLatestButton.meta}
          />
        ) : null}

        {platformSelectors ? <PlatformSelectors platformSelectors={platformSelectors} /> : null}

        {trailingOptionButtons.map(button => (
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

        {utility ? <div className="options-bar__utility">{utility}</div> : null}
      </div>
    </div>
  )
}
