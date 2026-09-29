import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPanel from '../../components/company/AnalyticsPanel'

export const Route = createFileRoute('/account/analytics')({
  ssr: false,
  component: AnalyticsPanel,
})
