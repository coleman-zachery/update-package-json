import type { ReactNode } from 'react'

interface Props {
  active?: boolean
  warning?: boolean
  danger?: boolean
  className?: string
  disabled?: boolean
  ariaPressed?: boolean
  onClick: () => void
  label: ReactNode
  meta: ReactNode
}

export function OptionToggle({
  active = false,
  warning = false,
  danger = false,
  className = '',
  disabled = false,
  ariaPressed,
  onClick,
  label,
  meta,
}: Props) {
  return (
    <button
      type="button"
      className={`options-toggle${className}${active ? ' options-toggle--active' : ''}${warning ? ' options-toggle--warning' : ''}${danger ? ' options-toggle--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
    >
      <span className="options-toggle__label">{label}</span>
      <span className="options-toggle__meta">{meta}</span>
    </button>
  )
}
