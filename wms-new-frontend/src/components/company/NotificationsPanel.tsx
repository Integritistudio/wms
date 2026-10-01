import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, Mail, RefreshCw } from 'lucide-react'
import {
  DataTable,
  ListToolbar,
  MessageWithCopyIds,
  PageHeader,
  Pagination,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
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
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await getNotifications({ unread: unreadOnly, page, limit })
      setItems(res.data.items)
      setTotal(res.data.total)
      setUnreadCount(res.unreadCount)
      setUnreadNotifCount(res.unreadCount)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
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
    if (markingAllRead) return
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
    if (!target || target.read) return

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
    }
  }

  function openNotification(n: AppNotification) {
    const id = n._id || n.id
    if (id && !n.read) void handleMarkRead(id)

    if (isUnassignedWarehouseNotification(n)) {
      void navigate({ to: '/account/orders/', search: { warehouse: 'unassigned' } })
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

  const columns: DataTableColumn<AppNotification>[] = [
    {
      key: 'type',
      header: 'Type',
      className: 'notif-col-type',
      render: (n) => (
        <div className="notif-type-cell">
          <StatusBadge status={n.type} label={typeLabel(n.type)} />
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Message',
      className: 'notif-col-message',
      render: (n) => (
        <div className={`notif-message-cell${n.read ? '' : ' is-unread'}`}>
          {!n.read ? <span className="notif-unread-dot" aria-hidden /> : null}
          <div className="demo-cell-primary">{n.title}</div>
          {n.message ? <MessageWithCopyIds message={n.message} className="demo-cell-secondary" /> : null}
          {n.emailSent ? (
            <span className="notif-email-chip">
              <Mail size={11} aria-hidden /> Emailed
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      className: 'notif-col-time',
      sortable: true,
      sortValue: (n) => n.createdAt,
      render: (n) => (
        <div className="notif-time-cell">
          <div className="demo-cell-primary">{relativeTime(n.createdAt)}</div>
          <div className="demo-cell-secondary">
            {new Date(n.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
      ),
    },
    {
      key: 'read',
      header: 'Status',
      className: 'notif-col-status',
      render: (n) => (
        <StatusBadge
          status={n.read ? 'skipped' : 'pending'}
          label={n.read ? 'Read' : 'Unread'}
          variant={n.read ? 'neutral' : 'info'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      className: 'notif-col-actions',
      render: (n) =>
        !n.read ? (
          <button
            className="notif-mark-btn"
            type="button"
            title="Mark as read"
            aria-label="Mark as read"
            onClick={(e) => {
              e.stopPropagation()
              void handleMarkRead(n._id || n.id || '')
            }}
          >
            <Check size={14} aria-hidden />
            <span>Mark read</span>
          </button>
        ) : (
          <span className="notif-read-done">Done</span>
        ),
    },
  ]

  return (
    <div className="oj-page oj-skel notifications-page">
      <PageHeader
        title="Notifications"
        description="Order events and system alerts. Read alerts are removed after 7 days."
        count={total}
        actions={
          <button
            className="demo-btn demo-btn-sm notif-mark-all-btn"
            type="button"
            disabled={markingAllRead || loading || unreadCount === 0}
            aria-busy={markingAllRead}
            onClick={() => void handleMarkAllRead()}
          >
            <Check size={14} aria-hidden />
            {markingAllRead ? 'Marking…' : 'Mark all read'}
          </button>
        }
      />

      <div className="notif-stats" aria-label="Notification summary">
        <div className={`notif-stat${unreadCount > 0 ? ' is-warn' : ''}`}>
          <span className="notif-stat-label">Unread</span>
          <strong className="notif-stat-value">{unreadCount}</strong>
        </div>
        <div className="notif-stat">
          <span className="notif-stat-label">On this page</span>
          <strong className="notif-stat-value">{filtered.length}</strong>
        </div>
        <div className="notif-stat">
          <span className="notif-stat-label">Total</span>
          <strong className="notif-stat-value">{total}</strong>
        </div>
      </div>

      <div className="notif-status-tabs">
        <StatusTabs
          activeId={unreadOnly ? 'unread' : 'all'}
          onChange={(id) => {
            setUnreadOnly(id === 'unread')
            setPage(1)
          }}
          tabs={[
            { id: 'all', label: 'All', count: unreadOnly ? undefined : total },
            { id: 'unread', label: 'Unread', count: unreadCount || undefined },
          ]}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh notifications"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      <ListToolbar
        search={q}
        searchPlaceholder="Filter title, message, or type…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="shown"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(n) => n._id || n.id || ''}
        loading={loading || markingAllRead}
        emptyTitle={unreadOnly ? 'No unread alerts' : 'No notifications'}
        emptyMessage={
          unreadOnly
            ? 'You’re all caught up. Switch to All to review recent history.'
            : 'Alerts appear here when orders need attention or a system event fires.'
        }
        onRowClick={openNotification}
        rowClassName={(n) => (n.read ? 'is-read-row' : 'is-unread-row')}
      />

      <Pagination
        page={page}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={(n) => {
          setLimit(n)
          setPage(1)
        }}
      />
    </div>
  )
}
