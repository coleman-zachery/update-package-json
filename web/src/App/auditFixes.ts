import { createSpaceIndentStyle, type SpaceIndentSize } from '@/lib/indentation'
import { removeDependencyOverrides, serializePackageJson } from '@/lib/package-json'
import type { ResolveResult } from '@/lib/resolver'

export function buildApplyFixesInput(
  result: ResolveResult,
  spaceIndentSize: SpaceIndentSize,
): string {
  const nextPackage = removeDependencyOverrides(
    result.updatedPackage,
    result.recommendedUnfreezeNames,
  )

  return serializePackageJson(nextPackage, createSpaceIndentStyle(spaceIndentSize), {
    packageManagerBeforeEngines: true,
  })
}
