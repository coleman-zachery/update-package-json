import {
  getFirstValue,
  getSelectorTargets,
  normalizePlatformSelection,
  toArchOption,
  toOsOption,
  toRuntimeOption,
  uniq,
} from './helpers'
import type {
  PlatformOption,
  PlatformSelection,
} from './types'

export { normalizePlatformSelection }

export function coercePlatformSelection(
  rawTargets: string[],
  selection: PlatformSelection,
): PlatformSelection {
  const normalized = normalizePlatformSelection(selection)
  const targets = getSelectorTargets(rawTargets)

  const osValues = uniq(targets.map(target => target.os))
  const nextOs = normalized.os && osValues.includes(normalized.os)
    ? normalized.os
    : getFirstValue(osValues)

  const archValues = uniq(
    targets
      .filter(target => !nextOs || target.os === nextOs)
      .map(target => target.arch),
  )
  const nextArch = normalized.arch && archValues.includes(normalized.arch)
    ? normalized.arch
    : getFirstValue(archValues)

  const runtimeValues = uniq(
    targets
      .filter(target => (!nextOs || target.os === nextOs) && (!nextArch || target.arch === nextArch))
      .map(target => target.runtime),
  )
  const nextRuntime = normalized.runtime && runtimeValues.includes(normalized.runtime)
    ? normalized.runtime
    : getFirstValue(runtimeValues)

  return {
    os: nextOs,
    arch: nextArch,
    runtime: nextRuntime,
  }
}

export function getPlatformSelectorState(
  rawTargets: string[],
  selection: PlatformSelection,
): {
  osOptions: PlatformOption[]
  archOptions: PlatformOption[]
  runtimeOptions: PlatformOption[]
} {
  const normalized = coercePlatformSelection(rawTargets, selection)
  const targets = getSelectorTargets(rawTargets)
  const osValues = uniq(targets.map(target => target.os))
  const archValues = uniq(
    targets
      .filter(target => !normalized.os || target.os === normalized.os)
      .map(target => target.arch),
  )
  const runtimeValues = uniq(
    targets
      .filter(target => (!normalized.os || target.os === normalized.os) && (!normalized.arch || target.arch === normalized.arch))
      .map(target => target.runtime),
  )

  return {
    osOptions: osValues.map(value => toOsOption(value)),
    archOptions: archValues.map(value => toArchOption(value)),
    runtimeOptions: runtimeValues.map(value => toRuntimeOption(value)),
  }
}
