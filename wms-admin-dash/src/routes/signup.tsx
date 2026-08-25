import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import AuthScreen from '../components/AuthScreen'
import { companySignup } from '../lib/api'

export const Route = createFileRoute('/signup')({
  ssr: false,
  component: SignupPage,
})

function SignupPage() {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await companySignup({
        name,
        contactName: contactName || name,
        email,
        password,
        phone,
        notes,
      })
      setSuccessMessage(res.message || 'Registration submitted! Your account is pending Admin approval.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen
      kicker="Company Onboarding"
      title="Register your Company"
      subtitle="Submit your business details for Platform Admin review and activation."
      submitLabel="Submit Registration"
      error={error}
      loading={loading}
      headline="Scale your fulfillment,"
      headlineEm="automated & synchronized."
      lede="Register your company to route orders across multiple 3PL warehouses, synchronize EDI 940/945 documents, and monitor live inventory."
      brandFoot="WMS Linker Multi-Tenant Platform"
      onSubmit={async () => { /* noop - form handled in children */ }}
      footer={
        successMessage ? (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              borderRadius: '8px',
              backgroundColor: 'var(--card-subtle, #f0fdf4)',
              border: '1px solid #bbf7d0',
              color: '#166534',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Registration Submitted!</h3>
            <p style={{ margin: 0, fontSize: '0.925rem', lineHeight: 1.5 }}>{successMessage}</p>
            <div style={{ marginTop: '1.25rem' }}>
              <Link to="/account/login" className="login-submit" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none', padding: '0.65rem 1.25rem' }}>
                Back to Sign in
              </Link>
            </div>
          </div>
        ) : null
      }
    >
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}

      {!successMessage ? (
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Company Name *</span>
            <input
              name="name"
              type="text"
              placeholder="Acme Logistics Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="login-field">
            <span>Contact Person Name *</span>
            <input
              name="contactName"
              type="text"
              placeholder="Jane Doe"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
          </label>

          <label className="login-field">
            <span>Business Email Address *</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="jane@acmelogistics.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="login-field">
              <span>Password *</span>
              <div className="login-password">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min 8 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className="login-field">
              <span>Confirm Password *</span>
              <input
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="login-field">
            <span>Phone Number (optional)</span>
            <input
              name="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Notes / Business Requirements (optional)</span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Tell us about your warehouse or ERP requirements..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--card-bg, #fff)',
                color: 'inherit',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </label>

          <button className="login-submit" type="submit" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Submitting registration…' : 'Submit Registration'}
          </button>

          <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>Already have an account? </span>
            <Link to="/account/login" style={{ fontWeight: 600, color: 'var(--accent, #2563eb)' }}>
              Sign in
            </Link>
          </div>
        </form>
      ) : null}
    </AuthScreen>
  )
}
