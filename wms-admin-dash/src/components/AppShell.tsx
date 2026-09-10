import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import AppearanceMenu from './AppearanceMenu'

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
  children: ReactNode
}

const ICONS: Record<string, ReactNode> = {
  companies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M4 19c.6-3.2 2.8-5 5-5s4.4 1.8 5 5" />
      <path d="M15 19c.3-1.8 1.4-3 3-3s2.4.9 2.7 2.4" />
    </svg>
  ),
  warehouses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 20V9l9-5 9 5v11" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  sftp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5M8 17h3" />
    </svg>
  ),
  uploads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V7M8 10l4-4 4 4" />
      <path d="M5 19h14" />
    </svg>
  ),
  failed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 17H9l-5 3V7a5 5 0 0 1 10 0v10z" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  routing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M8 6h8M7.5 7.5 10.5 16.5M16.5 7.5 13.5 16.5" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V5M8 19v-7M12 19V8M16 19v-4M20 19V9" />
    </svg>
  ),
  returns: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  ),
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
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
          <span className="app-mark">W</span>
          <div>
            <p className="app-sidebar-product">WMS Linker</p>
            <p className="app-sidebar-kicker">{workspaceKicker}</p>
          </div>
        </div>

        <div className="app-sidebar-workspace">
          <p>{workspace}</p>
        </div>

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
                <span className="app-nav-icon">{ICONS[item.id] || ICONS.orders}</span>
                <span className="app-nav-label">
                  <span className="app-nav-label-row">
                    {item.label}
                    {item.badge !== undefined && item.badge !== null && item.badge !== 0 && item.badge !== '0' ? (
                      <span className="app-nav-badge">{item.badge}</span>
                    ) : null}
                  </span>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="app-sidebar-user">
          <span className="app-avatar">{initials(userName) || 'U'}</span>
          <div className="app-sidebar-user-copy">
            <strong>{userName}</strong>
            {userMeta ? <span>{userMeta}</span> : null}
          </div>
          <button className="app-signout" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button className="app-menu" type="button" aria-label="Open menu" onClick={() => setOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <div className="app-topbar-copy">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="app-topbar-actions">
            <AppearanceMenu />
          </div>
        </header>
        <div className="app-content">
          <div className="app-content-inner">{children}</div>
        </div>
      </div>
    </div>
  )
}
