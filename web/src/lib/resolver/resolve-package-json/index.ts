import {
  parsePackageJson,
} from '@/lib/package-json'
import { type RestrictionState } from '@/lib/restrictions'
import { throwIfAborted } from '../abort'
import {
  formatEngineIssue,
  formatPackageManagerIssue,
} from '../messages'
import {
  getPinnedPackageManagerVersion,
  getTrimmedString,
  selectDeclaredNpmValue,
} from '../package-manager'
import { validateDeclaredEngines, validateDeclaredPackageManager } from '../validation'
import type {
  ResolveOptions,
  ResolvePreferences,
  ResolveResult,
  VersionChange,
} from '../types'
import { formatResolvedEngineOutput } from './engine-output'
import { settleEngineResolution } from './engine-resolution'
import { syncResolvedOverrides } from './override-sync'
import { applyResolvedSections } from './resolved-sections'

export async function resolvePackageJson(
  raw: string,
  options: ResolveOptions,
  restrictions: RestrictionState = {},
  preferences: ResolvePreferences = {},
): Promise<ResolveResult> {
  throwIfAborted(preferences.signal)
  const pkg = parsePackageJson(raw)
  const changes: VersionChange[] = []
  const engineIssues = await validateDeclaredEngines(pkg.engines?.node, pkg.engines?.npm, preferences.signal)
  const packageManagerIssue = await validateDeclaredPackageManager(pkg.packageManager, preferences.signal)
  const { value: declaredNpm, source: declaredNpmSource } = selectDeclaredNpmValue(pkg, engineIssues, packageManagerIssue)
  const declaredEngineNpm = getTrimmedString(pkg.engines?.npm)
  const inputPackageManagerVersion = getPinnedPackageManagerVersion(pkg.packageManager)
  const engineWarnings = [
    ...engineIssues.map(issue => formatEngineIssue(issue)),
    ...(packageManagerIssue ? [formatPackageManagerIssue(packageManagerIssue)] : []),
  ]
  const engineOverrides: string[] = []
  const rootNode = pkg.engines?.node
  const rootNpm = declaredNpm
  const {
    respectNode,
    respectNpm,
    restrictedNode,
    restrictedNpm,
    restrictedPackageManagerNpm,
    shouldRetainDetachedPackageManager,
    workingRootNode,
    workingRootNpm,
    resolution,
  } = await settleEngineResolution({
    pkg,
    options,
    restrictions,
    rootNode,
    rootNpm,
    declaredEngineNpm,
    declaredNpmSource,
    inputPackageManagerVersion,
    engineIssues,
    packageManagerIssue,
    preferences,
  })

  const resolvedSections = {
    dependencies: resolution.deps,
    devDependencies: resolution.devDeps,
    peerDependencies: resolution.peerDeps,
  }
  const updated = applyResolvedSections(pkg, resolvedSections, changes)
  const formattedEngineOutput = await formatResolvedEngineOutput({
    rootNode,
    rootNpm,
    declaredEngineNpm,
    inputPackageManagerVersion,
    respectNode,
    respectNpm,
    restrictedNode,
    restrictedNpm,
    restrictedPackageManagerNpm,
    shouldRetainDetachedPackageManager,
    workingRootNode,
    workingRootNpm,
    engineIssues,
    packageManagerIssue,
    declaredNpmSource,
    resolvedManifests: resolution.resolvedManifests,
    signal: preferences.signal,
  })
  engineWarnings.push(...formattedEngineOutput.engineWarnings)
  engineOverrides.push(...formattedEngineOutput.engineOverrides)
  const {
    didOverrideNpm,
    formattedEngineNode,
    formattedEngineNpm,
    formattedPackageManager,
    overriddenEngines,
  } = formattedEngineOutput
  if (formattedEngineNode && updated.engines?.node !== formattedEngineNode) {
    changes.push({
      name: 'engines.node',
      from: updated.engines?.node ?? '(none)',
      to: formattedEngineNode,
      section: 'engines',
    })
    updated.engines = { ...(updated.engines ?? {}), node: formattedEngineNode }
  }
  if (formattedEngineNpm && updated.engines?.npm !== formattedEngineNpm) {
    changes.push({
      name: 'engines.npm',
      from: updated.engines?.npm ?? '(none)',
      to: formattedEngineNpm,
      section: 'engines',
    })
    updated.engines = { ...(updated.engines ?? {}), npm: formattedEngineNpm }
  }
  if (formattedPackageManager && updated.packageManager !== formattedPackageManager) {
    changes.push({
      name: 'packageManager',
      from: getTrimmedString(updated.packageManager) || '(none)',
      to: formattedPackageManager,
      section: 'engines',
    })
    updated.packageManager = formattedPackageManager
  }

  const recommendedUnfreezeNames = Array.from(new Set([
    ...resolution.recommendedUnfreezeNames,
    ...resolution.auditStatus.recommendedUnfreezeNames,
  ])).sort((left, right) => left.localeCompare(right))
  const fixRecommendations = [
    ...resolution.fixRecommendations,
    ...resolution.auditStatus.recommendedUnfreezeNames.map(
      name => `Remove the override/freeze for ${name}: it is blocking an available audit-safe version.`,
    ),
  ].sort((left, right) => left.localeCompare(right))
  syncResolvedOverrides(pkg, updated, resolution, changes, preferences.signal)

  return {
    updatedPackage: updated,
    auditStatus: resolution.auditStatus,
    latestDependencyNames: resolution.latestDependencyNames,
    staleDependencyNames: resolution.staleDependencyNames,
    changes,
    resolvedManifests: resolution.resolvedManifests,
    changeSources: resolution.changeSources,
    addedPeerDeps: resolution.addedPeerDeps,
    conflicts: resolution.conflicts,
    engineWarnings: [...engineWarnings, ...resolution.engineWarnings, ...resolution.transitiveOverrideWarnings]
      .filter(message => !(
        (message.startsWith('engines.node ') && overriddenEngines.has('node'))
        || (message.startsWith('engines.npm ') && overriddenEngines.has('npm'))
        || (message.startsWith('packageManager ') && didOverrideNpm && declaredNpmSource === 'packageManager')
      )),
    engineOverrides: [
      ...engineOverrides,
      ...resolution.transitiveOverrides.map(
        override => `${override.source}: pinned transitive ${override.name}@${override.version} in overrides to satisfy engine constraints`,
      ),
    ],
    recommendedUnfreezeNames,
    fixRecommendations,
    platformSupport: resolution.platformSupport,
  }
}
