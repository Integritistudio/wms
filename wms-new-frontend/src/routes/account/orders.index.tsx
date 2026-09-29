import { createFileRoute } from '@tanstack/react-router'
import OrdersPanel from '../../components/company/OrdersPanel'

export type OrdersSearch = {
  warehouse?: string
}

export const Route = createFileRoute('/account/orders/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    warehouse: typeof search.warehouse === 'string' && search.warehouse ? search.warehouse : undefined,
  }),
  component: OrdersPanel,
})
