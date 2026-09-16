import { useEffect, useId, useRef, useState } from 'react'

type UserMenuProps = {
  userName: string
  userMeta?: string
  onSignOut: () => void
}

export default function UserMenu({ userName, userMeta, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className={`app-topbar-avatar user-menu-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        title="Account menu"
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          person
        </span>
      </button>

      {open ? (
        <div className="user-menu-panel" id={panelId} role="menu" aria-label="Account">
          <div className="user-menu-header">
            <span className="user-menu-avatar" aria-hidden>
              <span className="material-symbols-outlined">person</span>
            </span>
            <div className="user-menu-identity">
              <strong>{userName}</strong>
              {userMeta ? <span>{userMeta}</span> : null}
            </div>
          </div>
          <div className="user-menu-divider" />
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <span className="material-symbols-outlined" aria-hidden>
              logout
            </span>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
