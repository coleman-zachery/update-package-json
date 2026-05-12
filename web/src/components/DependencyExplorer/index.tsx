import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  DEPENDENCY_EXPLORER_SAME_VALUE,
  formatDependencyExplorerVersionWindow,
  getVisibleRowVersions,
  inspectDependencyPackage,
  type DependencyExplorerReport,
  type DependencyExplorerRow,
} from '@/lib/dependency-explorer'
import type { PackageJson } from '@/lib/package-json'
import './index.css'

interface Props {
  contextPackage: PackageJson
  contextSourceLabel: string
  canApply: boolean
  applyDisabledReason?: string
  onApplyVersion: (packageName: string, versionSpec: string, freeze: boolean) => Promise<void>
}

interface VisibleRow extends DependencyExplorerRow {
  visibleVersions: string[]
  visibleVersionLabel: string
  targetVersion: string
}

function getInitialVisibleMajorCount(report: DependencyExplorerReport): number {
  return Math.min(3, report.majorSeries.length)
}

function createVisibleRows(
  report: DependencyExplorerReport | null,
  visibleMajorCount: number,
): VisibleRow[] {
  if (!report) {
    return []
  }

  const visibleMajors = new Set(report.majorSeries.slice(0, visibleMajorCount))

  return report.rows
    .map(row => {
      const visibleVersions = getVisibleRowVersions(row, visibleMajors)
      if (visibleVersions.length === 0) {
        return null
      }

      return {
        ...row,
        visibleVersions,
        visibleVersionLabel: formatDependencyExplorerVersionWindow(visibleVersions),
        targetVersion: visibleVersions[0],
      }
    })
    .filter((row): row is VisibleRow => Boolean(row))
}

function createButtonTitle(
  packageName: string,
  versionLabel: string,
  targetVersion: string,
  latestVersion: string,
  freeze: boolean,
): string {
  if (!freeze) {
    return `Add ${packageName}@${targetVersion} to package.json.`
  }

  if (versionLabel === targetVersion) {
    return `Add ${packageName}@${targetVersion} and freeze it in overrides because ${latestVersion} is newer.`
  }

  return `Add the latest version in ${versionLabel} (${targetVersion}) and freeze it in overrides because ${latestVersion} is newer.`
}

