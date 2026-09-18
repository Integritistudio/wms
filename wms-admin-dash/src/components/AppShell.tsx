import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
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
  userEmail?: string
  userRole?: string
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

const SIDEBAR_COLLAPSED_KEY = 'wms-sidebar-collapsed'

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

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export default function AppShell({
  workspace,
  workspaceKicker = 'Workspace',
  userName,
  userMeta,
  userEmail,
  userRole,
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
  const [collapsed, setCollapsed] = useState(false)
  const email = userEmail?.trim() || ''
  const role = userRole?.trim() || ''
  const hasSplitMeta = Boolean(email || role)

  useEffect(() => {
    setCollapsed(readCollapsed())
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  function go(item: ShellNavItem) {
    setOpen(false)
    if (item.href) {
      void navigate({ to: item.href as never })
      return
    }
    onNav?.(item.id)
  }

  return (
    <div className={`app-shell${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <button className="app-shell-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-left">
            <span className="app-mark" title="WMS Linker">
              <MaterialIcon name="hub" />
            </span>
            <div className="app-sidebar-brand-copy">
              <p className="app-sidebar-product">WMS Linker</p>
              <span className="app-sidebar-version">v2.4</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="app-sidebar-collapse"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MaterialIcon name={collapsed ? 'chevron_right' : 'chevron_left'} />
        </button>

        <div className="app-sidebar-workspace" title={`${workspace}${workspaceKicker ? ` · ${workspaceKicker}` : ''}`}>
          <span className="app-sidebar-workspace-name">{workspace}</span>
        </div>

        <nav className="app-nav" aria-label="Workspace">
          {nav.map((item) => {
            const className = `app-nav-item${activeId === item.id ? ' is-active' : ''}`
            const tip = item.hint ? `${item.label} — ${item.hint}` : item.label
            return (
              <button
                key={item.id}
                type="button"
                className={className}
                aria-current={activeId === item.id ? 'page' : undefined}
                aria-label={item.label}
                data-tooltip={collapsed ? tip : undefined}
                onClick={() => go(item)}
              >
                <span className="app-nav-icon">
                  <MaterialIcon name={MATERIAL_ICONS[item.id] || 'chevron_right'} />
                </span>
                <span className="app-nav-label">{item.label}</span>
                {item.badge !== undefined && item.badge !== null && item.badge !== 0 && item.badge !== '0' ? (
                  <span className="app-nav-badge">{item.badge}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-user" title={[userName, email, role].filter(Boolean).join(' · ')}>
            <span className="app-avatar" title="Online">
              <MaterialIcon name="person" />
              <span className="app-avatar-status" aria-hidden />
            </span>
            <div className="app-sidebar-user-copy">
              <strong>{userName}</strong>
              {hasSplitMeta ? (
                <>
                  {email ? <span className="app-sidebar-user-email">{email}</span> : null}
                  {role ? <span className="app-sidebar-user-role">{role}</span> : null}
                </>
              ) : userMeta ? (
                <span>{userMeta}</span>
              ) : null}
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
            <UserMenu
              userName={userName}
              userMeta={userMeta}
              userEmail={userEmail}
              userRole={userRole}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        <div className="app-content">
          <div className="app-content-inner">{children}</div>
        </div>
      </div>
    </div>
  )
}
