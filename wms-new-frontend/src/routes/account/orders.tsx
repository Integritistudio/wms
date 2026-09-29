import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/account/orders')({
  ssr: false,
  component: () => <Outlet />,
})
