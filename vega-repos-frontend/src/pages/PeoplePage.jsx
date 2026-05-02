import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './PeoplePage.module.css'
import { API_BASE } from '../config/api'


export default function PeoplePage() {
  const { getAuthHeader } = useAuth()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(
    (query) => {
      const trimmed = query.trim()
      if (trimmed.length < 2) {
        setResults([])
        setLoading(false)
        setError('')
        return
      }
      setLoading(true)
      setError('')
      fetch(`${API_BASE}/people/search?q=${encodeURIComponent(trimmed)}&limit=40`, {
        headers: getAuthHeader(),
      })
        .then((r) => {
          if (r.status === 401 || r.status === 403) throw new Error('Please sign in again.')
          if (r.status === 502) throw new Error('Could not reach user directory. Is User Service running?')
          if (!r.ok) throw new Error('Search failed')
          return r.json()
        })
        .then(setResults)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    },
    [getAuthHeader]
  )

  useEffect(() => {
    const t = setTimeout(() => search(q), 280)
    return () => clearTimeout(t)
  }, [q, search])

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>People</h1>
        <p className={styles.pageSub}>
          Search by username, first name, or last name (at least 2 characters). Open a profile to see repositories you can view (public repos, or private repos where you are a collaborator).
        </p>
      </div>

      <div className={styles.searchBar}>
        <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by username or name (min. 2 characters)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>

      {loading && <div className={styles.hint}>Searching…</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!loading && q.trim().length >= 2 && results.length === 0 && !error && (
        <div className={styles.empty}>No users match &ldquo;{q.trim()}&rdquo;.</div>
      )}

      {!loading && q.trim().length < 2 && !error && (
        <div className={styles.hint}>Type at least 2 characters to search.</div>
      )}

      <ul className={styles.list}>
        {results.map((u) => (
          <li key={u.username}>
            <Link to={`/people/${encodeURIComponent(u.username)}`} className={styles.card}>
              <span className={styles.avatar}>{(u.username || '?').slice(0, 2).toUpperCase()}</span>
              <div className={styles.cardBody}>
                <span className={styles.username}>{u.username}</span>
                {(u.firstName || u.lastName) && (
                  <span className={styles.displayName}>
                    {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
              <span className={styles.chevron}>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
