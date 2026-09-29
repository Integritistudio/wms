import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { CompanyPortalProvider, CompanyShell } from '../components/company'
import { getCompanySession, isCompanyAuthenticated } from '../lib/auth'

const PUBLIC_ACCOUNT_PATHS = new Set(['/account/login', '/account/forgot'])

export const Route = createFileRoute('/account')({
  ssr: false,
  beforeLoad: ({ location }) => {
    const path = location.pathname
    if (!PUBLIC_ACCOUNT_PATHS.has(path) && !isCompanyAuthenticated()) {
      throw redirect({ to: '/account/login' })
    }
  },
  component: AccountLayout,
})

function AccountLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const sessionKey = getCompanySession()?.token || 'signed-out'
  const isPublic = PUBLIC_ACCOUNT_PATHS.has(pathname)

  return (
    <CompanyPortalProvider key={sessionKey}>
      {isPublic ? (
        <Outlet />
      ) : (
        <CompanyShell>
          <Outlet />
        </CompanyShell>
      )}
    </CompanyPortalProvider>
  )
}
