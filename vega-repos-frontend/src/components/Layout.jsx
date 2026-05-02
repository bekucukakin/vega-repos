import { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Layout.module.css'
import { API_BASE } from '../config/api'


const VegaLogo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hexGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#58a6ff" />
        <stop offset="100%" stopColor="#818cf8" />
      </linearGradient>
    </defs>
    <path
      d="M16 2L27.5 8.5V21.5L16 28L4.5 21.5V8.5L16 2Z"
      fill="rgba(88,166,255,0.1)"
      stroke="url(#hexGrad)"
      strokeWidth="1.25"
    />
    <path
      d="M9.5 10L16 21L22.5 10"
      stroke="url(#hexGrad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="16" cy="21" r="2" fill="#818cf8" />
  </svg>
)

const NAV_ICONS = {
  '/': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  '/repos': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  '/people': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  '/metrics': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  '/collaborator-requests': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
}

export default function Layout() {
  const { token, user, logout, getAuthHeader } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [repoResults, setRepoResults] = useState([])
  const [peopleResults, setPeopleResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const searchTimer = useRef(null)
  const searchWrapRef = useRef(null)
  const userMenuRef = useRef(null)

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/repos', label: 'Repositories' },
    { path: '/people', label: 'People' },
    { path: '/collaborator-requests', label: 'Collaborators' },
  ]

  const isMetricsActive = location.pathname.startsWith('/metrics')

  const doSearch = useCallback((q) => {
    const trimmed = q.trim()
    if (!trimmed) { setRepoResults([]); setPeopleResults([]); setShowDropdown(false); return }
    setSearching(true)
    const headers = getAuthHeader()
    const repoReq = fetch(`${API_BASE}/repos/search?q=${encodeURIComponent(trimmed)}`, { headers })
    const peopleReq = trimmed.length >= 2
      ? fetch(`${API_BASE}/people/search?q=${encodeURIComponent(trimmed)}&limit=20`, { headers })
      : Promise.resolve({ ok: true, json: () => Promise.resolve([]) })

    Promise.all([repoReq, peopleReq])
      .then(async ([r1, r2]) => {
        const repos = r1.ok ? await r1.json() : []
        const people = r2.ok ? await r2.json() : []
        setRepoResults(Array.isArray(repos) ? repos : [])
        setPeopleResults(Array.isArray(people) ? people : [])
        setShowDropdown(true)
      })
      .catch(() => { setRepoResults([]); setPeopleResults([]) })
      .finally(() => setSearching(false))
  }, [getAuthHeader])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim()) { setRepoResults([]); setPeopleResults([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(() => doSearch(val), 250)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setShowDropdown(false)
    if (e.key === 'Enter') { e.preventDefault(); if (searchTimer.current) clearTimeout(searchTimer.current); doSearch(query) }
  }

  const handleSelectRepo = (repo) => { setShowDropdown(false); setQuery(''); navigate(`/repos/${repo.owner}/${repo.name}`) }
  const handleSelectPerson = (person) => { setShowDropdown(false); setQuery(''); navigate(`/people/${encodeURIComponent(person.username)}`) }

  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setShowDropdown(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setShowDropdown(false); setQuery(''); setUserMenuOpen(false)
  }, [location.pathname])

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??'
  const showNav = !!token

  return (
    <div className={styles.layout}>
      {showNav && (
        <header className={styles.topNav}>
          <div className={styles.topNavInner}>

            {/* ── Logo ── */}
            <Link to="/" className={styles.navLogo}>
              <VegaLogo />
              <span className={styles.logoText}>VEGA</span>
            </Link>

            <div className={styles.navDivider} />

            {/* ── Nav Links ── */}
            <nav className={styles.navLinks} aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                  >
                    <span className={styles.navIcon}>{NAV_ICONS[item.path]}</span>
                    {item.label}
                  </Link>
                )
              })}

              {/* Metrics link */}
              <Link
                to="/metrics"
                className={`${styles.navLink} ${styles.navLinkMetrics} ${isMetricsActive ? styles.navLinkActive : ''}`}
              >
                <span className={`${styles.navIcon} ${styles.navIconMetrics}`}>{NAV_ICONS['/metrics']}</span>
                Metrics
                <span className={styles.metricsBadge} />
              </Link>
            </nav>

            {/* ── Right side ── */}
            <div className={styles.navRight}>

              {/* Search */}
              <div className={`${styles.searchWrap} ${searchFocused ? styles.searchExpanded : ''}`} ref={searchWrapRef}>
                <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search…"
                  className={styles.searchInput}
                  value={query}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    setSearchFocused(true)
                    if ((repoResults.length > 0 || peopleResults.length > 0) && query.trim()) setShowDropdown(true)
                  }}
                  onBlur={() => setSearchFocused(false)}
                  autoComplete="off"
                />
                {query && (
                  <button type="button" className={styles.searchClear}
                    onClick={() => { setQuery(''); setRepoResults([]); setPeopleResults([]); setShowDropdown(false) }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
                {showDropdown && (
                  <div className={styles.searchDropdown}>
                    {searching && <div className={styles.searchStatus}>Searching…</div>}
                    {!searching && repoResults.length === 0 && peopleResults.length === 0 && query.trim() && (
                      <div className={styles.searchStatus}>No results for &ldquo;{query.trim()}&rdquo;</div>
                    )}
                    {!searching && peopleResults.length > 0 && (
                      <>
                        <div className={styles.searchGroup}>People</div>
                        {peopleResults.map((u) => (
                          <button key={u.username} type="button" className={styles.searchResult} onClick={() => handleSelectPerson(u)}>
                            <span className={styles.resultAvatar}>{u.username.slice(0, 1).toUpperCase()}</span>
                            <span className={styles.resultName}>{u.username}</span>
                            {(u.firstName || u.lastName) && (
                              <span className={styles.resultSub}>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                    {!searching && repoResults.length > 0 && (
                      <>
                        <div className={styles.searchGroup}>Repositories</div>
                        {repoResults.map((repo) => (
                          <button key={`${repo.owner}/${repo.name}`} type="button" className={styles.searchResult} onClick={() => handleSelectRepo(repo)}>
                            <svg className={styles.resultIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className={styles.resultName}>{repo.owner}/{repo.name}</span>
                            <span className={repo.isPublic ? styles.badgePublic : styles.badgePrivate}>
                              {repo.isPublic ? 'Public' : 'Private'}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.navSeparator} />

              {/* Docs link */}
              <Link to="/docs" className={styles.docsBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                Docs
              </Link>

              {/* Download CLI link */}
              <Link to="/download" className={styles.downloadNavBtn}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Install CLI
              </Link>

              {/* User avatar + menu */}
              <div className={styles.userWrap} ref={userMenuRef}>
                <button
                  type="button"
                  className={`${styles.avatarBtn} ${userMenuOpen ? styles.avatarBtnActive : ''}`}
                  onClick={() => setUserMenuOpen((v) => !v)}
                  title={user?.username}
                >
                  <span className={styles.avatar}>{initials}</span>
                </button>

                {userMenuOpen && (
                  <div className={styles.userMenu}>
                    <div className={styles.userMenuHeader}>
                      <span className={styles.userMenuAvatar}>{initials}</span>
                      <div>
                        <div className={styles.userMenuName}>{user?.username}</div>
                        <div className={styles.userMenuRole}>Signed in</div>
                      </div>
                    </div>
                    <div className={styles.userMenuDivider} />
                    <Link to="/profile" className={styles.userMenuItem} onClick={() => setUserMenuOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                      Your profile
                    </Link>
                    <Link to="/repos" className={styles.userMenuItem} onClick={() => setUserMenuOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      Your repositories
                    </Link>
                    <div className={styles.userMenuDivider} />
                    <button type="button" className={styles.userMenuItemDanger} onClick={logout}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
