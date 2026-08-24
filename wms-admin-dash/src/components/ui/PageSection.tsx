import type { ReactNode } from 'react'

type PageSectionProps = {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export default function PageSection({ title, description, actions, children, className = '' }: PageSectionProps) {
  return (
    <section className={`demo-panel ${className}`.trim()}>
      <div className="demo-panel-head">
        <div>
          <h3 className="demo-panel-title">{title}</h3>
          {description ? <p className="demo-panel-desc">{description}</p> : null}
        </div>
        {actions ? <div className="demo-action-group">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
