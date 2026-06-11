import semver from 'semver'
import { formatNpmPackageManager, getDependencyVersion, getStringOverrides, isNpmSupportAligned, isPinnedNpmVersion, isUnpinnedSemverRange, parsePackageJson, sortDependencies } from '@/lib/package-json'
import { fetchLatestNodeVersion, fetchLatestNpmVersion } from '@/lib/npm'
import { ENGINE_NPM_RESTRICTION_KEY, PACKAGE_MANAGER_NPM_RESTRICTION_KEY, getRestrictionKey, type RestrictionState } from '@/lib/restrictions'
import { pickCompatibleEngineVersion } from './engine-selection'
import { formatEngineIssue, formatOutputNpmAlignmentWarning, formatPackageManagerIssue } from './messages'
import { getPinnedPackageManagerVersion, getTrimmedString, selectDeclaredNpmValue } from './package-manager'
import { resolveWithEngines } from './resolve-with-engines'
import { isMeaningfulDependencyChange, sortOverrideEntries } from './state-helpers'
import { validateDeclaredEngines, validateDeclaredPackageManager } from './validation'
import type { DependencySection, EngineName, ResolveOptions, ResolvePreferences, ResolveResult, VersionChange } from './types'

export async function resolvePackageJson(
  raw: string,
  options: ResolveOptions,
  restrictions: RestrictionState = {},
  preferences: ResolvePreferences = {},
): Promise<ResolveResult> {
  const pkg = parsePackageJson(raw)
  const changes: VersionChange[] = []
  const engineIssues = await validateDeclaredEngines(pkg.engines?.node, pkg.engines?.npm)
  const packageManagerIssue = await validateDeclaredPackageManager(pkg.packageManager)
  const { value: declaredNpm, source: declaredNpmSource } = selectDeclaredNpmValue(pkg, engineIssues, packageManagerIssue)
  const declaredEngineNpm = getTrimmedString(pkg.engines?.npm)
  const inputPackageManagerVersion = getPinnedPackageManagerVersion(pkg.packageManager)
  const engineWarnings = [...engineIssues.map(issue => formatEngineIssue(issue)), ...(packageManagerIssue ? [formatPackageManagerIssue(packageManagerIssue)] : [])]
  const engineOverrides: string[] = []
  const rootNode = pkg.engines?.node
  const rootNpm = declaredNpm
  const selectedNpmIssue = declaredNpmSource === 'packageManager' ? packageManagerIssue : engineIssues.find(candidate => candidate.engine === 'npm') ?? null
  const respectNode = options.respectEnginesNode && !engineIssues.some(issue => issue.engine === 'node')
  const respectNpm = options.respectEnginesNpm && !selectedNpmIssue
  const restrictedNode = Boolean(restrictions[getRestrictionKey('engines', 'node')])
  const restrictedNpm = Boolean(restrictions[ENGINE_NPM_RESTRICTION_KEY])
  const hasDetachedNpmRange = isUnpinnedSemverRange(declaredEngineNpm)
  const restrictedPackageManagerNpm = Boolean(restrictions[hasDetachedNpmRange ? PACKAGE_MANAGER_NPM_RESTRICTION_KEY : ENGINE_NPM_RESTRICTION_KEY])
  const shouldRetainDetachedPackageManager = hasDetachedNpmRange && restrictedPackageManagerNpm && !packageManagerIssue && Boolean(inputPackageManagerVersion)
  let workingRootNode = !respectNode ? await fetchLatestNodeVersion().catch(() => rootNode) : rootNode
  let workingRootNpm = !respectNpm ? await fetchLatestNpmVersion().catch(() => rootNpm) : rootNpm
  let resolution = await resolveWithEngines(pkg, options, restrictions, workingRootNode, workingRootNpm, Boolean(workingRootNode), Boolean(workingRootNpm), preferences)

  for (let pass = 0; pass < 3; pass++) {
    const nextRootNode = await pickCompatibleEngineVersion('node', rootNode, resolution.resolvedManifests, respectNode, restrictedNode, options.addEnginesNode, options.avoidLatestVersions)
    const nextRootNpm = await pickCompatibleEngineVersion('npm', rootNpm, resolution.resolvedManifests, respectNpm, restrictedNpm, options.addEnginesNpm, options.avoidLatestVersions)
    if ((nextRootNode ?? '') === (workingRootNode ?? '') && (nextRootNpm ?? '') === (workingRootNpm ?? '')) break
    workingRootNode = nextRootNode ?? workingRootNode
    workingRootNpm = nextRootNpm ?? workingRootNpm
    resolution = await resolveWithEngines(pkg, options, restrictions, workingRootNode, workingRootNpm, Boolean(workingRootNode), Boolean(workingRootNpm), preferences)
  }

  const resolvedSections = { dependencies: resolution.deps, devDependencies: resolution.devDeps, peerDependencies: resolution.peerDeps }
  const updated = { ...pkg }
  if (Object.keys(resolvedSections.dependencies).length > 0) updated.dependencies = sortDependencies(resolvedSections.dependencies)
  if (Object.keys(resolvedSections.devDependencies).length > 0) updated.devDependencies = sortDependencies(resolvedSections.devDependencies)
  if (Object.keys(resolvedSections.peerDependencies).length > 0) updated.peerDependencies = sortDependencies(resolvedSections.peerDependencies)

  const originalSections: Array<[DependencySection, Record<string, string> | undefined, Record<string, string>]> = [['dependencies', pkg.dependencies, resolvedSections.dependencies], ['devDependencies', pkg.devDependencies, resolvedSections.devDependencies], ['peerDependencies', pkg.peerDependencies, resolvedSections.peerDependencies]]
  for (const [section, originalSection, resolvedSection] of originalSections) {
    for (const [name, nextValue] of Object.entries(resolvedSection)) {
      const previousValue = originalSection?.[name]
      if (isMeaningfulDependencyChange(previousValue, nextValue)) changes.push({ name, from: previousValue ?? '(none)', to: nextValue, section })
    }
  }

  const didOverrideNode = !respectNode && rootNode && workingRootNode && rootNode !== workingRootNode
  const didOverrideNpm = !respectNpm && rootNpm && workingRootNpm && rootNpm !== workingRootNpm
  const shouldRetainFrozenNodeValue = restrictedNode && Boolean(rootNode && semver.validRange(rootNode))
  const shouldRetainFrozenNpmValue = restrictedNpm && Boolean(rootNpm && semver.validRange(rootNpm))
  if (didOverrideNode) engineOverrides.push(engineIssues.find(candidate => candidate.engine === 'node') ? formatEngineIssue(engineIssues.find(candidate => candidate.engine === 'node')!, workingRootNode) : `using node latest ${workingRootNode}. engines.node "${rootNode}" overridden during update`)
  if (didOverrideNpm) engineOverrides.push(declaredNpmSource === 'packageManager' && packageManagerIssue ? formatPackageManagerIssue(packageManagerIssue, workingRootNpm) : (engineIssues.find(candidate => candidate.engine === 'npm') ? formatEngineIssue(engineIssues.find(candidate => candidate.engine === 'npm')!, workingRootNpm) : `using npm latest ${workingRootNpm}. engines.npm "${rootNpm}" overridden during update`))

  const overriddenEngines = new Set<EngineName>(); if (didOverrideNode) overriddenEngines.add('node'); if (didOverrideNpm) overriddenEngines.add('npm')
  if (shouldRetainFrozenNpmValue && rootNpm && isUnpinnedSemverRange(rootNpm) && workingRootNpm && !shouldRetainDetachedPackageManager) engineWarnings.push(`packageManager will pin npm@${workingRootNpm} while retaining engines.npm "${rootNpm}" because packageManager does not support ranges`)

  const formattedEngineNode = shouldRetainFrozenNodeValue && rootNode ? rootNode : workingRootNode
  const formattedEngineNpm = shouldRetainFrozenNpmValue && rootNpm ? rootNpm : workingRootNpm
  const formattedPackageManager = restrictedPackageManagerNpm && inputPackageManagerVersion ? formatNpmPackageManager(inputPackageManagerVersion) : shouldRetainFrozenNpmValue && rootNpm ? shouldRetainDetachedPackageManager && inputPackageManagerVersion ? formatNpmPackageManager(inputPackageManagerVersion) : isPinnedNpmVersion(rootNpm) ? formatNpmPackageManager(rootNpm) : workingRootNpm ? formatNpmPackageManager(workingRootNpm) : undefined : formattedEngineNpm ? formatNpmPackageManager(formattedEngineNpm) : undefined
  if (formattedEngineNpm && formattedPackageManager && !isNpmSupportAligned(formattedEngineNpm, formattedPackageManager)) engineWarnings.push(formatOutputNpmAlignmentWarning(formattedEngineNpm, formattedPackageManager))
  if (formattedEngineNode && updated.engines?.node !== formattedEngineNode) { changes.push({ name: 'engines.node', from: updated.engines?.node ?? '(none)', to: formattedEngineNode, section: 'engines' }); updated.engines = { ...(updated.engines ?? {}), node: formattedEngineNode } }
  if (formattedEngineNpm && updated.engines?.npm !== formattedEngineNpm) { changes.push({ name: 'engines.npm', from: updated.engines?.npm ?? '(none)', to: formattedEngineNpm, section: 'engines' }); updated.engines = { ...(updated.engines ?? {}), npm: formattedEngineNpm } }
  if (formattedPackageManager && updated.packageManager !== formattedPackageManager) { changes.push({ name: 'packageManager', from: getTrimmedString(updated.packageManager) || '(none)', to: formattedPackageManager, section: 'engines' }); updated.packageManager = formattedPackageManager }

  const recommendedUnfreezeNames = Array.from(new Set([...resolution.recommendedUnfreezeNames, ...resolution.auditStatus.recommendedUnfreezeNames])).sort((left, right) => left.localeCompare(right))
  const fixRecommendations = [...resolution.fixRecommendations, ...resolution.auditStatus.recommendedUnfreezeNames.map(name => `Remove the override/freeze for ${name}: it is blocking an available audit-safe version.`)].sort((left, right) => left.localeCompare(right))
  if (resolution.transitiveOverrides.length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = !updated.overrides
    for (const override of resolution.transitiveOverrides) { if (nextOverrides[override.name] === override.version) continue; nextOverrides[override.name] = override.version; overridesChanged = true }
    if (overridesChanged) updated.overrides = sortOverrideEntries(nextOverrides)
  }
  if (Object.keys(getStringOverrides(updated)).length > 0) {
    const nextOverrides = { ...(updated.overrides ?? {}) }
    let overridesChanged = false
    for (const name of Object.keys(getStringOverrides(updated))) { const mirroredVersion = getDependencyVersion(updated, name); if (!mirroredVersion || nextOverrides[name] === mirroredVersion) continue; nextOverrides[name] = mirroredVersion; overridesChanged = true }
    if (overridesChanged) updated.overrides = sortOverrideEntries(nextOverrides)
  }

  return {
    updatedPackage: updated,
    auditStatus: resolution.auditStatus,
    latestDependencyNames: resolution.latestDependencyNames,
    staleDependencyNames: resolution.staleDependencyNames,
    changes,
    addedPeerDeps: resolution.addedPeerDeps,
    conflicts: resolution.conflicts,
    engineWarnings: [...engineWarnings, ...resolution.engineWarnings, ...resolution.transitiveOverrideWarnings].filter(message => !((message.startsWith('engines.node ') && overriddenEngines.has('node')) || (message.startsWith('engines.npm ') && overriddenEngines.has('npm')) || (message.startsWith('packageManager ') && didOverrideNpm && declaredNpmSource === 'packageManager'))),
    engineOverrides: [...engineOverrides, ...resolution.transitiveOverrides.map(override => `${override.source}: pinned transitive ${override.name}@${override.version} in overrides to satisfy engine constraints`)],
    recommendedUnfreezeNames,
    fixRecommendations,
    platformSupport: resolution.platformSupport,
  }
}
