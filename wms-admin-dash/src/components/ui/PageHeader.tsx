import type { ReactNode } from 'react'
import PageBanner, { bannerVariant } from './PageBanner'

type PageHeaderProps = {
  title: string
  description?: string
  count?: number | string
  actions?: ReactNode
  breadcrumb?: ReactNode
  stats?: ReactNode
}

export default function PageHeader({ title, description, count, actions, breadcrumb, stats }: PageHeaderProps) {
  return (
    <PageBanner className="page-header" variant={bannerVariant(title)} label={title} stats={stats}>
      <div className="page-header-copy">
        <div className="page-header-crumb">{breadcrumb || <>Workspace <span aria-hidden="true">/</span> <strong>{title}</strong></>}</div>
        <div className="page-header-title-row">
          <h1 className="page-header-title">{title}</h1>
          {count !== undefined && count !== null ? (
            <span className="page-header-count">{count}</span>
          ) : null}
        </div>
        {description ? <p className="page-header-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </PageBanner>
  )
}
