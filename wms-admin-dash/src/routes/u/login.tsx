import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import AuthScreen from '../../components/AuthScreen'
import { uploaderLogin } from '../../lib/api'
import { isUploaderAuthenticated, saveUploaderSession } from '../../lib/auth'

export const Route = createFileRoute('/u/login')({
  ssr: false,
  beforeLoad: () => {
    if (isUploaderAuthenticated()) {
      throw redirect({ to: '/u' })
    }
  },
  component: UploaderLoginPage,
})

function UploaderLoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <AuthScreen
      title="Warehouse sign in"
      subtitle="Upload a 945 or post tracking for a connected store."
      submitLabel="Sign in"
      userLabel="Username"
      userType="text"
      userPlaceholder="uploader"
      headline="Shipments in."
      headlineEm="Tracking out."
      lede="Upload a 945 or enter tracking. Shopify fulfillment updates when the store is installed."
      showRemember={false}
      error={error}
      loading={loading}
      onSubmit={async (username, password) => {
        setError('')
        setLoading(true)
        try {
          const payload = await uploaderLogin({ username, password })
          saveUploaderSession(payload)
          await navigate({ to: '/u' })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to sign in')
        } finally {
          setLoading(false)
        }
      }}
    />
  )
}
