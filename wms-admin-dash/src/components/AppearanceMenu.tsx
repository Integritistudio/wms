import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  ACCENT_PRESETS,
  applyAccentColors,
  applyThemeMode,
  getStoredAccentId,
  getStoredCustomAccent,
  getStoredThemeMode,
  persistAccent,
  persistThemeMode,
  type AccentPresetId,
  type ThemeMode,
} from '../lib/appearance'

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [accentId, setAccentId] = useState<AccentPresetId>('blue')
  const [customHex, setCustomHex] = useState('#2563eb')
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initialMode = getStoredThemeMode()
    const initialAccent = getStoredAccentId()
    const initialCustom = getStoredCustomAccent()
    setMode(initialMode)
    setAccentId(initialAccent)
    setCustomHex(initialCustom)
    applyThemeMode(initialMode)
    applyAccentColors(initialAccent, initialCustom)
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyThemeMode('auto')
      applyAccentColors(getStoredAccentId(), getStoredCustomAccent())
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

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

  function setTheme(next: ThemeMode) {
    setMode(next)
    persistThemeMode(next)
  }

  function setPreset(id: AccentPresetId) {
    setAccentId(id)
    persistAccent(id, customHex)
  }

  function setCustom(hex: string) {
    setCustomHex(hex)
    setAccentId('custom')
    persistAccent('custom', hex)
  }

  const modeLabel = mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="appearance-root" ref={rootRef}>
      <button
        type="button"
        className="appearance-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="Appearance"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="appearance-swatch" aria-hidden />
        <span className="appearance-trigger-label">Theme</span>
        <span className="appearance-trigger-meta">{modeLabel}</span>
      </button>

      {open ? (
        <div className="appearance-panel" id={panelId} role="dialog" aria-label="Appearance settings">
          <div className="appearance-section">
            <p className="appearance-section-title">Mode</p>
            <div className="appearance-mode-row" role="group" aria-label="Color mode">
              {(['light', 'dark', 'auto'] as ThemeMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`appearance-chip${mode === option ? ' is-active' : ''}`}
                  onClick={() => setTheme(option)}
                >
                  {option === 'auto' ? 'Auto' : option === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <p className="appearance-section-title">Accent color</p>
            <div className="appearance-swatch-grid" role="listbox" aria-label="Accent presets">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  aria-selected={accentId === preset.id}
                  className={`appearance-preset${accentId === preset.id ? ' is-active' : ''}`}
                  title={preset.label}
                  style={{ '--preset-color': preset.accent } as CSSProperties}
                  onClick={() => setPreset(preset.id)}
                >
                  <span className="appearance-preset-dot" />
                  <span className="appearance-preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <p className="appearance-section-title">Custom accent</p>
            <div className="appearance-custom-row">
              <label className="appearance-custom-picker">
                <span className="sr-only">Pick custom accent</span>
                <input
                  type="color"
                  value={customHex}
                  onChange={(event) => setCustom(event.target.value)}
                />
              </label>
              <input
                className="demo-input appearance-hex-input"
                value={customHex}
                spellCheck={false}
                aria-label="Custom accent hex"
                onChange={(event) => {
                  const next = event.target.value.trim()
                  setCustomHex(next)
                  if (/^#[0-9a-fA-F]{6}$/.test(next)) setCustom(next)
                }}
              />
              <button
                type="button"
                className={`appearance-chip${accentId === 'custom' ? ' is-active' : ''}`}
                onClick={() => setCustom(customHex)}
              >
                Use
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
