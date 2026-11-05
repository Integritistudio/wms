/**
 * Shared light / dark theme — dashboard defaults to light mode.
 * The colors themselves live in styles/theme.css.
 */
export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'theme'

export function getSystemTheme(): ThemeMode {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
  return getStoredTheme() ?? 'light'
}

/** Applies the mode to <html> (class + data-theme + color-scheme) and persists it. */
export function applyTheme(mode: ThemeMode = 'light', persist = true): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(mode)
  root.setAttribute('data-theme', mode)
  root.style.colorScheme = mode
  window.dispatchEvent(new Event('wms-theme-change'))
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* private mode — session only */
    }
  }
}

/** Restore the saved mode before paint to prevent a light flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var mode='light';try{if(window.localStorage.getItem('theme')==='dark')mode='dark'}catch(e){}var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(mode);root.setAttribute('data-theme',mode);root.style.colorScheme=mode}catch(e){}})();`
