import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import AuthLayout from '../components/AuthLayout'
import { resetPassword } from '../lib/api'
import { saveCompanySession } from '../lib/auth'

export const Route = createFileRoute('/reset/$token')({
  ssr: false,
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      const payload = await resetPassword({ token, password })
      saveCompanySession(payload)
      await navigate({ to: '/account' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      kicker="Password reset"
      headline="Choose a new"
      headlineEm="password."
      lede="Pick something you can remember. You will be signed in after it is saved."
      brandFoot="Company workspace · Invite only"
    >
      <p className="login-card-kicker">Account</p>
      <h2 className="login-title">Reset password</h2>
      <p className="login-subtitle">At least 8 characters.</p>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="login-form" onSubmit={onSubmit}>
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="login-field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </label>
        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  )
}
