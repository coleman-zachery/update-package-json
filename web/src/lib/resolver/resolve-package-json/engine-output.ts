import semver from 'semver'
import {
  formatNpmPackageManager,
  isNpmSupportAligned,
  isPinnedNpmVersion,
  isUnpinnedSemverRange,
  type NpmDeclarationSource,
} from '@/lib/package-json'
import { formatEngineIssue, formatOutputNpmAlignmentWarning, formatPackageManagerIssue } from '../messages'
import type {
  EngineName,
  EngineValidationIssue,
  PackageManagerValidationIssue,
  ResolvedManifest,
} from '../types'
import { formatCompatibleEngineRange } from './engine-ranges'

interface FormatEngineOutputOptions {
  rootNode: string | undefined
  rootNpm: string | undefined
  declaredEngineNpm: string
  inputPackageManagerVersion: string | null
  respectNode: boolean
  respectNpm: boolean
  restrictedNode: boolean
  restrictedNpm: boolean
  restrictedPackageManagerNpm: boolean
  shouldRetainDetachedPackageManager: boolean
  workingRootNode: string | undefined
  workingRootNpm: string | undefined
  engineIssues: EngineValidationIssue[]
  packageManagerIssue: PackageManagerValidationIssue | null
  declaredNpmSource: NpmDeclarationSource | null
  resolvedManifests: ResolvedManifest[]
  signal?: AbortSignal
}

export interface FormattedEngineOutput {
  didOverrideNode: boolean
  didOverrideNpm: boolean
  formattedEngineNode: string | undefined
  formattedEngineNpm: string | undefined
  formattedPackageManager: string | undefined
  engineWarnings: string[]
  engineOverrides: string[]
  overriddenEngines: Set<EngineName>
}

export async function formatResolvedEngineOutput(
  options: FormatEngineOutputOptions,
): Promise<FormattedEngineOutput> {
  const hasPinnedNodeInput = options.restrictedNode
  const hasPinnedNpmInput = options.restrictedNpm || options.restrictedPackageManagerNpm
  const didOverrideNode = hasPinnedNodeInput
    && Boolean(options.rootNode && options.workingRootNode && options.rootNode !== options.workingRootNode)
  const didOverrideNpm = hasPinnedNpmInput
    && Boolean(options.rootNpm && options.workingRootNpm && options.rootNpm !== options.workingRootNpm)
  const shouldRetainFrozenNodeValue = options.restrictedNode && Boolean(options.rootNode && semver.validRange(options.rootNode))
  const shouldRetainFrozenNpmValue = options.restrictedNpm && Boolean(options.rootNpm && semver.validRange(options.rootNpm))
  const nodeIssue = options.engineIssues.find(candidate => candidate.engine === 'node')
  const npmIssue = options.engineIssues.find(candidate => candidate.engine === 'npm')
  const engineWarnings: string[] = []
  const engineOverrides: string[] = []

  if (didOverrideNode) {
    engineOverrides.push(
      nodeIssue
        ? formatEngineIssue(nodeIssue, options.workingRootNode)
        : `using node latest ${options.workingRootNode}. engines.node "${options.rootNode}" overridden during update`,
    )
  }
  if (didOverrideNpm) {
    engineOverrides.push(
      options.declaredNpmSource === 'packageManager' && options.packageManagerIssue
        ? formatPackageManagerIssue(options.packageManagerIssue, options.workingRootNpm)
        : (
          npmIssue
            ? formatEngineIssue(npmIssue, options.workingRootNpm)
            : `using npm latest ${options.workingRootNpm}. engines.npm "${options.rootNpm}" overridden during update`
        ),
    )
  }

  const overriddenEngines = new Set<EngineName>()
  if (didOverrideNode) {
    overriddenEngines.add('node')
  }
  if (didOverrideNpm) {
    overriddenEngines.add('npm')
  }

  if (
    shouldRetainFrozenNpmValue
    && options.rootNpm
    && isUnpinnedSemverRange(options.rootNpm)
    && options.workingRootNpm
    && !options.shouldRetainDetachedPackageManager
  ) {
    engineWarnings.push(
      `packageManager will pin npm@${options.workingRootNpm} while retaining engines.npm "${options.rootNpm}" because packageManager does not support ranges`,
    )
  }

  const formattedEngineNode = shouldRetainFrozenNodeValue && options.rootNode
    ? options.rootNode
    : await formatCompatibleEngineRange({
        engineName: 'node',
        declaredValue: options.rootNode,
        resolvedManifests: options.resolvedManifests,
        limitToDeclaredRange: options.respectNode || options.restrictedNode,
        signal: options.signal,
      }) ?? options.workingRootNode
  const formattedEngineNpm = shouldRetainFrozenNpmValue && options.rootNpm
    ? options.rootNpm
    : await formatCompatibleEngineRange({
        engineName: 'npm',
        declaredValue: options.rootNpm,
        resolvedManifests: options.resolvedManifests,
        limitToDeclaredRange: options.respectNpm || options.restrictedNpm,
        signal: options.signal,
      }) ?? options.workingRootNpm
  const formattedPackageManager = options.restrictedPackageManagerNpm && options.inputPackageManagerVersion
    ? formatNpmPackageManager(options.inputPackageManagerVersion)
    : shouldRetainFrozenNpmValue && options.rootNpm
      ? options.shouldRetainDetachedPackageManager && options.inputPackageManagerVersion
        ? formatNpmPackageManager(options.inputPackageManagerVersion)
        : isPinnedNpmVersion(options.rootNpm)
          ? formatNpmPackageManager(options.rootNpm)
          : options.workingRootNpm
            ? formatNpmPackageManager(options.workingRootNpm)
            : undefined
      : options.workingRootNpm
        ? formatNpmPackageManager(options.workingRootNpm)
        : formattedEngineNpm
          ? formatNpmPackageManager(formattedEngineNpm)
          : undefined
  if (
    formattedEngineNpm
    && formattedPackageManager
    && !isNpmSupportAligned(formattedEngineNpm, formattedPackageManager)
  ) {
    engineWarnings.push(formatOutputNpmAlignmentWarning(formattedEngineNpm, formattedPackageManager))
  }

  return {
    didOverrideNode,
    didOverrideNpm,
    formattedEngineNode,
    formattedEngineNpm,
    formattedPackageManager,
    engineWarnings,
    engineOverrides,
    overriddenEngines,
  }
}
