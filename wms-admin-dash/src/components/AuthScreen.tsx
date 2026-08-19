import { useState, type FormEvent, type ReactNode } from 'react'
import AuthLayout from './AuthLayout'

type AuthScreenProps = {
  kicker: string
  title: string
  subtitle: string
  submitLabel: string
  error: string
  loading: boolean
  userLabel?: string
  userType?: 'text' | 'email'
  headline?: string
  headlineEm?: string
  lede?: string
  brandFoot?: string
  onSubmit: (username: string, password: string) => Promise<void>
  footer?: ReactNode
}

export default function AuthScreen({
  kicker,
  title,
  subtitle,
  submitLabel,
  error,
  loading,
  userLabel = 'User',
  userType = 'text',
  headline = 'Shopify to warehouse,',
  headlineEm = 'without the busywork.',
  lede = 'Orders become EDI 940s. Shipments come back as 945s. Shopify gets tracking.',
  brandFoot,
  onSubmit,
  footer,
}: AuthScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit(username, password)
  }

  return (
    <AuthLayout
      kicker={kicker}
      headline={headline}
      headlineEm={headlineEm}
      lede={lede}
      brandFoot={brandFoot}
    >
      <p className="login-card-kicker">{kicker}</p>
      <h2 className="login-title">{title}</h2>
      <p className="login-subtitle">{subtitle}</p>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="login-form" onSubmit={handleSubmit}>
        <label className="login-field">
          <span>{userLabel}</span>
          <input
            name="username"
            type={userType}
            autoComplete={userType === 'email' ? 'email' : 'username'}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <div className="login-password">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : submitLabel}
        </button>
      </form>
      {footer}
    </AuthLayout>
  )
}
