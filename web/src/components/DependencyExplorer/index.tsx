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
  type DependencyExplorerColumn,
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
  includeOptionalPeerDeps: boolean
  onApplyVersion: (
    packageName: string,
    versionSpec: string,
    freeze: boolean,
    remove?: boolean,
  ) => Promise<PackageJson>
  openRequest?: DependencyExplorerOpenRequest | null
}

interface VisibleRow extends DependencyExplorerRow {
  visibleVersions: string[]
  visibleVersionLabel: string
  targetVersion: string
}

interface VisiblePlatformDependency {
  name: string
  versions: string[]
  visibleVersions: string[]
  visibleVersionLabel: string
}

export interface DependencyExplorerOpenRequest {
  id: number
  packageName: string
  contextPackage: PackageJson
  contextSourceLabel: string
  canApply: boolean
  applyDisabledReason?: string
}

interface ExplorerSessionContext {
  packageJson: PackageJson
  sourceLabel: string
  canApply: boolean
  applyDisabledReason?: string
}

interface InspectOptions {
  preserveFilters?: boolean
  silent?: boolean
}

function getInitialSelectedMajors(report: DependencyExplorerReport): number[] {
  if (report.majorSeries.length <= 1) {
    return report.majorSeries
  }

  return report.majorSeries.slice(0, 2)
}

