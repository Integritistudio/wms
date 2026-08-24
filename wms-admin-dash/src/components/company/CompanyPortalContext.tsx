import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  failedOrdersCount,
  getCompanyMe,
  getNotifications,
  type Company,
  type CompanyMember,
  type Shop,
} from '../../lib/api'
import { getCompanySession, saveCompanySession } from '../../lib/auth'

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
  setUnreadNotifCount: (value: number) => void
  setFailedCount: (value: number) => void
  refresh: () => Promise<void>
  refreshCounts: () => Promise<void>
}

const CompanyPortalContext = createContext<CompanyPortalContextValue | null>(null)

export function CompanyPortalProvider({ children }: { children: React.ReactNode }) {
  const session = getCompanySession()
  const [company, setCompany] = useState<Company | null>(null)
  const [currentUser, setCurrentUser] = useState<CompanyMember | null>(null)
  const [failedCount, setFailedCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  const isRoot = (currentUser?.role || session?.user.role) === 'root'

  const shopsById = useMemo(() => {
    return new Map((company?.shops || []).map((shop) => [shop.id, shop]))
  }, [company])

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
  }, [refreshCounts])

  useEffect(() => {
    if (!getCompanySession()?.token) return
    void refresh()
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
      refresh,
      refreshCounts,
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
      refresh,
      refreshCounts,
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
