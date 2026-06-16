import { PlatformSelectField } from './PlatformSelectField'
import type { PlatformSelectorControls } from './types'

interface Props {
  platformSelectors: PlatformSelectorControls
}

export function PlatformSelectors({ platformSelectors }: Props) {
  return (
    <PlatformSelectField
      label="Select Platform"
      value={platformSelectors.value}
      options={platformSelectors.options}
      disabled={platformSelectors.disabled}
      onChange={platformSelectors.onChange}
    />
  )
}
