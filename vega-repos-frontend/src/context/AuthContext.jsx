import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'vega_token'
const USER_KEY = 'vega_user'

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

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => safeGetItem(TOKEN_KEY))
  const [user, setUser] = useState(() => {
    try {
      const u = safeGetItem(USER_KEY)
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })

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
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

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
