import type { ResolveProgress } from '@/lib/resolver'
import './index.css'

interface Props {
  message: string
  loading?: boolean
  progress?: ResolveProgress | null
}

export function PaneState({ message, loading = false, progress = null }: Props) {
  const total = progress?.total ?? 0
  const completed = progress?.completed ?? 0
  const percent = total > 0 ? Math.max(0, Math.min(100, (completed / total) * 100)) : 0

  return (
    <div className="pane-state">
      {loading ? (
        total > 0 ? (
          <div
            className="pane-state__progress"
            role="progressbar"
            aria-label={message}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
          >
            <div className="pane-state__progress-track">
              <div className="pane-state__progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : (
          <div className="pane-state__spinner" />
        )
      ) : null}
      <p>{message}</p>
    </div>
  )
}
