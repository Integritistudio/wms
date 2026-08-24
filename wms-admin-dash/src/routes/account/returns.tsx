import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import ReturnsPanel from '../../components/company/ReturnsPanel'

export const Route = createFileRoute('/account/returns')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="returns">
      <ReturnsPanel />
    </CompanyShell>
  ),
})
