import { createFileRoute, redirect } from '@tanstack/react-router'
import { isCompanyAuthenticated } from '../../lib/auth'

export const Route = createFileRoute('/account/')({
  ssr: false,
  beforeLoad: () => {
    if (!isCompanyAuthenticated()) {
      throw redirect({ to: '/account/login' })
    }
    throw redirect({ to: '/account/orders' })
  },
})
