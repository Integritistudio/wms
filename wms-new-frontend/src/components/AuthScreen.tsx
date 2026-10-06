import { Link } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import AuthLayout from './AuthLayout'

type AuthScreenProps = {
  kicker?: string
  title: string
  titlePrefix?: string
  subtitle?: string
  submitLabel: string
  error: string
  loading: boolean
  userLabel?: string
  userType?: 'text' | 'email'
  userPlaceholder?: string
  headline?: string
  headlineEm?: string
  lede?: string
  roles?: Array<{ value: string; label: string }>
  selectedRole?: string
  onRoleChange?: (role: string) => void
  showRemember?: boolean
  onSubmit: (username: string, password: string, role?: string) => Promise<void>
  footer?: ReactNode
  children?: ReactNode
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 10V8a4 4 0 018 0v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path
          d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M4 19L20 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function AuthScreen({
  title,
  titlePrefix = 'Welcome to',
  subtitle = 'WMS × Ecommerce',
  submitLabel,
  error,
  loading,
  userLabel = 'Email address',
  userType = 'email',
  userPlaceholder = 'you@company.com',
  headline = 'Orders in.',
  headlineEm = 'Shipments out.',
  lede,
  roles,
  selectedRole,
  onRoleChange,
  showRemember = true,
  onSubmit,
  footer,
  children,
}: AuthScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit(username, password, selectedRole)
  }

  return (
    <AuthLayout headline={headline} headlineEm={headlineEm} lede={lede}>
      <div className="login-card-head">
        <p className="login-card-welcome">{titlePrefix}</p>
        <h2 className="login-title">{title}</h2>
        {subtitle ? <p className="login-card-tag">{subtitle}</p> : null}
      </div>

      {error && !children ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}

      {children ? (
        <div>{children}</div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          {roles && roles.length > 0 ? (
            <label className="login-field">
              <span className="login-role-label-x">Sign in as</span>
              <select
                name="role"
                className="login-select"
                value={selectedRole}
                onChange={(event) => onRoleChange?.(event.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="login-field">
            <span>
              {userLabel}
              <span className="login-required" aria-hidden="true">
                *
              </span>
            </span>
            <div className="login-input">
              <span className="login-input-icon">
                <MailIcon />
              </span>
              <input
                name="username"
                type={userType}
                autoComplete={userType === 'email' ? 'email' : 'username'}
                placeholder={userPlaceholder}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>
              Password
              <span className="login-required" aria-hidden="true">
                *
              </span>
            </span>
            <div className="login-input login-password">
              <span className="login-input-icon">
                <LockIcon />
              </span>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
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
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </label>

          {showRemember ? (
            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <Link className="login-forgot" to="/account/forgot">
                Forgot password?
              </Link>
            </div>
          ) : null}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : (
              <>
                {submitLabel}
                <span aria-hidden="true"> →</span>
              </>
            )}
          </button>
        </form>
      )}

      {footer}
    </AuthLayout>
  )
}
