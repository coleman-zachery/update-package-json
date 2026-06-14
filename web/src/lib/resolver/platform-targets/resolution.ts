import {
  matchesSelection,
  normalizePlatformSelection,
  parseAvailableTargets,
  parsePlatformTarget,
  selectionLabel,
} from './helpers'
import type {
  ParsedPlatformTarget,
  PlatformResolutionIssue,
  PlatformSelection,
} from './types'

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
    candidates: candidates
      .map(candidate => candidate.raw)
      .sort((left, right) => left.localeCompare(right)),
  }]
}

export function reconcilePlatformTargets(
  requestedTargets: string[],
  availableTargets: string[],
): { selectedTargets: string[]; unresolvedTargets: string[] } {
  const parsedAvailable = parseAvailableTargets(availableTargets)
  const selectedTargets = new Set<string>()
  const unresolvedTargets = new Set<string>()

  for (const requestedTarget of requestedTargets) {
    if (availableTargets.includes(requestedTarget)) {
      selectedTargets.add(requestedTarget)
      continue
    }

    const parsedRequested = parsePlatformTarget(requestedTarget)
    const matches = parsedRequested
      ? parsedAvailable.filter(target => matchesSelection(target, parsedRequested))
      : []
    if (matches.length === 1) {
      selectedTargets.add(matches[0].raw)
    } else {
      unresolvedTargets.add(requestedTarget)
    }
  }

  return {
    selectedTargets: Array.from(selectedTargets).sort((left, right) => left.localeCompare(right)),
    unresolvedTargets: Array.from(unresolvedTargets).sort((left, right) => left.localeCompare(right)),
  }
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
    const matches = parsedRequested
      ? parsedAvailable.filter(target => matchesSelection(target, parsedRequested))
      : []
    if (matches.length === 1) {
      selectedTargets.add(matches[0].raw)
      continue
    }

    issues.push(
      ...createIssue(
        'inferred',
        requestedTarget,
        matches.length > 1 ? 'ambiguous' : 'no-match',
        matches,
      ),
    )
  }

  return {
    selectedTargets: Array.from(selectedTargets).sort((left, right) => left.localeCompare(right)),
    issues,
  }
}

export function resolvePlatformSelection(
  selection: PlatformSelection,
  availableTargets: string[],
): {
  selectedTargets: string[]
  unresolvedTargets: string[]
  issues: PlatformResolutionIssue[]
} {
  const normalized = normalizePlatformSelection(selection)
  const label = selectionLabel(normalized)
  if (!normalized.os || !normalized.arch) {
    return { selectedTargets: [], unresolvedTargets: [], issues: [] }
  }

  const parsedTargets = parseAvailableTargets(availableTargets)
  const matches = parsedTargets.filter(target => matchesSelection(target, normalized))
  if (matches.length === 1) {
    return { selectedTargets: [matches[0].raw], unresolvedTargets: [], issues: [] }
  }

  const fallbackMatches = normalized.runtime
    ? parsedTargets.filter(target => matchesSelection(target, {
      os: normalized.os,
      arch: normalized.arch,
    }))
    : matches
  if (matches.length === 0 && normalized.runtime && fallbackMatches.length === 1) {
    return { selectedTargets: [fallbackMatches[0].raw], unresolvedTargets: [], issues: [] }
  }

  const reason = matches.length > 1 || fallbackMatches.length > 1
    ? 'ambiguous'
    : 'no-match'
  const candidates = matches.length > 0 ? matches : fallbackMatches

  return {
    selectedTargets: [],
    unresolvedTargets: label ? [label] : [],
    issues: createIssue('toolbar', label, reason, candidates),
  }
}
