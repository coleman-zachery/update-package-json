export interface PlatformSelection {
  os?: string
  arch?: string
  runtime?: string
}

export interface PlatformOption {
  value: string
  label: string
  hint?: string
  group?: string
  groupHint?: string
  hintDetail?: string
  selectedLabel?: string
}

export interface PlatformResolutionIssue {
  source: 'toolbar' | 'inferred'
  requested: string
  reason: 'ambiguous' | 'no-match'
  candidates: string[]
}

export interface ParsedPlatformTarget {
  raw: string
  os: string
  arch: string
  runtime?: string
}
