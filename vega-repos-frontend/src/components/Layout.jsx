import { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Layout.module.css'

const API_BASE = '/api'

const NAV_ICONS = {
  '/': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  '/repos': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  '/metrics/commits': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  '/metrics/pr-reviews': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  '/collaborator-requests': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  '/people': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const searchTimer = useRef(null)
  const wrapperRef = useRef(null)
  const userMenuRef = useRef(null)

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/repos', label: 'Repositories' },
    { path: '/people', label: 'People' },
    { path: '/metrics/commits', label: 'Commit Metrics' },
    { path: '/metrics/pr-reviews', label: 'PR Reviews' },
    { path: '/collaborator-requests', label: 'Collaborators' },
  ]

  const showSidebar = !!token

  const doSearch = useCallback((q) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setRepoResults([])
      setPeopleResults([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    const headers = getAuthHeader()
    const repoReq = fetch(`${API_BASE}/repos/search?q=${encodeURIComponent(trimmed)}`, { headers })
    const peopleReq =
      trimmed.length >= 2
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
      .catch(() => {
        setRepoResults([])
        setPeopleResults([])
      })
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
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchTimer.current) clearTimeout(searchTimer.current)
      doSearch(query)
    }
  }

  const handleSelectRepo = (repo) => {
    setShowDropdown(false)
    setQuery('')
    navigate(`/repos/${repo.owner}/${repo.name}`)
  }

  const handleSelectPerson = (person) => {
    setShowDropdown(false)
    setQuery('')
    navigate(`/people/${encodeURIComponent(person.username)}`)
  }

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
      setShowDropdown(false)
    }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setShowDropdown(false)
    setQuery('')
    setUserMenuOpen(false)
  }, [location.pathname])

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??'

  return (
    <div className={styles.layout}>
      {showSidebar && (
        <aside className={styles.sidebar}>
          <Link to="/" className={styles.sidebarLogo}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div>
              <span className={styles.logoMark}>VEGA</span>
              <span className={styles.logoSub}>VersionEngine AI</span>
            </div>
          </Link>

          <nav className={styles.sidebarNav}>
            {navItems.map((item) => {
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
                >
                  <span className={styles.navIcon}>{NAV_ICONS[item.path]}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className={styles.sidebarFooter} ref={userMenuRef}>
            <button
              type="button"
              className={styles.userBtn}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <span className={styles.userAvatar}>{initials}</span>
              <span className={styles.userName}>{user?.username}</span>
              <svg className={`${styles.chevron} ${userMenuOpen ? styles.chevronUp : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {userMenuOpen && (
              <div className={styles.userMenu}>
                <Link to="/profile" className={styles.menuItem}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </Link>
                <Link to="/docs" className={styles.menuItem}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  VegaDocs
                </Link>
                <div className={styles.menuDivider} />
                <button type="button" className={styles.menuItemDanger} onClick={logout}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className={styles.mainArea}>
        {showSidebar && (
          <header className={styles.topBar}>
            <div className={styles.searchWrap} ref={wrapperRef}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search repositories and people…"
                className={styles.globalSearch}
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if ((repoResults.length > 0 || peopleResults.length > 0) && query.trim()) setShowDropdown(true)
                }}
                autoComplete="off"
              />
              {query && (
                <button type="button" className={styles.searchClear} onClick={() => { setQuery(''); setRepoResults([]); setPeopleResults([]); setShowDropdown(false) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
              {showDropdown && (
                <div className={styles.searchDropdown}>
                  {searching && <div className={styles.searchStatus}>Searching...</div>}
                  {!searching && repoResults.length === 0 && peopleResults.length === 0 && query.trim() && (
                    <div className={styles.searchStatus}>No results for &ldquo;{query.trim()}&rdquo;</div>
                  )}
                  {!searching && peopleResults.length > 0 && (
                    <>
                      <div className={styles.searchSectionLabel}>People</div>
                      {peopleResults.map((u) => (
                        <button
                          key={u.username}
                          type="button"
                          className={styles.searchResult}
                          onClick={() => handleSelectPerson(u)}
                        >
                          <div className={styles.searchResultMain}>
                            <span className={styles.searchResultName}>{u.username}</span>
                          </div>
                          {(u.firstName || u.lastName) && (
                            <span className={styles.searchResultDesc}>
                              {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {!searching && repoResults.length > 0 && (
                    <>
                      <div className={styles.searchSectionLabel}>Repositories</div>
                      {repoResults.map((repo) => (
                        <button
                          key={`${repo.owner}/${repo.name}`}
                          type="button"
                          className={styles.searchResult}
                          onClick={() => handleSelectRepo(repo)}
                        >
                          <div className={styles.searchResultMain}>
                            <span className={styles.searchResultName}>{repo.name}</span>
                            <span className={repo.isPublic ? styles.searchBadgePublic : styles.searchBadgePrivate}>
                              {repo.isPublic ? 'Public' : 'Private'}
                            </span>
                          </div>
                          <span className={styles.searchResultOwner}>{repo.owner}/{repo.name}</span>
                          {repo.description && <span className={styles.searchResultDesc}>{repo.description}</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={styles.topRight}>
              <Link to="/docs" className={styles.docsLink}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                Docs
              </Link>
              <Link to="/profile" className={styles.topAvatar} title="Profile">
                {initials}
              </Link>
            </div>
          </header>
        )}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
