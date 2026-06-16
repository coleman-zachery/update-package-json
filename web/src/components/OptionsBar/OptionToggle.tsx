import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

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
  buttonRef?: Ref<HTMLButtonElement>
  ariaExpanded?: boolean
  ariaHasPopup?: ButtonHTMLAttributes<HTMLButtonElement>['aria-haspopup']
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
  buttonRef,
  ariaExpanded,
  ariaHasPopup,
}: Props) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`options-toggle${className}${active ? ' options-toggle--active' : ''}${warning ? ' options-toggle--warning' : ''}${danger ? ' options-toggle--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
    >
      <span className="options-toggle__label">{label}</span>
      <span className="options-toggle__meta">{meta}</span>
    </button>
  )
}
