export interface PlatformSelection {
  os?: string
  arch?: string
  runtime?: string
}

export interface PlatformOption {
  value: string
  label: string
}

export interface PlatformResolutionIssue {
  source: 'toolbar' | 'inferred'
  requested: string
  reason: 'ambiguous' | 'no-match'
  candidates: string[]
}

interface ParsedPlatformTarget extends PlatformSelection {
  raw: string
}

const OS_LABELS: Record<string, string> = { aix: 'AIX', android: 'Android', darwin: 'macOS', freebsd: 'FreeBSD', linux: 'Linux', netbsd: 'NetBSD', openbsd: 'OpenBSD', openharmony: 'OpenHarmony', sunos: 'SunOS', wasm32: 'WebAssembly', win32: 'Windows' }
const ARCH_LABELS: Record<string, string> = { arm: 'ARM', arm64: 'ARM64', ia32: 'x86', loong64: 'LoongArch 64-bit', mips64el: 'MIPS64 little-endian', ppc64: 'PowerPC 64-bit', ppc64le: 'PowerPC 64-bit LE', riscv64: 'RISC-V 64-bit', s390x: 'IBM s390x', universal: 'Universal', x64: 'x64' }
const RUNTIME_LABELS: Record<string, string> = { eabi: 'EABI', eabihf: 'EABI hard-float', gnu: 'glibc', gnueabihf: 'GNU EABI hard-float', gnux32: 'GNU x32', musl: 'musl', musleabihf: 'musl EABI hard-float', msvc: 'MSVC', wasi: 'WASI' }
const TOKEN_ALIASES: Record<string, string> = { '32': 'ia32', '64': 'x64', amd64: 'x64', aarch64: 'arm64', armv8: 'arm64', glibc: 'gnu', loongarch64: 'loong64', mac: 'darwin', macos: 'darwin', osx: 'darwin', powerpc64le: 'ppc64le', ppc64le: 'ppc64le', win: 'win32', windows: 'win32', x86_64: 'x64' }
export const DEFAULT_PLATFORM_SELECTION: PlatformSelection = { os: 'linux', arch: 'x64', runtime: 'gnu' }

function uniq(values: Array<string | undefined>, current?: string): string[] {
  const next = new Set(values.filter(Boolean) as string[])
  if (current) next.add(current)
  return Array.from(next).sort((left, right) => left.localeCompare(right))
}

function normalizeToken(value: string): string {
  return TOKEN_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase()
}

function normalizeRuntime(token: string): string {
  if (token.startsWith('gnu')) return token === 'gnueabihf' || token === 'gnux32' ? token : 'gnu'
  if (token.startsWith('musl')) return token === 'musleabihf' ? token : 'musl'
  return token
}

function toOption(value: string, labels: Record<string, string>): PlatformOption {
  return { value, label: labels[value] ?? value }
}

export function normalizePlatformSelection(selection: PlatformSelection): PlatformSelection {
  return {
    os: selection.os ? normalizeToken(selection.os) : undefined,
    arch: selection.arch ? normalizeToken(selection.arch) : undefined,
    runtime: selection.runtime ? normalizeRuntime(normalizeToken(selection.runtime)) : undefined,
  }
}

export function parsePlatformTarget(raw: string): ParsedPlatformTarget | null {
  const tokens = raw.split('-').map(normalizeToken).filter(Boolean)
  if (tokens.length < 2 || !(tokens[0] in OS_LABELS)) return null
  const parsed: ParsedPlatformTarget = { raw, os: tokens[0], arch: tokens[1] }
  const runtimeToken = tokens.slice(2).find(token => token in RUNTIME_LABELS || token === 'glibc')
  if (runtimeToken) parsed.runtime = normalizeRuntime(runtimeToken)
  return parsed
}

export function extractPlatformSuffix(name: string): string | null {
  const packageName = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
  const parts = packageName.split('-')
  for (let index = 0; index < parts.length; index++) {
    const suffix = parts.slice(index).join('-')
    if (parsePlatformTarget(suffix)) return suffix.split('-').map(normalizeToken).join('-')
  }
  return null
}

function matchesSelection(target: ParsedPlatformTarget, selection: PlatformSelection): boolean {
  return (!selection.os || target.os === selection.os)
    && (!selection.arch || target.arch === selection.arch)
    && (!selection.runtime || !target.runtime || target.runtime === selection.runtime)
}

function selectionLabel(selection: PlatformSelection): string | null {
  const parts = [selection.os, selection.arch, selection.runtime].filter(Boolean)
  return parts.length > 0 ? parts.join('-') : null
}

function parseAvailableTargets(rawTargets: string[]): ParsedPlatformTarget[] {
  return rawTargets.map(parsePlatformTarget).filter((value): value is ParsedPlatformTarget => Boolean(value))
}

