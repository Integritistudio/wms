import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import AuthScreen from '../../components/AuthScreen'
import { companyLogin, platformLogin } from '../../lib/api'
import {
  isCompanyAuthenticated,
  isPlatformAuthenticated,
  saveCompanySession,
  savePlatformSession,
} from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

const LOGIN_ROLES = [
  { value: 'root', label: 'Company Root / Owner' },
  { value: 'member', label: 'Company User' },
  { value: 'warehouse', label: 'Warehouse User' },
  { value: 'admin', label: 'Platform Administrator' },
]

export const Route = createFileRoute('/account/login')({
  ssr: false,
  beforeLoad: () => {
    if (isCompanyAuthenticated()) {
      throw redirect({ to: '/account' })
    }
    if (isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath', params: { consolePath: ADMIN_CONSOLE_PATH } })
    }
  },
  component: CompanyLoginPage,
})

function CompanyLoginPage() {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState('root')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isPlatform = selectedRole === 'admin'

  return (
    <AuthScreen
      kicker={isPlatform ? 'Platform Console' : 'Company Portal'}
      title="Welcome back"
      subtitle="Select your role and sign in to keep warehouses and storefronts in sync."
      submitLabel="Sign in"
      userLabel={isPlatform ? 'Username' : 'Email'}
      userType={isPlatform ? 'text' : 'email'}
      headline="Stock to shipping,"
      headlineEm="always in sync."
      lede="Linker keeps WMS inventory authoritative across Shopify and your warehouses—orders, stock, and tracking in one loop."
      brandFoot="WMS Linker · Multi-tenant fulfillment"
      roles={LOGIN_ROLES}
      selectedRole={selectedRole}
      onRoleChange={(role) => {
        setSelectedRole(role)
        setError('')
      }}
      error={error}
      loading={loading}
      onSubmit={async (usernameOrEmail, password, role) => {
        setError('')
        setLoading(true)
        try {
          if (role === 'admin') {
            const payload = await platformLogin({ username: usernameOrEmail, password })
            savePlatformSession(payload)
            await navigate({
              to: '/$consolePath',
              params: { consolePath: ADMIN_CONSOLE_PATH },
            })
          } else {
            const payload = await companyLogin({
              email: usernameOrEmail,
              password,
              expectedRole: role,
            })
            saveCompanySession(payload)
            await navigate({ to: '/account' })
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to sign in')
        } finally {
          setLoading(false)
        }
      }}
      footer={
        <div className="login-footer-links">
          <p className="login-switch">
            <Link to="/account/forgot">Forgot password?</Link>
          </p>
          <p className="login-switch">
            Don't have a company account? <Link to="/signup">Register your Company</Link>
          </p>
        </div>
      }
    />
  )
}
