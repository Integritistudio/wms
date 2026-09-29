import { createFileRoute } from '@tanstack/react-router'
import ReturnsPanel from '../../components/company/ReturnsPanel'

export const Route = createFileRoute('/account/returns')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    returnId: typeof search.returnId === 'string' ? search.returnId : undefined,
  }),
  component: ReturnsRoute,
})

function ReturnsRoute() {
  const { returnId } = Route.useSearch()
  return <ReturnsPanel initialReturnId={returnId} />
}
