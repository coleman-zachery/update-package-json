import type { SpaceIndentSize } from '@/lib/indentation'

interface Props {
  value: SpaceIndentSize
  onToggle: () => void
}

export function IndentSwitch({ value, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`indent-switch indent-switch--${value === 4 ? 'right' : 'left'}`}
      onClick={onToggle}
      role="switch"
      aria-checked={value === 4}
      aria-label={`Use ${value}-space indentation. Click to switch to ${value === 2 ? 4 : 2} spaces.`}
      title={`Using ${value}-space indentation`}
    >
      <span className="indent-switch__thumb" aria-hidden="true" />
      <span className={`indent-switch__value${value === 2 ? ' indent-switch__value--active' : ''}`}>2</span>
      <span className={`indent-switch__value${value === 4 ? ' indent-switch__value--active' : ''}`}>4</span>
    </button>
  )
}
