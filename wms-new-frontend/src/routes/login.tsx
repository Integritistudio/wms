import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: '/account/login',
    })
  },
  component: () => null,
})
