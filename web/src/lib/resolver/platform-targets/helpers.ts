import {
  OS_HINTS,
  OS_LABELS,
  PLATFORM_ARCH_ORDER,
  PLATFORM_OS_PRIORITY,
  PLATFORM_RUNTIME_NONE,
  PLATFORM_RUNTIME_ORDER,
  RUNTIME_HINTS,
  RUNTIME_LABELS,
  TOKEN_ALIASES,
} from './constants'
import type {
  ParsedPlatformTarget,
  PlatformOption,
  PlatformSelection,
} from './types'

export function uniq(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

export function sortValues(
  values: Array<string | undefined>,
  order: readonly string[],
): string[] {
  const orderMap = new Map(order.map((value, index) => [value, index]))

  return uniq(values).sort((left, right) => {
    const leftOrder = orderMap.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderMap.get(right) ?? Number.MAX_SAFE_INTEGER

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.localeCompare(right)
  })
}

export function sortPlatformTargets(targets: ParsedPlatformTarget[]): ParsedPlatformTarget[] {
  const osPriority = new Map<string, number>(
    PLATFORM_OS_PRIORITY.map((value, index) => [value, index]),
  )
  const archOrder = new Map<string, number>(
    PLATFORM_ARCH_ORDER.map((value, index) => [value, index]),
  )
  const runtimeOrder = new Map<string, number>(
    PLATFORM_RUNTIME_ORDER.map((value, index) => [value, index]),
  )

  return [...targets].sort((left, right) => {
    const leftPriority = osPriority.get(left.os)
    const rightPriority = osPriority.get(right.os)

    if (leftPriority != null || rightPriority != null) {
      if (leftPriority == null) return 1
      if (rightPriority == null) return -1
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
    } else {
      const osDiff = (OS_LABELS[left.os] ?? left.os).localeCompare(OS_LABELS[right.os] ?? right.os)
      if (osDiff !== 0) return osDiff
    }

    const archDiff = (archOrder.get(left.arch) ?? Number.MAX_SAFE_INTEGER)
      - (archOrder.get(right.arch) ?? Number.MAX_SAFE_INTEGER)
    if (archDiff !== 0) return archDiff

    const leftRuntime = left.runtime ?? PLATFORM_RUNTIME_NONE
    const rightRuntime = right.runtime ?? PLATFORM_RUNTIME_NONE
    const runtimeDiff = (runtimeOrder.get(leftRuntime) ?? Number.MAX_SAFE_INTEGER)
      - (runtimeOrder.get(rightRuntime) ?? Number.MAX_SAFE_INTEGER)
    if (runtimeDiff !== 0) return runtimeDiff

    return left.raw.localeCompare(right.raw)
  })
}

export function normalizeToken(value: string): string {
  return TOKEN_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase()
}

export function normalizeRuntime(token: string): string {
  if (token === PLATFORM_RUNTIME_NONE) {
    return token
  }

  if (token.startsWith('gnu')) {
    return token === 'gnueabihf' || token === 'gnux32' ? token : 'gnu'
  }

  if (token.startsWith('musl')) {
    return token === 'musleabihf' ? token : 'musl'
  }

  return token
}

export function normalizePlatformSelection(
  selection: PlatformSelection,
): PlatformSelection {
  return {
    os: selection.os ? normalizeToken(selection.os) : undefined,
    arch: selection.arch ? normalizeToken(selection.arch) : undefined,
    runtime: selection.runtime
      ? normalizeRuntime(normalizeToken(selection.runtime))
      : undefined,
  }
}

export function toPlatformOption(target: ParsedPlatformTarget): PlatformOption {
  const group = OS_LABELS[target.os] ?? target.os
  const runtimeLabel = target.runtime ? (RUNTIME_LABELS[target.runtime] ?? target.runtime) : undefined
  const groupHint = OS_HINTS[target.os as keyof typeof OS_HINTS]
  const runtimeHint = target.runtime
    ? RUNTIME_HINTS[target.runtime as keyof typeof RUNTIME_HINTS]
    : undefined

  return {
    value: target.raw,
    group,
    groupHint: groupHint && groupHint.toLowerCase() !== group.toLowerCase() ? groupHint : undefined,
    label: target.arch,
    hint: runtimeLabel ? `+ ${runtimeLabel}` : undefined,
    hintDetail: runtimeHint && runtimeHint.toLowerCase() !== runtimeLabel?.toLowerCase()
      ? runtimeHint
      : undefined,
    selectedLabel: runtimeLabel
      ? `${group} ${target.arch} + ${runtimeLabel}`
      : `${group} ${target.arch}`,
  }
}

export function parsePlatformTarget(raw: string): ParsedPlatformTarget | null {
  const tokens = raw.split('-').map(normalizeToken).filter(Boolean)
  if (tokens.length < 2 || !(tokens[0] in OS_LABELS)) {
    return null
  }

  const parsed: ParsedPlatformTarget = {
    raw: tokens.join('-'),
    os: tokens[0],
    arch: tokens[1],
  }
  const runtimeToken = tokens
    .slice(2)
    .find(token => token in RUNTIME_LABELS || token === 'glibc')

  if (runtimeToken) {
    parsed.runtime = normalizeRuntime(runtimeToken)
  }

  return parsed
}

export function extractPlatformSuffix(name: string): string | null {
  const packageName = name.includes('/')
    ? name.slice(name.indexOf('/') + 1)
    : name
  const parts = packageName.split('-')

  for (let index = 0; index < parts.length; index += 1) {
    const suffix = parts.slice(index).join('-')
    if (parsePlatformTarget(suffix)) {
      return suffix.split('-').map(normalizeToken).join('-')
    }
  }

  return null
}

export function matchesSelection(
  target: ParsedPlatformTarget,
  selection: PlatformSelection,
): boolean {
  const expectsRuntimeNone = selection.runtime === PLATFORM_RUNTIME_NONE

  return (!selection.os || target.os === selection.os)
    && (!selection.arch || target.arch === selection.arch)
    && (
      !selection.runtime
      || (expectsRuntimeNone ? !target.runtime : target.runtime === selection.runtime)
    )
}

export function selectionLabel(selection: PlatformSelection): string | null {
  const parts = [
    selection.os,
    selection.arch,
    selection.runtime && selection.runtime !== PLATFORM_RUNTIME_NONE ? selection.runtime : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('-') : null
}

export function parseAvailableTargets(rawTargets: string[]): ParsedPlatformTarget[] {
  return rawTargets
    .map(parsePlatformTarget)
    .filter((value): value is ParsedPlatformTarget => Boolean(value))
}

export function getOsValues(values: Array<string | undefined>): string[] {
  const uniqueValues = uniq(values)
  const priority = Array.from(PLATFORM_OS_PRIORITY) as string[]
  const prioritySet = new Set<string>(priority)
  const remaining = uniqueValues
    .filter(value => !prioritySet.has(value))
    .sort((left, right) => (OS_LABELS[left] ?? left).localeCompare(OS_LABELS[right] ?? right))

  return [
    ...priority.filter(value => uniqueValues.includes(value)),
    ...remaining,
  ]
}

export function getArchValues(values: Array<string | undefined>): string[] {
  return sortValues(values, PLATFORM_ARCH_ORDER)
}

export function getRuntimeValues(values: Array<string | undefined>): string[] {
  return sortValues(values, PLATFORM_RUNTIME_ORDER)
}
