import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import BrandLoader from '../../components/BrandLoader'
import type { RoutingTab } from '../../components/company/RoutingPanel'
import { getCompanySession } from '../../lib/auth'

const RoutingPanel = lazy(() => import('../../components/company/RoutingPanel'))

export const Route = createFileRoute('/account/routing')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: RoutingTab; ruleWarehouse?: string; inventoryWarehouse?: string; ruleStatus?: string; warehouseMode?: string; warehouseGeo?: string } => ({
    ruleWarehouse: typeof search.ruleWarehouse === 'string' ? search.ruleWarehouse : undefined,
    inventoryWarehouse: typeof search.inventoryWarehouse === 'string' ? search.inventoryWarehouse : undefined,
    ruleStatus: ['all', 'active', 'off'].includes(search.ruleStatus as string) ? String(search.ruleStatus) : undefined,
    warehouseMode: ['all', 'modernwms', 'sftp_edi'].includes(search.warehouseMode as string) ? String(search.warehouseMode) : undefined,
    warehouseGeo: ['all', 'mapped', 'unmapped'].includes(search.warehouseGeo as string) ? String(search.warehouseGeo) : undefined,
    tab: ['rules', 'settings', 'warehouses', 'inventory'].includes(search.tab as RoutingTab)
      ? (search.tab as RoutingTab)
      : undefined,
  }),
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: RoutingPanelRoute,
})

function RoutingPanelRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <Suspense fallback={<BrandLoader label="Loading routing..." />}>
      <RoutingPanel
        tab={tab ?? 'rules'}
        onTabChange={(next) => {
          void navigate({
            search: (previous) => ({ ...previous, tab: next }),
            resetScroll: false,
          })
        }}
      />
    </Suspense>
  )
}
