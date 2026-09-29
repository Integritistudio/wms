import { createFileRoute, useNavigate } from '@tanstack/react-router'
import WarehouseDetailScreen, {
  type WarehouseDetailTab,
} from '../../components/company/WarehouseDetailScreen'

const TABS: WarehouseDetailTab[] = ['fulfillment', 'modernwms', 'products', 'template']

export type WarehouseDetailSearch = {
  tab?: WarehouseDetailTab
}

export const Route = createFileRoute('/account/warehouses/$warehouseId')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): WarehouseDetailSearch => {
    const tab = typeof search.tab === 'string' ? search.tab : undefined
    return {
      tab: tab && TABS.includes(tab as WarehouseDetailTab) ? (tab as WarehouseDetailTab) : undefined,
    }
  },
  component: WarehouseDetailRoute,
})

function WarehouseDetailRoute() {
  const navigate = useNavigate()
  const { warehouseId } = Route.useParams()
  const { tab } = Route.useSearch()

  return (
    <WarehouseDetailScreen
      warehouseId={warehouseId}
      tab={tab || 'fulfillment'}
      onTabChange={(next) => {
        void navigate({
          to: '/account/warehouses/$warehouseId',
          params: { warehouseId },
          search: next === 'fulfillment' ? {} : { tab: next },
          replace: true,
        })
      }}
      onBack={() => void navigate({ to: '/account/warehouses' })}
    />
  )
}
