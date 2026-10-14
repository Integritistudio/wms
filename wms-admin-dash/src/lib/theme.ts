/**
 * Light / dark theme — dashboard defaults to light mode.
 * The colors themselves live in styles/theme.css.
 */
export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'theme'

export function getSystemTheme(): ThemeMode {
  return 'light'
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
  return 'light'
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

/** Runs before paint — always light (ignores system dark preference). */
export const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;try{window.localStorage.setItem('theme','light')}catch(e){}root.classList.remove('light','dark');root.classList.add('light');root.setAttribute('data-theme','light');root.style.colorScheme='light'}catch(e){}})();`
