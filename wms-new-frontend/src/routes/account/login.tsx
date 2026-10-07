import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import AuthScreen, { type AuthAlertTone } from '../../components/AuthScreen'
import { ApiError, companyLogin, platformLogin } from '../../lib/api'
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

function toneFromLoginError(err: unknown): AuthAlertTone {
  if (err instanceof ApiError) {
    if (err.code === 'ACCOUNT_PENDING') return 'pending'
    if (err.code === 'ACCOUNT_REJECTED') return 'rejected'
    if (err.code === 'ACCOUNT_DISABLED') return 'disabled'
  }
  const message = err instanceof Error ? err.message : ''
  if (/pending/i.test(message)) return 'pending'
  if (/rejected/i.test(message)) return 'rejected'
  if (/disabled/i.test(message)) return 'disabled'
  return 'error'
}

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
  const [errorTone, setErrorTone] = useState<AuthAlertTone>('error')
  const [loading, setLoading] = useState(false)

  const isPlatform = selectedRole === 'admin'
  const isWarehouse = selectedRole === 'warehouse'
  const userPlaceholder = isPlatform
    ? 'admin'
    : isWarehouse
      ? 'you@warehouse.com'
      : 'you@company.com'

  return (
    <AuthScreen
      title="Linker"
      titlePrefix="Welcome to"
      subtitle="WMS × Ecommerce"
      submitLabel="Sign in"
      userLabel={isPlatform ? 'Username' : 'Email address'}
      userType={isPlatform ? 'text' : 'email'}
      userPlaceholder={userPlaceholder}
      headline="Orders in."
      headlineEm="Shipments out."
      lede="A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back. Tracking lands on the order — without the spreadsheet."
      roles={LOGIN_ROLES}
      selectedRole={selectedRole}
      onRoleChange={(role) => {
        setSelectedRole(role)
        setError('')
        setErrorTone('error')
      }}
      error={error}
      errorTone={errorTone}
      loading={loading}
      onSubmit={async (usernameOrEmail, password, role) => {
        setError('')
        setErrorTone('error')
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
          setErrorTone(toneFromLoginError(err))
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
