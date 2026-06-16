import { useEffect, useRef, useState, type ReactElement } from 'react'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { OptionToggle } from './OptionToggle'
import type { PlatformOption } from '@/lib/resolver/platform-targets'
import './platform.css'

interface Props {
  label: string
  value: string
  options: PlatformOption[]
  disabled: boolean
  onChange: (value: string) => void
}

function renderPlatformValue(option?: PlatformOption) {
  if (!option) {
    return <span className="options-bar__platform-none">None</span>
  }

  return (
    <span className="options-bar__platform-value options-bar__platform-value--menu">
      <span className="options-bar__platform-text options-bar__platform-text--menu">
        {option.label}
      </span>
      {option.hint ? (
        <span className="options-bar__platform-hint options-bar__platform-hint--menu">
          {option.hint}
          {option.hintDetail ? (
            <span className="options-bar__platform-hint-detail">{option.hintDetail}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}

export function PlatformSelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuPaperRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = options.find(option => option.value === value)
  const showClearButton = Boolean(value) && !disabled
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (buttonRef.current?.contains(target) || menuPaperRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
    }
  }, [open])

  function handleToggle() {
    if (disabled) {
      return
    }

    setOpen(current => !current)
  }

  function handleSelect(nextValue: string) {
    setOpen(false)
    onChange(nextValue)
  }

  function handleClear() {
    setOpen(false)
    onChange('')
  }

  function renderMenuItems() {
    const items: ReactElement[] = []
    let currentGroup = ''

    for (const option of options) {
      if (option.group && option.group !== currentGroup) {
        currentGroup = option.group
        items.push(
          <ListSubheader key={`group:${currentGroup}`} className="options-bar__platform-group">
            <span>{currentGroup}</span>
            {option.groupHint ? (
              <span className="options-bar__platform-group-hint">{option.groupHint}</span>
            ) : null}
          </ListSubheader>,
        )
      }

      items.push(
        <MenuItem
          key={option.value}
          value={option.value}
          className="options-bar__platform-option"
          selected={option.value === value}
          onClick={() => {
            if (option.value === value) {
              handleClear()
              return
            }

            handleSelect(option.value)
          }}
        >
          {renderPlatformValue(option)}
        </MenuItem>,
      )
    }

    return items
  }

  return (
    <div className={`options-bar__platform-field${selectedOption ? ' options-bar__platform-field--active' : ''}${open ? ' options-bar__platform-field--open' : ''}`}>
      <div className="options-bar__platform-input">
        <OptionToggle
          buttonRef={buttonRef}
          className=" options-toggle--platform"
          active={Boolean(selectedOption)}
          disabled={disabled}
          ariaPressed={Boolean(selectedOption)}
          ariaExpanded={open}
          ariaHasPopup="menu"
          onClick={handleToggle}
          label={label}
          meta={selectedOption?.selectedLabel ?? 'N/A'}
        />

        <div className="options-bar__platform-actions">
          {showClearButton ? (
            <button
              type="button"
              className="options-bar__platform-clear"
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                handleClear()
              }}
              aria-label={`Clear ${label.toLowerCase()} selection`}
            >
              ×
            </button>
          ) : (
            <span className="options-bar__platform-clear-spacer" aria-hidden="true" />
          )}

          <span className="options-bar__platform-caret" aria-hidden="true">
            ▾
          </span>
        </div>

        <Menu
          anchorEl={buttonRef.current}
          open={open}
          onClose={() => setOpen(false)}
          hideBackdrop
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          slotProps={{
            root: {
              sx: {
                pointerEvents: 'none',
              },
            },
            paper: {
              ref: menuPaperRef,
              className: 'options-bar__platform-menu-paper',
              sx: {
                maxHeight: '24rem',
                pointerEvents: 'auto',
              },
            },
            list: {
              className: 'options-bar__platform-menu-list',
            },
          }}
        >
          {renderMenuItems()}
        </Menu>
      </div>
    </div>
  )
}
