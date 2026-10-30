import PageBanner from '../ui/PageBanner'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Bell, Package, Truck, Warehouse, Check, CheckCheck, ChevronRight, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { MessageWithCopyIds, Pagination } from '../ui'
import BrandLoader from '../BrandLoader'
import '../../styles/notifications.css'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

function isUnassignedWarehouseNotification(n: AppNotification) {
  const title = (n.title || '').toLowerCase()
  return (
    title.includes('needs warehouse') ||
    title.includes('needs warehouse confirm') ||
    Boolean(n.meta && 'suggestedWarehouseId' in n.meta && !n.meta.warehouseId)
  )
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 'Just now'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function typeLabel(type: string) {
  return (type || 'system').replace(/_/g, ' ')
}

export default function NotificationsPanel() {
  const navigate = useNavigate()
  const { setError, setUnreadNotifCount, refreshCounts } = useCompanyPortal()
  const [items, setItems] = useState<AppNotification[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(true)
  const [q, setQ] = useState('')
  const [loadError, setLoadError] = useState('')
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const readLocks = useRef(new Set<string>())
  const loadSequence = useRef(0)

  async function load() {
    const sequence = ++loadSequence.current
    let switchingToAll = false
    setLoading(true)
    setLoadError('')
    try {
      const res = await getNotifications({ unread: unreadOnly, page, limit })
      if (sequence !== loadSequence.current) return
      setUnreadCount(res.unreadCount)
      setUnreadNotifCount(res.unreadCount)
      if (unreadOnly && res.unreadCount === 0) {
        switchingToAll = true
        setUnreadOnly(false)
        setPage(1)
        return
      }
      setItems(res.data.items)
      setTotal(res.data.total)
      setError('')
    } catch (err) {
      if (sequence === loadSequence.current) setLoadError(err instanceof Error ? err.message : 'Unable to load notifications')
    } finally {
      if (sequence === loadSequence.current && !switchingToAll) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => { loadSequence.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly, page, limit])

  const filtered = q.trim()
    ? items.filter(
        (n) =>
          n.title.toLowerCase().includes(q.toLowerCase()) ||
          (n.message || '').toLowerCase().includes(q.toLowerCase()) ||
          n.type.toLowerCase().includes(q.toLowerCase()),
      )
    : items

  async function handleMarkAllRead() {
    if (markingAllRead || readLocks.current.size > 0) return
    setMarkingAllRead(true)
    setLoading(true)
    try {
      await markAllNotificationsRead()
      setUnreadNotifCount(0)
      setUnreadCount(0)
      if (unreadOnly) {
        setItems([])
        setTotal(0)
      } else {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })))
      }
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark all notifications read')
      setLoading(false)
    } finally {
      setMarkingAllRead(false)
    }
  }

  async function handleMarkRead(id: string) {
    const target = items.find((n) => n._id === id || n.id === id)
    if (!target || target.read || readLocks.current.has(id) || markingAllRead) return
    readLocks.current.add(id)
    setPendingIds((previous) => [...previous, id])

    setItems((prev) =>
      unreadOnly
        ? prev.filter((n) => n._id !== id && n.id !== id)
        : prev.map((n) => (n._id === id || n.id === id ? { ...n, read: true } : n)),
    )
    if (unreadOnly) setTotal((t) => Math.max(0, t - 1))
    setUnreadCount((c) => Math.max(0, c - 1))
    setUnreadNotifCount((c) => Math.max(0, c - 1))

    try {
      await markNotificationRead(id)
      if (unreadOnly && unreadCount === 1) {
        setUnreadOnly(false)
        setPage(1)
      } else if (unreadOnly && items.length === 1 && page > 1) {
        setPage((previous) => previous - 1)
      }
      await refreshCounts()
    } catch (err) {
      setItems((prev) => {
        if (unreadOnly) return [target, ...prev]
        return prev.map((n) => (n._id === id || n.id === id ? { ...n, read: false } : n))
      })
      if (unreadOnly) setTotal((t) => t + 1)
      setUnreadCount((c) => c + 1)
      setUnreadNotifCount((c) => c + 1)
      setError(err instanceof Error ? err.message : 'Unable to mark notification read')
    } finally {
      readLocks.current.delete(id)
      setPendingIds((previous) => previous.filter((pending) => pending !== id))
    }
  }

  function openNotification(n: AppNotification) {
    const id = n._id || n.id
    if (id && !n.read) void handleMarkRead(id)

    if (isUnassignedWarehouseNotification(n)) {
      void navigate({ to: '/account/orders', search: { warehouse: 'unassigned' } })
      return
    }

    const orderId = typeof n.meta?.orderId === 'string' ? n.meta.orderId : ''
    if (orderId) {
      void navigate({ to: '/account/orders/$orderId', params: { orderId } })
      return
    }

    if (n.type === 'dlq_entry' || n.type === 'sftp_failed') {
      void navigate({ to: '/account/failed' })
    }
  }

  return (
    <div className="notification-center">
      <PageBanner variant="notifications">
        <svg className="notification-header-vector" viewBox="0 0 260 140" fill="none" aria-hidden="true">
          <path d="M12 108H76Q92 108 92 92V52Q92 36 108 36H248M58 136V92Q58 76 74 76H174Q190 76 190 60V8M122 136V118Q122 102 138 102H248" stroke="currentColor" strokeWidth="1" />
          <circle cx="92" cy="76" r="4" fill="currentColor" /><circle cx="190" cy="36" r="4" fill="currentColor" /><circle cx="122" cy="118" r="3" fill="currentColor" />
        </svg>
        <div className="notification-center-hero-copy">
          <div className="notification-center-crumb"><span>Workspace</span><ChevronRight size={12} aria-hidden /><strong>Notifications</strong></div>
          <h1>Notifications</h1>
          <p>Order updates and system alerts, together in one place.</p>
          <div className="notification-center-summary"><span className={unreadCount ? 'has-unread' : ''}><span />{loading ? 'Updating inbox...' : unreadCount ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}` : 'No unread notifications'}</span></div>
        </div>
        <button className="notification-mark-all" type="button" disabled={markingAllRead || loading || unreadCount === 0 || pendingIds.length > 0}
          aria-busy={markingAllRead} onClick={() => void handleMarkAllRead()}><CheckCheck size={16} aria-hidden />{markingAllRead ? 'Marking...' : 'Mark all as read'}</button>
      </PageBanner>

      <section className="notification-inbox" aria-label="Notification inbox">
        <div className="notification-inbox-toolbar">
          <nav className="notification-filter-pills" aria-label="Notification status">
            {[{ id: 'all', label: 'All' }, ...(unreadCount > 0 || loading || unreadOnly ? [{ id: 'unread', label: 'Unread' }] : [])].map(({ id, label }) => (
              <button key={id} type="button" className={unreadOnly === (id === 'unread') ? 'is-active' : ''} aria-pressed={unreadOnly === (id === 'unread')}
                disabled={markingAllRead} onClick={() => { setUnreadOnly(id === 'unread'); setPage(1) }}>
                {label}{id === 'unread' && unreadCount > 0 ? <span>{unreadCount}</span> : null}
              </button>
            ))}
          </nav>
            <button type="button" className="notification-refresh" disabled={loading || markingAllRead} onClick={() => void load()} aria-label="Refresh notifications" title="Refresh notifications"><RefreshCw size={16} aria-hidden /></button>
        </div>
        <div className="notification-inbox-search-row">
          <label className="notification-search"><Search size={16} aria-hidden /><input type="search" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Search this page of notifications" placeholder="Search this page of notifications..." /></label>
          <span className="notification-page-count">{loading ? 'Updating...' : `${filtered.length} ${filtered.length === 1 ? 'notification' : 'notifications'} on this page`}</span>
        </div>
        {loading || markingAllRead ? <BrandLoader label="Loading notifications..." /> : loadError ? (
          <div className="notification-empty" role="alert"><TriangleAlert size={28} aria-hidden /><h2>Notifications unavailable</h2><p>{loadError}</p><button type="button" onClick={() => void load()}>Try again</button></div>
        ) : filtered.length === 0 ? (
          <div className="notification-empty"><h2>{q.trim() ? 'No matching notifications' : unreadOnly ? "You're all caught up" : 'Your inbox is clear'}</h2><p>{q.trim() ? 'Try a different search on this page.' : unreadOnly ? 'New unread updates will appear here.' : 'Order updates and system alerts will appear here.'}</p>{q.trim() ? <button type="button" onClick={() => setQ('')}>Clear search</button> : unreadOnly ? <button type="button" onClick={() => { setUnreadOnly(false); setPage(1) }}>View all notifications</button> : null}</div>
        ) : (
          <ul className="notification-feed">{filtered.map((notification) => {
            const id = notification._id || notification.id || ''
            const isFailure = /fail|error|dlq/.test(notification.type)
            const Icon = isFailure ? TriangleAlert : isUnassignedWarehouseNotification(notification) ? Warehouse : /ship|deliver|tracking/.test(notification.type) ? Truck : /order|fulfill/.test(notification.type) ? Package : Bell
            const actionable = isUnassignedWarehouseNotification(notification) || typeof notification.meta?.orderId === 'string' || ['dlq_entry', 'sftp_failed'].includes(notification.type)
            return <li key={id} className={`${notification.read ? 'is-read' : 'is-unread'}${isFailure ? ' is-attention' : ''}`}>
              <span className="notification-type-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.7} /></span>
              <article className="notification-feed-content">
                <div className="notification-feed-meta"><span>{typeLabel(notification.type)}</span><span className="notification-meta-divider" /><time dateTime={notification.createdAt} title={new Date(notification.createdAt).toLocaleString()}>{relativeTime(notification.createdAt)}</time>{!notification.read ? <span className="notification-unread-label">Unread</span> : null}</div>
                <h2>{actionable ? <button type="button" onClick={() => openNotification(notification)}>{notification.title}<ArrowUpRight size={13} aria-hidden /></button> : notification.title}</h2>
                {notification.message ? <MessageWithCopyIds message={notification.message} className="notification-feed-message" /> : null}
                {notification.emailSent ? <span className="notification-emailed">Sent by email</span> : null}
              </article>
              {!notification.read ? <button className="notification-mark-read" type="button" disabled={pendingIds.includes(id)} aria-label={`Mark ${notification.title} as read`} title="Mark as read" onClick={() => void handleMarkRead(id)}><Check size={16} aria-hidden /><span>{pendingIds.includes(id) ? 'Saving...' : 'Mark read'}</span></button> : <span className="notification-read-label"><CheckCheck size={15} aria-hidden /><span>Read</span></span>}
            </li>
          })}</ul>
        )}
        <div className="notification-inbox-footer"><p>Read notifications are removed after 7 days.</p><Pagination page={page} limit={limit} total={total} onPageChange={setPage} onLimitChange={(value) => { setLimit(value); setPage(1) }} /></div>
      </section>
    </div>
  )
}
