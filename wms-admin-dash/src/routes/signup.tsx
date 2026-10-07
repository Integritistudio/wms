import { Link, createFileRoute } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import AuthScreen from '../components/AuthScreen'
import { companySignup } from '../lib/api'

export const Route = createFileRoute('/signup')({
  ssr: false,
  component: SignupPage,
})

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

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

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
      setSuccessMessage(res.message || 'Registration submitted. Your account is pending admin approval.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen
      title="Create a company"
      subtitle="An admin approves the account before you can sign in."
      submitLabel="Submit registration"
      error={error}
      loading={loading}
      wide={!successMessage}
      hideHead={Boolean(successMessage)}
      headline="Register"
      headlineEm="a company."
      lede=""
      showRemember={false}
      onSubmit={async () => {
        /* form handled in children */
      }}
      footer={
        successMessage ? null : (
          <p className="login-switch">
            Already have an account? <Link to="/account/login">Sign in</Link>
          </p>
        )
      }
    >
      {successMessage ? (
        <motion.div
          className="login-success"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
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
            <h2 className="login-success-title">Registration submitted</h2>
            <p>
              Your company account is pending admin approval. We&apos;ll notify you by email once
              it&apos;s reviewed.
            </p>
          </div>
          <Link to="/account/login" className="login-submit home-cta">
            Back to sign in
          </Link>
        </motion.div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="login-section">
            <div className="login-form-row">
              <label className="login-field">
                <span>
                  Company name
                  <span className="login-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  name="name"
                  type="text"
                  autoComplete="organization"
                  placeholder="Acme Logistics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="login-field">
                <span>
                  Contact person
                  <span className="login-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  name="contactName"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                />
              </label>
            </div>
            <label className="login-field">
              <span>
                Business email
                <span className="login-required" aria-hidden="true">
                  *
                </span>
              </span>
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
          </div>

          <div className="login-section">
            <div className="login-form-row">
              <label className="login-field">
                <span>
                  Password
                  <span className="login-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <div className="login-password">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
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
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </label>
              <label className="login-field">
                <span>
                  Confirm password
                  <span className="login-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch}
                  required
                />
              </label>
            </div>
            <AnimatePresence>
              {mismatch ? (
                <motion.p
                  className="login-hint"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  Passwords do not match.
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="login-section">
            <label className="login-field">
              <span>Phone</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="login-field">
              <span>Notes</span>
              <textarea
                name="notes"
                className="login-textarea"
                rows={2}
                placeholder="Warehouses, ERP, or anything we should know"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <motion.button
            className="login-submit"
            type="submit"
            disabled={loading}
            whileTap={loading ? undefined : { scale: 0.98 }}
          >
            {loading ? <span className="login-spinner" aria-label="Submitting" /> : 'Submit registration'}
          </motion.button>
        </form>
      )}
    </AuthScreen>
  )
}
