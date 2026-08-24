import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import FailedOrdersPanel from '../../components/company/FailedOrdersPanel'

export const Route = createFileRoute('/account/failed')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="failed">
      <FailedOrdersPanel />
    </CompanyShell>
  ),
})
