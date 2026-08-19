import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/account')({
  ssr: false,
  component: () => <Outlet />,
})
