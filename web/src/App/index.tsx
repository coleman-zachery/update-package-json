import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { OptionsBar, type EngineControlButton, type OptionControlButton } from '@/components/OptionsBar'
import { ChangesPane } from '@/components/Panes/ChangesPane'
import { EditorPane } from '@/components/Panes/EditorPane'
import { OutputPane } from '@/components/Panes/OutputPane'
import { detectSupportedSpaceIndentSize, type SpaceIndentSize } from '@/lib/indentation'
import type {
  EngineName,
  ResolveOptions,
  ResolveResult,
} from '@/lib/resolver'
import {
  forceDependenciesIntoOverrides,
  getStringOverrides,
  hasDependencyOverride,
  parsePackageJson,
  reformatPackageJson,
  removeDependencyOverrides,
  setDependencyFrozen,
  upsertEngineValue,
  upsertNpmSupport,
} from '@/lib/package-json'
import {
  detectRestrictableEntries,
  ENGINE_NPM_RESTRICTION_KEY,
  isDependencyRestrictionSection,
  PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  getRestrictionKey,
  type RestrictableEntry,
} from '@/lib/restrictions'
import {
  DEFAULT_OPTIONS,
  ENGINE_NAMES,
  OPTION_BUTTONS,
} from '@/App/constants'
import { buildApplyFixesInput } from '@/App/auditFixes'
import { loadNpmModule, loadResolverModule } from '@/App/moduleLoaders'
import { getPreferredFrozenSection, syncRestrictions } from '@/App/restrictions'
import { useInputValidation } from '@/App/useInputValidation'
import { useLatestVersions } from '@/App/useLatestVersions'
import './index.css'

type PendingAction = 'update' | 'apply-fixes'

