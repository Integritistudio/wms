import type { ShopOrder } from './api'

export function orderStatusLabel(order: Pick<ShopOrder, 'status' | 'wmsPushDeferred' | 'suggestedWarehouseId' | 'warehouseId'>) {
  if (order.status === 'error') return 'Error'
  if (order.status === 'cancelled') return 'Cancelled'
  if (order.wmsPushDeferred) return 'Hold · push pending'
  if (order.suggestedWarehouseId && !order.warehouseId) return 'Needs accept'
  if (['940_ready', '945_received'].includes(order.status)) return 'Allocated'
  if (order.status === 'partially_fulfilled') return 'Partial'
  return order.status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
