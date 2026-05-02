import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { parseApiError } from '../utils/parseApiError'
import { timeAgo } from '../utils/formatDate'
import { API_BASE } from '../config/api'
import { RepoRowSkeleton } from '../components/Skeleton'
import styles from './RepoListPage.module.css'

function RepoRow({ repo }) {
  const updated = timeAgo(repo.updatedAt || repo.lastUpdated)

  return (
    <div className={styles.repoRow}>
      <div className={styles.repoMain}>
        <div className={styles.repoNameRow}>
          <svg className={styles.repoIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <Link to={`/repos/${repo.owner}/${repo.name}`} className={styles.repoLink}>
            <span className={styles.repoOwner}>{repo.owner}</span>
            <span className={styles.repoSlash}>/</span>
            <span className={styles.repoName}>{repo.name}</span>
          </Link>
          <span className={repo.isPublic ? styles.badgePublic : styles.badgePrivate}>
            {repo.isPublic ? 'Public' : 'Private'}
          </span>
        </div>
        {repo.description && (
          <p className={styles.repoDesc}>{repo.description}</p>
        )}
        {updated && (
          <div className={styles.repoMeta}>
            <span className={styles.metaItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Updated {updated}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RepoListPage() {
  const { user, token, getAuthHeader } = useAuth()
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    if (!user?.username) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchWithTimeout(`${API_BASE}/repos/me`, { headers: getAuthHeader() }, 60_000)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const detail = typeof data.error === 'string' ? data.error
            : typeof data.message === 'string' ? data.message : null
          if (res.status === 401) throw new Error('Session expired or invalid. Please sign in again.')
          throw new Error(
            detail ||
            (res.status >= 500
              ? 'Server error while loading repositories. Is HDFS running (Docker NameNode/DataNode)?'
              : `Failed to load repositories (HTTP ${res.status}).`),
          )
        }
        if (!cancelled) setRepos(Array.isArray(data) ? data : [])
      })
      .catch((err) => { if (!cancelled) setError(parseApiError(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.username, token, getAuthHeader])

  const ownRepos   = useMemo(() => repos.filter((r) => r.owner === user?.username), [repos, user])
  const collabRepos = useMemo(() => repos.filter((r) => r.owner !== user?.username), [repos, user])

  const displayed = useMemo(() => {
    const source = activeTab === 'own' ? ownRepos : activeTab === 'collab' ? collabRepos : repos
    if (!filter.trim()) return source
    const q = filter.trim().toLowerCase()
    return source.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q))
    )
  }, [repos, ownRepos, collabRepos, activeTab, filter])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Repositories</h1>
        </div>
        <div className={styles.repoPanel}>
          {Array.from({ length: 5 }).map((_, i) => <RepoRowSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {error}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Repositories</h1>
        <span className={styles.pageCount}>{repos.length}</span>
      </div>

      {repos.length === 0 ? (
        <div className={styles.empty}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p>No repositories yet</p>
          <span>Push your first repo from the CLI:</span>
          <code>vega push my-project</code>
        </div>
      ) : (
        <div className={styles.repoPanel}>
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="Find a repository…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`} onClick={() => setActiveTab('all')}>
                All <span className={styles.tabCount}>{repos.length}</span>
              </button>
              {ownRepos.length > 0 && (
                <button className={`${styles.tab} ${activeTab === 'own' ? styles.tabActive : ''}`} onClick={() => setActiveTab('own')}>
                  Yours <span className={styles.tabCount}>{ownRepos.length}</span>
                </button>
              )}
              {collabRepos.length > 0 && (
                <button className={`${styles.tab} ${activeTab === 'collab' ? styles.tabActive : ''}`} onClick={() => setActiveTab('collab')}>
                  Collaborations <span className={styles.tabCount}>{collabRepos.length}</span>
                </button>
              )}
            </div>
          </div>
          <div className={styles.repoList}>
            {displayed.length === 0 ? (
              <div className={styles.noResults}>
                No repositories match <strong>&ldquo;{filter}&rdquo;</strong>
              </div>
            ) : (
              displayed.map((repo) => (
                <RepoRow key={`${repo.owner}/${repo.name}`} repo={repo} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
