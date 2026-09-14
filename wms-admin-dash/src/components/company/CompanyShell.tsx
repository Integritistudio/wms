import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, type ReactNode } from 'react'
import AppShell, { type ShellNavItem } from '../AppShell'
import AppearanceMenu from '../AppearanceMenu'
import { useCompanyPortal } from './CompanyPortalContext'
import { clearCompanySession, getCompanySession } from '../../lib/auth'
import type { AccentPresetId } from '../../lib/appearance'
import { Alert } from '../ui'

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
  guide: { title: 'User Guide', subtitle: 'How to use each section of the company portal' },
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
    setError,
    setNotice,
    saveAppearance,
    refreshCounts,
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
      items.push({ id: 'analytics', label: 'Analytics', href: '/account/analytics' })
    }
    if (permissions.orders) {
      items.push({ id: 'orders', label: 'Orders & Shipments', href: '/account/orders' })
    }
    if (permissions.returns) {
      items.push({ id: 'returns', label: 'Returns', href: '/account/returns' })
    }
    if (permissions.failed) {
      items.push({
        id: 'failed',
        label: 'Failed',
        href: '/account/failed',
        badge: failedCount > 0 ? failedCount : undefined,
      })
    }
    if (isRoot) {
      items.push({
        id: 'notifications',
        label: 'Notifications',
        href: '/account/notifications',
        badge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
      })
    }

    if (isRoot) {
      items.push({ id: 'team', label: 'Users', href: '/account/team' })
    }

    if (permissions.warehouses) {
      items.push({ id: 'warehouses', label: 'Warehouses', href: '/account/warehouses' })
    }
    if (permissions.sftp) {
      items.push({ id: 'sftp', label: 'SFTP & EDI', href: '/account/sftp' })
    }
    if (permissions.routing) {
      items.push({ id: 'routing', label: 'Order Routing', href: '/account/routing' })
    }
    if (permissions.email) {
      items.push({ id: 'email', label: 'Email Settings', href: '/account/email' })
    }

    items.push({ id: 'guide', label: 'User Guide', href: '/account/guide' })

    return items
  }, [permissions, isRoot, failedCount, unreadNotifCount])

  return (
    <AppShell
      workspace={company?.name || session?.user.companyName || 'Company'}
      workspaceKicker="Active tenant"
      userName={currentUser?.name || session?.user.name || session?.user.email || 'User'}
      userMeta={`${currentUser?.email || session?.user.email || ''} · ${roleLabel}`}
      title={meta.title}
      subtitle={meta.subtitle}
      nav={nav}
      activeId={activeId}
      quickSync={{
        onClick: () => {
          void refreshCounts()
        },
        label: 'Quick Sync',
      }}
      topbarLeading={
        <span className="app-gateway-chip">
          <span className="material-symbols-outlined" aria-hidden>
            dns
          </span>
          Gateway
          <code>healthy</code>
        </span>
      }
      topbarActions={
        <>
          {isRoot ? (
            <button
              className="app-icon-btn"
              type="button"
              aria-label="Notifications"
              title="Notifications"
              onClick={() => void navigate({ to: '/account/notifications' })}
            >
              <span className="material-symbols-outlined" aria-hidden>
                notifications
              </span>
              {unreadNotifCount > 0 ? <span className="app-icon-btn-dot" /> : null}
            </button>
          ) : null}
          <AppearanceMenu
            companyBranding
            canEditBranding={isRoot}
            accentId={(company?.appearance?.accentId || 'blue') as AccentPresetId}
            customAccent={company?.appearance?.customAccent || '#2563eb'}
            onSaveBranding={saveAppearance}
          />
        </>
      }
      onSignOut={() => {
        clearCompanySession()
        void navigate({ to: '/account/login' })
      }}
    >
      {error ? (
        <div className="shell-banner">
          <Alert tone="danger" onDismiss={() => setError('')}>
            {error}
          </Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="shell-banner">
          <Alert tone="success" onDismiss={() => setNotice('')}>
            {notice}
          </Alert>
        </div>
      ) : null}
      {inviteUrl ? (
        <div className="shell-banner">
          <Alert
            tone="info"
            title="Invite link ready"
            autoDismissMs={false}
            onDismiss={() => setInviteUrl('')}
            actions={
              <button
                className="demo-button demo-button-secondary ui-btn-sm"
                type="button"
                onClick={() => void navigator.clipboard.writeText(inviteUrl)}
              >
                Copy link
              </button>
            }
          >
            <label className="sr-only" htmlFor="invite-url">
              Invite URL
            </label>
            <input id="invite-url" className="demo-input" readOnly value={inviteUrl} />
          </Alert>
        </div>
      ) : null}
      {children}
    </AppShell>
  )
}
