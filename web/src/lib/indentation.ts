export interface IndentStyle {
  kind: 'space' | 'tab'
  size: number
}

export type SpaceIndentSize = 2 | 4

const DEFAULT_INDENT_STYLE: IndentStyle = {
  kind: 'space',
  size: 2,
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)

  while (y !== 0) {
    const next = x % y
    x = y
    y = next
  }

  return x || 1
}

function detectSpaceIndentSize(widths: number[]): number {
  if (widths.length === 0) return DEFAULT_INDENT_STYLE.size

  return widths.reduce((current, width) => gcd(current, width))
}

export function detectIndentStyle(raw: string): IndentStyle {
  const lines = raw.split(/\r?\n/)
  const tabIndents: number[] = []
  const spaceIndents: number[] = []

  for (const line of lines) {
    const match = line.match(/^([ \t]+)/)
    if (!match) continue

    const indent = match[1]
    if (/^\t+$/.test(indent)) {
      tabIndents.push(indent.length)
      continue
    }

    if (/^ +$/.test(indent)) {
      spaceIndents.push(indent.length)
    }
  }

  if (tabIndents.length > spaceIndents.length) {
    const visualSize = spaceIndents.length > 0 ? detectSpaceIndentSize(spaceIndents) : 4
    return {
      kind: 'tab',
      size: visualSize,
    }
  }

  if (spaceIndents.length > 0) {
    return {
      kind: 'space',
      size: Math.max(1, detectSpaceIndentSize(spaceIndents)),
    }
  }

  return DEFAULT_INDENT_STYLE
}

export function createSpaceIndentStyle(size: SpaceIndentSize): IndentStyle {
  return {
    kind: 'space',
    size,
  }
}

export function detectSupportedSpaceIndentSize(raw: string): SpaceIndentSize {
  const detected = detectIndentStyle(raw)
  return detected.kind === 'space' && (detected.size === 2 || detected.size === 4)
    ? detected.size
    : 2
}

export function getEffectiveIndentStyle(raw: string, spaceIndentSize?: SpaceIndentSize): IndentStyle {
  return spaceIndentSize ? createSpaceIndentStyle(spaceIndentSize) : detectIndentStyle(raw)
}

export function getIndentText(style: IndentStyle): string {
  return style.kind === 'tab' ? '\t' : ' '.repeat(style.size)
}
