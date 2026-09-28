/**
 * Light / dark theme — the single place that decides which mode the dashboard
 * runs in. The colors themselves live in styles/theme.css.
 */
export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'theme'

export function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function getTheme(): ThemeMode {
  return getStoredTheme() ?? getSystemTheme()
}

/** Applies the mode to <html> (class + data-theme + color-scheme) and persists it. */
export function applyTheme(mode: ThemeMode, persist = true): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(mode)
  root.setAttribute('data-theme', mode)
  root.style.colorScheme = mode
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* private mode — session only */
    }
  }
}

/** Runs before paint to avoid a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;var stored=null;try{stored=window.localStorage.getItem('theme')}catch(e){}var mode=(stored==='light'||stored==='dark')?stored:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');root.classList.remove('light','dark');root.classList.add(mode);root.setAttribute('data-theme',mode);root.style.colorScheme=mode}catch(e){}})();`
