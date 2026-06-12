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
  forcedOverrideNames: string[]
  majorBuildsActive: boolean
  transitiveDependencyNames: string[]
  transitivesActive: boolean
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
  forcedOverrideNames,
  majorBuildsActive,
  transitiveDependencyNames,
  transitivesActive,
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
  const overriddenDependencyNames = (() => {
    if (!result) {
      return []
    }

    return [
      ...new Set([
        ...Object.keys(getStringOverrides(result.updatedPackage)),
        ...forcedOverrideNames,
      ]),
    ]
  })()
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
  const platformDependencyNames = result
    ? result.changeSources
      .filter(source => source.kind === 'platform')
      .map(source => source.name)
    : []

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
        transitiveDependencyNames={transitiveDependencyNames}
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
  const transitivesDisabled = !result || status !== 'done' || (!transitivesActive && transitiveDependencyNames.length === 0)

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
