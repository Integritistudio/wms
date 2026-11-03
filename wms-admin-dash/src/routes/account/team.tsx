import { createFileRoute, redirect } from '@tanstack/react-router'
import TeamPanel, { type UserFilter } from '../../components/company/TeamPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/team')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: UserFilter } => ({
    tab: ['all', 'active', 'pending', 'disabled', 'warehouse'].includes(search.tab as UserFilter)
      ? (search.tab as UserFilter)
      : undefined,
  }),
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: TeamPanelRoute,
})

function TeamPanelRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <TeamPanel
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
