import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import NotificationsPanel from '../../components/company/NotificationsPanel'

export const Route = createFileRoute('/account/notifications')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="notifications">
      <NotificationsPanel />
    </CompanyShell>
  ),
})
