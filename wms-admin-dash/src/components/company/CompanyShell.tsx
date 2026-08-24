import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import AppShell, { type ShellNavItem } from '../AppShell'
import { useCompanyPortal } from './CompanyPortalContext'
import { clearCompanySession, getCompanySession } from '../../lib/auth'

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  orders: { title: 'Orders', subtitle: 'Search, filter, allocate, and ship' },
  returns: { title: 'Returns', subtitle: 'RMA, receive, restock, and close' },
  failed: { title: 'Failed Orders', subtitle: 'Orders that need manual intervention' },
  notifications: { title: 'Notifications', subtitle: 'In-app alerts for order events' },
  team: { title: 'Users', subtitle: 'Invite company and warehouse users' },
  warehouses: { title: 'Warehouses', subtitle: 'Locations assigned to Shopify stores' },
  sftp: { title: 'SFTP', subtitle: 'Named connections warehouses can share' },
  routing: { title: 'Order Routing', subtitle: 'Auto-assign warehouses with rules' },
  email: { title: 'Email Settings', subtitle: 'SMTP for notification delivery' },
}

const ROOT_ONLY_PREFIXES = [
  '/account/team',
  '/account/warehouses',
  '/account/sftp',
  '/account/routing',
  '/account/email',
] as const

type CompanyShellProps = {
  activeId: keyof typeof PAGE_META
  children: ReactNode
}

export default function CompanyShell({ activeId, children }: CompanyShellProps) {
  const navigate = useNavigate()
  const session = getCompanySession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const {
    company,
    currentUser,
    isRoot: contextIsRoot,
    failedCount,
    unreadNotifCount,
    error,
    notice,
    inviteUrl,
    setInviteUrl,
  } = useCompanyPortal()

  const role = currentUser?.role || session?.user.role || 'member'
  const isRoot = contextIsRoot || role === 'root'
  const roleLabel = role === 'root' ? 'User' : role === 'warehouse' ? 'Warehouse' : 'Member'
  const meta = PAGE_META[activeId]

  useEffect(() => {
    // Wait until we know the user before enforcing root-only pages.
    if (!currentUser && !session?.user.role) return
    if (isRoot) return
    if (ROOT_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      void navigate({ to: '/account/orders' })
    }
  }, [currentUser, session?.user.role, isRoot, pathname, navigate])

  const nav: ShellNavItem[] = [
    { id: 'orders', label: 'Orders', hint: '940s and shipments', href: '/account/orders' },
    { id: 'returns', label: 'Returns', hint: 'RMA and restock', href: '/account/returns' },
    {
      id: 'failed',
      label: 'Failed',
      hint: failedCount > 0 ? 'Needs attention' : 'DLQ',
      href: '/account/failed',
      badge: failedCount > 0 ? failedCount : undefined,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      hint: 'Alerts',
      href: '/account/notifications',
      badge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
    },
    ...(isRoot
      ? [
          { id: 'team', label: 'Users', hint: 'Invites and access', href: '/account/team' },
          { id: 'warehouses', label: 'Warehouses', href: '/account/warehouses' },
          { id: 'sftp', label: 'SFTP', hint: 'Push 940 files', href: '/account/sftp' },
          { id: 'routing', label: 'Routing', hint: 'Auto warehouse rules', href: '/account/routing' },
          { id: 'email', label: 'Email Settings', hint: 'SMTP config', href: '/account/email' },
        ]
      : []),
  ]

  return (
    <AppShell
      workspace={company?.name || session?.user.companyName || 'Company'}
      workspaceKicker="Company portal"
      userName={currentUser?.name || session?.user.name || session?.user.email || 'User'}
      userMeta={`${currentUser?.email || session?.user.email || ''} · ${roleLabel}`}
      title={meta.title}
      subtitle={meta.subtitle}
      nav={nav}
      activeId={activeId}
      onSignOut={() => {
        clearCompanySession()
        void navigate({ to: '/account/login' })
      }}
    >
      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}
      {notice ? <p className="demo-muted mb-4">{notice}</p> : null}
      {inviteUrl ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="invite-url">
            Invite URL
          </label>
          <input id="invite-url" className="demo-input min-w-[18rem] flex-1" readOnly value={inviteUrl} />
          <button
            className="demo-button demo-button-secondary"
            type="button"
            onClick={() => void navigator.clipboard.writeText(inviteUrl)}
          >
            Copy link
          </button>
          <button className="demo-btn demo-btn-ghost demo-btn-sm" type="button" onClick={() => setInviteUrl('')}>
            Dismiss
          </button>
        </div>
      ) : null}
      {children}
    </AppShell>
  )
}