export function reconcilePlatformTargets(requestedTargets: string[], availableTargets: string[]): { selectedTargets: string[]; unresolvedTargets: string[] } {
  const parsedAvailable = parseAvailableTargets(availableTargets)
  const selectedTargets = new Set<string>()
  const unresolvedTargets = new Set<string>()
  for (const requestedTarget of requestedTargets) {
    if (availableTargets.includes(requestedTarget)) {
      selectedTargets.add(requestedTarget)
      continue
    }
    const parsedRequested = parsePlatformTarget(requestedTarget)
    const matches = parsedRequested ? parsedAvailable.filter(target => matchesSelection(target, parsedRequested)) : []
    if (matches.length === 1) selectedTargets.add(matches[0].raw)
    else unresolvedTargets.add(requestedTarget)
  }
  return { selectedTargets: Array.from(selectedTargets).sort((left, right) => left.localeCompare(right)), unresolvedTargets: Array.from(unresolvedTargets).sort((left, right) => left.localeCompare(right)) }
}

function createIssue(
  source: PlatformResolutionIssue['source'],
  requested: string | null,
  reason: PlatformResolutionIssue['reason'],
  candidates: ParsedPlatformTarget[],
): PlatformResolutionIssue[] {
  if (!requested) {
    return []
  }

  return [{
    source,
    requested,
    reason,
    candidates: candidates.map(candidate => candidate.raw).sort((left, right) => left.localeCompare(right)),
  }]
}

export function reconcilePlatformTargetsDetailed(
  requestedTargets: string[],
  availableTargets: string[],
): { selectedTargets: string[]; issues: PlatformResolutionIssue[] } {
  const parsedAvailable = parseAvailableTargets(availableTargets)
  const selectedTargets = new Set<string>()
  const issues: PlatformResolutionIssue[] = []

  for (const requestedTarget of requestedTargets) {
    if (availableTargets.includes(requestedTarget)) {
      selectedTargets.add(requestedTarget)
      continue
    }

    const parsedRequested = parsePlatformTarget(requestedTarget)
    const matches = parsedRequested ? parsedAvailable.filter(target => matchesSelection(target, parsedRequested)) : []
    if (matches.length === 1) {
      selectedTargets.add(matches[0].raw)
      continue
    }

    issues.push(...createIssue('inferred', requestedTarget, matches.length > 1 ? 'ambiguous' : 'no-match', matches))
  }

  return {
    selectedTargets: Array.from(selectedTargets).sort((left, right) => left.localeCompare(right)),
    issues,
  }
}

export function resolvePlatformSelection(
  selection: PlatformSelection,
  availableTargets: string[],
): { selectedTargets: string[]; unresolvedTargets: string[]; issues: PlatformResolutionIssue[] } {
  const normalized = normalizePlatformSelection(selection)
  const label = selectionLabel(normalized)
  if (!normalized.os || !normalized.arch) return { selectedTargets: [], unresolvedTargets: [], issues: [] }
  const matches = parseAvailableTargets(availableTargets).filter(target => matchesSelection(target, normalized))
  if (matches.length === 1) return { selectedTargets: [matches[0].raw], unresolvedTargets: [], issues: [] }
  const fallbackMatches = normalized.runtime ? parseAvailableTargets(availableTargets).filter(target => matchesSelection(target, { os: normalized.os, arch: normalized.arch })) : matches
  if (matches.length === 0 && normalized.runtime && fallbackMatches.length === 1) {
    return { selectedTargets: [fallbackMatches[0].raw], unresolvedTargets: [], issues: [] }
  }
  const reason = matches.length > 1 || fallbackMatches.length > 1 ? 'ambiguous' : 'no-match'
  const candidates = matches.length > 1 || matches.length === 1 ? matches : fallbackMatches
  return { selectedTargets: [], unresolvedTargets: label ? [label] : [], issues: createIssue('toolbar', label, reason, candidates) }
}

export function getPlatformSelectorState(rawTargets: string[], selection: PlatformSelection): { osOptions: PlatformOption[]; archOptions: PlatformOption[]; runtimeOptions: PlatformOption[] } {
  const normalized = normalizePlatformSelection(selection)
  const targets = parseAvailableTargets(rawTargets)
  const osValues = uniq(targets.length > 0 ? targets.map(target => target.os) : Object.keys(OS_LABELS), normalized.os)
  const archValues = uniq(targets.length > 0 ? targets.filter(target => !normalized.os || target.os === normalized.os).map(target => target.arch) : Object.keys(ARCH_LABELS), normalized.arch)
  const runtimeValues = uniq(targets.length > 0 ? targets.filter(target => (!normalized.os || target.os === normalized.os) && (!normalized.arch || target.arch === normalized.arch)).map(target => target.runtime) : Object.keys(RUNTIME_LABELS), normalized.runtime)
  return {
    osOptions: osValues.map(value => toOption(value, OS_LABELS)),
    archOptions: archValues.map(value => toOption(value, ARCH_LABELS)),
    runtimeOptions: runtimeValues.map(value => toOption(value, RUNTIME_LABELS)),
  }
}
