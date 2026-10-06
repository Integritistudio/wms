import { createFileRoute } from '@tanstack/react-router'
import OrdersPanel from '../../components/company/OrdersPanel'

export type OrdersSearch = {
  warehouse?: string
  status?: string
}

const ORDER_SEARCH_STATUSES = new Set([
  'received',
  'allocated',
  'partially_fulfilled',
  'fulfilled',
  'returns',
  'error',
  'on_hold',
  'in_transit',
])

export const Route = createFileRoute('/account/orders/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    warehouse: typeof search.warehouse === 'string' && search.warehouse ? search.warehouse : undefined,
    status:
      typeof search.status === 'string' && ORDER_SEARCH_STATUSES.has(search.status)
        ? search.status
        : undefined,
  }),
  component: OrdersPanel,
})
