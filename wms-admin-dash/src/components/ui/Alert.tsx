import { useEffect, useRef, type ReactNode } from 'react'

type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

type AlertProps = {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  /** Auto-clear after ms when onDismiss is set. Default 6000. Pass 0/false to keep until closed. */
  autoDismissMs?: number | false
  className?: string
}

const DEFAULT_AUTO_DISMISS_MS = 6000

export default function Alert({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  autoDismissMs,
  className = '',
}: AlertProps) {
  const dismissAfter =
    onDismiss && autoDismissMs !== false && autoDismissMs !== 0
      ? Number(autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS)
      : 0

  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const messageKey = typeof children === 'string' || typeof children === 'number' ? String(children) : title || ''

  useEffect(() => {
    if (!onDismissRef.current || dismissAfter <= 0) return
    const timer = window.setTimeout(() => onDismissRef.current?.(), dismissAfter)
    return () => window.clearTimeout(timer)
  }, [dismissAfter, messageKey, title])

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
