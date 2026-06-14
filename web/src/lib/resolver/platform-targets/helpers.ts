import {
  ARCH_HINTS,
  ARCH_LABELS,
  FALLBACK_OS_ARCH_OPTIONS,
  FALLBACK_RUNTIME_OPTIONS,
  OS_HINTS,
  OS_LABELS,
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
  const next = new Set(values.filter(Boolean) as string[])
  return Array.from(next).sort((left, right) => left.localeCompare(right))
}

export function normalizeToken(value: string): string {
  return TOKEN_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase()
}

export function normalizeRuntime(token: string): string {
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

export function toOsOption(value: string): PlatformOption {
  return {
    value,
    label: OS_LABELS[value] ?? value,
    hint: OS_HINTS[value as keyof typeof OS_HINTS],
  }
}

export function toArchOption(value: string): PlatformOption {
  return {
    value,
    label: ARCH_LABELS[value] ?? value,
    hint: ARCH_HINTS[value as keyof typeof ARCH_HINTS],
  }
}

export function toRuntimeOption(value: string): PlatformOption {
  return {
    value,
    label: RUNTIME_LABELS[value] ?? value,
    hint: RUNTIME_HINTS[value as keyof typeof RUNTIME_HINTS],
  }
}

export function parsePlatformTarget(raw: string): ParsedPlatformTarget | null {
  const tokens = raw.split('-').map(normalizeToken).filter(Boolean)
  if (tokens.length < 2 || !(tokens[0] in OS_LABELS)) {
    return null
  }

  const parsed: ParsedPlatformTarget = {
    raw,
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
  return (!selection.os || target.os === selection.os)
    && (!selection.arch || target.arch === selection.arch)
    && (!selection.runtime || !target.runtime || target.runtime === selection.runtime)
}

export function selectionLabel(selection: PlatformSelection): string | null {
  const parts = [selection.os, selection.arch, selection.runtime].filter(Boolean)
  return parts.length > 0 ? parts.join('-') : null
}

export function parseAvailableTargets(rawTargets: string[]): ParsedPlatformTarget[] {
  return rawTargets
    .map(parsePlatformTarget)
    .filter((value): value is ParsedPlatformTarget => Boolean(value))
}

export function buildFallbackTargets(): ParsedPlatformTarget[] {
  const targets: ParsedPlatformTarget[] = []

  for (const [os, archValues] of Object.entries(FALLBACK_OS_ARCH_OPTIONS)) {
    for (const arch of archValues ?? []) {
      const runtimeKey = `${os}-${arch}`
      const runtimes = FALLBACK_RUNTIME_OPTIONS[runtimeKey]

      if (!runtimes || runtimes.length === 0) {
        targets.push({ raw: runtimeKey, os, arch })
        continue
      }

      for (const runtime of runtimes) {
        targets.push({
          raw: `${runtimeKey}-${runtime}`,
          os,
          arch,
          runtime,
        })
      }
    }
  }

  return targets
}

export function getSelectorTargets(rawTargets: string[]): ParsedPlatformTarget[] {
  const parsedTargets = parseAvailableTargets(rawTargets)
  return parsedTargets.length > 0 ? parsedTargets : buildFallbackTargets()
}

export function getFirstValue(values: string[]): string | undefined {
  return values[0]
}
