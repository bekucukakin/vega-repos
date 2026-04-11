import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { parseApiError } from '../utils/parseApiError'
import styles from './RegisterPage.module.css'

const API_BASE = '/api'

// Client-side validations (same rules as CLI/backend)
const USERNAME_MIN = 3
const USERNAME_MAX = 50
const PASSWORD_MIN = 6
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateUsername(v) {
  if (!v || !v.trim()) return 'Username is required'
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) return `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`
  return null
}

function validateEmail(v) {
  if (!v || !v.trim()) return 'Email is required'
  if (!EMAIL_REGEX.test(v.trim())) return 'Email should be valid'
  return null
}

function validatePassword(v) {
  if (!v) return 'Password is required'
  if (v.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  return null
}

function validateName(v, label) {
  if (!v || !v.trim()) return `${label} is required`
  return null
}

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const validate = () => {
    const err = {}
    const u = validateUsername(username)
    if (u) err.username = u
    const e = validateEmail(email)
    if (e) err.email = e
    const p = validatePassword(password)
    if (p) err.password = p
    const f = validateName(firstName, 'First name')
    if (f) err.firstName = f
    const l = validateName(lastName, 'Last name')
    if (l) err.lastName = l
    setFieldErrors(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || data.message
        throw new Error(typeof msg === 'string' ? msg : 'Registration failed.')
      }
      login(data)
      navigate('/repos', { replace: true })
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <Link to="/" className={styles.brandLink}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span className={styles.logo}>VEGA</span>
            <span className={styles.brandSub}>VersionEngine AI</span>
          </Link>
        </div>
        <div className={styles.card}>
          <h1>Create account</h1>
          <p className={styles.sub}>Register to use VEGA and the web UI</p>
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setFieldErrors((x) => ({ ...x, username: null })) }}
                placeholder="3–50 characters"
                autoComplete="username"
              />
              {fieldErrors.username && <span className={styles.fieldError}>{fieldErrors.username}</span>}
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((x) => ({ ...x, email: null })) }}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((x) => ({ ...x, password: null })) }}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
              {fieldErrors.password && <span className={styles.fieldError}>{fieldErrors.password}</span>}
            </label>
            <label>
              First name
              <input
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setFieldErrors((x) => ({ ...x, firstName: null })) }}
                autoComplete="given-name"
              />
              {fieldErrors.firstName && <span className={styles.fieldError}>{fieldErrors.firstName}</span>}
            </label>
            <label>
              Last name
              <input
                type="text"
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setFieldErrors((x) => ({ ...x, lastName: null })) }}
                autoComplete="family-name"
              />
              {fieldErrors.lastName && <span className={styles.fieldError}>{fieldErrors.lastName}</span>}
            </label>
            <button type="submit" disabled={loading} className={styles.submit}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className={styles.footer}>
            Already have an account? <Link to="/login">Sign in</Link>
            <span className={styles.sep}> · </span>
            <Link to="/">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
