import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import UserGuidePanel from '../../components/company/UserGuidePanel'

export const Route = createFileRoute('/account/guide')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="guide">
      <UserGuidePanel />
    </CompanyShell>
  ),
})
