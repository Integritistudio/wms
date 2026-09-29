import { useEffect, useState } from 'react'
import { applyTheme, getTheme, type ThemeMode } from '../lib/theme'

type ThemeToggleProps = {
  className?: string
}

/** Personal light/dark switch — shown in the public header and app shells. */
export default function ThemeToggle({ className = 'theme-toggle' }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    setMode(getTheme())
  }, [])

  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark'

  return (
    <button
      className={className}
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        applyTheme(next)
        setMode(next)
      }}
    >
      <span className="material-symbols-outlined" aria-hidden>
        {mode === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}
