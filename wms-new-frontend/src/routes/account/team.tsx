import { createFileRoute, redirect } from '@tanstack/react-router'
import TeamPanel from '../../components/company/TeamPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/team')({
  ssr: false,
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: TeamPanel,
})
