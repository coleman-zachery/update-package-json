import { createSpaceIndentStyle, type SpaceIndentSize } from '@/lib/indentation'
import {
  removeDependenciesFromPackage,
  removeDependencyOverrides,
  serializePackageJson,
} from '@/lib/package-json'
import type { ResolveResult } from '@/lib/resolver'

export function buildApplyFixesInput(
  result: ResolveResult,
  spaceIndentSize: SpaceIndentSize,
): string {
  const unfrozenPackage = removeDependencyOverrides(
    result.updatedPackage,
    result.recommendedUnfreezeNames,
  )
  const nextPackage = removeDependenciesFromPackage(
    unfrozenPackage,
    result.recommendedRemovalNames,
  )

  return serializePackageJson(nextPackage, createSpaceIndentStyle(spaceIndentSize), {
    packageManagerBeforeEngines: true,
  })
}
