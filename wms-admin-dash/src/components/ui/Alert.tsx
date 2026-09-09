import type { ReactNode } from 'react'

type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

type AlertProps = {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
}

export default function Alert({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  className = '',
}: AlertProps) {
  return (
    <div className={`ui-alert ui-alert-${tone} ${className}`.trim()} role="status">
      <div className="ui-alert-body">
        {title ? <strong className="ui-alert-title">{title}</strong> : null}
        {children ? <div className="ui-alert-message">{children}</div> : null}
        {actions ? <div className="ui-alert-actions">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="ui-alert-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </div>
  )
}
