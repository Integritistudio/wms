import type { ReactNode } from 'react'

export type ListFilter = {
  key: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

type ListToolbarProps = {
  search?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  filters?: ListFilter[]
  resultCount?: number
  resultLabel?: string
  onClear?: () => void
  children?: ReactNode
}

export default function ListToolbar({
  search,
  searchPlaceholder = 'Search…',
  onSearchChange,
  filters = [],
  resultCount,
  resultLabel = 'results',
  onClear,
  children,
}: ListToolbarProps) {
  const hasActive =
    Boolean(search?.trim()) || filters.some((f) => f.value && f.value !== 'all' && f.value !== '')

  return (
    <div className="list-toolbar">
      <div className="list-toolbar-main">
        {onSearchChange ? (
          <label className="list-toolbar-search">
            <span className="sr-only">Search</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              className="demo-input"
              value={search || ''}
              placeholder={searchPlaceholder}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>
        ) : null}

        {filters.map((filter) => (
          <label key={filter.key} className="list-toolbar-filter">
            <span>{filter.label}</span>
            <select
              className="demo-input demo-select"
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              aria-label={filter.label}
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {children}

        {hasActive && onClear ? (
          <button type="button" className="demo-btn demo-btn-ghost demo-btn-sm" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {resultCount !== undefined ? (
        <p className="list-toolbar-count">
          {resultCount} {resultLabel}
        </p>
      ) : null}
    </div>
  )
}
