import { useState, type ReactNode } from 'react'

export type ShellNavItem = {
  id: string
  label: string
  hint?: string
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
  onNav: (id: string) => void
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
  const [open, setOpen] = useState(false)

  function select(id: string) {
    onNav(id)
    setOpen(false)
  }

  return (
    <div className={`app-shell${open ? ' is-open' : ''}`}>
      <button className="app-shell-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="login-mark">W</span>
          <div>
            <p className="app-sidebar-product">WMS Linker</p>
            <p className="app-sidebar-kicker">{workspaceKicker}</p>
          </div>
        </div>

        <div className="app-sidebar-workspace">
          <p>{workspace}</p>
        </div>

        <nav className="app-nav" aria-label="Workspace">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`app-nav-item${activeId === item.id ? ' is-active' : ''}`}
              type="button"
              onClick={() => select(item.id)}
            >
              <span className="app-nav-icon">{ICONS[item.id] || ICONS.orders}</span>
              <span>
                {item.label}
                {item.hint ? <small>{item.hint}</small> : null}
              </span>
            </button>
          ))}
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
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </header>
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
