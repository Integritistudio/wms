import { createFileRoute } from '@tanstack/react-router'
import OrderDetailPanel from '../../components/company/OrderDetailPanel'

export const Route = createFileRoute('/account/orders/$orderId')({
  ssr: false,
  component: OrderDetailRoute,
})

function OrderDetailRoute() {
  const { orderId } = Route.useParams()
  return <OrderDetailPanel orderId={orderId} />
}
