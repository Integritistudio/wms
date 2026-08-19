import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import AuthScreen from '../../components/AuthScreen'
import { companyLogin } from '../../lib/api'
import { isCompanyAuthenticated, saveCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/login')({
  ssr: false,
  beforeLoad: () => {
    if (isCompanyAuthenticated()) {
      throw redirect({ to: '/account' })
    }
  },
  component: CompanyLoginPage,
})

function CompanyLoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <AuthScreen
      kicker="Company portal"
      title="Welcome back"
      subtitle="Sign in with the email from your invite. Company and warehouse users share this screen."
      submitLabel="Sign in"
      userLabel="Email"
      userType="email"
      headline="Your warehouse,"
      headlineEm="connected to Shopify."
      lede="Orders become EDI 940s. Shipments come back as 945s. Tracking returns to the store."
      brandFoot="Company workspace · Invite only"
      error={error}
      loading={loading}
      onSubmit={async (email, password) => {
        setError('')
        setLoading(true)
        try {
          const payload = await companyLogin({ email, password })
          saveCompanySession(payload)
          await navigate({ to: '/account' })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to sign in')
        } finally {
          setLoading(false)
        }
      }}
      footer={
        <p className="login-switch">
          <Link to="/account/forgot">Forgot password?</Link>
        </p>
      }
    />
  )
}
