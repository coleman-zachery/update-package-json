import { useEffect, useRef, useState } from 'react'
import { PaneState } from '@/components/PaneState'
import { PaneHeader } from '@/components/Panes/PaneHeader'
import { createChangeSummary } from '@/lib/change-summary'
import type { PackageJson } from '@/lib/package-json'
import type { ResolveProgress, ResolveResult } from '@/lib/resolver'
import './index.css'

interface Props {
  inputPackage?: PackageJson
  displayPackage?: PackageJson | null
  result: ResolveResult | null
  status: 'idle' | 'loading' | 'done' | 'error'
  progress?: ResolveProgress | null
  onStopResolve?: () => void
  onApplyFixes?: () => void
  applyFixesDisabled?: boolean
  applyFixesLabel?: string
}

function getAuditSectionClassName(state: ResolveResult['auditStatus']['state']): string {
  if (state === 'pass') {
    return 'summary-section summary-section--success'
  }

  if (state === 'failure') {
    return 'summary-section summary-section--danger'
  }

  return 'summary-section summary-section--warn'
}

export function ChangesPane({
  inputPackage = {},
  displayPackage = null,
  result,
  status,
  progress = null,
  onStopResolve,
  onApplyFixes,
  applyFixesDisabled = false,
  applyFixesLabel = 'Apply Fixes',
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [hasVerticalScrollbar, setHasVerticalScrollbar] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) {
      return
    }

    const updateOverflow = () => {
      const hasOverflow = viewport.scrollHeight > viewport.clientHeight + 1
      const scrollbarWidth = viewport.offsetWidth - viewport.clientWidth
      setHasVerticalScrollbar(hasOverflow && scrollbarWidth > 0)
    }

    updateOverflow()

    const observer = new ResizeObserver(() => {
      updateOverflow()
    })

    observer.observe(viewport)
    observer.observe(content)
    window.addEventListener('resize', updateOverflow)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateOverflow)
    }
  }, [result, status])

  const showApplyFixes = Boolean(
    result
    && status === 'done'
    && result.fixRecommendations.length > 0,
  )
  const applyFixesButtonClassName = result?.auditStatus.state === 'failure'
    ? 'changes-pane__button changes-pane__button--danger'
    : 'changes-pane__button changes-pane__button--warn'

  function renderContent() {
    if (status === 'idle') {
      return <PaneState message="Changes will appear here." />
    }

    if (status === 'loading') {
      return <PaneState loading progress={progress} message="Resolving…" actionLabel="Stop" onAction={onStopResolve} />
    }

    if (status === 'error' || !result) {
      return <PaneState message="No results." />
    }

    const {
      hasAnything,
      engineChanges,
      versionChanges,
      unresolvedPeerDependencies,
    } = createChangeSummary(result, { inputPackage, displayPackage })

    return (
      <div ref={contentRef} className="changes-pane__content">
        <section className={getAuditSectionClassName(result.auditStatus.state)}>
          <h3>npm audit</h3>
          <p className="audit-summary__meta">
            OSV-backed browser advisory check with deprecated dependency detection. {result.auditStatus.summary}
          </p>
          {result.auditStatus.details.length > 0 ? (
            <ul>
              {result.auditStatus.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {!hasAnything ? (
          <section className="summary-section summary-section--success">
            <h3>No Changes</h3>
            <p className="audit-summary__meta">All dependencies are already up to date.</p>
          </section>
        ) : null}

        {result.fixRecommendations.length > 0 ? (
          <section className="summary-section summary-section--warn">
            <h3>Recommended fixes</h3>
            <ul>
              {result.fixRecommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {result.engineWarnings.length > 0 ? (
          <section className="summary-section summary-section--warn">
            <h3>Engine warnings</h3>
            <ul>
              {result.engineWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {result.engineOverrides.length > 0 ? (
          <section className="summary-section summary-section--warn">
            <h3>Engine overrides</h3>
            <ul>
              {result.engineOverrides.map((override, index) => (
                <li key={index}>{override}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {result.conflicts.length > 0 ? (
          <section className="summary-section summary-section--warn">
            <h3>Conflicts ({result.conflicts.length})</h3>
            <ul>
              {result.conflicts.map((conflict, index) => (
                <li key={index}>{conflict}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {engineChanges.length > 0 ? (
          <section className="summary-section">
            <h3>Engine updates</h3>
            <ul>
              {engineChanges.map(change => (
                <li key={change.name}>
                  <p className="summary-line">
                    <span className="summary-line__name">{change.name}</span>{' '}
                    <span className="summary-line__version-old">{change.from}</span>{' '}
                    <span className="summary-line__arrow">&rarr;</span>{' '}
                    <span className="summary-line__version-new">{change.to}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {versionChanges.length > 0 ? (
          <section className="summary-section">
            <h3>Version changes ({versionChanges.length})</h3>
            <ul>
              {versionChanges.map(change => (
                <li key={change.name}>
                  <p className="summary-line summary-line--version-change">
                    {change.from ? (
                      <>
                        <span className={change.isPlatform ? 'summary-line__name summary-line__name--platform' : 'summary-line__name'}>{change.name}</span>{' '}
                        <span className="summary-line__version-input">{change.from}</span>{' '}
                        <span className="summary-line__arrow">&rarr;</span>{' '}
                      </>
                    ) : (
                      <>
                        <span className="summary-line__arrow">&rarr;</span>{' '}
                        <span className={change.isPlatform ? 'summary-line__name summary-line__name--platform' : 'summary-line__name'}>{change.name}</span>{' '}
                      </>
                    )}
                    <span className={
                      change.outputTone === 'upgrade'
                        ? 'summary-line__version-output summary-line__version-output--upgrade'
                        : change.outputTone === 'override'
                          ? 'summary-line__version-output summary-line__version-output--override'
                          : 'summary-line__version-output summary-line__version-output--downgrade'
                    }>
                      {change.displayTo}
                    </span>
                    {change.reason ? (
                      <>
                        {' '}
                        <span className="summary-line__reason">{change.reason}</span>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {unresolvedPeerDependencies.length > 0 ? (
          <section className="summary-section summary-section--warn">
            <h3>Unresolved peer dependencies ({unresolvedPeerDependencies.length})</h3>
            <ul>
              {unresolvedPeerDependencies.map(peerDependency => (
                <li key={peerDependency.name}>
                  <p className="summary-line">
                    <span className="summary-line__name">{peerDependency.name}</span>{' '}
                    <span className="summary-line__version-old">{peerDependency.version}</span>{' '}
                    <span className="summary-line__peer-source">
                      via {peerDependency.source} - no version compatible with engine constraints
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className="changes-pane">
      <PaneHeader
        start={(
          <div className="changes-pane__header-main">
            <span className="pane-header__label">Changes</span>
            {showApplyFixes && onApplyFixes ? (
              <button
                type="button"
                className={applyFixesButtonClassName}
                onClick={onApplyFixes}
                disabled={applyFixesDisabled}
              >
                {applyFixesLabel}
              </button>
            ) : null}
          </div>
        )}
      />
      <div
        ref={viewportRef}
        className={`changes-pane__viewport${hasVerticalScrollbar ? ' changes-pane__viewport--scrollable' : ''}`}
      >
        {renderContent()}
      </div>
    </div>
  )
}
