import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import AuthScreen from '../../components/AuthScreen'
import { platformLogin } from '../../lib/api'
import { isPlatformAuthenticated, savePlatformSession } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

export const Route = createFileRoute('/$consolePath/login')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath', params })
    }
  },
  component: PlatformLoginPage,
})

function PlatformLoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <AuthScreen
      kicker="Platform"
      title="Console sign in"
      subtitle="Restricted to platform owners. There is no public registration."
      submitLabel="Sign in"
      userLabel="Username"
      headline="Operate the network"
      headlineEm="from one desk."
      lede="Create companies, attach Shopify stores, and watch the 940 to 945 loop from one console."
      brandFoot="Internal console · Owner access only"
      error={error}
      loading={loading}
      onSubmit={async (username, password) => {
        setError('')
        setLoading(true)
        try {
          const payload = await platformLogin({ username, password })
          savePlatformSession(payload)
          await navigate({ to: '/$consolePath', params: { consolePath: ADMIN_CONSOLE_PATH } })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to sign in')
        } finally {
          setLoading(false)
        }
      }}
    />
  )
}