function createVisibleRows(
  report: DependencyExplorerReport | null,
  visibleMajors: Set<number>,
): VisibleRow[] {
  if (!report) {
    return []
  }

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

function createVisiblePlatformDependencies(
  report: DependencyExplorerReport | null,
  visibleMajors: Set<number>,
): VisiblePlatformDependency[] {
  if (!report) {
    return []
  }

  return report.platformDependencies
    .map(dependency => {
      const visibleVersions = dependency.versions.filter(version => {
        const parsed = Number.parseInt(version.split('.', 1)[0] ?? '', 10)
        return Number.isFinite(parsed) && visibleMajors.has(parsed)
      })

      if (visibleVersions.length === 0) {
        return null
      }

      return {
        ...dependency,
        visibleVersions,
        visibleVersionLabel: formatDependencyExplorerVersionWindow(visibleVersions),
      }
    })
    .filter((dependency): dependency is VisiblePlatformDependency => Boolean(dependency))
}

function createVisibleColumns(
  report: DependencyExplorerReport | null,
  visibleRows: VisibleRow[],
  showRequiredPeerColumns: boolean,
  showOptionalColumns: boolean,
): DependencyExplorerColumn[] {
  if (!report) {
    return []
  }

  const candidateColumns = [
    ...(showRequiredPeerColumns ? report.requiredPeerColumns : []),
    ...(showRequiredPeerColumns ? report.dependencyColumns : []),
    ...(showOptionalColumns ? report.optionalDependencyColumns : []),
  ]

  return candidateColumns.filter(column =>
    visibleRows.some(row => Boolean(row.dependencyValues[column.key])),
  )
}

function createButtonTitle(
  packageName: string,
  versionLabel: string,
  targetVersion: string,
  latestVersion: string,
  freeze: boolean,
  remove: boolean,
): string {
  if (remove) {
    return `Remove ${packageName} from package.json.`
  }

  if (!freeze) {
    return `Add ${packageName}@${targetVersion} to package.json.`
  }

  if (versionLabel === targetVersion) {
    return `Add ${packageName}@${targetVersion} and freeze it in overrides because ${latestVersion} is newer.`
  }

  return `Add the latest version in ${versionLabel} (${targetVersion}) and freeze it in overrides because ${latestVersion} is newer.`
}

function getColumnLinkClassName(column: DependencyExplorerColumn): string {
  if (column.kind === 'peer-required') {
    return 'dependency-explorer__column-link dependency-explorer__column-link--peer'
  }

  if (column.kind === 'optional') {
    return 'dependency-explorer__column-link dependency-explorer__column-link--optional'
  }

  return 'dependency-explorer__column-link'
}

export function DependencyExplorer({
  contextPackage,
  contextSourceLabel,
  canApply,
  applyDisabledReason,
  includeOptionalPeerDeps,
  onApplyVersion,
  openRequest,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [report, setReport] = useState<DependencyExplorerReport | null>(null)
  const [selectedMajors, setSelectedMajors] = useState<number[]>([])
  const [showRequiredPeerColumns, setShowRequiredPeerColumns] = useState(true)
  const [showOptionalColumns, setShowOptionalColumns] = useState(includeOptionalPeerDeps)
  const [showPlatformDependencies, setShowPlatformDependencies] = useState(true)
  const [applyPendingVersion, setApplyPendingVersion] = useState<string | null>(null)
  const [sessionContext, setSessionContext] = useState<ExplorerSessionContext>({
    packageJson: contextPackage,
    sourceLabel: contextSourceLabel,
    canApply,
    applyDisabledReason,
  })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shouldCloseOnBackdropClickRef = useRef(false)

  useEffect(() => {
    if (open) {
      return
    }

    setSessionContext({
      packageJson: contextPackage,
      sourceLabel: contextSourceLabel,
      canApply,
      applyDisabledReason,
    })
  }, [applyDisabledReason, canApply, contextPackage, contextSourceLabel, open])

  const visibleMajorSet = useMemo(() => new Set(selectedMajors), [selectedMajors])

  const visibleRows = useMemo(
    () => createVisibleRows(report, visibleMajorSet),
    [report, visibleMajorSet],
  )

  const visibleColumns = useMemo(
    () => createVisibleColumns(report, visibleRows, showRequiredPeerColumns, showOptionalColumns),
    [report, showOptionalColumns, showRequiredPeerColumns, visibleRows],
  )

  const showEngineNodeColumn = useMemo(
    () => showRequiredPeerColumns && visibleRows.some(row => row.engineNode !== '-'),
    [showRequiredPeerColumns, visibleRows],
  )

  const showEngineNpmColumn = useMemo(
    () => showRequiredPeerColumns && visibleRows.some(row => row.engineNpm !== '-'),
    [showRequiredPeerColumns, visibleRows],
  )

  const visiblePlatformDependencies = useMemo(
    () => createVisiblePlatformDependencies(report, visibleMajorSet),
    [report, visibleMajorSet],
  )
  const hasDetailColumns = showEngineNodeColumn || showEngineNpmColumn || visibleColumns.length > 0
  const latestMajor = report?.majorSeries[0] ?? null

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

  useEffect(() => {
    if (!openRequest) {
      return
    }

    const nextContext = {
      packageJson: openRequest.contextPackage,
      sourceLabel: openRequest.contextSourceLabel,
      canApply: openRequest.canApply,
      applyDisabledReason: openRequest.applyDisabledReason,
    }

    setSessionContext(nextContext)
    setOpen(true)
    setQuery(openRequest.packageName)
    void runInspect(openRequest.packageName, nextContext.packageJson)
  }, [openRequest])

  async function runInspect(
    nextQuery: string,
    context: PackageJson = sessionContext.packageJson,
    options: InspectOptions = {},
  ) {
    if (!nextQuery) {
      setStatus('error')
      setErrorMsg('Enter a package name to inspect.')
      setReport(null)
      setSelectedMajors([])
      return
    }

    if (!options.silent) {
      setStatus('loading')
    }
    setErrorMsg('')

    try {
      const nextReport = await inspectDependencyPackage(nextQuery, context)
      setReport(nextReport)

      if (options.preserveFilters) {
        setSelectedMajors(current => {
          const nextSelectedMajors = nextReport.majorSeries.filter(series => current.includes(series))
          return nextSelectedMajors.length > 0
            ? nextSelectedMajors
            : getInitialSelectedMajors(nextReport)
        })
      } else {
        setSelectedMajors(getInitialSelectedMajors(nextReport))
        setShowRequiredPeerColumns(true)
        setShowOptionalColumns(includeOptionalPeerDeps)
        setShowPlatformDependencies(true)
      }

      setStatus('done')
    } catch (error) {
      setStatus('error')
      setErrorMsg(error instanceof Error ? error.message : String(error))

      if (!options.silent) {
        setReport(null)
        setSelectedMajors([])
      }
    }
  }

  async function handleInspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runInspect(query.trim())
  }

  async function handleLaunchInspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSessionContext({
      packageJson: contextPackage,
      sourceLabel: contextSourceLabel,
      canApply,
      applyDisabledReason,
    })
    setOpen(true)
    await runInspect(query.trim(), contextPackage)
  }

  async function handleInspectDependencyColumn(packageName: string) {
    setQuery(packageName)
    await runInspect(packageName)
  }

  function handleToggleMajor(major: number) {
    if (!report) {
      return
    }

    setSelectedMajors(current => {
      const isSelected = current.includes(major)
      if (isSelected && current.length === 1) {
        return current
      }

      const next = isSelected
        ? current.filter(value => value !== major)
        : [...current, major]

      return report.majorSeries.filter(series => next.includes(series))
    })
  }

  function handleToggleDependencyColumnKind(kind: 'required' | 'optional') {
    if (!report) {
      return
    }

    if (kind === 'required') {
      if (report.requiredPeerColumns.length === 0 && report.dependencyColumns.length === 0) {
        return
      }

      if (!showRequiredPeerColumns) {
        setShowRequiredPeerColumns(true)
        return
      }

      if (showOptionalColumns) {
        setShowRequiredPeerColumns(false)
        return
      }

      setShowRequiredPeerColumns(false)
      setShowOptionalColumns(true)
      return
    }

    if (report.optionalDependencyColumns.length === 0) {
      return
    }

    if (!showOptionalColumns) {
      setShowOptionalColumns(true)
      return
    }

    if (showRequiredPeerColumns) {
      setShowOptionalColumns(false)
      return
    }

    setShowOptionalColumns(false)
    setShowRequiredPeerColumns(true)
  }

  async function handleApplyRow(row: VisibleRow) {
    if (!report) {
      return
    }

    const remove = Boolean(
      report.currentResolvedVersion
      && row.visibleVersions.includes(report.currentResolvedVersion),
    )
    const freeze = row.targetVersion !== report.latestVersion
    setApplyPendingVersion(row.key)

    try {
      const nextPackage = await onApplyVersion(report.packageName, row.targetVersion, freeze, remove)
      setSessionContext(current => ({
        ...current,
        packageJson: nextPackage,
      }))
      await runInspect(report.packageName, nextPackage, {
        preserveFilters: true,
        silent: true,
      })
    } finally {
      setApplyPendingVersion(null)
    }
  }

  return (
    <div className="dependency-explorer">
      <form
        className={`dependency-explorer__search dependency-explorer__search--header${open ? ' dependency-explorer__search--active' : ''}`}
        onSubmit={handleLaunchInspect}
      >
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="react-docgen"
          spellCheck={false}
          aria-label="Package name"
        />
        <button type="submit" aria-expanded={open}>
          Inspect Dependency
        </button>
      </form>

      {open ? (
        <div
          className="dependency-explorer__backdrop"
          onMouseDown={event => {
            shouldCloseOnBackdropClickRef.current = event.target === event.currentTarget
          }}
          onMouseUp={event => {
            const shouldClose = shouldCloseOnBackdropClickRef.current
            shouldCloseOnBackdropClickRef.current = false

            if (shouldClose && event.target === event.currentTarget) {
              setOpen(false)
            }
          }}
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
                <p>Uses the current {sessionContext.sourceLabel.toLowerCase()} as the compatibility baseline.</p>
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

            {status === 'idle' && !report ? (
              <p className="dependency-explorer__empty">
                Search for a package to compare grouped version ranges, engines, and direct dependencies.
              </p>
            ) : null}

            {status === 'error' ? (
              <div className="dependency-explorer__error">{errorMsg}</div>
            ) : null}

            {report ? (
              <div className="dependency-explorer__results">
                <div className="dependency-explorer__summary">
                  <h4>{report.packageName}</h4>
                  <p>
                    Newest stable <strong>{report.latestVersion || 'n/a'}</strong> • {report.stableVersionCount} stable version{report.stableVersionCount === 1 ? '' : 's'}
                  </p>
                  {report.currentVersion ? (
                    <p>
                      Current entry: <strong>{report.currentVersion}</strong>
                      {report.currentSections.length > 0 ? ` in ${report.currentSections.join(', ')}` : ''}
                    </p>
                  ) : (
                    <p>This package is not currently present in the active package context.</p>
                  )}
                </div>

                  <div className="dependency-explorer__filters">
                    <div className="dependency-explorer__filter-row">
                      <span className="dependency-explorer__filters-label">Major builds</span>
                      <div className="dependency-explorer__segmented-toggle dependency-explorer__segmented-toggle--majors" role="group" aria-label="Major builds">
                        {report.majorSeries.map(major => (
                          <button
                            key={major}
                            type="button"
                            className={`dependency-explorer__segment dependency-explorer__segment--major${selectedMajors.includes(major) ? ' dependency-explorer__segment--active' : ''}${selectedMajors.includes(major) && major !== latestMajor ? ' dependency-explorer__segment--major-older' : ''}`}
                            onClick={() => handleToggleMajor(major)}
                            aria-pressed={selectedMajors.includes(major)}
                          >
                          {major}
                        </button>
                      ))}
                    </div>
                  </div>

                  {visiblePlatformDependencies.length > 0 ? (
                    <div className="dependency-explorer__platform-summary">
                      <div className="dependency-explorer__platform-summary-header">
                        <div className="dependency-explorer__platform-summary-title">
                          <span className="dependency-explorer__filters-label">Platform optional dependencies</span>
                          <button
                            type="button"
                            className={`dependency-explorer__filter-badge${showPlatformDependencies ? ' dependency-explorer__filter-badge--active' : ''}`}
                            onClick={() => setShowPlatformDependencies(current => !current)}
                            aria-pressed={showPlatformDependencies}
                          >
                            {showPlatformDependencies ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      {showPlatformDependencies ? (
                        <div className="dependency-explorer__platform-scroll">
                          <div className="dependency-explorer__platform-list">
                            {visiblePlatformDependencies.map(dependency => (
                              <button
                                key={dependency.name}
                                type="button"
                                className="dependency-explorer__platform-chip"
                                onClick={() => void handleInspectDependencyColumn(dependency.name)}
                                title={`Inspect ${dependency.name}`}
                              >
                                {dependency.name} ({dependency.visibleVersionLabel})
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {report.requiredPeerColumns.length > 0 || report.optionalDependencyColumns.length > 0 ? (
                    <div className="dependency-explorer__filter-row">
                      <span className="dependency-explorer__filters-label">Show dependency columns</span>
                      <div className="dependency-explorer__segmented-toggle" role="group" aria-label="Show dependency columns">
                        <button
                          type="button"
                          className={`dependency-explorer__segment dependency-explorer__segment--required${showRequiredPeerColumns ? ' dependency-explorer__segment--active' : ''}`}
                          onClick={() => handleToggleDependencyColumnKind('required')}
                          aria-pressed={showRequiredPeerColumns}
                          disabled={report.requiredPeerColumns.length === 0 && report.dependencyColumns.length === 0}
                        >
                          Required
                        </button>
                        <button
                          type="button"
                          className={`dependency-explorer__segment dependency-explorer__segment--optional${showOptionalColumns ? ' dependency-explorer__segment--active' : ''}`}
                          onClick={() => handleToggleDependencyColumnKind('optional')}
                          aria-pressed={showOptionalColumns}
                          disabled={report.optionalDependencyColumns.length === 0}
                        >
                          Optional
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="dependency-explorer__table-wrap">
                  <table className={`dependency-explorer__table${!hasDetailColumns ? ' dependency-explorer__table--compact' : ''}`}>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        {showEngineNodeColumn ? (
                          <th scope="col">engines.node</th>
                        ) : null}
                        {showEngineNpmColumn ? (
                          <th scope="col">engines.npm</th>
                        ) : null}
                        {visibleColumns.map(column => (
                          <th key={column.key} scope="col">
                            <button
                              type="button"
                              className={getColumnLinkClassName(column)}
                              onClick={() => void handleInspectDependencyColumn(column.name)}
                              title={`Inspect ${column.name}`}
                            >
                              <span>{column.name}</span>
                              <span className="dependency-explorer__column-link-arrow" aria-hidden="true">↗</span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => {
                        const freeze = Boolean(report.latestVersion && row.targetVersion !== report.latestVersion)
                        const hasSelectedVersion = Boolean(report.currentResolvedVersion)
                        const isMissingFromInput = !report.currentVersion
                        const isCurrentResolvedRow = Boolean(
                          report.currentResolvedVersion
                          && row.visibleVersions.includes(report.currentResolvedVersion),
                        )
                        const isInactiveRow = hasSelectedVersion && !isCurrentResolvedRow
                        const buttonDisabled =
                          !sessionContext.canApply
                          || applyPendingVersion !== null
                          || status === 'loading'
                        const buttonTitle = !sessionContext.canApply && sessionContext.applyDisabledReason
                          ? sessionContext.applyDisabledReason
                          : createButtonTitle(
                            report.packageName,
                            row.visibleVersionLabel,
                            row.targetVersion,
                            report.latestVersion,
                            freeze,
                            isCurrentResolvedRow,
                          )

                        return (
                          <tr key={row.key}>
                            <td className="dependency-explorer__version-cell">
                              <button
                                type="button"
                                className={`dependency-explorer__version-button${isCurrentResolvedRow ? ' dependency-explorer__version-button--current' : ' dependency-explorer__version-button--new'}${freeze ? ' dependency-explorer__version-button--override' : ''}${isMissingFromInput ? ' dependency-explorer__version-button--missing' : ''}${isInactiveRow ? ' dependency-explorer__version-button--inactive' : ''}`}
                                disabled={buttonDisabled}
                                title={buttonTitle}
                                onClick={() => void handleApplyRow(row)}
                              >
                                {row.visibleVersionLabel}
                              </button>
                            </td>
                            {showEngineNodeColumn ? (
                              <td>{row.engineNode}</td>
                            ) : null}
                            {showEngineNpmColumn ? (
                              <td>{row.engineNpm}</td>
                            ) : null}
                            {visibleColumns.map(column => {
                              const value = row.dependencyValues[column.key]
                              return (
                                <td key={`${row.key}:${column.key}`}>
                                  {value ? (
                                    value === DEPENDENCY_EXPLORER_SAME_VALUE ? (
                                      <span className="dependency-explorer__same-tag">same</span>
                                    ) : (
                                      value
                                    )
                                  ) : (
                                    <span className="dependency-explorer__cell-empty">-</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
