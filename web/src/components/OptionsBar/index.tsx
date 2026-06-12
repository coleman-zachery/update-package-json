import { useEffect, useState, type ReactNode } from 'react'
import { css } from '@emotion/css'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import type { EngineName, ResolveOptions } from '@/lib/resolver'
import type { PlatformSelection } from '@/lib/resolver'
import './index.css'

const PLATFORM_THEME_COLOR = 'rgb(51, 187, 255)'
const PLATFORM_THEME_COLOR_SOFT = 'rgba(51, 187, 255, 0.72)'
const PLATFORM_SELECTED_TEXT_COLOR = 'rgb(242, 240, 247)'
const PLATFORM_SELECTED_HINT_COLOR = 'rgb(160, 143, 121)'

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
    osOptions: Array<{ value: string; label: string; hint?: string }>
    archOptions: Array<{ value: string; label: string; hint?: string }>
    runtimeOptions: Array<{ value: string; label: string; hint?: string }>
    selection: PlatformSelection
    disabled: boolean
    onChange: (key: keyof PlatformSelection, value: string) => void
  }
  utility?: ReactNode
  onEngineClick: (engineName: EngineName) => void
  onOptionClick: (key: keyof ResolveOptions) => void
}

const platformValueClassName = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  minWidth: 0,
  width: '100%',
})

const platformLabelTextClassName = css({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: PLATFORM_THEME_COLOR,
})

const platformLabelTextSelectedClassName = css({
  color: PLATFORM_SELECTED_TEXT_COLOR,
})

const platformLabelTextMenuClassName = css({
  color: PLATFORM_SELECTED_TEXT_COLOR,
})

const platformHintClassName = css({
  flexShrink: 0,
  color: PLATFORM_THEME_COLOR_SOFT,
  fontSize: '0.72rem',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
})

const platformHintSelectedClassName = css({
  color: PLATFORM_SELECTED_HINT_COLOR,
})

const platformHintMenuClassName = css({
  color: PLATFORM_SELECTED_HINT_COLOR,
})

const platformUnavailableClassName = css({
  color: 'var(--text-muted)',
  fontStyle: 'italic',
})

const platformSelectSx = {
  width: '100%',
  backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
  borderRadius: '10px',
  color: PLATFORM_THEME_COLOR,
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: '#6f647f',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: '#83779a',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--accent)',
    borderWidth: '1px',
  },
  '& .MuiSelect-select': {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    paddingBlock: '10px',
    paddingRight: '2.25rem !important',
    fontSize: '0.82rem',
    lineHeight: 1.35,
  },
  '& .MuiSvgIcon-root': {
    color: PLATFORM_SELECTED_HINT_COLOR,
  },
  '&.Mui-disabled': {
    opacity: 0.55,
  },
} as const

function renderPlatformOption(
  option?: { label: string; hint?: string },
  variant: 'menu' | 'selected' = 'menu',
) {
  if (!option) {
    return null
  }

  const labelClassName = variant === 'selected'
    ? `${platformLabelTextClassName} ${platformLabelTextSelectedClassName}`
    : `${platformLabelTextClassName} ${platformLabelTextMenuClassName}`
  const hintClassName = variant === 'selected'
    ? `${platformHintClassName} ${platformHintSelectedClassName}`
    : `${platformHintClassName} ${platformHintMenuClassName}`

  return (
    <span className={platformValueClassName}>
      <span className={labelClassName}>{option.label}</span>
      {option.hint ? (
        <span className={hintClassName}>{option.hint}</span>
      ) : null}
    </span>
  )
}

export function OptionsBar({
  engineButtons,
  optionButtons,
  platformSelectors,
  utility,
  onEngineClick,
  onOptionClick,
}: Props) {
  const [openPlatformMenu, setOpenPlatformMenu] = useState<keyof PlatformSelection | null>(null)

  useEffect(() => {
    if (platformSelectors?.disabled) {
      setOpenPlatformMenu(null)
    }
  }, [platformSelectors?.disabled])

  useEffect(() => {
    if (!openPlatformMenu) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        setOpenPlatformMenu(null)
        return
      }

      if (target.closest('.options-bar__platform-menu-paper')) {
        return
      }

      if (target.closest('[data-platform-trigger]')) {
        return
      }

      setOpenPlatformMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
    }
  }, [openPlatformMenu])

  function renderPlatformSelect(
    label: string,
    selectionKey: keyof PlatformSelection,
    value: string,
    options: Array<{ value: string; label: string; hint?: string }>,
  ) {
    const isRuntimeUnavailable = selectionKey === 'runtime' && options.length === 0
    const selectedOption = options.find(option => option.value === value)

    return (
      <Box className="options-bar__platform-field" data-platform-trigger={selectionKey}>
        <Typography
          component="span"
          className="options-bar__platform-label"
          sx={{
            fontSize: '0.76rem',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {label}
        </Typography>
        <Select
          size="small"
          value={isRuntimeUnavailable ? '' : value}
          onChange={(event: SelectChangeEvent<string>) => platformSelectors?.onChange(selectionKey, event.target.value)}
          open={openPlatformMenu === selectionKey}
          onOpen={() => setOpenPlatformMenu(selectionKey)}
          onClose={() => setOpenPlatformMenu(current => (current === selectionKey ? null : current))}
          disabled={platformSelectors?.disabled || isRuntimeUnavailable}
          displayEmpty={isRuntimeUnavailable}
          SelectDisplayProps={{
            onMouseDown: event => {
              if (isRuntimeUnavailable) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              setOpenPlatformMenu(current => (
                current === selectionKey ? null : selectionKey
              ))
            },
          }}
          MenuProps={{
            hideBackdrop: true,
            slotProps: {
              root: {
                sx: {
                  pointerEvents: 'none',
                },
              },
              paper: {
                className: 'options-bar__platform-menu-paper',
                sx: {
                  pointerEvents: 'auto',
                  marginTop: '0.4rem',
                  border: '1px solid #6f647f',
                  borderRadius: '10px',
                  backgroundColor: '#1f212d',
                  color: PLATFORM_THEME_COLOR,
                  boxShadow: '0 18px 42px rgba(0, 0, 0, 0.38)',
                },
              },
            },
          }}
          sx={platformSelectSx}
          renderValue={() => {
            if (isRuntimeUnavailable) {
              return <span className={platformUnavailableClassName}>N/A</span>
            }

            return renderPlatformOption(selectedOption, 'selected') ?? value
          }}
        >
          {options.map(option => (
            <MenuItem key={option.value} value={option.value}>
              {renderPlatformOption(option, 'menu')}
            </MenuItem>
          ))}
        </Select>
      </Box>
    )
  }

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
            {renderPlatformSelect(
              'OS',
              'os',
              platformSelectors.selection.os ?? '',
              platformSelectors.osOptions,
            )}
            {renderPlatformSelect(
              'Architecture',
              'arch',
              platformSelectors.selection.arch ?? '',
              platformSelectors.archOptions,
            )}
            {renderPlatformSelect(
              'Runtime',
              'runtime',
              platformSelectors.selection.runtime ?? '',
              platformSelectors.runtimeOptions,
            )}
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
