import { Link } from '@tanstack/react-router'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import AuthLayout from './AuthLayout'

export type AuthAlertTone = 'error' | 'pending' | 'rejected' | 'disabled'

type AuthScreenProps = {
  kicker?: string
  title: string
  titlePrefix?: string
  subtitle?: string
  submitLabel: string
  error: string
  errorTone?: AuthAlertTone
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
  wide?: boolean
  hideHead?: boolean
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 19.2c1.2-2.6 3.4-3.9 6.5-3.9s5.3 1.3 6.5 3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V8a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19L20 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function AuthScreen({
  title,
  titlePrefix = '',
  subtitle,
  submitLabel,
  error,
  errorTone = 'error',
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
  wide = false,
  hideHead = false,
  onSubmit,
  footer,
  children,
}: AuthScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)

  useEffect(() => {
    setUsername('')
  }, [userType])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit(username, password, selectedRole)
  }

  return (
    <AuthLayout headline={headline} headlineEm={headlineEm} lede={lede} wide={wide}>
      {!hideHead ? (
        <div className="login-card-head">
          {titlePrefix ? <p className="login-card-welcome">{titlePrefix}</p> : null}
          <h2 className="login-title">{title}</h2>
          {subtitle ? <p className="login-card-tag">{subtitle}</p> : null}
        </div>
      ) : null}

      {error && !children ? (
        <p
          className={
            errorTone === 'error' ? 'login-error' : `login-status-alert login-status-alert--${errorTone}`
          }
          role="alert"
        >
          {errorTone === 'pending' ? <strong className="login-status-alert-title">Pending approval</strong> : null}
          {errorTone === 'rejected' ? <strong className="login-status-alert-title">Registration rejected</strong> : null}
          {errorTone === 'disabled' ? <strong className="login-status-alert-title">Account disabled</strong> : null}
          <span>{error}</span>
        </p>
      ) : null}

      {children ? (
        <div>{children}</div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          {roles && roles.length > 0 ? (
            <div className="login-field">
              <span id="login-role-label">Sign in as</span>
              <LayoutGroup id="auth-roles">
              <div className="login-roles" role="radiogroup" aria-labelledby="login-role-label">
                {roles.map((role) => {
                  const active = selectedRole === role.value
                  return (
                    <button
                      key={role.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? 'login-role is-active' : 'login-role'}
                      onClick={() => onRoleChange?.(role.value)}
                    >
                      {active ? (
                        <motion.span
                          layoutId="auth-role-pill"
                          className="login-role-bg"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        />
                      ) : null}
                      <span className="login-role-label">{role.label}</span>
                    </button>
                  )
                })}
              </div>
              </LayoutGroup>
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.label
              key={userType}
              className="login-field"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <span>
                {userLabel}
                <span className="login-required" aria-hidden="true">
                  *
                </span>
              </span>
              <div className="login-input">
                <span className="login-input-icon">{userType === 'email' ? <MailIcon /> : <UserIcon />}</span>
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
            </motion.label>
          </AnimatePresence>

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

          <motion.button
            className="login-submit"
            type="submit"
            disabled={loading}
            whileTap={loading ? undefined : { scale: 0.98 }}
          >
            {loading ? <span className="login-spinner" aria-label="Signing in" /> : submitLabel}
          </motion.button>
        </form>
      )}

      {footer}
    </AuthLayout>
  )
}
