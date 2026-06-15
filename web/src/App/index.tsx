import semver from 'semver'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { DependencyExplorer } from '@/components/DependencyExplorer'
import { OptionsBar, type EngineControlButton, type OptionControlButton } from '@/components/OptionsBar'
import { ChangesPane } from '@/components/Panes/ChangesPane'
import { EditorPane } from '@/components/Panes/EditorPane'
import { OutputPane } from '@/components/Panes/OutputPane'
import {
  createSpaceIndentStyle,
  detectSupportedSpaceIndentSize,
  type SpaceIndentSize,
} from '@/lib/indentation'
import type {
  EngineName,
  ResolveProgress,
  ResolveOptions,
  ResolveResult,
} from '@/lib/resolver'
import { isAbortError } from '@/lib/resolver/abort'
import {
  type PlatformSelection,
} from '@/lib/resolver/platform-targets'
import {
  applyMajorBuildRanges,
  forceDependenciesIntoOverrides,
  getStringOverrides,
  hasDependencyOverride,
  parsePackageJson,
  reformatPackageJson,
  removeDependencyOverrides,
  removeDependenciesFromPackage,
  removeDependencyValue,
  serializePackageJson,
  setDependencyFrozen,
  type PackageJson,
  upsertDependencyValue,
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
import {
  collectPackageSemanticHighlights,
  getOutputOverrideNames,
} from '@/App/packageSemanticHighlights'
import { getPreferredFrozenSection, syncRestrictions } from '@/App/restrictions'
import { useInputPackageSemantics } from '@/App/useInputPackageSemantics'
import { usePlatformSelection } from '@/App/usePlatformSelection'
import { useInputValidation } from '@/App/useInputValidation'
import { useLatestVersions } from '@/App/useLatestVersions'
import './index.css'

type PendingAction = 'update' | 'apply-fixes'
const MAX_APPLY_FIXES_PASSES = 8

function normalizeComparableVersion(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.replace(/^[\^~]/, '').trim()
  if (semver.valid(normalized)) {
    return normalized
  }

  return semver.minVersion(value)?.version ?? null
}

export default function App() {
  const [input, setInput] = useState('')
  const [spaceIndentSize, setSpaceIndentSize] = useState<SpaceIndentSize>(2)
  const [options, setOptions] = useState<ResolveOptions>(DEFAULT_OPTIONS)
  const [result, setResult] = useState<ResolveResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [resolveProgress, setResolveProgress] = useState<ResolveProgress | null>(null)
  const [pendingEngine, setPendingEngine] = useState<EngineName | null>(null)
  const [restrictions, setRestrictions] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [overridesActive, setOverridesActive] = useState(true)
  const [majorBuildsActive, setMajorBuildsActive] = useState(true)
  const [transitivesActive, setTransitivesActive] = useState(true)
  const [platformAvailableTargets, setPlatformAvailableTargets] = useState<string[]>([])
  const [dependencyExplorerRequest, setDependencyExplorerRequest] = useState<{
    id: number
    packageName: string
    contextPackage: ReturnType<typeof parsePackageJson> | {}
    contextSourceLabel: string
    canApply: boolean
    applyDisabledReason?: string
  } | null>(null)
  const pendingIndentAutoDetectRef = useRef(false)
  const dependencyExplorerRequestIdRef = useRef(0)
  const resolveAbortControllerRef = useRef<AbortController | null>(null)

  const latestVersions = useLatestVersions()
  const inputValidation = useInputValidation(input)
  const inputPackageSemantics = useInputPackageSemantics(input)
  const {
    platformSelection,
    platformSelectorState,
    handlePlatformSelectionChange,
  } = usePlatformSelection(platformAvailableTargets)

  const inputPackage = useMemo<PackageJson>(() => {
    if (!input.trim()) {
      return {}
    }

    try {
      return parsePackageJson(input)
    } catch {
      return {}
    }
  }, [input])

  const inputEngines = useMemo<Record<EngineName, string>>(() => {
    return {
      node: typeof inputPackage.engines?.node === 'string' ? inputPackage.engines.node.trim() : '',
      npm: typeof inputPackage.engines?.npm === 'string' ? inputPackage.engines.npm.trim() : '',
    }
  }, [inputPackage])

  const transitiveDependencyNames = useMemo(() => {
    if (!result) {
      return []
    }

    const rootPackageNames = [
      ...new Set([
        ...Object.keys(result.updatedPackage.dependencies ?? {}),
        ...Object.keys(result.updatedPackage.devDependencies ?? {}),
        ...Object.keys(result.updatedPackage.peerDependencies ?? {}),
        ...Object.keys(result.updatedPackage.optionalDependencies ?? {}),
      ]),
    ]
    if (rootPackageNames.length === 0) {
      return []
    }

    const rootPackageNameSet = new Set(rootPackageNames)
    const manifestsByName = new Map(result.resolvedManifests.map(manifest => [manifest.name, manifest]))
    const protectedNames = new Set([
      ...result.changeSources
        .filter(source => source.kind === 'platform' || source.kind === 'peer')
        .map(source => source.name),
      ...Object.keys(result.updatedPackage.peerDependencies ?? {}),
      ...Object.keys(result.updatedPackage.optionalDependencies ?? {}),
    ])
    const adjacency = new Map<string, string[]>()

    for (const sourceName of rootPackageNames) {
      const sourceManifest = manifestsByName.get(sourceName)?.manifest
      if (!sourceManifest) {
        adjacency.set(sourceName, [])
        continue
      }

      const dependencyTargets = new Set<string>()
      for (const [dependencyName, dependencyRange] of Object.entries(sourceManifest.dependencies ?? {})) {
        if (!rootPackageNameSet.has(dependencyName) || !semver.validRange(dependencyRange)) {
          continue
        }

        const resolvedVersion = manifestsByName.get(dependencyName)?.version
          ?? result.updatedPackage.dependencies?.[dependencyName]
          ?? result.updatedPackage.devDependencies?.[dependencyName]
          ?? result.updatedPackage.peerDependencies?.[dependencyName]
          ?? result.updatedPackage.optionalDependencies?.[dependencyName]
        const normalizedResolvedVersion = normalizeComparableVersion(resolvedVersion)
        if (!normalizedResolvedVersion || !semver.satisfies(normalizedResolvedVersion, dependencyRange)) {
          continue
        }

        dependencyTargets.add(dependencyName)
      }

      adjacency.set(sourceName, Array.from(dependencyTargets))
    }

    const transitivelyReducibleRoots = rootPackageNames.filter(name => !protectedNames.has(name))
    const reachableNames = new Set<string>()
    for (const rootName of transitivelyReducibleRoots) {
      const pendingTargets = [...(adjacency.get(rootName) ?? [])]
      const seenTargets = new Set<string>()

      while (pendingTargets.length > 0) {
        const targetName = pendingTargets.pop()
        if (!targetName || targetName === rootName || seenTargets.has(targetName)) {
          continue
        }

        seenTargets.add(targetName)
        reachableNames.add(targetName)

        if (protectedNames.has(targetName)) {
          continue
        }

        for (const nextTarget of adjacency.get(targetName) ?? []) {
          if (!seenTargets.has(nextTarget)) {
            pendingTargets.push(nextTarget)
          }
        }
      }
    }

    return rootPackageNames
      .filter(name => reachableNames.has(name) && !protectedNames.has(name))
      .sort((left, right) => left.localeCompare(right))
  }, [result])

  const overrideNames = useMemo(
    () => (result ? getOutputOverrideNames(result) : []),
    [result],
  )

  const outputPackage = useMemo(() => {
    if (!result) {
      return null
    }

    const packageWithOverrides = overridesActive
      ? forceDependenciesIntoOverrides(result.updatedPackage, overrideNames)
      : removeDependencyOverrides(forceDependenciesIntoOverrides(result.updatedPackage, overrideNames), overrideNames)
    const overriddenDependencyNames = new Set(Object.keys(getStringOverrides(packageWithOverrides)))
    const majorBuildCandidateNames = result.latestDependencyNames.filter(name => !overriddenDependencyNames.has(name))

    const packageWithMajorBuilds = majorBuildsActive
      ? applyMajorBuildRanges(packageWithOverrides, majorBuildCandidateNames)
      : packageWithOverrides

    return transitivesActive
      ? packageWithMajorBuilds
      : removeDependenciesFromPackage(packageWithMajorBuilds, transitiveDependencyNames)
  }, [majorBuildsActive, overrideNames, overridesActive, result, transitiveDependencyNames, transitivesActive])

  const inputSemanticHighlights = useMemo(
    () => collectPackageSemanticHighlights(inputPackage, {
      transitiveDependencyNames: inputPackageSemantics.transitiveDependencyNames,
      unresolvedDependencyNames: inputPackageSemantics.unresolvedDependencyNames,
    }),
    [inputPackage, inputPackageSemantics.transitiveDependencyNames, inputPackageSemantics.unresolvedDependencyNames],
  )

  const outputSemanticHighlights = useMemo(
    () => outputPackage
      ? collectPackageSemanticHighlights(outputPackage, {
        overrideNames: overridesActive ? overrideNames : [],
        result,
        transitiveDependencyNames,
      })
      : collectPackageSemanticHighlights({}),
    [outputPackage, overrideNames, overridesActive, result, transitiveDependencyNames],
  )

  const outputJson = useMemo(() => {
    if (!outputPackage) {
      return ''
    }

    return serializePackageJson(outputPackage, createSpaceIndentStyle(spaceIndentSize), {
      packageManagerBeforeEngines: true,
    })
  }, [outputPackage, spaceIndentSize])

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

  useEffect(() => {
    return () => {
      resolveAbortControllerRef.current?.abort()
    }
  }, [])

  async function runUpdatePackage(
    nextInput: string,
    nextRestrictions: Record<string, boolean>,
    action: PendingAction,
    nextPlatformSelection: PlatformSelection = platformSelection,
  ) {
    resolveAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    resolveAbortControllerRef.current = abortController
    setPendingAction(action)
    setOverridesActive(true)
    setStatus('loading')
    setResult(null)
    setErrorMsg('')
    setResolveProgress(null)

    try {
      const { resolvePackageJson } = await loadResolverModule()
      const nextResult = await resolvePackageJson(nextInput, options, nextRestrictions, {
        platformSelection: nextPlatformSelection,
        onProgress: setResolveProgress,
        signal: abortController.signal,
      })
      if (abortController.signal.aborted) {
        return
      }
      setPlatformAvailableTargets(nextResult.platformSupport.availableTargets)
      setOverridesActive(true)
      setMajorBuildsActive(true)
      setTransitivesActive(true)
      setResult(nextResult)
      setStatus('done')
    } catch (error) {
      if (isAbortError(error)) {
        setStatus('idle')
        setResolveProgress(null)
        return
      }
      setErrorMsg(error instanceof Error ? error.message : String(error))
      setStatus('error')
    } finally {
      if (resolveAbortControllerRef.current === abortController) {
        resolveAbortControllerRef.current = null
      }
      setPendingAction(current => current === action ? null : current)
    }
  }

  async function handleUpdatePackage() {
    await runUpdatePackage(input, restrictions, 'update')
  }

  async function handleApplyFixes() {
    if (!result) {
      return
    }

    resolveAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    resolveAbortControllerRef.current = abortController
    setPendingAction('apply-fixes')
    setOverridesActive(true)
    setStatus('loading')
    setResult(null)
    setErrorMsg('')
    setResolveProgress(null)

    try {
      const { resolvePackageJson } = await loadResolverModule()
      let workingInput = input
      let workingRestrictions = restrictions
      let workingResult = result
      const seenStates = new Set<string>()

      for (let pass = 0; pass < MAX_APPLY_FIXES_PASSES; pass++) {
        if (workingResult.fixRecommendations.length === 0) {
          break
        }

        const nextInput = buildApplyFixesInput(workingResult, spaceIndentSize)
        const nextRestrictions = syncRestrictions(
          workingRestrictions,
          nextInput,
          detectRestrictableEntries(nextInput),
        )
        const stateKey = JSON.stringify({
          input: nextInput,
          restrictions: Object.entries(nextRestrictions).sort(([left], [right]) => left.localeCompare(right)),
        })

        if (seenStates.has(stateKey)) {
          workingInput = nextInput
          workingRestrictions = nextRestrictions
          break
        }

        seenStates.add(stateKey)
        workingInput = nextInput
        workingRestrictions = nextRestrictions
        workingResult = await resolvePackageJson(workingInput, options, workingRestrictions, {
          platformSelection,
          onProgress: setResolveProgress,
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) {
          return
        }
      }

      if (abortController.signal.aborted) {
        return
      }
      setInput(workingInput)
      setRestrictions(workingRestrictions)
      setPlatformAvailableTargets(workingResult.platformSupport.availableTargets)
      setOverridesActive(true)
      setMajorBuildsActive(true)
      setTransitivesActive(true)
      setResult(workingResult)
      setStatus('done')
    } catch (error) {
      if (isAbortError(error)) {
        setStatus('idle')
        setResolveProgress(null)
        return
      }
      setErrorMsg(error instanceof Error ? error.message : String(error))
      setStatus('error')
    } finally {
      if (resolveAbortControllerRef.current === abortController) {
        resolveAbortControllerRef.current = null
      }
      setPendingAction(current => current === 'apply-fixes' ? null : current)
    }
  }

  function handleStopResolve() {
    resolveAbortControllerRef.current?.abort()
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

  const inputExplorerContext = useMemo(() => {
    if (!input.trim()) {
      return {
        pkg: {},
        raw: '',
        sourceLabel: 'Input package.json',
        canApply: status !== 'loading' && pendingEngine === null,
        applyDisabledReason: '',
      }
    }

    try {
      parsePackageJson(input)
      return {
        pkg: inputPackage,
        raw: input,
        sourceLabel: 'Input package.json',
        canApply: status !== 'loading' && pendingEngine === null,
        applyDisabledReason: '',
      }
    } catch {
      return {
        pkg: {},
        raw: '',
        sourceLabel: 'Input package.json',
        canApply: false,
        applyDisabledReason: 'Fix the input JSON first so the new dependency has somewhere safe to land.',
      }
    }
  }, [input, inputPackage, pendingEngine, status])

  const outputExplorerContext = useMemo(() => {
    if (status === 'done' && outputPackage) {
      return {
        pkg: outputPackage,
        raw: outputJson,
        sourceLabel: 'Updated output package.json',
        canApply: pendingEngine === null,
        applyDisabledReason: '',
      }
    }

    return null
  }, [outputJson, outputPackage, pendingEngine, status])

  const explorerContext = outputExplorerContext ?? inputExplorerContext

  async function handleApplyDependencyVersion(
    packageName: string,
    versionSpec: string,
    freeze: boolean,
    remove = false,
  ): Promise<ReturnType<typeof parsePackageJson>> {
    let nextInput = input

    if (remove) {
      nextInput = removeDependencyValue(input, packageName, spaceIndentSize)
    } else {
      const inputPackage = input.trim() ? parsePackageJson(input) : {}
      const preferredSection =
        inputPackage.dependencies?.[packageName] ? 'dependencies'
          : inputPackage.devDependencies?.[packageName] ? 'devDependencies'
            : inputPackage.peerDependencies?.[packageName] ? 'peerDependencies'
              : inputPackage.optionalDependencies?.[packageName] ? 'optionalDependencies'
                : 'dependencies'

      const withDependency = upsertDependencyValue(
        input,
        packageName,
        versionSpec,
        spaceIndentSize,
        preferredSection,
      )
      nextInput = setDependencyFrozen(
        withDependency,
        packageName,
        freeze,
        spaceIndentSize,
        preferredSection,
      )
    }

    const nextRestrictions = syncRestrictions(
      restrictions,
      nextInput,
      detectRestrictableEntries(nextInput),
    )

    setInput(nextInput)
      setRestrictions(nextRestrictions)
    setOverridesActive(true)
    setResult(null)
    setStatus('idle')

    if (errorMsg) {
      setErrorMsg('')
    }

    return parsePackageJson(nextInput)
  }

  function handleForceOverrides() {
    if (!result || overrideNames.length === 0) {
      return
    }
    setOverridesActive(current => !current)
  }

  function handleMajorBuildsToggle() {
    setMajorBuildsActive(current => !current)
  }

  function handleTransitivesToggle() {
    setTransitivesActive(current => !current)
  }

  function handleInspectDependency(packageName: string, source: 'input' | 'output') {
    const nextContext = source === 'output' && outputExplorerContext
      ? outputExplorerContext
      : inputExplorerContext

    dependencyExplorerRequestIdRef.current += 1
    setDependencyExplorerRequest({
      id: dependencyExplorerRequestIdRef.current,
      packageName,
      contextPackage: nextContext.pkg,
      contextSourceLabel: nextContext.sourceLabel,
      canApply: nextContext.canApply,
      applyDisabledReason: nextContext.applyDisabledReason,
    })
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
      <AppHeader
        utility={(
          <DependencyExplorer
            contextPackage={explorerContext.pkg}
            contextSourceLabel={explorerContext.sourceLabel}
            canApply={explorerContext.canApply}
            applyDisabledReason={explorerContext.applyDisabledReason}
            includeOptionalPeerDeps={options.addOptionalPeerDeps}
            onApplyVersion={handleApplyDependencyVersion}
            openRequest={dependencyExplorerRequest}
          />
        )}
      />

      <OptionsBar
        engineButtons={engineButtons}
        optionButtons={optionButtons}
        platformSelectors={{
          ...platformSelectorState,
          disabled: status === 'loading' || pendingEngine !== null,
          onChange: value => void handlePlatformSelectionChange(value),
        }}
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
            readOnly={status === 'loading'}
            overriddenDependencyNames={inputSemanticHighlights.overriddenDependencyNames}
            platformDependencyNames={inputSemanticHighlights.platformDependencyNames}
            transitiveDependencyNames={inputSemanticHighlights.transitiveDependencyNames}
            unresolvedDependencyNames={inputSemanticHighlights.unresolvedDependencyNames}
            onInspectDependency={status === 'loading'
              ? undefined
              : packageName => handleInspectDependency(packageName, 'input')}
          />
        </div>
        <div className="app__column">
          <ChangesPane
            inputPackage={inputPackage}
            displayPackage={outputPackage}
            result={result}
            status={status}
            progress={resolveProgress}
            onStopResolve={handleStopResolve}
            onApplyFixes={() => void handleApplyFixes()}
            applyFixesDisabled={status === 'loading' || pendingEngine !== null}
            applyFixesLabel={status === 'loading' && pendingAction === 'apply-fixes' ? 'Applying…' : 'Apply Fixes'}
          />
        </div>
        <div className="app__column">
        <OutputPane
          result={result}
          outputJson={outputJson}
          onForceOverrides={handleForceOverrides}
          onToggleMajorBuilds={handleMajorBuildsToggle}
          onToggleTransitives={handleTransitivesToggle}
          onUseAsInput={handleUseOutputAsInput}
          onInspectDependency={packageName => handleInspectDependency(packageName, 'output')}
          overrideNames={overrideNames}
          overridesActive={overridesActive}
          majorBuildsActive={majorBuildsActive}
          overriddenDependencyNames={outputSemanticHighlights.overriddenDependencyNames}
          platformDependencyNames={outputSemanticHighlights.platformDependencyNames}
          transitiveDependencyNames={transitiveDependencyNames}
          highlightTransitiveDependencyNames={outputSemanticHighlights.transitiveDependencyNames}
          transitivesActive={transitivesActive}
          unresolvedDependencyNames={outputSemanticHighlights.unresolvedDependencyNames}
          spaceIndentSize={spaceIndentSize}
          status={status}
        />
        </div>
      </main>
    </div>
  )
}
