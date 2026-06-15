import { PlatformSelectField } from './PlatformSelectField'
import type { PlatformSelectorControls } from './types'

interface Props {
  platformSelectors: PlatformSelectorControls
}

export function PlatformSelectors({ platformSelectors }: Props) {
  return (
    <div className="options-bar__platform-selectors">
      <PlatformSelectField
        label="Platform"
        value={platformSelectors.value}
        options={platformSelectors.options}
        disabled={platformSelectors.disabled}
        onChange={platformSelectors.onChange}
      />
    </div>
  )
}
