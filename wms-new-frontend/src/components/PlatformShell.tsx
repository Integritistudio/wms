import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import AppShell from './AppShell'
import { clearPlatformSession, getPlatformSession } from '../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../lib/config'

type PlatformShellProps = {
  title: string
  subtitle?: string
  activeId?: string
  children: ReactNode
}

export default function PlatformShell({
  title,
  subtitle,
  activeId = 'companies',
  children,
}: PlatformShellProps) {
  const navigate = useNavigate()
  const user = getPlatformSession()?.user

  return (
    <AppShell
      workspace="Platform console"
      workspaceKicker="Owner"
      userName={user?.username || 'Admin'}
      userMeta="Platform"
      title={title}
      subtitle={subtitle}
      nav={[
        {
          id: 'companies',
          label: 'Companies',
          hint: 'Tenants and stores',
          href: `/${ADMIN_CONSOLE_PATH}`,
        },
        {
          id: 'settings',
          label: 'Platform Settings',
          hint: 'Retention & Cleanup',
          href: `/${ADMIN_CONSOLE_PATH}/settings`,
        },
      ]}
      activeId={activeId}
      onNav={(id) => {
        if (id === 'settings') {
          void navigate({ to: '/$consolePath/settings', params: { consolePath: ADMIN_CONSOLE_PATH } })
        } else {
          void navigate({ to: '/$consolePath', params: { consolePath: ADMIN_CONSOLE_PATH } })
        }
      }}
      onSignOut={() => {
        clearPlatformSession()
        void navigate({
          to: '/$consolePath/login',
          params: { consolePath: ADMIN_CONSOLE_PATH },
        })
      }}
    >
      {children}
    </AppShell>
  )
}
