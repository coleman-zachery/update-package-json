import {
  matchesSelection,
  normalizePlatformSelection,
  sortPlatformTargets,
  toPlatformOption,
} from './helpers'
import { getCanonicalPlatformTargets } from './catalog'
import { PLATFORM_RUNTIME_NONE } from './constants'
import type {
  PlatformOption,
  ParsedPlatformTarget,
  PlatformSelection,
} from './types'

export { normalizePlatformSelection }

function toSelection(target: ParsedPlatformTarget): PlatformSelection {
  return {
    os: target.os,
    arch: target.arch,
    runtime: target.runtime ?? PLATFORM_RUNTIME_NONE,
  }
}

function findSelectedTarget(
  rawTargets: string[],
  selection: PlatformSelection,
): ParsedPlatformTarget | null {
  const normalized = normalizePlatformSelection(selection)
  if (!normalized.os || !normalized.arch) {
    return null
  }

  const targets = sortPlatformTargets(getCanonicalPlatformTargets(rawTargets))
  const matches = targets.filter(target => matchesSelection(target, normalized))

  if (normalized.runtime === PLATFORM_RUNTIME_NONE) {
    return matches.find(target => !target.runtime) ?? null
  }

  if (normalized.runtime) {
    return matches.find(target => target.runtime === normalized.runtime) ?? null
  }

  return matches.length === 1 ? matches[0] : null
}

export function coercePlatformSelection(
  rawTargets: string[],
  selection: PlatformSelection,
): PlatformSelection {
  const target = findSelectedTarget(rawTargets, selection)
  return target ? toSelection(target) : {}
}

export function updatePlatformSelection(
  rawTargets: string[],
  selection: PlatformSelection,
  value: string,
): PlatformSelection {
  const current = findSelectedTarget(rawTargets, selection)
  if (!value || current?.raw === value) {
    return {}
  }

  const next = getCanonicalPlatformTargets(rawTargets).find(target => target.raw === value)
  return next ? toSelection(next) : {}
}

export function getPlatformSelectorState(
  rawTargets: string[],
  selection: PlatformSelection,
): {
  value: string
  options: PlatformOption[]
} {
  const selectedTarget = findSelectedTarget(rawTargets, selection)
  const targets = sortPlatformTargets(getCanonicalPlatformTargets(rawTargets))

  return {
    value: selectedTarget?.raw ?? '',
    options: targets.map(toPlatformOption),
  }
}
