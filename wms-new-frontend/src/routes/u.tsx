import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/u')({
  ssr: false,
  component: () => <Outlet />,
})
