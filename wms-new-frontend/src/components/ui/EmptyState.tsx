import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  message?: string
  icon?: ReactNode
  action?: ReactNode
}

export default function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="demo-empty">
      {icon ? <div className="demo-empty-icon">{icon}</div> : null}
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {action ? <div className="demo-empty-action">{action}</div> : null}
    </div>
  )
}
