const PLATFORM_KEY = 'wms.platform.auth'
const UPLOADER_KEY = 'wms.uploader.auth'
const COMPANY_KEY = 'wms.company.auth'

export type PlatformUser = {
  id: string
  username: string
  isActive?: boolean
}

export type UploaderUser = {
  id: string
  username: string
  shopIds: string[]
  isActive?: boolean
}

export type CompanyPermissions = {
  orders?: boolean
  returns?: boolean
  failed?: boolean
  warehouses?: boolean
  sftp?: boolean
  routing?: boolean
  email?: boolean
}

export type CompanyUser = {
  id: string
  name: string
  email: string
  role?: 'root' | 'member' | 'warehouse'
  companyId?: string
  warehouseIds?: string[]
  permissions?: CompanyPermissions
  status?: string
  companyName?: string
}

export type Session<T> = {
  token: string
  user: T
}

function read<T>(key: string): Session<T> | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Session<T>) : null
  } catch {
    return null
  }
}

function write<T>(key: string, value: Session<T> | null) {
  if (!value) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function getPlatformSession() {
  return read<PlatformUser>(PLATFORM_KEY)
}

export function savePlatformSession(session: Session<PlatformUser>) {
  write(PLATFORM_KEY, session)
}

export function clearPlatformSession() {
  write(PLATFORM_KEY, null)
}

export function isPlatformAuthenticated() {
  return Boolean(getPlatformSession()?.token)
}

export function getUploaderSession() {
  return read<UploaderUser>(UPLOADER_KEY)
}

export function saveUploaderSession(session: Session<UploaderUser>) {
  write(UPLOADER_KEY, session)
}

export function clearUploaderSession() {
  write(UPLOADER_KEY, null)
}

export function isUploaderAuthenticated() {
  return Boolean(getUploaderSession()?.token)
}

export function getCompanySession() {
  return read<CompanyUser>(COMPANY_KEY)
}

export function saveCompanySession(session: Session<CompanyUser>) {
  write(COMPANY_KEY, session)
}

export function clearCompanySession() {
  write(COMPANY_KEY, null)
}

export function isCompanyAuthenticated() {
  return Boolean(getCompanySession()?.token)
}
