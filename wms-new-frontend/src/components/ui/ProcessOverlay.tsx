import { useEffect } from 'react'

export type ProcessOverlayPhase = 'working' | 'success' | 'error'

type ProcessOverlayProps = {
  open: boolean
  phase: ProcessOverlayPhase
  title: string
  detail?: string
  filename?: string
  errorMessage?: string
  /** Auto-close success after ms (default 1600). Pass 0 to keep open. */
  successAutoCloseMs?: number
  onClose?: () => void
}

export default function ProcessOverlay({
  open,
  phase,
  title,
  detail,
  filename,
  errorMessage,
  successAutoCloseMs = 1600,
  onClose,
}: ProcessOverlayProps) {
  useEffect(() => {
    if (!open || phase !== 'success' || !onClose || successAutoCloseMs <= 0) return
    const t = window.setTimeout(() => onClose(), successAutoCloseMs)
    return () => window.clearTimeout(t)
  }, [open, phase, onClose, successAutoCloseMs])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="process-overlay" role="alertdialog" aria-modal="true" aria-live="assertive" aria-busy={phase === 'working'}>
      <div className="process-overlay-scrim" />
      <div className="process-overlay-card">
        <div className={`process-overlay-icon is-${phase}`} aria-hidden>
          {phase === 'working' ? <span className="process-overlay-spinner" /> : null}
          {phase === 'success' ? (
            <span className="material-symbols-outlined">check_circle</span>
          ) : null}
          {phase === 'error' ? <span className="material-symbols-outlined">error</span> : null}
        </div>
        <h2 className="process-overlay-title">{title}</h2>
        {detail ? <p className="process-overlay-detail">{detail}</p> : null}
        {filename ? (
          <p className="process-overlay-file" title={filename}>
            {filename}
          </p>
        ) : null}
        {phase === 'error' && errorMessage ? <p className="process-overlay-error">{errorMessage}</p> : null}
        {phase === 'working' ? (
          <p className="process-overlay-hint">Please wait — do not close this page or click again.</p>
        ) : null}
        {phase === 'error' && onClose ? (
          <button type="button" className="demo-button" onClick={onClose}>
            Close
          </button>
        ) : null}
        {phase === 'success' && successAutoCloseMs <= 0 && onClose ? (
          <button type="button" className="demo-button" onClick={onClose}>
            Done
          </button>
        ) : null}
      </div>
    </div>
  )
}
