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
  onToggleMajorBuilds: () => void
  onUseAsInput: (value: string) => void
  onInspectDependency: (packageName: string) => void
  forcedOverrideNames: string[]
  majorBuildsActive: boolean
  spaceIndentSize: SpaceIndentSize
  status: 'idle' | 'loading' | 'done' | 'error'
}

export function OutputPane({
  result,
  outputJson,
  onForceOverrides,
  onToggleMajorBuilds,
  onUseAsInput,
  onInspectDependency,
  forcedOverrideNames,
  majorBuildsActive,
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
        onInspectDependency={onInspectDependency}
        highlightMajorBuildVersions={majorBuildsActive}
      />
    )
  }

  const outputActionsDisabled = !result || status !== 'done'
  const forceOverridesActive = forcedOverrideNames.length > 0
  const forceOverridesDisabled = !result || status !== 'done' || (!forceOverridesActive && pendingOverrideNames.length === 0)
  const majorBuildNames = (() => {
    if (!result) {
      return []
    }

    const overriddenDependencyNames = new Set(Object.keys(getStringOverrides(result.updatedPackage)))
    return result.latestDependencyNames.filter(name => !overriddenDependencyNames.has(name))
  })()
  const majorBuildsDisabled = !result || status !== 'done' || (!majorBuildsActive && majorBuildNames.length === 0)

  return (
    <div className="output-pane">
      <PaneHeader
        start={<span className="pane-header__label">Updated package.json</span>}
        actions={(
          <div className="output-pane__actions">
            <button
              type="button"
              className={`output-pane__button${forceOverridesActive ? ' output-pane__button--warning' : ''}`}
              onClick={onForceOverrides}
              disabled={forceOverridesDisabled}
            >
              Force Overrides
            </button>
            <button
              type="button"
              className={`output-pane__button${majorBuildsActive ? ' output-pane__button--active' : ''}`}
              onClick={onToggleMajorBuilds}
              disabled={majorBuildsDisabled}
            >
              Major Builds
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
          </div>
        )}
      />
      {renderBody()}
    </div>
  )
}
