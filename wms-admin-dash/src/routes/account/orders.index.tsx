import { createFileRoute } from '@tanstack/react-router'
import OrdersPanel from '../../components/company/OrdersPanel'

export const Route = createFileRoute('/account/orders/')({
  ssr: false,
  component: OrdersPanel,
})
