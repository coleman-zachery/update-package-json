import { HISTORICAL_PLATFORM_TARGETS } from './catalog.generated'
import {
  parseAvailableTargets,
  parsePlatformTarget,
} from './helpers'
import type { ParsedPlatformTarget } from './types'

function buildTargetMap(values: readonly string[]): Map<string, ParsedPlatformTarget> {
  const targets = new Map<string, ParsedPlatformTarget>()

  for (const value of values) {
    const parsed = parsePlatformTarget(value)
    if (parsed) {
      targets.set(parsed.raw, parsed)
    }
  }

  return targets
}

const HISTORICAL_TARGETS = buildTargetMap(HISTORICAL_PLATFORM_TARGETS)

export function getCanonicalPlatformTargets(rawTargets: string[]): ParsedPlatformTarget[] {
  const targets = new Map(HISTORICAL_TARGETS)

  for (const parsed of parseAvailableTargets(rawTargets)) {
    targets.set(parsed.raw, parsed)
  }

  return Array.from(targets.values())
}
