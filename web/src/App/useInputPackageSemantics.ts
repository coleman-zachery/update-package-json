import semver from 'semver'
import { useEffect, useRef, useState } from 'react'
import { parsePackageJson } from '@/lib/package-json'
import { extractPlatformSuffix } from '@/lib/resolver/platform-targets'
import {
  analyzeInputDependency,
  collectDependencyLineSignatures,
  collectInputDependencyEntries,
  type InputDependencyAnalysisEntry,
} from '@/App/inputDependencySemantics'

interface InputPackageSemanticsState {
  transitiveDependencyNames: string[]
  unresolvedDependencyNames: string[]
}

const EMPTY_STATE: InputPackageSemanticsState = {
  transitiveDependencyNames: [],
  unresolvedDependencyNames: [],
}

export function useInputPackageSemantics(input: string): InputPackageSemanticsState {
  const [state, setState] = useState<InputPackageSemanticsState>(EMPTY_STATE)
  const lastSuccessfulRef = useRef<{
    lineSignatures: Map<string, string>
    analyses: Map<string, InputDependencyAnalysisEntry>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        if (!input.trim()) {
          lastSuccessfulRef.current = {
            lineSignatures: new Map(),
            analyses: new Map(),
          }
          setState(EMPTY_STATE)
          return
        }

        let pkg
        try {
          pkg = parsePackageJson(input)
        } catch {
          return
        }

        const entries = collectInputDependencyEntries(pkg)
        const nextLineSignatures = collectDependencyLineSignatures(input)
        const previous = lastSuccessfulRef.current
        const nextAnalyses = new Map<string, InputDependencyAnalysisEntry>()
        const changedNames = new Set<string>()

        for (const entry of entries) {
          const nextSignature = nextLineSignatures.get(entry.name) ?? ''
          const previousSignature = previous?.lineSignatures.get(entry.name) ?? null
          if (previousSignature === nextSignature) {
            const previousAnalysis = previous?.analyses.get(entry.name)
            if (previousAnalysis) {
              nextAnalyses.set(entry.name, previousAnalysis)
              continue
            }
          }
          changedNames.add(entry.name)
        }

        const changedEntries = entries.filter(entry => changedNames.has(entry.name))
        const changedResults = await Promise.allSettled(
          changedEntries.map(async entry => ({
            name: entry.name,
            analysis: await analyzeInputDependency(entry, abortController.signal),
          })),
        )

        for (const [index, result] of changedResults.entries()) {
          if (result.status === 'fulfilled') {
            nextAnalyses.set(result.value.name, result.value.analysis)
            continue
          }

          const failedEntryName = changedEntries[index]?.name
          if (!failedEntryName) {
            continue
          }

          const previousAnalysis = previous?.analyses.get(failedEntryName)
          if (previousAnalysis) {
            nextAnalyses.set(failedEntryName, previousAnalysis)
          } else {
            nextAnalyses.set(failedEntryName, {
              missing: true,
              resolvedVersion: null,
              dependencyRanges: {},
            })
          }
        }

        if (cancelled || abortController.signal.aborted) {
          return
        }

        const platformNames = new Set(
          entries.map(entry => entry.name).filter(name => Boolean(extractPlatformSuffix(name))),
        )
        const declaredNames = new Set(entries.map(entry => entry.name))
        const unresolvedNames = new Set(
          entries
            .map(entry => entry.name)
            .filter(name => nextAnalyses.get(name)?.missing),
        )
        const resolvedVersions = new Map(
          entries
            .map(entry => [entry.name, nextAnalyses.get(entry.name)?.resolvedVersion ?? null] as const)
            .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
        )
        const transitiveNames = new Set<string>()

        for (const entry of entries) {
          const analysis = nextAnalyses.get(entry.name)
          if (!analysis || platformNames.has(entry.name) || unresolvedNames.has(entry.name)) {
            continue
          }

          for (const [targetName, range] of Object.entries(analysis.dependencyRanges)) {
            const targetVersion = resolvedVersions.get(targetName)
            if (
              !targetVersion
              || !declaredNames.has(targetName)
              || platformNames.has(targetName)
              || unresolvedNames.has(targetName)
            ) {
              continue
            }

            if (range && targetName !== entry.name) {
              try {
                if (range === '*' || range === 'latest' || range === 'workspace:*') {
                  transitiveNames.add(targetName)
                } else if (range.startsWith('workspace:')) {
                  transitiveNames.add(targetName)
                } else if (semver.validRange(range) && semver.satisfies(targetVersion, range)) {
                  transitiveNames.add(targetName)
                }
              } catch {
                continue
              }
            }
          }
        }

        if (!cancelled) {
          lastSuccessfulRef.current = {
            lineSignatures: nextLineSignatures,
            analyses: nextAnalyses,
          }
          setState({
            transitiveDependencyNames: Array.from(transitiveNames).sort((left, right) => left.localeCompare(right)),
            unresolvedDependencyNames: Array.from(unresolvedNames).sort((left, right) => left.localeCompare(right)),
          })
        }
      })()
    }, 1000)

    return () => {
      cancelled = true
      abortController.abort()
      window.clearTimeout(timeoutId)
    }
  }, [input])

  return state
}
