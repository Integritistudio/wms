import { createFileRoute, redirect } from '@tanstack/react-router'
import SftpPanel, { type SftpFilter } from '../../components/company/SftpPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/sftp')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: SftpFilter } => ({
    tab: ['all', 'enabled', 'off'].includes(search.tab as SftpFilter)
      ? (search.tab as SftpFilter)
      : undefined,
  }),
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: SftpPanelRoute,
})

function SftpPanelRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <SftpPanel
      filter={tab ?? 'all'}
      onTabChange={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: next }),
          resetScroll: false,
        })
      }}
    />
  )
}
