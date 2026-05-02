import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { parseApiError } from '../utils/parseApiError'
import styles from './PeopleProfilePage.module.css'
import { API_BASE } from '../config/api'


function RepoRow({ repo }) {
  return (
    <div className={styles.repoRow}>
      <div className={styles.repoMain}>
        <div className={styles.repoNameRow}>
          <svg className={styles.repoIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        {repo.description && <p className={styles.repoDesc}>{repo.description}</p>}
      </div>
    </div>
  )
}

export default function PeopleProfilePage() {
  const { username } = useParams()
  const decoded = username ? decodeURIComponent(username) : ''
  const { user, getAuthHeader } = useAuth()
  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isSelf = user?.username && decoded && user.username.toLowerCase() === decoded.toLowerCase()

  useEffect(() => {
    if (!decoded) return
    let cancelled = false
    setLoading(true)
    setError('')
    const headers = getAuthHeader()
    Promise.all([
      fetchWithTimeout(`${API_BASE}/people/${encodeURIComponent(decoded)}/profile`, { headers }, 60_000),
      fetchWithTimeout(`${API_BASE}/people/${encodeURIComponent(decoded)}/repos`, { headers }, 60_000),
    ])
      .then(async ([pr, rr]) => {
        if (!pr.ok) throw new Error('User not found')
        const p = await pr.json()
        if (!rr.ok) {
          const err = await rr.json().catch(() => ({}))
          const detail = typeof err.error === 'string' ? err.error : typeof err.message === 'string' ? err.message : null
          throw new Error(detail || 'Could not load repositories')
        }
        const r = await rr.json()
        if (!cancelled) {
          setProfile(p)
          setRepos(Array.isArray(r) ? r : [])
        }
      })
      .catch((e) => {
        if (!cancelled) setError(parseApiError(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [decoded, getAuthHeader])

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading profile…</span>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className={styles.errorState}>
        {error || 'User not found.'}
        <Link to="/people" className={styles.backLink}>Back to People</Link>
      </div>
    )
  }

  const display = [profile.firstName, profile.lastName].filter(Boolean).join(' ')

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.avatar}>{(profile.username || '?').slice(0, 2).toUpperCase()}</div>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{profile.username}</h1>
          {display && <p className={styles.subtitle}>{display}</p>}
          {isSelf && (
            <p className={styles.badgeSelf}>This is you — <Link to="/repos">My repositories</Link> lists everything you can access.</p>
          )}
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Repositories you can see</h2>
          <span className={styles.count}>{repos.length}</span>
        </div>
        <p className={styles.sectionHint}>
          Includes public repositories and private ones where you are a collaborator. Private repos you cannot access are not listed.
        </p>

        {repos.length === 0 ? (
          <div className={styles.empty}>No visible repositories for this user.</div>
        ) : (
          <div className={styles.repoList}>
            {repos.map((repo) => (
              <RepoRow key={`${repo.owner}/${repo.name}`} repo={repo} />
            ))}
          </div>
        )}
      </section>

      <div className={styles.footer}>
        <Link to="/people" className={styles.backLink}>← People search</Link>
      </div>
    </div>
  )
}
