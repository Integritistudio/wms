import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description?: string
  count?: number | string
  actions?: ReactNode
  breadcrumb?: ReactNode
}

export default function PageHeader({ title, description, count, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        {breadcrumb ? <div className="page-header-crumb">{breadcrumb}</div> : null}
        <div className="page-header-title-row">
          <h2 className="page-header-title">{title}</h2>
          {count !== undefined && count !== null ? (
            <span className="page-header-count">{count}</span>
          ) : null}
        </div>
        {description ? <p className="page-header-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  )
}
