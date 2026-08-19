import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import AuthLayout from '../components/AuthLayout'
import { peekInvite, setCompanyPassword } from '../lib/api'
import { saveCompanySession } from '../lib/auth'

export const Route = createFileRoute('/invite/$token')({
  ssr: false,
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void peekInvite(token)
      .then((invite) => {
        setCompanyName(invite.name)
        setEmail(invite.email)
        setReady(true)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Invite link is invalid or expired')
      })
  }, [token])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setLoading(true)
    try {
      const payload = await setCompanyPassword({ token, password })
      saveCompanySession(payload)
      await navigate({ to: '/account' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      kicker="Company invite"
      headline="Set a password"
      headlineEm="and you are in."
      lede="Choose a password for this company account. You will land in the portal after saving."
      brandFoot="Invite-only access · Encrypted sessions"
    >
      <p className="login-card-kicker">Invite</p>
      <h2 className="login-title">{companyName || 'Set password'}</h2>
      <p className="login-subtitle">
        {email ? `Sign-in email is ${email}.` : 'Choose a password for this account.'} At least 8
        characters.
      </p>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      {ready ? (
        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-field">
            <span>Password</span>
            <div className="login-password">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
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
          <label className="login-field">
            <span>Confirm password</span>
            <input
              name="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </label>
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Set password'}
          </button>
        </form>
      ) : error ? null : (
        <p className="login-subtitle">Checking invite…</p>
      )}
    </AuthLayout>
  )
}
