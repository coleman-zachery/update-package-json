import type { SpaceIndentSize } from '@/lib/indentation'
import { PaneHeader } from '@/components/Panes/PaneHeader'
import { WhitespaceTextarea, type TextareaMarker } from '@/components/WhitespaceTextarea'
import { IndentSwitch } from '@/components/Panes/EditorPane/IndentSwitch'
import './index.css'

interface Props {
  value: string
  onChange: (value: string) => void
  onPasteCapture?: () => void
  onToggleSpaceIndent: () => void
  onUpdate: () => void
  spaceIndentSize: SpaceIndentSize
  updateDisabled: boolean
  updateLabel: string
  validationMessages: string[]
  validationSeverity: 'error' | 'warning' | null
  runtimeError?: string
  markers?: TextareaMarker[]
}

export function EditorPane({
  value,
  onChange,
  onPasteCapture,
  onToggleSpaceIndent,
  onUpdate,
  spaceIndentSize,
  updateDisabled,
  updateLabel,
  validationMessages,
  validationSeverity,
  runtimeError,
  markers,
}: Props) {
  const headerTitle = validationMessages.join('\n')

  return (
    <div className="editor-pane">
      <PaneHeader
        start={(
          <div className="editor-pane__header-main">
            <div className="pane-header__title">
              <span>Input package.json</span>
              {validationSeverity && (
                <span
                  className={`editor-pane__status editor-pane__status--${validationSeverity}`}
                  title={headerTitle}
                  aria-label={headerTitle}
                >
                  {'\u26A0'}
                </span>
              )}
            </div>
            <IndentSwitch value={spaceIndentSize} onToggle={onToggleSpaceIndent} />
          </div>
        )}
        actions={(
          <button
            type="button"
            className="editor-pane__update-button"
            onClick={onUpdate}
            disabled={updateDisabled}
          >
            {updateLabel}
          </button>
        )}
      />

      {runtimeError ? (
        <div className="editor-pane__error">{runtimeError}</div>
      ) : null}

      <WhitespaceTextarea
        value={value}
        onChange={onChange}
        onPasteCapture={onPasteCapture}
        markers={markers}
        ariaLabel="Input package.json"
        spaceIndentSize={spaceIndentSize}
        placeholder={`Paste your package.json here…\n\nExample:\n{\n  "dependencies": {\n    "react": "^17.0.0"\n  }\n}`}
      />
    </div>
  )
}
