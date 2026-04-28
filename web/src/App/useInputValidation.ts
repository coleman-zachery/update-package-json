import { useEffect, useState } from 'react'
import type { InputValidationState } from '@/lib/resolver'
import { loadResolverModule } from '@/App/moduleLoaders'

const EMPTY_VALIDATION: InputValidationState = {
  errors: [],
  warnings: [],
  engineIssues: [],
}

export function useInputValidation(input: string): InputValidationState {
  const [validation, setValidation] = useState<InputValidationState>(EMPTY_VALIDATION)

  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void loadResolverModule()
        .then(({ validatePackageJsonInput }) => validatePackageJsonInput(input))
        .then(nextValidation => {
          if (!cancelled) {
            setValidation(nextValidation)
          }
        })
        .catch(error => {
          if (!cancelled) {
            setValidation({
              errors: [error instanceof Error ? error.message : String(error)],
              warnings: [],
              engineIssues: [],
            })
          }
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [input])

  return validation
}
