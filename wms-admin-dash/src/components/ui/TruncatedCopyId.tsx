import { useState, type MouseEvent } from 'react'

const DEFAULT_MAX = 18

type TruncatedCopyIdProps = {
  value: string
  /** Visible character count before ellipsis (default 18). */
  maxLen?: number
  className?: string
  /** Optional prefix shown before the value (e.g. "UPS "). */
  prefix?: string
}

export default function TruncatedCopyId({
  value,
  maxLen = DEFAULT_MAX,
  className = '',
  prefix = '',
}: TruncatedCopyIdProps) {
  const [copied, setCopied] = useState(false)
  const raw = String(value || '').trim()
  if (!raw) return null

  const needsTruncate = raw.length > maxLen
  const display = needsTruncate ? `${raw.slice(0, maxLen)}…` : raw

  async function copy(event?: MouseEvent) {
    event?.stopPropagation()
    event?.preventDefault()
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore clipboard failures */
    }
  }

  return (
    <span className={`truncated-copy ${className}`.trim()} title={raw}>
      {prefix ? <span className="truncated-copy-prefix">{prefix}</span> : null}
      <code className="truncated-copy-value">{display}</code>
      {needsTruncate ? (
        <button type="button" className="truncated-copy-btn" onClick={(e) => void copy(e)} aria-label="Copy full ID">
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : null}
    </span>
  )
}

/** Split message text and wrap long IDs (24+ chars) with truncate + copy. */
export function MessageWithCopyIds({ message, className = '' }: { message: string; className?: string }) {
  const parts = String(message || '').split(/([A-Za-z0-9_-]{24,})/g)
  return (
    <div className={`notif-message ${className}`.trim()}>
      {parts.map((part, i) =>
        /^[A-Za-z0-9_-]{24,}$/.test(part) ? (
          <TruncatedCopyId key={`${i}-${part.slice(0, 8)}`} value={part} />
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  )
}
