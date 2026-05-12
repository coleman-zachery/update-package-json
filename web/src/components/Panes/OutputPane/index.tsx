import { PaneState } from '@/components/PaneState'
import { PaneHeader } from '@/components/Panes/PaneHeader'
import { WhitespaceTextarea } from '@/components/WhitespaceTextarea'
import type { SpaceIndentSize } from '@/lib/indentation'
import { getStringOverrides } from '@/lib/package-json'
import type { ResolveResult } from '@/lib/resolver'
import './index.css'

interface Props {
  result: ResolveResult | null
  outputJson: string
  onForceOverrides: () => void
  onUseAsInput: (value: string) => void
  forcedOverrideNames: string[]
  spaceIndentSize: SpaceIndentSize
  status: 'idle' | 'loading' | 'done' | 'error'
}

export function OutputPane({
  result,
  outputJson,
  onForceOverrides,
  onUseAsInput,
  forcedOverrideNames,
  spaceIndentSize,
  status,
}: Props) {
  const pendingOverrideNames = (() => {
    if (!result) {
      return []
    }

    const overrideNames = new Set(Object.keys(getStringOverrides(result.updatedPackage)))
    return result.staleDependencyNames.filter(name => !overrideNames.has(name))
  })()

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(outputJson)
    }
  }

  function handleDownload() {
    if (!result) {
      return
    }

    const blob = new Blob([outputJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'package.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleUseAsInput() {
    if (!result) {
      return
    }

    onUseAsInput(outputJson)
  }

  function renderBody() {
    if (status === 'idle') {
      return <PaneState message="Updated package.json will appear here." />
    }

    if (status === 'loading') {
      return <PaneState loading message="Fetching metadata…" />
    }

    if (status === 'error' || !result) {
      return <PaneState message="No output." />
    }

    return (
      <WhitespaceTextarea
        value={outputJson}
        ariaLabel="Updated package.json"
        readOnly
        spaceIndentSize={spaceIndentSize}
        staleDependencyNames={result.staleDependencyNames}
      />
    )
  }

  const outputActionsDisabled = !result || status !== 'done'
  const forceOverridesActive = forcedOverrideNames.length > 0
  const forceOverridesDisabled = !result || status !== 'done' || (!forceOverridesActive && pendingOverrideNames.length === 0)
  const forceOverridesLabel = forceOverridesActive ? 'Undo Overrides' : 'Force Overrides'

  return (
    <div className="output-pane">
      <PaneHeader
        start={<span className="pane-header__label">Updated package.json</span>}
        actions={(
          <div className="output-pane__actions">
            <button
              type="button"
              className="output-pane__button output-pane__button--danger"
              onClick={onForceOverrides}
              disabled={forceOverridesDisabled}
            >
              {forceOverridesLabel}
            </button>
            <button
              type="button"
              className="output-pane__button"
              onClick={handleUseAsInput}
              disabled={outputActionsDisabled}
            >
              Use as Input
            </button>
            <button
              type="button"
              className="output-pane__button"
              onClick={handleCopy}
              disabled={outputActionsDisabled}
            >
              Copy
            </button>
            <button
              type="button"
              className="output-pane__button"
              onClick={handleDownload}
              disabled={outputActionsDisabled}
            >
              Download
            </button>
          </div>
        )}
      />
      {renderBody()}
    </div>
  )
}
