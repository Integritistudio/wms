import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/warehouses')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: () => (
    <CompanyShell activeId="warehouses">
      <Outlet />
    </CompanyShell>
  ),
})
