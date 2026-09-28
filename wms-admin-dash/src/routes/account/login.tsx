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
      title="Linker"
      titlePrefix="Welcome to"
      subtitle="WMS × Ecommerce"
      submitLabel="Sign in"
      userLabel={isPlatform ? 'Username' : 'Email address'}
      userType={isPlatform ? 'text' : 'email'}
      userPlaceholder={isPlatform ? 'admin' : 'you@company.com'}
      headline="Orders in."
      headlineEm="Shipments out."
      lede="A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back. Tracking lands on the order — without the spreadsheet."
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
        <p className="login-switch">
          New to Linker? <Link to="/signup">Open company →</Link>
        </p>
      }
    />
  )
}
