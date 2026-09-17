import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { CompanyPortalProvider } from '../components/company'
import { getCompanySession, isCompanyAuthenticated } from '../lib/auth'

export const Route = createFileRoute('/account')({
  ssr: false,
  beforeLoad: ({ location }) => {
    const path = location.pathname
    const publicPaths = ['/account/login', '/account/forgot']
    if (!publicPaths.includes(path) && !isCompanyAuthenticated()) {
      throw redirect({ to: '/account/login' })
    }
  },
  component: AccountLayout,
})

function AccountLayout() {
  // Re-read on every account navigation so login/logout remounts portal state.
  useRouterState({ select: (s) => s.location.pathname })
  const sessionKey = getCompanySession()?.token || 'signed-out'

  return (
    <CompanyPortalProvider key={sessionKey}>
      <Outlet />
    </CompanyPortalProvider>
  )
}
