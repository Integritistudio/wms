import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  failedOrdersCount,
  getCompanyMe,
  getNotifications,
  saveCompanyAppearance,
  type Company,
  type CompanyMember,
  type Shop,
} from '../../lib/api'
import { applyAccentColors, type AccentPresetId } from '../../lib/appearance'
import { getCompanySession, saveCompanySession } from '../../lib/auth'

const BANNER_AUTO_CLEAR_MS = 6000

type CompanyPortalContextValue = {
  company: Company | null
  currentUser: CompanyMember | null
  isRoot: boolean
  shopsById: Map<string, Shop>
  failedCount: number
  unreadNotifCount: number
  error: string
  notice: string
  inviteUrl: string
  setError: (value: string) => void
  setNotice: (value: string) => void
  setInviteUrl: (value: string) => void
  setUnreadNotifCount: (value: number | ((prev: number) => number)) => void
  setFailedCount: (value: number) => void
  clearBanners: () => void
  refresh: () => Promise<void>
  refreshCounts: () => Promise<void>
  saveAppearance: (accentId: AccentPresetId, customAccent: string) => Promise<void>
}

const CompanyPortalContext = createContext<CompanyPortalContextValue | null>(null)

function useEphemeralBanner(ms = BANNER_AUTO_CLEAR_MS) {
  const [value, setValue] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const setBanner = useCallback(
    (next: string) => {
      clearTimer()
      setValue(next)
      if (next) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          setValue('')
        }, ms)
      }
    },
    [clearTimer, ms],
  )

  useEffect(() => () => clearTimer(), [clearTimer])

  return [value, setBanner] as const
}

export function CompanyPortalProvider({ children }: { children: React.ReactNode }) {
  const session = getCompanySession()
  const [company, setCompany] = useState<Company | null>(null)
  const [currentUser, setCurrentUser] = useState<CompanyMember | null>(null)
  const [failedCount, setFailedCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [error, setError] = useEphemeralBanner()
  const [notice, setNotice] = useEphemeralBanner()
  const [inviteUrl, setInviteUrl] = useState('')

  const isRoot = (currentUser?.role || session?.user.role) === 'root'

  const shopsById = useMemo(() => {
    return new Map((company?.shops || []).map((shop) => [shop.id, shop]))
  }, [company])

  const clearBanners = useCallback(() => {
    setError('')
    setNotice('')
  }, [setError, setNotice])

  const refreshCounts = useCallback(async () => {
    try {
      const [dlqCount, notifData] = await Promise.all([
        failedOrdersCount(),
        getNotifications({ unread: true, limit: 1 }).catch(() => ({
          data: { items: [] as never[], total: 0, page: 1, limit: 1 },
          unreadCount: 0,
        })),
      ])
      setFailedCount(dlqCount.count)
      setUnreadNotifCount(notifData.unreadCount)
    } catch {
      /* ignore count refresh errors */
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [sessionData] = await Promise.all([getCompanyMe(), refreshCounts()])
      setCompany(sessionData.company)
      setCurrentUser(sessionData.user)
      const appearance = sessionData.company?.appearance
      if (appearance?.accentId) {
        applyAccentColors(appearance.accentId as AccentPresetId, appearance.customAccent)
      }
      const existing = getCompanySession()
      if (existing?.token && sessionData.user) {
        saveCompanySession({
          token: existing.token,
          user: {
            ...existing.user,
            id: sessionData.user.id,
            name: sessionData.user.name,
            email: sessionData.user.email,
            role: sessionData.user.role,
            companyId: sessionData.user.companyId,
            companyName: sessionData.company?.name || existing.user.companyName,
            status: sessionData.user.status,
            warehouseIds: sessionData.user.warehouseIds,
          },
        })
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load account')
    }
  }, [refreshCounts, setError])

  const saveAppearance = useCallback(async (accentId: AccentPresetId, customAccent: string) => {
    const data = await saveCompanyAppearance({ accentId, customAccent })
    setCompany((prev) => (prev ? { ...prev, appearance: data } : prev))
    applyAccentColors(data.accentId as AccentPresetId, data.customAccent)
  }, [])

  useEffect(() => {
    if (!getCompanySession()?.token) return
    void refresh()
    return () => {
      applyAccentColors('blue', '#2563eb')
    }
  }, [refresh])

  const value = useMemo<CompanyPortalContextValue>(
    () => ({
      company,
      currentUser,
      isRoot,
      shopsById,
      failedCount,
      unreadNotifCount,
      error,
      notice,
      inviteUrl,
      setError,
      setNotice,
      setInviteUrl,
      setUnreadNotifCount,
      setFailedCount,
      clearBanners,
      refresh,
      refreshCounts,
      saveAppearance,
    }),
    [
      company,
      currentUser,
      isRoot,
      shopsById,
      failedCount,
      unreadNotifCount,
      error,
      notice,
      inviteUrl,
      setError,
      setNotice,
      clearBanners,
      refresh,
      refreshCounts,
      saveAppearance,
    ],
  )

  return <CompanyPortalContext.Provider value={value}>{children}</CompanyPortalContext.Provider>
}

export function useCompanyPortal() {
  const ctx = useContext(CompanyPortalContext)
  if (!ctx) {
    throw new Error('useCompanyPortal must be used within CompanyPortalProvider')
  }
  return ctx
}
