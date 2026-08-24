import { Outlet, createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'

export const Route = createFileRoute('/account/orders')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="orders">
      <Outlet />
    </CompanyShell>
  ),
})
