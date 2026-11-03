import { createFileRoute } from '@tanstack/react-router'
import WarehousePanel from '../../components/company/WarehousePanel'

export const Route = createFileRoute('/account/warehouses/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): {
    view?: 'warehouses' | 'stores'
    warehouseTab?: 'all' | 'modernwms' | 'sftp' | 'needs_setup'
    tab?: string
  } => ({
    view: search.view === 'stores' || search.view === 'warehouses' ? search.view : undefined,
    warehouseTab: search.warehouseTab === 'all' || search.warehouseTab === 'modernwms'
      || search.warehouseTab === 'sftp' || search.warehouseTab === 'needs_setup'
      ? search.warehouseTab
      : undefined,
    tab: ['all', 'connected', 'awaiting', 'sync_issue', 'disabled'].includes(search.tab as string)
      ? String(search.tab)
      : undefined,
  }),
  component: WarehousePanel,
})
