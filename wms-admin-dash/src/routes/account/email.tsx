import { createFileRoute, redirect } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import SmtpSettingsPanel from '../../components/company/SmtpSettingsPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/email')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: () => (
    <CompanyShell activeId="email">
      <SmtpSettingsPanel />
    </CompanyShell>
  ),
})
