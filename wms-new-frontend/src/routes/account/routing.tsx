import { createFileRoute, redirect } from '@tanstack/react-router'
import RoutingPanel from '../../components/company/RoutingPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/routing')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: RoutingPanel,
})
