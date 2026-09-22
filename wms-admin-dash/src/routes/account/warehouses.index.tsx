import { createFileRoute } from '@tanstack/react-router'
import WarehousePanel from '../../components/company/WarehousePanel'

export const Route = createFileRoute('/account/warehouses/')({
  ssr: false,
  component: WarehousePanel,
})
