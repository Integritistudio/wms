import { createFileRoute, redirect } from '@tanstack/react-router'
import { ADMIN_CONSOLE_PATH } from '../lib/config'

export const Route = createFileRoute('/login')({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: '/$consolePath/login',
      params: { consolePath: ADMIN_CONSOLE_PATH },
    })
  },
  component: () => null,
})
