import semver from 'semver'
import { PaneState } from '@/components/PaneState'
import { PaneHeader } from '@/components/Panes/PaneHeader'
import { WhitespaceTextarea } from '@/components/WhitespaceTextarea'
import type { SpaceIndentSize } from '@/lib/indentation'
import { getStringOverrides } from '@/lib/package-json'
import type { ResolveResult } from '@/lib/resolver'
import './index.css'

function normalizeComparableVersion(value: string): string | null {
  const normalized = value.replace(/^[\^~]/, '').trim()
  return semver.valid(normalized)
}

interface Props {
  result: ResolveResult | null
  outputJson: string
  onForceOverrides: () => void
  onToggleMajorBuilds: () => void
  onToggleTransitives: () => void
  onUseAsInput: (value: string) => void
  onInspectDependency: (packageName: string) => void
  overrideNames: string[]
  overridesActive: boolean
  majorBuildsActive: boolean
  overriddenDependencyNames: string[]
  platformDependencyNames: string[]
  transitiveDependencyNames: string[]
  highlightTransitiveDependencyNames: string[]
  transitivesActive: boolean
  unresolvedDependencyNames: string[]
  spaceIndentSize: SpaceIndentSize
  status: 'idle' | 'loading' | 'done' | 'error'
}

export function OutputPane({
  result,
  outputJson,
  onForceOverrides,
  onToggleMajorBuilds,
  onToggleTransitives,
  onUseAsInput,
  onInspectDependency,
  overrideNames,
  overridesActive,
  majorBuildsActive,
  overriddenDependencyNames,
  platformDependencyNames,
  transitiveDependencyNames,
  highlightTransitiveDependencyNames,
  transitivesActive,
  unresolvedDependencyNames,
  spaceIndentSize,
  status,
}: Props) {
  const downgradedDependencyNames = (() => {
    if (!result) {
      return []
    }

    const overriddenNames = new Set(overriddenDependencyNames)

    return result.changes
      .filter(change => change.section !== 'engines')
      .filter(change => {
        const from = normalizeComparableVersion(change.from)
        const to = normalizeComparableVersion(change.to)
        return Boolean(from && to && semver.lt(to, from))
      })
      .map(change => change.name)
      .filter(name => !overriddenNames.has(name))
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
        staleDependencyNames={downgradedDependencyNames}
        onInspectDependency={onInspectDependency}
        highlightMajorBuildVersions={majorBuildsActive}
        overriddenDependencyNames={overriddenDependencyNames}
        platformDependencyNames={platformDependencyNames}
        transitiveDependencyNames={highlightTransitiveDependencyNames}
        unresolvedDependencyNames={unresolvedDependencyNames}
      />
    )
  }

  const outputActionsDisabled = !result || status !== 'done'
  const forceOverridesDisabled = !result || status !== 'done' || overrideNames.length === 0
  const majorBuildNames = (() => {
    if (!result) {
      return []
    }

    const overriddenDependencyNames = new Set(Object.keys(getStringOverrides(result.updatedPackage)))
    return result.latestDependencyNames.filter(name => !overriddenDependencyNames.has(name))
  })()
  const majorBuildsDisabled = !result || status !== 'done' || (!majorBuildsActive && majorBuildNames.length === 0)
  const transitivesDisabled = !result || status !== 'done' || (!transitivesActive && transitiveDependencyNames.length === 0)

  return (
    <div className="output-pane">
      <PaneHeader
        start={<span className="pane-header__label">Updated package.json</span>}
        actions={(
          <div className="output-pane__actions">
            <button
              type="button"
              className={`output-pane__button${overridesActive ? ' output-pane__button--warning' : ''}`}
              onClick={onForceOverrides}
              disabled={forceOverridesDisabled}
            >
              Overrides
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
              className={`output-pane__button${transitivesActive ? ' output-pane__button--transitives' : ''}`}
              onClick={onToggleTransitives}
              disabled={transitivesDisabled}
            >
              Transitives
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
