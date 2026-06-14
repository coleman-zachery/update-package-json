import semver from 'semver'
import {
  fetchPackument,
  getAllVersions,
} from '@/lib/npm'
import { isEngineCompatible } from '@/lib/semver-utils'
import { throwIfAborted } from '../abort'
import { getDependencyRangeCandidates } from '../state-helpers'
import type { PackageState } from '../types'

export interface InstallTargetAnalysis {
  latestSatisfyingVersion: string | null
  latestEngineCompatibleVersion: string | null
  latestSatisfyingIsEngineCompatible: boolean
}

interface InstallTargetHelpersOptions {
  rootNode: string | undefined
  rootNpm: string | undefined
  respectNode: boolean
  respectNpm: boolean
  signal?: AbortSignal
  getPackumentCached(name: string): Promise<Awaited<ReturnType<typeof fetchPackument>>>
}

export function createInstallTargetHelpers(
  options: InstallTargetHelpersOptions,
): {
  getInstallTargetAnalysis(name: string, range: string): Promise<InstallTargetAnalysis>
  getTransitiveOverridePlan(manifest: PackageState['manifest'] | undefined): Promise<Record<string, string> | null>
} {
  const installTargetCache = new Map<string, InstallTargetAnalysis>()
  const getInstallTargetAnalysis = async (
    name: string,
    range: string,
  ): Promise<InstallTargetAnalysis> => {
    throwIfAborted(options.signal)
    if (!semver.validRange(range)) {
      return {
        latestSatisfyingVersion: null,
        latestEngineCompatibleVersion: null,
        latestSatisfyingIsEngineCompatible: true,
      }
    }

    const cacheKey = [
      name,
      range,
      options.rootNode ?? '',
      options.rootNpm ?? '',
      options.respectNode ? 'node' : '',
      options.respectNpm ? 'npm' : '',
    ].join('|')
    const cached = installTargetCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const packument = await options.getPackumentCached(name)
      const satisfyingVersions = getDependencyRangeCandidates(range, getAllVersions(packument))
      const latestSatisfyingVersion = satisfyingVersions[0] ?? null
      const latestEngineCompatibleVersion = satisfyingVersions.find(version =>
        Boolean(
          packument.versions[version]
          && isEngineCompatible(
            packument.versions[version].engines,
            options.rootNode,
            options.rootNpm,
            options.respectNode,
            options.respectNpm,
          ),
        ),
      ) ?? null
      const next = {
        latestSatisfyingVersion,
        latestEngineCompatibleVersion,
        latestSatisfyingIsEngineCompatible: Boolean(
          latestSatisfyingVersion
          && latestSatisfyingVersion === latestEngineCompatibleVersion,
        ),
      }
      installTargetCache.set(cacheKey, next)
      return next
    } catch {
      const next = {
        latestSatisfyingVersion: null,
        latestEngineCompatibleVersion: null,
        latestSatisfyingIsEngineCompatible: false,
      }
      installTargetCache.set(cacheKey, next)
      return next
    }
  }

  const getTransitiveOverridePlan = async (
    manifest: PackageState['manifest'] | undefined,
  ): Promise<Record<string, string> | null> => {
      throwIfAborted(options.signal)
      if (!manifest) {
        return null
      }

      const overrides: Record<string, string> = {}
      const entries = [
        ...Object.entries(manifest.dependencies ?? {}),
        ...Object.entries(manifest.optionalDependencies ?? {}),
      ]
      for (const [name, range] of entries) {
        throwIfAborted(options.signal)
        const analysis = await getInstallTargetAnalysis(name, range)
        if (!analysis.latestSatisfyingVersion || !analysis.latestEngineCompatibleVersion) {
          return null
        }
        if (!analysis.latestSatisfyingIsEngineCompatible) {
          overrides[name] = analysis.latestEngineCompatibleVersion
        }
      }
      return overrides
  }

  return {
    getInstallTargetAnalysis,
    getTransitiveOverridePlan,
  }
}
