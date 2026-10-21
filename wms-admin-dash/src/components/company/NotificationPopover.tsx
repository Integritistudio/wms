import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Bell, BellRing, RefreshCw } from 'lucide-react'
import { getNotifications, type AppNotification } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import '../../styles/notification-popover.css'

function notificationTime(iso: string) {
  const date = new Date(iso)
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationPopover() {
  const { unreadNotifCount, setUnreadNotifCount } = useCompanyPortal()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    setItems([])
    void getNotifications({ unread: true, page: 1, limit: 5 }).then((result) => {
      if (cancelled) return
      setItems(result.data.items.filter((item) => !item.read)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5))
      setUnreadNotifCount(result.unreadCount)
    }).catch(() => {
      if (!cancelled) setError('Unable to load notifications.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, attempt, setUnreadNotifCount])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="notification-popover" ref={rootRef} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
    }}>
      <button ref={triggerRef} type="button" className={`app-icon-btn${open ? ' is-open' : ''}`}
        title="Notifications" aria-label={unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : 'Notifications'}
        aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((previous) => !previous)}>
        <span className="material-symbols-outlined" aria-hidden>notifications</span>
        {unreadNotifCount > 0 ? <span className="app-icon-btn-dot" /> : null}
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="notification-popover-panel" role="region" aria-labelledby={titleId} tabIndex={-1}>
          <header className="notification-popover-header"><h2 id={titleId}>Notifications</h2><span>{unreadNotifCount} unread</span></header>
          <div className="notification-popover-content" aria-busy={loading}>
            {loading ? <div className="notification-popover-state" role="status"><RefreshCw size={19} className="notification-popover-spin" aria-hidden /><p>Loading notifications...</p></div>
              : error ? <div className="notification-popover-state" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((previous) => previous + 1)}>Try again</button></div>
              : items.length === 0 ? <div className="notification-popover-state"><Bell size={24} aria-hidden /><strong>You're all caught up</strong><p>No unread notifications.</p></div>
              : <ul className="notification-popover-list">{items.map((item) => (
                <li key={item._id || item.id}>
                  <span className="notification-popover-item-icon"><BellRing size={16} aria-hidden /></span>
                  <div><strong>{item.title}</strong>{item.message ? <p>{item.message}</p> : null}<time dateTime={item.createdAt}>{notificationTime(item.createdAt)}</time></div>
                  <span className="notification-popover-unread" aria-label="Unread" />
                </li>
              ))}</ul>}
          </div>
          <Link className="notification-popover-all" to="/account/notifications" onClick={() => setOpen(false)}>See all notifications<ArrowRight size={15} aria-hidden /></Link>
        </div>
      ) : null}
    </div>
  )
}
