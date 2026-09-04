import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import AnalyticsPanel from '../../components/company/AnalyticsPanel'

export const Route = createFileRoute('/account/analytics')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="analytics">
      <AnalyticsPanel />
    </CompanyShell>
  ),
})
