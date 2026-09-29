import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { ADMIN_CONSOLE_PATH } from '../lib/config'

export const Route = createFileRoute('/$consolePath')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (params.consolePath !== ADMIN_CONSOLE_PATH) {
      throw notFound()
    }
  },
  component: () => <Outlet />,
})
