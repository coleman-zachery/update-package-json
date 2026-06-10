import type { SpaceIndentSize } from '@/lib/indentation'
import { syncNpmSupportAfterInputChange } from './npm-support'
import { syncDependencyOverridesAfterInputChange } from './overrides'
import type { TextReplacement } from './types'

export function syncPackageJsonAfterInputChange(
  previousRaw: string,
  nextRaw: string,
  spaceIndentSize?: SpaceIndentSize,
): string {
  const withSyncedOverrides = syncDependencyOverridesAfterInputChange(previousRaw, nextRaw, spaceIndentSize)
  return syncNpmSupportAfterInputChange(previousRaw, withSyncedOverrides, spaceIndentSize)
}

export function getTextReplacement(previousText: string, nextText: string): TextReplacement | null {
  if (previousText === nextText) {
    return null
  }

  let from = 0
  while (
    from < previousText.length &&
    from < nextText.length &&
    previousText.charCodeAt(from) === nextText.charCodeAt(from)
  ) {
    from += 1
  }

  let previousSuffix = previousText.length
  let nextSuffix = nextText.length
  while (
    previousSuffix > from &&
    nextSuffix > from &&
    previousText.charCodeAt(previousSuffix - 1) === nextText.charCodeAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1
    nextSuffix -= 1
  }

  return {
    from,
    to: previousSuffix,
    insert: nextText.slice(from, nextSuffix),
  }
}
