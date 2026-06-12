export { applyMajorBuildRanges, removeDependenciesFromPackage, removeDependencyValue, upsertDependencyValue } from './dependency-updates'
export { getTextReplacement, syncPackageJsonAfterInputChange } from './editor'
export {
  reformatPackageJson,
  syncNpmSupportAfterInputChange,
  upsertEngineValue,
  upsertNpmSupport,
} from './npm-support'
export {
  detectFrozenDependencyNames,
  forceDependenciesIntoOverrides,
  getStringOverrides,
  hasDependencyOverride,
  removeDependencyOverrides,
  setDependencyFrozen,
  syncDependencyOverridesAfterInputChange,
} from './overrides'
export {
  formatNpmPackageManager,
  parsePackageJson,
  parsePackageManager,
  serializePackageJson,
} from './serialization'
export { getDependencyVersion, sortDependencies } from './sections'
export { isNpmSupportAligned, isPinnedNpmVersion, isUnpinnedSemverRange } from './semver'
export type {
  NpmDeclarationSource,
  PackageJson,
  PackageManagerSpec,
  RootDependencySection,
  TextReplacement,
} from './types'
