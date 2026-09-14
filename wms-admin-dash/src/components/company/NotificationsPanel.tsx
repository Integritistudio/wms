import { useEffect, useState } from 'react'
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

export default function NotificationsPanel() {
  const { setError, setUnreadNotifCount, refreshCounts } = useCompanyPortal()
  const [items, setItems] = useState<AppNotification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await getNotifications({ unread: unreadOnly, page, limit })
      setItems(res.data.items)
      setTotal(res.data.total)
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
    await markAllNotificationsRead()
    await load()
    await refreshCounts()
  }

  async function handleMarkRead(id: string) {
    try {
      await markNotificationRead(id)
      // reload current page so server-side ordering/counts match client
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark notification read')
    }
  }

  const columns: DataTableColumn<AppNotification>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (n) => <StatusBadge status={n.type} />,
    },
    {
      key: 'title',
      header: 'Message',
      className: 'notif-col-message',
      render: (n) => (
        <div className="notif-message-cell">
          <div className="demo-cell-primary">{n.title}</div>
          {n.message ? <MessageWithCopyIds message={n.message} className="demo-cell-secondary" /> : null}
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
          <div className="demo-cell-primary">{new Date(n.createdAt).toLocaleDateString()}</div>
          <div className="demo-cell-secondary">
            {new Date(n.createdAt).toLocaleTimeString()}
            {n.emailSent ? ' · emailed' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'read',
      header: 'Status',
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
      header: 'Actions',
      align: 'right',
      render: (n) =>
        !n.read ? (
          <button className="demo-btn demo-btn-sm" type="button" onClick={() => handleMarkRead(n._id)}>
            Mark read
          </button>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Order events and system alerts for this company."
        count={total}
        actions={
          <button className="demo-button demo-button-secondary" type="button" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </button>
        }
      />

      <StatusTabs
        activeId={unreadOnly ? 'unread' : 'all'}
        onChange={(id) => {
          setUnreadOnly(id === 'unread')
          setPage(1)
        }}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
        ]}
      />

      <ListToolbar
        search={q}
        searchPlaceholder="Filter this page…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="shown"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(n) => n._id}
        loading={loading}
        emptyTitle="No notifications"
        emptyMessage="Alerts will appear here when orders need attention."
      />

      <Pagination page={page} limit={limit} total={total} onPageChange={setPage} onLimitChange={(n) => { setLimit(n); setPage(1) }} />
    </div>
  )
}
