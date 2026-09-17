export type ThemeMode = 'light' | 'dark' | 'auto'

export type AccentPresetId =
  | 'industrial'
  | 'blue'
  | 'teal'
  | 'indigo'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'slate'
  | 'custom'

export type AccentPreset = {
  id: AccentPresetId
  label: string
  accent: string
  accentSoft: string
  accentDeep: string
}

/** Brand defaults: Safety Vermilion on Freight Paper / Barcode Black. */
export const BRAND = {
  black: '#161616',
  vermilion: '#FF4D2E',
  vermilionSoft: '#FF7A63',
  vermilionDeep: '#D9381F',
  paper: '#F1EDE4',
  steel: '#8EA3B0',
  yellow: '#F4E06D',
} as const

export const DEFAULT_ACCENT_ID: AccentPresetId = 'industrial'
export const DEFAULT_CUSTOM_ACCENT = BRAND.vermilion

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'industrial',
    label: 'Industrial',
    accent: BRAND.vermilion,
    accentSoft: BRAND.vermilionSoft,
    accentDeep: BRAND.vermilionDeep,
  },
  { id: 'blue', label: 'Blue', accent: '#3b82f6', accentSoft: '#60a5fa', accentDeep: '#1d4ed8' },
  { id: 'teal', label: 'Teal', accent: '#14b8a6', accentSoft: '#2dd4bf', accentDeep: '#0f766e' },
  { id: 'indigo', label: 'Indigo', accent: '#6366f1', accentSoft: '#818cf8', accentDeep: '#4338ca' },
  { id: 'emerald', label: 'Emerald', accent: '#10b981', accentSoft: '#34d399', accentDeep: '#047857' },
  { id: 'violet', label: 'Violet', accent: '#8b5cf6', accentSoft: '#a78bfa', accentDeep: '#6d28d9' },
  { id: 'rose', label: 'Rose', accent: '#f43f5e', accentSoft: '#fb7185', accentDeep: '#be123c' },
  { id: 'amber', label: 'Amber', accent: '#f59e0b', accentSoft: '#fbbf24', accentDeep: '#b45309' },
  { id: 'slate', label: 'Steel', accent: BRAND.steel, accentSoft: '#B0C0CA', accentDeep: '#5F7380' },
]

const THEME_KEY = 'theme'
const ACCENT_ID_KEY = 'wms-accent-id'
const ACCENT_CUSTOM_KEY = 'wms-accent-custom'

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  return 'auto'
}

export function getStoredAccentId(): AccentPresetId {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_ID
  const stored = window.localStorage.getItem(ACCENT_ID_KEY)
  if (stored && (ACCENT_PRESETS.some((p) => p.id === stored) || stored === 'custom')) {
    return stored as AccentPresetId
  }
  return DEFAULT_ACCENT_ID
}

export function getStoredCustomAccent(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_ACCENT
  return window.localStorage.getItem(ACCENT_CUSTOM_KEY) || DEFAULT_CUSTOM_ACCENT
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim()
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Slightly lighter / darker variants from a base hex. */
export function deriveAccentFamily(base: string): { soft: string; deep: string; base: string } {
  const rgb = hexToRgb(base) || { r: 255, g: 77, b: 46 }
  const soft = rgbToHex(rgb.r + 40, rgb.g + 40, rgb.b + 30)
  const deep = rgbToHex(rgb.r * 0.72, rgb.g * 0.72, rgb.b * 0.78)
  const normalized = rgbToHex(rgb.r, rgb.g, rgb.b)
  return { base: normalized, soft, deep }
}

export function resolveAccentColors(
  id: AccentPresetId,
  customHex?: string,
): { accent: string; soft: string; deep: string } {
  if (id === 'custom') {
    const family = deriveAccentFamily(customHex || getStoredCustomAccent())
    return { accent: family.base, soft: family.soft, deep: family.deep }
  }
  const preset = ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]
  return { accent: preset.accent, soft: preset.accentSoft, deep: preset.accentDeep }
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }

  document.documentElement.style.colorScheme = resolved
}

export function applyAccentColors(id: AccentPresetId, customHex?: string) {
  if (typeof document === 'undefined') return
  const { accent, soft, deep } = resolveAccentColors(id, customHex)
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  root.style.setProperty('--lagoon', isDark ? soft : accent)
  root.style.setProperty('--lagoon-deep', isDark ? soft : deep)
  root.style.setProperty('--palm', deep)
  root.style.setProperty('--shell-accent', isDark ? soft : deep)
  root.style.setProperty('--shell-accent-deep', deep)
  root.style.setProperty('--user-accent', accent)
  root.style.setProperty('--user-accent-soft', soft)
  root.style.setProperty('--user-accent-deep', deep)
  root.style.setProperty('--primary', isDark ? soft : accent)
  root.style.setProperty('--primary-container', isDark ? accent : deep)
  root.style.setProperty('--primary-fixed', isDark ? '#3a2a18' : BRAND.yellow)
  root.dataset.accent = id
}

export function persistThemeMode(mode: ThemeMode) {
  window.localStorage.setItem(THEME_KEY, mode)
  applyThemeMode(mode)
}

export function persistAccent(id: AccentPresetId, customHex?: string) {
  window.localStorage.setItem(ACCENT_ID_KEY, id)
  if (id === 'custom' && customHex) {
    window.localStorage.setItem(ACCENT_CUSTOM_KEY, customHex)
  }
  applyAccentColors(id, customHex)
}

/** Call once on client mount (and from FOUC script). */
export function hydrateAppearance() {
  applyThemeMode(getStoredThemeMode())
  applyAccentColors(getStoredAccentId(), getStoredCustomAccent())
}
