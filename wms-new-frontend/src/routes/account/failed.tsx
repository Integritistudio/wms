import { createFileRoute } from '@tanstack/react-router'
import FailedOrdersPanel from '../../components/company/FailedOrdersPanel'

export const Route = createFileRoute('/account/failed')({
  ssr: false,
  component: FailedOrdersPanel,
})
