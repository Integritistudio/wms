import { createFileRoute } from '@tanstack/react-router'
import ReturnsPanel, { STATUS_TABS } from '../../components/company/ReturnsPanel'

export const Route = createFileRoute('/account/returns')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: string; returnId?: string } => ({
    tab: STATUS_TABS.some(({ id }) => id === search.tab) ? String(search.tab) : undefined,
    returnId: typeof search.returnId === 'string' ? search.returnId : undefined,
  }),
  component: ReturnsRoute,
})

function ReturnsRoute() {
  const { returnId, tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ReturnsPanel
      initialReturnId={returnId}
      status={tab ?? 'all'}
      onTabChange={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: next }),
          resetScroll: false,
        })
      }}
    />
  )
}
