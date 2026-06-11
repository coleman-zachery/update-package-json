import { useEffect, useState } from 'react'
import type { EngineName } from '@/lib/resolver'
import { fetchLatestNodeVersion, fetchLatestNpmVersion } from '@/lib/npm'

const EMPTY_LATEST_VERSIONS: Record<EngineName, string> = {
  node: '',
  npm: '',
}

export function useLatestVersions(): Record<EngineName, string> {
  const [latestVersions, setLatestVersions] = useState<Record<EngineName, string>>(EMPTY_LATEST_VERSIONS)

  useEffect(() => {
    let cancelled = false

    void Promise.allSettled([fetchLatestNodeVersion(), fetchLatestNpmVersion()])
      .then(([nodeResult, npmResult]) => {
        if (cancelled) {
          return
        }

        setLatestVersions(current => ({
          node: nodeResult.status === 'fulfilled' ? nodeResult.value : current.node,
          npm: npmResult.status === 'fulfilled' ? npmResult.value : current.npm,
        }))
      })
      .catch(() => {
        // Ignore background metadata lookup failures.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return latestVersions
}