export function DependencyExplorer({
  contextPackage,
  contextSourceLabel,
  canApply,
  applyDisabledReason,
  onApplyVersion,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [report, setReport] = useState<DependencyExplorerReport | null>(null)
  const [visibleMajorCount, setVisibleMajorCount] = useState(0)
  const [applyPendingVersion, setApplyPendingVersion] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const visibleRows = useMemo(
    () => createVisibleRows(report, visibleMajorCount),
    [report, visibleMajorCount],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    inputRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function runInspect(nextQuery: string) {
    if (!nextQuery) {
      setStatus('error')
      setErrorMsg('Enter a package name to inspect.')
      setReport(null)
      setVisibleMajorCount(0)
      return
    }

    setStatus('loading')
    setErrorMsg('')

    try {
      const nextReport = await inspectDependencyPackage(nextQuery, contextPackage)
      setReport(nextReport)
      setVisibleMajorCount(getInitialVisibleMajorCount(nextReport))
      setStatus('done')
    } catch (error) {
      setStatus('error')
      setErrorMsg(error instanceof Error ? error.message : String(error))
      setReport(null)
      setVisibleMajorCount(0)
    }
  }

  async function handleInspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runInspect(query.trim())
  }

  async function handleInspectDependencyColumn(packageName: string) {
    setQuery(packageName)
    await runInspect(packageName)
  }

  async function handleApplyRow(row: VisibleRow) {
    if (!report) {
      return
    }

    const freeze = row.targetVersion !== report.latestVersion
    setApplyPendingVersion(row.key)

    try {
      await onApplyVersion(report.packageName, row.targetVersion, freeze)
      setOpen(false)
    } finally {
      setApplyPendingVersion(null)
    }
  }

  const canLoadMore = Boolean(report && visibleMajorCount < report.majorSeries.length)

  return (
    <div className="dependency-explorer">
      <button
        type="button"
        className={`dependency-explorer__trigger${open ? ' dependency-explorer__trigger--active' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
      >
        Inspect Dependency
      </button>

      {open ? (
        <div
          className="dependency-explorer__backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="dependency-explorer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Dependency explorer"
            onClick={event => event.stopPropagation()}
          >
            <div className="dependency-explorer__panel-header">
              <div>
                <h3>Dependency explorer</h3>
                <p>Uses the current {contextSourceLabel.toLowerCase()} as the compatibility baseline.</p>
              </div>
              <button
                type="button"
                className="dependency-explorer__close"
                onClick={() => setOpen(false)}
                aria-label="Close dependency explorer"
              >
                ×
              </button>
            </div>

            <form className="dependency-explorer__search" onSubmit={handleInspect}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="react-docgen"
                spellCheck={false}
                aria-label="Package name"
              />
              <button type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Inspecting…' : 'Inspect'}
              </button>
            </form>

            {status === 'idle' ? (
              <p className="dependency-explorer__empty">
                Search for a package to compare grouped version ranges, engines, and direct dependencies.
              </p>
            ) : null}

            {status === 'error' ? (
              <div className="dependency-explorer__error">{errorMsg}</div>
            ) : null}

            {status === 'done' && report ? (
              <div className="dependency-explorer__results">
                <div className="dependency-explorer__summary">
                  <div>
                    <h4>{report.packageName}</h4>
                    <p>
                      Latest tag <strong>{report.latestVersion || 'n/a'}</strong> • {report.stableVersionCount} stable version{report.stableVersionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                {report.currentVersion ? (
                  <p className="dependency-explorer__current">
                    Current entry: <strong>{report.currentVersion}</strong>
                    {report.currentSections.length > 0 ? ` in ${report.currentSections.join(', ')}` : ''}
                  </p>
                ) : (
                  <p className="dependency-explorer__current">This package is not currently present in the active package context.</p>
                )}

                <div className="dependency-explorer__table-wrap">
                  <table className="dependency-explorer__table">
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">engines.node</th>
                        <th scope="col">engines.npm</th>
                        {report.dependencyColumns.map(name => (
                          <th key={name} scope="col">
                            <button
                              type="button"
                              className="dependency-explorer__column-link"
                              onClick={() => void handleInspectDependencyColumn(name)}
                              title={`Inspect ${name}`}
                            >
                              <span>{name}</span>
                              <span className="dependency-explorer__column-link-arrow" aria-hidden="true">↗</span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => {
                        const freeze = row.targetVersion !== report.latestVersion
                        const buttonTitle = createButtonTitle(
                          report.packageName,
                          row.visibleVersionLabel,
                          row.targetVersion,
                          report.latestVersion,
                          freeze,
                        )

                        return (
                          <tr key={`${row.key}:${row.visibleVersionLabel}`}>
                            <td className="dependency-explorer__version-cell">
                              <button
                                type="button"
                                className={`dependency-explorer__version-button${freeze ? ' dependency-explorer__version-button--override' : ''}`}
                                onClick={() => void handleApplyRow(row)}
                                disabled={!canApply || applyPendingVersion !== null}
                                title={!canApply && applyDisabledReason ? applyDisabledReason : buttonTitle}
                              >
                                {applyPendingVersion === row.key ? 'Adding…' : row.visibleVersionLabel}
                              </button>
                            </td>
                            <td>{row.engineNode}</td>
                            <td>{row.engineNpm}</td>
                            {report.dependencyColumns.map(name => (
                              <td key={name}>
                                {row.dependencyValues[name] ? (
                                  row.dependencyValues[name] === DEPENDENCY_EXPLORER_SAME_VALUE ? (
                                    <span className="dependency-explorer__same-tag">same</span>
                                  ) : (
                                    <span>{row.dependencyValues[name]}</span>
                                  )
                                ) : (
                                  <span className="dependency-explorer__cell-empty">-</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {canLoadMore ? (
                  <div className="dependency-explorer__load-more">
                    <button
                      type="button"
                      className="dependency-explorer__load-more-button"
                      onClick={() => setVisibleMajorCount(current => Math.min(current + 1, report.majorSeries.length))}
                    >
                      Load older majors
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
