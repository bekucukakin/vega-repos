import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'vega_token'
const USER_KEY = 'vega_user'

/** No activity for this long → logout (in addition to JWT expiry) */
const IDLE_LIMIT_MS = 30 * 60 * 1000
/** How often we check JWT expiry + idle */
const SESSION_CHECK_MS = 15 * 1000

function safeGetItem(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key, value) {
  try {
    if (value != null) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch { /* ignore */ }
}

/** Decode JWT payload (no verification — expiry only for client-side UX) */
function parseJwtExpiryMs(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded))
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000
    }
    return null
  } catch {
    return null
  }
}

function loadStoredSession() {
  const t = safeGetItem(TOKEN_KEY)
  if (!t) return { token: null, user: null }
  const expMs = parseJwtExpiryMs(t)
  if (expMs != null && Date.now() >= expMs) {
    safeSetItem(TOKEN_KEY, null)
    safeSetItem(USER_KEY, null)
    return { token: null, user: null }
  }
  let user = null
  try {
    const raw = safeGetItem(USER_KEY)
    if (raw) user = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { token: t, user }
}

export function AuthProvider({ children }) {
  const initial = loadStoredSession()
  const [token, setToken] = useState(initial.token)
  const [user, setUser] = useState(initial.user)

  const lastActivityRef = useRef(Date.now())
  const tokenRef = useRef(token)

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    if (token) {
      safeSetItem(TOKEN_KEY, token)
    } else {
      safeSetItem(TOKEN_KEY, null)
      safeSetItem(USER_KEY, null)
    }
  }, [token])

  const login = (authData) => {
    setToken(authData.token)
    const userData = {
      userId: authData.userId,
      username: authData.username,
      email: authData.email,
    }
    setUser(userData)
    safeSetItem(USER_KEY, JSON.stringify(userData))
    lastActivityRef.current = Date.now()
  }

  // JWT expiry + idle timeout while logged in
  useEffect(() => {
    if (!token) return undefined

    lastActivityRef.current = Date.now()

    const bump = () => {
      lastActivityRef.current = Date.now()
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((e) => {
      window.addEventListener(e, bump, { passive: true, capture: true })
    })

    const tick = () => {
      const t = tokenRef.current
      if (!t) return

      const expMs = parseJwtExpiryMs(t)
      if (expMs != null && Date.now() >= expMs) {
        logout()
        return
      }
      if (Date.now() - lastActivityRef.current > IDLE_LIMIT_MS) {
        logout()
      }
    }

    const id = window.setInterval(tick, SESSION_CHECK_MS)

    return () => {
      window.clearInterval(id)
      events.forEach((e) => {
        window.removeEventListener(e, bump, { capture: true })
      })
    }
  }, [token, logout])

  const getAuthHeader = () => (token ? { Authorization: `Bearer ${token}` } : {})

  return (
    <AuthContext.Provider value={{ token, user, login, logout, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
