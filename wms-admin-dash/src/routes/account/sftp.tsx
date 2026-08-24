import { createFileRoute, redirect } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import SftpPanel from '../../components/company/SftpPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/sftp')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: () => (
    <CompanyShell activeId="sftp">
      <SftpPanel />
    </CompanyShell>
  ),
})
