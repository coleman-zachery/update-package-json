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
  type DependencyExplorerColumnKind,
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

type DependencyColumnFilterKind = DependencyExplorerColumnKind
type DependencyColumnFilterState = 'inclusive' | 'exclusive' | 'off'

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

function getVisibleColumnKinds(
  visibleRows: VisibleRow[],
): Map<string, DependencyExplorerColumnKind[]> {
  const kindsByColumn = new Map<string, Set<DependencyExplorerColumnKind>>()

  for (const row of visibleRows) {
    for (const [columnKey, cell] of Object.entries(row.dependencyCells)) {
      const currentKinds = kindsByColumn.get(columnKey) ?? new Set<DependencyExplorerColumnKind>()
      for (const kind of cell.kinds) {
        currentKinds.add(kind)
      }
      kindsByColumn.set(columnKey, currentKinds)
    }
  }

  return new Map(
    Array.from(kindsByColumn.entries()).map(([columnKey, kinds]) => [columnKey, Array.from(kinds)]),
  )
}

function createVisibleColumns(
  report: DependencyExplorerReport | null,
  visibleColumnKinds: Map<string, DependencyExplorerColumnKind[]>,
  columnFilterStates: Record<DependencyColumnFilterKind, DependencyColumnFilterState>,
): DependencyExplorerColumn[] {
  if (!report) {
    return []
  }

  const inclusiveKinds = (['peer', 'required', 'optional', 'platform'] as DependencyColumnFilterKind[])
    .filter(kind => columnFilterStates[kind] === 'inclusive')
  const exclusiveKinds = (['peer', 'required', 'optional', 'platform'] as DependencyColumnFilterKind[])
    .filter(kind => columnFilterStates[kind] === 'exclusive')

  return report.columns.filter(column => {
    const kinds = visibleColumnKinds.get(column.key) ?? []
    if (kinds.length === 0) {
      return false
    }

    if (inclusiveKinds.length > 0 && !kinds.some(kind => inclusiveKinds.includes(kind))) {
      return false
    }

    if (kinds.some(kind => exclusiveKinds.includes(kind))) {
      return false
    }

    return true
  })
}

function createAvailableColumnFilterKinds(
  visibleColumnKinds: Map<string, DependencyExplorerColumnKind[]>,
): DependencyColumnFilterKind[] {
  const activeKinds = new Set<DependencyColumnFilterKind>()
  for (const kinds of visibleColumnKinds.values()) {
    for (const kind of kinds) {
      activeKinds.add(kind)
    }
  }
  return ['peer', 'required', 'optional', 'platform'].filter((kind): kind is DependencyColumnFilterKind => activeKinds.has(kind as DependencyColumnFilterKind))
}

function createInitialColumnFilters(includeOptionalPeerDeps: boolean): Record<DependencyColumnFilterKind, DependencyColumnFilterState> {
  return {
    peer: 'inclusive',
    required: 'inclusive',
    optional: includeOptionalPeerDeps ? 'inclusive' : 'off',
    platform: 'inclusive',
  }
}

