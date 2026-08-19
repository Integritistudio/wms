export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'
export const ADMIN_CONSOLE_PATH = (import.meta.env.VITE_ADMIN_CONSOLE_PATH || 'c-7f3k91qx').replace(
  /^\/+|\/+$/g,
  '',
)

export function consolePath(suffix = '') {
  return `/${ADMIN_CONSOLE_PATH}${suffix}`
}
