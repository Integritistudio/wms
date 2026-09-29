import { createFileRoute } from '@tanstack/react-router'
import UserGuidePanel from '../../components/company/UserGuidePanel'

export const Route = createFileRoute('/account/guide')({
  ssr: false,
  component: UserGuidePanel,
})
