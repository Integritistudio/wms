import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import AuthLayout from '../../components/AuthLayout'
import { forgotPassword } from '../../lib/api'

export const Route = createFileRoute('/account/forgot')({
  ssr: false,
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resetUrl, setResetUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setCopied(false)
    setLoading(true)
    try {
      const result = await forgotPassword(email)
      setResetUrl(result.resetUrl || '')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset')
    } finally {
      setLoading(false)
    }
  }

  async function copyResetLink() {
    if (!resetUrl) return
    try {
      await navigator.clipboard.writeText(resetUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <AuthLayout
      headline="Reset and"
      headlineEm="get back in."
      lede="Enter the email on your company account. We will send a one-time reset link."
    >
      {submitted ? (
        <div className="login-success">
          <span className="login-success-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <path
                d="M5 12.5l4.2 4.2L19 7.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="login-success-copy">
            <h2 className="login-success-title">Check your email</h2>
            <p>
              If an account exists for <strong>{email}</strong>, a password reset link is on the
              way. The link expires after a short time.
            </p>
          </div>

          {resetUrl ? (
            <div className="login-reset-fallback">
              <p className="login-reset-fallback-label">Email delivery is off in this environment</p>
              <p className="login-reset-fallback-hint">
                Use this temporary link to finish resetting your password:
              </p>
              <div className="login-reset-fallback-row">
                <input className="demo-input" readOnly value={resetUrl} aria-label="Reset link" />
                <button className="login-submit login-reset-copy" type="button" onClick={() => void copyResetLink()}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : null}

          <Link to="/account/login" className="login-submit home-cta">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <p className="login-card-kicker">Account</p>
          <h2 className="login-title">Forgot password</h2>
          <p className="login-subtitle">Enter the email on your company account.</p>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <form className="login-form" onSubmit={onSubmit}>
            <label className="login-field">
              <span>
                Email
                <span className="login-required" aria-hidden="true">
                  *
                </span>
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <p className="login-switch">
            <Link to="/account/login">Back to sign in</Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
