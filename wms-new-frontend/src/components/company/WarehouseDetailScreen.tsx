import { WarehouseDetailPanel, type WarehouseDetailTab } from './WarehousePanel'
import { useCompanyPortal } from './CompanyPortalContext'

export type { WarehouseDetailTab }

export default function WarehouseDetailScreen({
  warehouseId,
  tab,
  onTabChange,
  onBack,
}: {
  warehouseId: string
  tab: WarehouseDetailTab
  onTabChange: (tab: WarehouseDetailTab) => void
  onBack: () => void
}) {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const connections = company?.sftpConnections || []
  const warehouse = warehouses.find((w) => w.id === warehouseId) || null

  if (!warehouse) {
    return (
      <div className="oj-page wh-detail-page">
        <button type="button" className="wh-detail-back-chip" onClick={onBack}>
          ← Warehouses
        </button>
        <p className="demo-muted mt-3">Warehouse not found.</p>
      </div>
    )
  }

  return (
    <div className="oj-page wh-detail-page">
      <WarehouseDetailPanel
        warehouse={warehouse}
        connections={connections}
        activeTab={tab}
        onTabChange={onTabChange}
        onClose={onBack}
        onError={setError}
        onNotice={setNotice}
        onSaved={() => void refresh()}
      />
    </div>
  )
}
