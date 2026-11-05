import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getTheme, type ThemeMode } from '../lib/theme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>('light')
  useEffect(() => {
    const sync = () => setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    const onStorage = (event: StorageEvent) => { if (event.key === 'theme') applyTheme(getTheme(), false) }
    sync()
    window.addEventListener('wms-theme-change', sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('wms-theme-change', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return (
    <div className={`theme-toggle ${className}`.trim()} role="group" aria-label="Appearance">
      {(['light', 'dark'] as const).map((value) => (
        <button key={value} type="button" aria-label={`Use ${value} mode`} aria-pressed={mode === value}
          title={`${value === 'light' ? 'Light' : 'Dark'} mode`}
          onClick={() => { applyTheme(value); setMode(value) }}>
          {value === 'light' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          <span>{value === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      ))}
    </div>
  )
}
