import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/parseApiError'
import styles from './LoginPage.module.css'

const API_BASE = '/api'

export default function LoginPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || data.message
        throw new Error(typeof msg === 'string' ? msg : 'Login failed.')
      }
      login(data)
      navigate('/repos')
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
          <h1>Sign in</h1>
          <p className={styles.sub}>Enter your credentials to continue</p>
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}
            <label>
              Username or Email
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="Enter your username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
            <button type="submit" disabled={loading} className={styles.submit}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className={styles.footer}>
            <Link to="/">← Home</Link>
            <span className={styles.sep}> · </span>
            <Link to="/register">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
