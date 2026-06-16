import { isUnpinnedSemverRange, type NpmDeclarationSource, type PackageJson } from '@/lib/package-json'
import {
  fetchLatestNodeVersion,
  fetchLatestNpmVersion,
} from '@/lib/npm'
import {
  ENGINE_NPM_RESTRICTION_KEY,
  PACKAGE_MANAGER_NPM_RESTRICTION_KEY,
  getRestrictionKey,
  type RestrictionState,
} from '@/lib/restrictions'
import { isAbortError } from '../abort'
import { throwIfAborted } from '../abort'
import { pickCompatibleEngineVersion } from '../engine-selection'
import { resolveWithEngines } from '../resolve-with-engines'
import type {
  EngineValidationIssue,
  PackageManagerValidationIssue,
  ResolutionPass,
  ResolveOptions,
  ResolvePreferences,
} from '../types'

interface SettleEngineResolutionOptions {
  pkg: PackageJson
  options: ResolveOptions
  restrictions: RestrictionState
  rootNode: string | undefined
  rootNpm: string | undefined
  declaredEngineNpm: string
  declaredNpmSource: NpmDeclarationSource | null
  inputPackageManagerVersion: string | null
  engineIssues: EngineValidationIssue[]
  packageManagerIssue: PackageManagerValidationIssue | null
  preferences: ResolvePreferences
}

export interface SettledEngineResolution {
  respectNode: boolean
  respectNpm: boolean
  restrictedNode: boolean
  restrictedNpm: boolean
  restrictedPackageManagerNpm: boolean
  shouldRetainDetachedPackageManager: boolean
  workingRootNode: string | undefined
  workingRootNpm: string | undefined
  resolution: ResolutionPass
}

export async function settleEngineResolution(
  options: SettleEngineResolutionOptions,
): Promise<SettledEngineResolution> {
  const selectedNpmIssue = options.declaredNpmSource === 'packageManager'
    ? options.packageManagerIssue
    : options.engineIssues.find(candidate => candidate.engine === 'npm') ?? null
  const respectNode = options.options.respectEnginesNode
    && !options.engineIssues.some(issue => issue.engine === 'node')
  const respectNpm = options.options.respectEnginesNpm && !selectedNpmIssue
  const restrictedNode = Boolean(options.restrictions[getRestrictionKey('engines', 'node')])
  const restrictedNpm = Boolean(options.restrictions[ENGINE_NPM_RESTRICTION_KEY])
  const hasDetachedNpmRange = isUnpinnedSemverRange(options.declaredEngineNpm)
  const restrictedPackageManagerNpm = Boolean(
    options.restrictions[hasDetachedNpmRange ? PACKAGE_MANAGER_NPM_RESTRICTION_KEY : ENGINE_NPM_RESTRICTION_KEY],
  )
  const shouldRetainDetachedPackageManager = hasDetachedNpmRange
    && restrictedPackageManagerNpm
    && !options.packageManagerIssue
    && Boolean(options.inputPackageManagerVersion)
  let workingRootNode = !respectNode
    ? await fetchLatestNodeVersion(options.preferences.signal).catch(error => {
      if (isAbortError(error)) {
        throw error
      }

      return options.rootNode
    })
    : options.rootNode
  let workingRootNpm = !respectNpm
    ? await fetchLatestNpmVersion(options.preferences.signal).catch(error => {
      if (isAbortError(error)) {
        throw error
      }

      return options.rootNpm
    })
    : options.rootNpm
  let resolution = await resolveWithEngines(
    options.pkg,
    options.options,
    options.restrictions,
    workingRootNode,
    workingRootNpm,
    Boolean(workingRootNode),
    Boolean(workingRootNpm),
    options.preferences,
  )

  for (let pass = 0; pass < 3; pass += 1) {
    throwIfAborted(options.preferences.signal)
    const nextRootNode = await pickCompatibleEngineVersion(
      'node',
      options.rootNode,
      resolution.resolvedManifests,
      respectNode,
      restrictedNode,
      options.options.addEnginesNode,
      options.options.avoidLatestVersions,
      options.preferences.signal,
    )
    const nextRootNpm = await pickCompatibleEngineVersion(
      'npm',
      options.rootNpm,
      resolution.resolvedManifests,
      respectNpm,
      restrictedNpm,
      options.options.addEnginesNpm,
      options.options.avoidLatestVersions,
      options.preferences.signal,
    )
    if (
      (nextRootNode ?? '') === (workingRootNode ?? '')
      && (nextRootNpm ?? '') === (workingRootNpm ?? '')
    ) {
      break
    }

    workingRootNode = nextRootNode ?? workingRootNode
    workingRootNpm = nextRootNpm ?? workingRootNpm
    resolution = await resolveWithEngines(
      options.pkg,
      options.options,
      options.restrictions,
      workingRootNode,
      workingRootNpm,
      Boolean(workingRootNode),
      Boolean(workingRootNpm),
      options.preferences,
    )
  }

  return {
    respectNode,
    respectNpm,
    restrictedNode,
    restrictedNpm,
    restrictedPackageManagerNpm,
    shouldRetainDetachedPackageManager,
    workingRootNode,
    workingRootNpm,
    resolution,
  }
}
