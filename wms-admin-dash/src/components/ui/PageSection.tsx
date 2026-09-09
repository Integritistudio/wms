import type { ReactNode } from 'react'

type PageSectionProps = {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}

export default function PageSection({
  title,
  description,
  actions,
  children,
  className = '',
  flush,
}: PageSectionProps) {
  return (
    <section className={`demo-panel${flush ? ' is-flush' : ''} ${className}`.trim()}>
      {(title || actions) && (
        <div className="demo-panel-head">
          <div>
            {title ? <h3 className="demo-panel-title">{title}</h3> : null}
            {description ? <p className="demo-panel-desc">{description}</p> : null}
          </div>
          {actions ? <div className="demo-action-group">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}
