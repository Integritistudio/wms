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
  const [notice, setNotice] = useState('')
  const [resetUrl, setResetUrl] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await forgotPassword(email)
      setNotice('If that email exists, a reset link was sent.')
      setResetUrl(result.resetUrl || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      kicker="Password reset"
      headline="Reset and"
      headlineEm="get back in."
      lede="Enter the email on your company account. We will send a one-time reset link."
      brandFoot="Company workspace · Invite only"
    >
      <p className="login-card-kicker">Account</p>
      <h2 className="login-title">Forgot password</h2>
      <p className="login-subtitle">Enter the email on your company account.</p>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="login-notice">{notice}</p> : null}
      {resetUrl ? (
        <p className="login-subtitle">
          Email was not sent. Use this link: <a href={resetUrl}>{resetUrl}</a>
        </p>
      ) : null}
      <form className="login-form" onSubmit={onSubmit}>
        <label className="login-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="login-switch">
        <Link to="/account/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
