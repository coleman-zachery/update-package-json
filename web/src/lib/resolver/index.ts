export { resolvePackageJson } from './resolve-package-json'
export { validatePackageJsonInput } from './validation'
export { DEFAULT_PLATFORM_SELECTION, getPlatformSelectorState, normalizePlatformSelection } from './platform-targets'
export type {
  AddedPeerDep,
  AuditStatus,
  ChangeSourceHint,
  EngineName,
  EngineValidationIssue,
  InputValidationState,
  PlatformSupport,
  ResolvedManifest,
  ResolvePreferences,
  ResolveProgress,
  ResolveOptions,
  ResolveResult,
  VersionChange,
} from './types'
export type { PlatformSelection } from './platform-targets'
