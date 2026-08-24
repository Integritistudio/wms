import { createFileRoute, redirect } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import TeamPanel from '../../components/company/TeamPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/team')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: () => (
    <CompanyShell activeId="team">
      <TeamPanel />
    </CompanyShell>
  ),
})
