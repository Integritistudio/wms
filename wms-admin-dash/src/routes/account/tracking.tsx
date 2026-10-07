import { createFileRoute, redirect } from '@tanstack/react-router'
import ShipooTrackingPanel from '../../components/company/ShipooTrackingPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/tracking')({
  ssr: false,
  beforeLoad: () => {
    const session = getCompanySession()
    const user = session?.user
    if (!user) throw redirect({ to: '/account/login' })
    const allowed =
      user.role === 'root' || Boolean(user.permissions?.tracking)
    if (!allowed) {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: ShipooTrackingPanel,
})
