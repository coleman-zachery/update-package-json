import { useEffect, useState, type ReactElement } from 'react'
import Box from '@mui/material/Box'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import type { PlatformOption } from '@/lib/resolver/platform-targets'
import './platform.css'

interface Props {
  label: string
  value: string
  options: PlatformOption[]
  disabled: boolean
  onChange: (value: string) => void
}

const selectSx = (showClearButton: boolean) => ({
  width: '100%',
  backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
  borderRadius: '10px',
  color: 'var(--options-bar-platform-accent)',
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
    paddingRight: `${showClearButton ? 68 : 36}px !important`,
    fontSize: '0.82rem',
    lineHeight: 1.35,
  },
  '& .MuiSvgIcon-root': {
    color: 'var(--options-bar-platform-hint-selected)',
  },
  '&.Mui-disabled': {
    opacity: 0.55,
  },
}) as const

function renderPlatformValue(option?: PlatformOption, variant: 'menu' | 'selected' = 'menu') {
  if (!option) {
    return <span className="options-bar__platform-none">None</span>
  }

  const text = variant === 'selected' ? (option.selectedLabel ?? option.label) : option.label
  const hint = variant === 'menu' ? option.hint : undefined
  const hintDetail = variant === 'menu' ? option.hintDetail : undefined

  return (
    <span className={`options-bar__platform-value options-bar__platform-value--${variant}`}>
      <span className={`options-bar__platform-text options-bar__platform-text--${variant}`}>
        {text}
      </span>
      {hint ? (
        <span className={`options-bar__platform-hint options-bar__platform-hint--${variant}`}>
          {hint}
          {hintDetail ? (
            <span className="options-bar__platform-hint-detail">{hintDetail}</span>
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
  const selectedOption = options.find(option => option.value === value)
  const showClearButton = Boolean(value) && !disabled
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  function handleChange(event: SelectChangeEvent<string>) {
    setOpen(false)
    onChange(event.target.value)
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
          onClick={option.value === value ? handleClear : undefined}
        >
          {renderPlatformValue(option, 'menu')}
        </MenuItem>,
      )
    }

    return items
  }

  return (
    <Box className={`options-bar__platform-field${disabled ? ' options-bar__platform-field--disabled' : ''}`}>
      <Typography component="span" className="options-bar__platform-label">
        {label}
      </Typography>
      <div className="options-bar__platform-input">
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
            ⮾
          </button>
        ) : null}
        <Select
          size="small"
          value={value}
          onChange={handleChange}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          disabled={disabled}
          displayEmpty
          MenuProps={{
            anchorOrigin: {
              vertical: 'bottom',
              horizontal: 'left',
            },
            transformOrigin: {
              vertical: 'top',
              horizontal: 'left',
            },
            slotProps: {
              paper: {
                className: 'options-bar__platform-menu-paper',
                sx: {
                  maxHeight: '24rem',
                },
              },
              list: {
                className: 'options-bar__platform-menu-list',
              },
            },
          }}
          sx={selectSx(showClearButton)}
          renderValue={() => renderPlatformValue(selectedOption, 'selected')}
        >
          {renderMenuItems()}
        </Select>
      </div>
    </Box>
  )
}
