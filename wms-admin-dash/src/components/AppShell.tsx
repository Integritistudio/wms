import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import UserMenu from './UserMenu'

export type ShellNavItem = {
  id: string
  label: string
  hint?: string
  href?: string
  badge?: number | string
}

type AppShellProps = {
  workspace: string
  workspaceKicker?: string
  userName: string
  userMeta?: string
  title: string
  subtitle?: string
  nav: ShellNavItem[]
  activeId: string
  onNav?: (id: string) => void
  onSignOut: () => void
  topbarActions?: ReactNode
  topbarLeading?: ReactNode
  quickSync?: { onClick: () => void; busy?: boolean; label?: string } | null
  children: ReactNode
}

const MATERIAL_ICONS: Record<string, string> = {
  companies: 'apartment',
  orders: 'local_shipping',
  team: 'group',
  warehouses: 'warehouse',
  sftp: 'cloud_sync',
  uploads: 'upload_file',
  failed: 'error',
  notifications: 'notifications',
  routing: 'alt_route',
  email: 'mail',
  analytics: 'monitoring',
  returns: 'assignment_return',
  guide: 'menu_book',
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined${className ? ` ${className}` : ''}`} aria-hidden>
      {name}
    </span>
  )
}

export default function AppShell({
  workspace,
  workspaceKicker = 'Workspace',
  userName,
  userMeta,
  title,
  subtitle,
  nav,
  activeId,
  onNav,
  onSignOut,
  topbarActions,
  topbarLeading,
  quickSync,
  children,
}: AppShellProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function go(item: ShellNavItem) {
    setOpen(false)
    if (item.href) {
      void navigate({ to: item.href as never })
      return
    }
    onNav?.(item.id)
  }

  return (
    <div className={`app-shell${open ? ' is-open' : ''}`}>
      <button className="app-shell-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-left">
            <span className="app-mark">
              <MaterialIcon name="hub" />
            </span>
            <p className="app-sidebar-product">WMS Linker</p>
          </div>
          <span className="app-sidebar-version">v2.4</span>
        </div>

        <div className="app-sidebar-workspace">
          <div className="app-sidebar-workspace-meta">
            <MaterialIcon name="domain" />
            <div>
              <p>{workspace}</p>
              <span className="app-sidebar-tenant-badge">{workspaceKicker}</span>
            </div>
          </div>
          <span className="app-sidebar-live-dot" title="Active" />
        </div>

        <p className="app-nav-group-label">Core routing</p>
        <nav className="app-nav" aria-label="Workspace">
          {nav.map((item) => {
            const className = `app-nav-item${activeId === item.id ? ' is-active' : ''}`
            return (
              <button
                key={item.id}
                type="button"
                className={className}
                aria-current={activeId === item.id ? 'page' : undefined}
                onClick={() => go(item)}
              >
                <span className="app-nav-icon">
                  <MaterialIcon name={MATERIAL_ICONS[item.id] || 'chevron_right'} />
                </span>
                <span className="app-nav-label">
                  <span className="app-nav-label-row">
                    {item.label}
                    {item.badge !== undefined && item.badge !== null && item.badge !== 0 && item.badge !== '0' ? (
                      <span className="app-nav-badge">{item.badge}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-status">
            <div className="app-sidebar-status-left">
              <span className="app-sidebar-status-ping" aria-hidden />
              <span className="app-sidebar-status-code">SYS.ONLINE</span>
            </div>
            <span className="app-sidebar-status-ok">OK</span>
          </div>
          <div className="app-sidebar-user">
            <span className="app-avatar">
              <MaterialIcon name="person" />
            </span>
            <div className="app-sidebar-user-copy">
              <strong>{userName}</strong>
              {userMeta ? <span>{userMeta}</span> : null}
            </div>
            <button className="app-signout" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <MaterialIcon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <button className="app-menu" type="button" aria-label="Open menu" onClick={() => setOpen(true)}>
              <span />
              <span />
              <span />
            </button>
            <span className="app-env-chip">PROD · LIVE</span>
            {topbarLeading}
            <div className="app-topbar-copy">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <div className="app-topbar-actions">
            {/* {quickSync ? (
              <button
                className="app-quick-sync"
                type="button"
                disabled={quickSync.busy}
                onClick={quickSync.onClick}
              >
                <MaterialIcon name="sync" />
                {quickSync.busy ? 'Syncing…' : quickSync.label || 'Quick Sync'}
              </button>
            ) : null} */}
            {topbarActions}
            <UserMenu userName={userName} userMeta={userMeta} onSignOut={onSignOut} />
          </div>
        </header>
        <div className="app-content">
          <div className="app-content-inner">{children}</div>
        </div>
      </div>
    </div>
  )
}
