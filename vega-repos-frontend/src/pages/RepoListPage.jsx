import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './RepoListPage.module.css'

const API_BASE = '/api'

function timeAgo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`
  return `${Math.floor(diff / 31536000)} years ago`
}

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
  const { user, getAuthHeader } = useAuth()
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    if (!user?.username) return
    fetch(`${API_BASE}/repos/me`, { headers: getAuthHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load repositories')
        return res.json()
      })
      .then(setRepos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [user?.username])

  const ownRepos = useMemo(() => repos.filter((r) => r.owner === user?.username), [repos, user])
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
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <span>Loading repositories…</span>
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
      {/* ── Header ── */}
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
          {/* ── Filter bar ── */}
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

          {/* ── List ── */}
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