function getNextColumnFilterState(
  current: DependencyColumnFilterState,
): DependencyColumnFilterState {
  if (current === 'off') {
    return 'inclusive'
  }

  if (current === 'inclusive') {
    return 'exclusive'
  }

  return 'off'
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

function getColumnLinkToneClassName(
  visibleColumnKinds: Map<string, DependencyExplorerColumnKind[]>,
  column: DependencyExplorerColumn,
): string {
  const kinds = visibleColumnKinds.get(column.key) ?? []
  if (kinds.includes('peer')) {
    return 'dependency-explorer__column-link dependency-explorer__column-link--peer'
  }

  if (kinds.includes('platform')) {
    return 'dependency-explorer__column-link dependency-explorer__column-link--platform'
  }

  if (kinds.includes('optional')) {
    return 'dependency-explorer__column-link dependency-explorer__column-link--optional'
  }

  if (kinds.includes('required')) {
    return 'dependency-explorer__column-link dependency-explorer__column-link--required'
  }

  return 'dependency-explorer__column-link'
}

function getKindBadgeLabel(kind: DependencyColumnFilterKind): string {
  if (kind === 'peer') {
    return 'P'
  }

  if (kind === 'required') {
    return 'R'
  }

  if (kind === 'optional') {
    return 'O'
  }

  return 'P'
}

function getKindBadgeClassName(kind: DependencyColumnFilterKind): string {
  return `dependency-explorer__kind-badge dependency-explorer__kind-badge--${kind}`
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
  const [columnFilterStates, setColumnFilterStates] = useState<Record<DependencyColumnFilterKind, DependencyColumnFilterState>>(
    () => createInitialColumnFilters(includeOptionalPeerDeps),
  )
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

  const visibleColumnKinds = useMemo(
    () => getVisibleColumnKinds(visibleRows),
    [visibleRows],
  )

  const visibleColumns = useMemo(
    () => createVisibleColumns(report, visibleColumnKinds, columnFilterStates),
    [columnFilterStates, report, visibleColumnKinds],
  )

  const availableColumnFilterKinds = useMemo(
    () => createAvailableColumnFilterKinds(visibleColumnKinds),
    [visibleColumnKinds],
  )

  const showEngineNodeColumn = useMemo(
    () => columnFilterStates.required !== 'off' && visibleRows.some(row => row.engineNode !== '-'),
    [columnFilterStates.required, visibleRows],
  )

  const showEngineNpmColumn = useMemo(
    () => columnFilterStates.required !== 'off' && visibleRows.some(row => row.engineNpm !== '-'),
    [columnFilterStates.required, visibleRows],
  )

  const hasDetailColumns = showEngineNodeColumn || showEngineNpmColumn || visibleColumns.length > 0
  const latestMajor = report?.majorSeries[0] ?? null

  useEffect(() => {
    if (availableColumnFilterKinds.length === 0) {
      return
    }

    setColumnFilterStates(current => {
      const next = { ...current }
      let changed = false

      for (const kind of ['peer', 'required', 'optional', 'platform'] as DependencyColumnFilterKind[]) {
        const shouldBeAvailable = availableColumnFilterKinds.includes(kind)
        if (!shouldBeAvailable && next[kind] !== 'off') {
          next[kind] = 'off'
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [availableColumnFilterKinds, includeOptionalPeerDeps])

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
        setColumnFilterStates(createInitialColumnFilters(includeOptionalPeerDeps))
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

  function handleToggleDependencyColumnKind(kind: DependencyColumnFilterKind) {
    if (!report || !availableColumnFilterKinds.includes(kind)) {
      return
    }

    setColumnFilterStates(current => {
      return {
        ...current,
        [kind]: getNextColumnFilterState(current[kind]),
      }
    })
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

                  {availableColumnFilterKinds.length > 0 ? (
                    <div className="dependency-explorer__filter-row">
                      <span className="dependency-explorer__filters-label">Show dependency columns</span>
                      <div className="dependency-explorer__segmented-toggle" role="group" aria-label="Show dependency columns">
                        {availableColumnFilterKinds.includes('peer') ? (
                          <button
                            type="button"
                            className={`dependency-explorer__segment dependency-explorer__segment--peer${columnFilterStates.peer !== 'off' ? ' dependency-explorer__segment--active' : ''}${columnFilterStates.peer === 'exclusive' ? ' dependency-explorer__segment--exclusive' : ''}`}
                            onClick={() => handleToggleDependencyColumnKind('peer')}
                            aria-pressed={columnFilterStates.peer !== 'off'}
                            title={`Peer: ${columnFilterStates.peer}`}
                          >
                            Peer
                          </button>
                        ) : null}
                        {availableColumnFilterKinds.includes('required') ? (
                          <button
                            type="button"
                            className={`dependency-explorer__segment dependency-explorer__segment--required${columnFilterStates.required !== 'off' ? ' dependency-explorer__segment--active' : ''}${columnFilterStates.required === 'exclusive' ? ' dependency-explorer__segment--exclusive' : ''}`}
                            onClick={() => handleToggleDependencyColumnKind('required')}
                            aria-pressed={columnFilterStates.required !== 'off'}
                            title={`Required: ${columnFilterStates.required}`}
                          >
                            Required
                          </button>
                        ) : null}
                        {availableColumnFilterKinds.includes('optional') ? (
                          <button
                            type="button"
                            className={`dependency-explorer__segment dependency-explorer__segment--optional${columnFilterStates.optional !== 'off' ? ' dependency-explorer__segment--active' : ''}${columnFilterStates.optional === 'exclusive' ? ' dependency-explorer__segment--exclusive' : ''}`}
                            onClick={() => handleToggleDependencyColumnKind('optional')}
                            aria-pressed={columnFilterStates.optional !== 'off'}
                            title={`Optional: ${columnFilterStates.optional}`}
                          >
                            Optional
                          </button>
                        ) : null}
                        {availableColumnFilterKinds.includes('platform') ? (
                          <button
                            type="button"
                            className={`dependency-explorer__segment dependency-explorer__segment--platform${columnFilterStates.platform !== 'off' ? ' dependency-explorer__segment--active' : ''}${columnFilterStates.platform === 'exclusive' ? ' dependency-explorer__segment--exclusive' : ''}`}
                            onClick={() => handleToggleDependencyColumnKind('platform')}
                            aria-pressed={columnFilterStates.platform !== 'off'}
                            title={`Platform: ${columnFilterStates.platform}`}
                          >
                            Platform
                          </button>
                        ) : null}
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
                              className={getColumnLinkToneClassName(visibleColumnKinds, column)}
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
                              const cell = row.dependencyCells[column.key]
                              return (
                                <td key={`${row.key}:${column.key}`}>
                                  {cell ? (
                                    <span className="dependency-explorer__dependency-cell">
                                      {cell.value === DEPENDENCY_EXPLORER_SAME_VALUE ? (
                                        <span className="dependency-explorer__same-tag">same</span>
                                      ) : (
                                        <span>{cell.value}</span>
                                      )}
                                      <span className="dependency-explorer__kind-badges" aria-hidden="true">
                                        {cell.kinds.map(kind => (
                                          <span key={kind} className={getKindBadgeClassName(kind)}>
                                            {getKindBadgeLabel(kind)}
                                          </span>
                                        ))}
                                      </span>
                                    </span>
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
