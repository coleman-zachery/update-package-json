import { useEffect, useMemo, useState } from 'react'
import {
  coercePlatformSelection,
  DEFAULT_PLATFORM_SELECTION,
  getPlatformSelectorState,
  normalizePlatformSelection,
  updatePlatformSelection,
  type PlatformSelection,
} from '@/lib/resolver/platform-targets'

const PLATFORM_SELECTION_STORAGE_KEY = 'upj-platform-selection'

function readStoredPlatformSelection(): PlatformSelection {
  try {
    const raw = localStorage.getItem(PLATFORM_SELECTION_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PLATFORM_SELECTION
    }

    const parsed = JSON.parse(raw)
    return normalizePlatformSelection(
      parsed && typeof parsed === 'object' ? parsed : DEFAULT_PLATFORM_SELECTION,
    )
  } catch {
    return DEFAULT_PLATFORM_SELECTION
  }
}

function writeStoredPlatformSelection(selection: PlatformSelection) {
  try {
    localStorage.setItem(
      PLATFORM_SELECTION_STORAGE_KEY,
      JSON.stringify(normalizePlatformSelection(selection)),
    )
  } catch {
    // ignore storage failures
  }
}

function isSameSelection(left: PlatformSelection, right: PlatformSelection): boolean {
  return left.os === right.os
    && left.arch === right.arch
    && left.runtime === right.runtime
}

export function usePlatformSelection(platformAvailableTargets: string[]) {
  const [platformSelection, setPlatformSelection] = useState<PlatformSelection>(() => (
    readStoredPlatformSelection()
  ))

  const platformSelectorState = useMemo(
    () => getPlatformSelectorState(platformAvailableTargets, platformSelection),
    [platformAvailableTargets, platformSelection],
  )

  useEffect(() => {
    const nextSelection = coercePlatformSelection(platformAvailableTargets, platformSelection)
    if (isSameSelection(nextSelection, platformSelection)) {
      return
    }

    setPlatformSelection(nextSelection)
    writeStoredPlatformSelection(nextSelection)
  }, [platformAvailableTargets, platformSelection])

  function handlePlatformSelectionChange(
    value: string,
  ) {
    const nextSelection = updatePlatformSelection(
      platformAvailableTargets,
      platformSelection,
      value,
    )
    setPlatformSelection(nextSelection)
    writeStoredPlatformSelection(nextSelection)
  }

  return {
    platformSelection,
    platformSelectorState,
    handlePlatformSelectionChange,
  }
}
