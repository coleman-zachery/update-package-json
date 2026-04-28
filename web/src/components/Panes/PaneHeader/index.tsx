import type { ReactNode } from 'react'
import './index.css'

interface Props {
  start: ReactNode
  actions?: ReactNode
}

export function PaneHeader({ start, actions }: Props) {
  return (
    <div className="pane-header">
      <div className="pane-header__start">{start}</div>
      {actions ? <div className="pane-header__actions">{actions}</div> : null}
    </div>
  )
}
