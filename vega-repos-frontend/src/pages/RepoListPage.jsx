import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './RepoListPage.module.css'

const API_BASE = '/api'

export default function RepoListPage() {
  const { user, getAuthHeader } = useAuth()
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (loading) return <div className={styles.loading}>Loading repositories...</div>
  if (error) return <div className={styles.error}>{error}</div>

  const ownRepos = repos.filter((r) => r.owner === user?.username)
  const collabRepos = repos.filter((r) => r.owner !== user?.username)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Repositories</h1>
          <p className={styles.sub}>{repos.length} repositories total</p>
        </div>
      </div>

      {repos.length === 0 ? (
        <div className={styles.empty}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p>No repositories found</p>
          <span>Push a repo from CLI to get started: <code>vega push my-repo</code></span>
        </div>
      ) : (
        <>
          {ownRepos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                Your Repositories
                <span className={styles.count}>{ownRepos.length}</span>
              </h2>
              <div className={styles.cardGrid}>
                {ownRepos.map((repo) => (
                  <RepoCard key={`${repo.owner}/${repo.name}`} repo={repo} />
                ))}
              </div>
            </section>
          )}
          {collabRepos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Collaborations
                <span className={styles.count}>{collabRepos.length}</span>
              </h2>
              <div className={styles.cardGrid}>
                {collabRepos.map((repo) => (
                  <RepoCard key={`${repo.owner}/${repo.name}`} repo={repo} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function RepoCard({ repo }) {
  return (
    <Link
      to={`/repos/${repo.owner}/${repo.name}`}
      className={styles.card}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3 className={styles.cardTitle}>{repo.name}</h3>
        <span className={repo.isPublic ? styles.badgePublic : styles.badgePrivate}>
          {repo.isPublic ? 'Public' : 'Private'}
        </span>
      </div>
      <p className={styles.cardOwner}>{repo.owner}</p>
      {repo.description && <p className={styles.cardDesc}>{repo.description}</p>}
      <div className={styles.cardFooter}>
        <span className={styles.cardPath}>{repo.owner}/{repo.name}</span>
      </div>
    </Link>
  )
}
