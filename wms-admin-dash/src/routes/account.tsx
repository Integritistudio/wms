import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { CompanyPortalProvider } from '../components/company'
import { isCompanyAuthenticated } from '../lib/auth'

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
  // Provider is safe on login/forgot — refresh no-ops without a session token.
  return (
    <CompanyPortalProvider>
      <Outlet />
    </CompanyPortalProvider>
  )
}
