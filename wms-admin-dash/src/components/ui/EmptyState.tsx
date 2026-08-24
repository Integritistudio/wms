import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  message?: string
  icon?: ReactNode
}

export default function EmptyState({ title, message, icon }: EmptyStateProps) {
  return (
    <div className="demo-empty">
      {icon ? <div>{icon}</div> : null}
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
    </div>
  )
}
