import './index.css'

interface Props {
  message: string
  loading?: boolean
}

export function PaneState({ message, loading = false }: Props) {
  return (
    <div className="pane-state">
      {loading && <div className="pane-state__spinner" />}
      <p>{message}</p>
    </div>
  )
}
