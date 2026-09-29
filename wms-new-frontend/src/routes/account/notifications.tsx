import { createFileRoute } from '@tanstack/react-router'
import NotificationsPanel from '../../components/company/NotificationsPanel'

export const Route = createFileRoute('/account/notifications')({
  ssr: false,
  component: NotificationsPanel,
})
