import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, type ReactNode } from 'react'
import AppShell, { type ShellNavItem } from '../AppShell'
import { useCompanyPortal } from './CompanyPortalContext'
import { clearCompanySession, getCompanySession } from '../../lib/auth'

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  analytics: { title: 'Analytics', subtitle: 'Orders, transit, warehouses, and returns' },
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
  const permissions = useMemo(() => {
    if (isRoot) {
      return {
        orders: true,
        returns: true,
        failed: true,
        warehouses: true,
        sftp: true,
        routing: true,
        email: true,
        analytics: true,
      }
    }
    return (currentUser?.permissions || (session?.user as any)?.permissions || {}) as Record<string, boolean>
  }, [isRoot, currentUser, session])

  const roleLabel = role === 'root' ? 'Company Root' : role === 'warehouse' ? 'Warehouse User' : 'Company User'
  const meta = PAGE_META[activeId] || { title: 'Dashboard', subtitle: 'Company portal' }

  useEffect(() => {
    if (!currentUser && !session?.user.role) return
    if (isRoot) return

    const routeModuleMap: Record<string, string> = {
      '/account/analytics': 'analytics',
      '/account/orders': 'orders',
      '/account/returns': 'returns',
      '/account/failed': 'failed',
      '/account/warehouses': 'warehouses',
      '/account/sftp': 'sftp',
      '/account/routing': 'routing',
      '/account/email': 'email',
    }

    if (pathname.startsWith('/account/team')) {
      void navigate({ to: '/account/orders' })
      return
    }

    for (const [routePrefix, moduleKey] of Object.entries(routeModuleMap)) {
      if (pathname.startsWith(routePrefix) && !permissions[moduleKey]) {
        const firstAllowed = Object.entries(routeModuleMap).find(([_, mod]) => permissions[mod])
        if (firstAllowed) {
          void navigate({ to: firstAllowed[0] as any })
        } else {
          void navigate({ to: '/account/notifications' })
        }
        break
      }
    }
  }, [currentUser, session?.user.role, isRoot, permissions, pathname, navigate])

  const nav: ShellNavItem[] = useMemo(() => {
    const items: ShellNavItem[] = []

    if (permissions.analytics || (permissions.analytics === undefined && permissions.orders)) {
      items.push({ id: 'analytics', label: 'Analytics', hint: 'Charts & rankings', href: '/account/analytics' })
    }
    if (permissions.orders) {
      items.push({ id: 'orders', label: 'Orders', hint: '940s and shipments', href: '/account/orders' })
    }
    if (permissions.returns) {
      items.push({ id: 'returns', label: 'Returns', hint: 'RMA and restock', href: '/account/returns' })
    }
    if (permissions.failed) {
      items.push({
        id: 'failed',
        label: 'Failed',
        hint: failedCount > 0 ? 'Needs attention' : 'DLQ',
        href: '/account/failed',
        badge: failedCount > 0 ? failedCount : undefined,
      })
    }
    if (isRoot) {
      items.push({
        id: 'notifications',
        label: 'Notifications',
        hint: 'Alerts',
        href: '/account/notifications',
        badge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
      })
    }

    if (isRoot) {
      items.push({ id: 'team', label: 'Users', hint: 'Invites & permissions', href: '/account/team' })
    }

    if (permissions.warehouses) {
      items.push({ id: 'warehouses', label: 'Warehouses', href: '/account/warehouses' })
    }
    if (permissions.sftp) {
      items.push({ id: 'sftp', label: 'SFTP', hint: 'Push 940 files', href: '/account/sftp' })
    }
    if (permissions.routing) {
      items.push({ id: 'routing', label: 'Routing', hint: 'Auto warehouse rules', href: '/account/routing' })
    }
    if (permissions.email) {
      items.push({ id: 'email', label: 'Email Settings', hint: 'SMTP config', href: '/account/email' })
    }

    return items
  }, [permissions, isRoot, failedCount, unreadNotifCount])

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