export default function App() {
  const [input, setInput] = useState('')
  const [spaceIndentSize, setSpaceIndentSize] = useState<SpaceIndentSize>(2)
  const [options, setOptions] = useState<ResolveOptions>(DEFAULT_OPTIONS)
  const [result, setResult] = useState<ResolveResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingEngine, setPendingEngine] = useState<EngineName | null>(null)
  const [restrictions, setRestrictions] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [forcedOverrideNames, setForcedOverrideNames] = useState<string[]>([])
  const pendingIndentAutoDetectRef = useRef(false)

  const latestVersions = useLatestVersions()
  const inputValidation = useInputValidation(input)

  const inputEngines = useMemo<Record<EngineName, string>>(() => {
    if (!input.trim()) {
      return { node: '', npm: '' }
    }

    try {
      const parsed = parsePackageJson(input)
      return {
        node: typeof parsed?.engines?.node === 'string' ? parsed.engines.node.trim() : '',
        npm: typeof parsed?.engines?.npm === 'string' ? parsed.engines.npm.trim() : '',
      }
    } catch {
      return { node: '', npm: '' }
    }
  }, [input])

  const restrictableEntries = useMemo(() => detectRestrictableEntries(input), [input])

  useEffect(() => {
    setRestrictions(current => syncRestrictions(current, input, restrictableEntries))
  }, [input, restrictableEntries])

  useEffect(() => {
    const nextRespectNode = Boolean(restrictions[getRestrictionKey('engines', 'node')])
    const nextRespectNpm = Boolean(
      restrictions[ENGINE_NPM_RESTRICTION_KEY] || restrictions[PACKAGE_MANAGER_NPM_RESTRICTION_KEY],
    )

    setOptions(current => {
      if (
        current.respectEnginesNode === nextRespectNode
        && current.respectEnginesNpm === nextRespectNpm
      ) {
        return current
      }

      return {
        ...current,
        respectEnginesNode: nextRespectNode,
        respectEnginesNpm: nextRespectNpm,
      }
    })
  }, [restrictions])

  async function runUpdatePackage(
    nextInput: string,
    nextRestrictions: Record<string, boolean>,
    action: PendingAction,
  ) {
    setPendingAction(action)
    setForcedOverrideNames([])
    setStatus('loading')
    setResult(null)
    setErrorMsg('')

    try {
      const { resolvePackageJson } = await loadResolverModule()
      const nextResult = await resolvePackageJson(nextInput, options, nextRestrictions)
      setResult(nextResult)
      setStatus('done')
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
      setStatus('error')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleUpdatePackage() {
    await runUpdatePackage(input, restrictions, 'update')
  }

  async function handleApplyFixes() {
    if (!result) {
      return
    }

    const nextInput = buildApplyFixesInput(result, spaceIndentSize)
    const nextRestrictions = syncRestrictions(
      restrictions,
      nextInput,
      detectRestrictableEntries(nextInput),
    )

    setInput(nextInput)
    setRestrictions(nextRestrictions)
    await runUpdatePackage(nextInput, nextRestrictions, 'apply-fixes')
  }

  function handleUseOutputAsInput(nextInput: string) {
    setInput(nextInput)
    setRestrictions(current => syncRestrictions(
      current,
      nextInput,
      detectRestrictableEntries(nextInput),
    ))

    if (errorMsg) {
      setErrorMsg('')
    }
  }

  async function getLatestEngineVersion(engineName: EngineName): Promise<string> {
    const { fetchLatestNodeVersion, fetchLatestNpmVersion } = await loadNpmModule()
    return engineName === 'node' ? fetchLatestNodeVersion() : fetchLatestNpmVersion()
  }

  async function handleAddEngine(engineName: EngineName) {
    setPendingEngine(engineName)
    setErrorMsg('')

    try {
      if (input.trim()) {
        parsePackageJson(input)
      }

      const latestVersion = await getLatestEngineVersion(engineName)
      setInput(current => engineName === 'npm'
        ? upsertNpmSupport(current, latestVersion, spaceIndentSize)
        : upsertEngineValue(current, engineName, latestVersion, spaceIndentSize))
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingEngine(null)
    }
  }

  function toggleOption(key: keyof ResolveOptions) {
    setOptions(current => ({ ...current, [key]: !current[key] }))
  }

  function setEngineFrozen(engineName: EngineName, frozen: boolean) {
    const hasDetachedPackageManagerEntry = restrictableEntries.some(
      entry => entry.key === PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
    )

    setRestrictions(current => {
      if (engineName === 'node') {
        const key = getRestrictionKey('engines', 'node')
        if (Boolean(current[key]) === frozen) {
          return current
        }

        return { ...current, [key]: frozen }
      }

      const next = {
        ...current,
        [ENGINE_NPM_RESTRICTION_KEY]: frozen,
      }

      if (hasDetachedPackageManagerEntry) {
        next[PACKAGE_MANAGER_NPM_RESTRICTION_KEY] = frozen
      }

      const didChange = Boolean(current[ENGINE_NPM_RESTRICTION_KEY]) !== frozen
        || (hasDetachedPackageManagerEntry
          && Boolean(current[PACKAGE_MANAGER_NPM_RESTRICTION_KEY]) !== frozen)

      return didChange ? next : current
    })
  }

  function handleInputChange(value: string) {
    setInput(value)

    if (pendingIndentAutoDetectRef.current) {
      pendingIndentAutoDetectRef.current = false

      try {
        parsePackageJson(value)
        setSpaceIndentSize(detectSupportedSpaceIndentSize(value))
      } catch {
        setSpaceIndentSize(2)
      }
    }

    if (errorMsg) {
      setErrorMsg('')
    }
  }

  function handleInputPasteCapture() {
    pendingIndentAutoDetectRef.current = true
  }

  function handleSpaceIndentToggle() {
    const nextSpaceIndentSize: SpaceIndentSize = spaceIndentSize === 2 ? 4 : 2
    setSpaceIndentSize(nextSpaceIndentSize)
    setInput(current => reformatPackageJson(current, nextSpaceIndentSize))
  }

  function handleForceOverrides() {
    if (!result) {
      return
    }

    if (forcedOverrideNames.length > 0) {
      setResult(current => current ? {
        ...current,
        updatedPackage: removeDependencyOverrides(current.updatedPackage, forcedOverrideNames),
      } : current)
      setForcedOverrideNames([])
      return
    }

    const existingOverrideNames = new Set(Object.keys(getStringOverrides(result.updatedPackage)))
    const nextForcedOverrideNames = result.staleDependencyNames.filter(name => !existingOverrideNames.has(name))
    if (nextForcedOverrideNames.length === 0) {
      return
    }

    setResult(current => current ? {
      ...current,
      updatedPackage: forceDependenciesIntoOverrides(current.updatedPackage, nextForcedOverrideNames),
    } : current)
    setForcedOverrideNames(nextForcedOverrideNames)
  }

  function handleRestrictionToggle(entry: RestrictableEntry) {
    if (!isDependencyRestrictionSection(entry.section)) {
      setEngineFrozen(entry.name === 'node' ? 'node' : 'npm', !isEngineFrozen(entry.name === 'node' ? 'node' : 'npm'))
      return
    }

    try {
      const currentFrozen = input.trim() ? hasDependencyOverride(parsePackageJson(input), entry.name) : false
      setInput(current => setDependencyFrozen(
        current,
        entry.name,
        !currentFrozen,
        spaceIndentSize,
        getPreferredFrozenSection(entry.section),
      ))

      if (errorMsg) {
        setErrorMsg('')
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
    }
  }

  function getEngineIssue(engineName: EngineName) {
    return inputValidation.engineIssues.find(candidate => candidate.engine === engineName)
  }

  function formatLatestVersion(engineName: EngineName): string {
    return latestVersions[engineName] || 'loading…'
  }

  function formatEngineButtonIssue(engineName: EngineName): string | null {
    const issue = getEngineIssue(engineName)
    if (!issue) {
      return null
    }

    const target = engineName === 'node' ? 'Node.js' : 'npm'
    if (issue.kind === 'invalid-range') {
      return `engines.${engineName} "${issue.value}" isn't a valid semver range`
    }

    return `engines.${engineName} "${issue.value}" doesn't match any published ${target} version`
  }

  function isEngineFrozen(engineName: EngineName): boolean {
    if (engineName === 'node') {
      return Boolean(restrictions[getRestrictionKey('engines', 'node')])
    }

    return Boolean(
      restrictions[ENGINE_NPM_RESTRICTION_KEY] || restrictions[PACKAGE_MANAGER_NPM_RESTRICTION_KEY],
    )
  }
  const validationMessages = [
    ...inputValidation.errors,
    ...inputValidation.warnings,
  ]

  const validationSeverity =
    inputValidation.errors.length > 0
      ? 'error'
      : validationMessages.length > inputValidation.errors.length
        ? 'warning'
        : null

  const engineControlsDisabled =
    status === 'loading' || pendingEngine !== null || inputValidation.errors.length > 0

  const engineButtons = useMemo<EngineControlButton[]>(() => {
    return ENGINE_NAMES.map(engineName => {
      const currentValue = inputEngines[engineName]
      const latest = formatLatestVersion(engineName)
      const engineIssueMeta = formatEngineButtonIssue(engineName)
      const frozen = isEngineFrozen(engineName)

      if (pendingEngine === engineName) {
        return {
          engineName,
          label: `engines.${engineName}`,
          active: false,
          warning: false,
          danger: false,
          hasInput: false,
          meta: `adding latest ${latest}`,
          disabled: engineControlsDisabled,
        }
      }

      if (!currentValue) {
        return {
          engineName,
          label: `engines.${engineName}`,
          active: false,
          warning: false,
          danger: false,
          hasInput: false,
          meta: `add latest ${latest}`,
          disabled: engineControlsDisabled,
        }
      }

      if (engineIssueMeta) {
        return {
          engineName,
          label: `engines.${engineName}`,
          active: false,
          warning: false,
          danger: true,
          hasInput: true,
          meta: engineIssueMeta,
          disabled: engineControlsDisabled,
        }
      }

      return {
        engineName,
        label: `engines.${engineName}`,
        active: !frozen,
        warning: frozen,
        danger: false,
        hasInput: true,
        meta: frozen ? `using override ${currentValue}` : `using latest ${latest}`,
        disabled: engineControlsDisabled,
      }
    })
  }, [engineControlsDisabled, inputEngines, latestVersions, pendingEngine, restrictions, inputValidation.engineIssues])

  const optionButtons = useMemo<OptionControlButton[]>(() => {
    return OPTION_BUTTONS.map(({
      key,
      label,
      activeLabel,
      inactiveLabel,
      activeMeta,
      inactiveMeta,
      activeTone,
      inactiveTone,
    }) => {
      const enabled = options[key]
      const tone = enabled ? (activeTone ?? 'accent') : (inactiveTone ?? 'default')

      return {
        key,
        label: enabled ? (activeLabel ?? label) : (inactiveLabel ?? label),
        active: tone === 'accent',
        warning: tone === 'warning',
        meta: enabled ? activeMeta : inactiveMeta,
        disabled: status === 'loading' || pendingEngine !== null,
        pressed: enabled,
      }
    })
  }, [options, pendingEngine, status])

  const restrictionMarkers = useMemo(() => {
    return restrictableEntries.map(entry => {
      const checked = entry.section === 'engines'
        ? isEngineFrozen(entry.name === 'node' ? 'node' : 'npm')
        : restrictions[entry.key] ?? false
      const stateLabel = checked ? 'frozen' : 'not frozen'

      return {
        key: entry.key,
        line: entry.line,
        checked,
        title: `${entry.label}: ${stateLabel}`,
        onToggle: () => handleRestrictionToggle(entry),
      }
    })
  }, [input, errorMsg, restrictableEntries, restrictions, spaceIndentSize])

  function handleEngineButton(engineName: EngineName) {
    if (!inputEngines[engineName]) {
      void handleAddEngine(engineName)
      return
    }

    if (getEngineIssue(engineName)) {
      return
    }

    setEngineFrozen(engineName, !isEngineFrozen(engineName))
  }

  return (
    <div className="app">
      <AppHeader />

      <OptionsBar
        engineButtons={engineButtons}
        optionButtons={optionButtons}
        onEngineClick={handleEngineButton}
        onOptionClick={toggleOption}
      />

      <main className="app__columns">
        <div className="app__column">
          <EditorPane
            value={input}
            onChange={handleInputChange}
            onPasteCapture={handleInputPasteCapture}
            onToggleSpaceIndent={handleSpaceIndentToggle}
            onUpdate={() => void handleUpdatePackage()}
            spaceIndentSize={spaceIndentSize}
            updateDisabled={status === 'loading' || pendingEngine !== null || !input.trim() || inputValidation.errors.length > 0}
            updateLabel={status === 'loading' ? 'Updating…' : 'Update Package'}
            validationMessages={validationMessages}
            validationSeverity={validationSeverity}
            runtimeError={errorMsg}
            markers={restrictionMarkers}
          />
        </div>
        <div className="app__column">
          <ChangesPane
            result={result}
            status={status}
            onApplyFixes={() => void handleApplyFixes()}
            applyFixesDisabled={status === 'loading' || pendingEngine !== null}
            applyFixesLabel={status === 'loading' && pendingAction === 'apply-fixes' ? 'Applying…' : 'Apply Fixes'}
          />
        </div>
        <div className="app__column">
          <OutputPane
            result={result}
            onForceOverrides={handleForceOverrides}
            onUseAsInput={handleUseOutputAsInput}
            forcedOverrideNames={forcedOverrideNames}
            spaceIndentSize={spaceIndentSize}
            status={status}
          />
        </div>
      </main>
    </div>
  )
}
