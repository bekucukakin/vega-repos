import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { parseApiError } from '../utils/parseApiError'
import VegaBrandMark from '../components/VegaBrandMark'
import styles from './LoginPage.module.css'
import { API_BASE } from '../config/api'


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
      const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
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
              <VegaBrandMark gradientId="loginHexGrad" />
            </div>
            <span className={styles.logo}>VEGA</span>
            <span className={styles.brandSub}>Version Engine AI</span>
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
