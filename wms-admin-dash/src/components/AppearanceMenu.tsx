import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  ACCENT_PRESETS,
  applyAccentColors,
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  type AccentPresetId,
  type ThemeMode,
} from '../lib/appearance'

type AppearanceMenuProps = {
  /** When true, accent is company-branded (saved to server). */
  companyBranding?: boolean
  /** Only company root can change branding. */
  canEditBranding?: boolean
  accentId?: AccentPresetId
  customAccent?: string
  onSaveBranding?: (accentId: AccentPresetId, customAccent: string) => Promise<void>
}

export default function AppearanceMenu({
  companyBranding = false,
  canEditBranding = false,
  accentId: accentIdProp = 'blue',
  customAccent: customAccentProp = '#2563eb',
  onSaveBranding,
}: AppearanceMenuProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [accentId, setAccentId] = useState<AccentPresetId>(accentIdProp)
  const [customHex, setCustomHex] = useState(customAccentProp)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initialMode = getStoredThemeMode()
    setMode(initialMode)
    applyThemeMode(initialMode)
    applyAccentColors(accentIdProp || 'blue', customAccentProp || '#2563eb')
  }, [])

  useEffect(() => {
    if (!companyBranding) return
    const id = (accentIdProp || 'blue') as AccentPresetId
    setAccentId(id)
    setCustomHex(customAccentProp || '#2563eb')
    applyAccentColors(id, customAccentProp || '#2563eb')
  }, [companyBranding, accentIdProp, customAccentProp])

  useEffect(() => {
    if (mode !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyThemeMode('auto')
      applyAccentColors(accentId, customHex)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode, accentId, customHex])

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
    applyAccentColors(accentId, customHex)
  }

  async function commitBranding(id: AccentPresetId, hex: string) {
    if (!companyBranding || !canEditBranding) return
    setAccentId(id)
    setCustomHex(hex)
    applyAccentColors(id, hex)
    if (!onSaveBranding) return
    setSaving(true)
    setError('')
    try {
      await onSaveBranding(id, hex)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save branding')
    } finally {
      setSaving(false)
    }
  }

  const modeLabel = mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'
  const showBranding = companyBranding
  const brandingLocked = companyBranding && !canEditBranding

  return (
    <div className="appearance-root">
      <div ref={rootRef}>
        <button
          type="button"
          className="appearance-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          title={companyBranding ? 'Company appearance' : 'Appearance'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="appearance-swatch" aria-hidden />
          <span className="appearance-trigger-label">{companyBranding ? 'Brand' : 'Theme'}</span>
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

            {showBranding ? (
              <>
                <div className="appearance-section">
                  <p className="appearance-section-title">
                    Company accent{brandingLocked ? ' (view only)' : ''}
                  </p>
                  {brandingLocked ? (
                    <p className="appearance-hint">Only the company root can change branding for this workspace.</p>
                  ) : (
                    <p className="appearance-hint">Applies to everyone in your company portal.</p>
                  )}
                  <div className="appearance-swatch-grid" role="listbox" aria-label="Accent presets">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="option"
                        aria-selected={accentId === preset.id}
                        disabled={brandingLocked || saving}
                        className={`appearance-preset${accentId === preset.id ? ' is-active' : ''}`}
                        title={preset.label}
                        style={{ '--preset-color': preset.accent } as CSSProperties}
                        onClick={() => void commitBranding(preset.id, customHex)}
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
                    <label className={`appearance-custom-picker${brandingLocked ? ' is-disabled' : ''}`}>
                      <span className="sr-only">Pick custom accent</span>
                      <input
                        type="color"
                        value={customHex}
                        disabled={brandingLocked || saving}
                        onChange={(event) => {
                          const next = event.target.value
                          setCustomHex(next)
                          void commitBranding('custom', next)
                        }}
                      />
                    </label>
                    <input
                      className="demo-input appearance-hex-input"
                      value={customHex}
                      spellCheck={false}
                      disabled={brandingLocked || saving}
                      aria-label="Custom accent hex"
                      onChange={(event) => {
                        const next = event.target.value.trim()
                        setCustomHex(next)
                        if (/^#[0-9a-fA-F]{6}$/.test(next)) void commitBranding('custom', next)
                      }}
                    />
                    <button
                      type="button"
                      className={`appearance-chip${accentId === 'custom' ? ' is-active' : ''}`}
                      disabled={brandingLocked || saving}
                      onClick={() => void commitBranding('custom', customHex)}
                    >
                      {saving ? '…' : 'Use'}
                    </button>
                  </div>
                  {error ? <p className="appearance-error">{error}</p> : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
