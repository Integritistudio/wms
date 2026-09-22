import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  DEFAULT_CUSTOM_ACCENT,
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
  accentId: accentIdProp = DEFAULT_ACCENT_ID,
  customAccent: customAccentProp = DEFAULT_CUSTOM_ACCENT,
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

    if (companyBranding) {
      applyAccentColors(accentIdProp || DEFAULT_ACCENT_ID, customAccentProp || DEFAULT_CUSTOM_ACCENT)
      return
    }

    const storedId = getStoredAccentId()
    const storedHex = getStoredCustomAccent()
    setAccentId(storedId)
    setCustomHex(storedHex)
    applyAccentColors(storedId, storedHex)
  }, [])

  useEffect(() => {
    if (!companyBranding) return
    const id = (accentIdProp || DEFAULT_ACCENT_ID) as AccentPresetId
    setAccentId(id)
    setCustomHex(customAccentProp || DEFAULT_CUSTOM_ACCENT)
    applyAccentColors(id, customAccentProp || DEFAULT_CUSTOM_ACCENT)
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

  function commitPersonal(id: AccentPresetId, hex: string) {
    setAccentId(id)
    setCustomHex(hex)
    persistAccent(id, hex)
  }

  function selectPreset(id: AccentPresetId) {
    if (companyBranding) {
      void commitBranding(id, customHex)
      return
    }
    commitPersonal(id, customHex)
  }

  function selectCustom(hex: string) {
    if (companyBranding) {
      void commitBranding('custom', hex)
      return
    }
    commitPersonal('custom', hex)
  }

  const modeLabel = mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'
  const brandingLocked = companyBranding && !canEditBranding
  const accentsLocked = brandingLocked
  const accentTitle = companyBranding
    ? `Company accent${brandingLocked ? ' (view only)' : ''}`
    : 'Color scheme'
  const accentHint = companyBranding
    ? brandingLocked
      ? 'Only the company root can change branding for this workspace.'
      : 'Applies to everyone in your company portal.'
    : 'Soft Sakura is tuned for this portal — blush accent on cool mist paper.'

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

            <div className="appearance-section">
              <p className="appearance-section-title">{accentTitle}</p>
              <p className="appearance-hint">{accentHint}</p>
              <div className="appearance-swatch-grid" role="listbox" aria-label="Accent presets">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="option"
                    aria-selected={accentId === preset.id}
                    disabled={accentsLocked || saving}
                    className={`appearance-preset${accentId === preset.id ? ' is-active' : ''}${preset.id === 'sakura' ? ' is-sakura' : ''}`}
                    title={preset.label}
                    style={{ '--preset-color': preset.accent } as CSSProperties}
                    onClick={() => selectPreset(preset.id)}
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
                <label className={`appearance-custom-picker${accentsLocked ? ' is-disabled' : ''}`}>
                  <span className="sr-only">Pick custom accent</span>
                  <input
                    type="color"
                    value={customHex}
                    disabled={accentsLocked || saving}
                    onChange={(event) => {
                      const next = event.target.value
                      setCustomHex(next)
                      selectCustom(next)
                    }}
                  />
                </label>
                <input
                  className="demo-input appearance-hex-input"
                  value={customHex}
                  spellCheck={false}
                  disabled={accentsLocked || saving}
                  aria-label="Custom accent hex"
                  onChange={(event) => {
                    const next = event.target.value.trim()
                    setCustomHex(next)
                    if (/^#[0-9a-fA-F]{6}$/.test(next)) selectCustom(next)
                  }}
                />
                <button
                  type="button"
                  className={`appearance-chip${accentId === 'custom' ? ' is-active' : ''}`}
                  disabled={accentsLocked || saving}
                  onClick={() => selectCustom(customHex)}
                >
                  {saving ? '…' : 'Use'}
                </button>
              </div>
              {error ? <p className="appearance-error">{error}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
