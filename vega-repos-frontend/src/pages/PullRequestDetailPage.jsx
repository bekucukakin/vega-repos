import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './PullRequestDetailPage.module.css'

const API_BASE = '/api'

/** Safely parse JSON from fetch response; handles empty/invalid body. */
async function safeJson(r) {
  const text = await r.text()
  if (!text || !text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export default function PullRequestDetailPage() {
  const { username, repoName, prId } = useParams()
  const { getAuthHeader, token } = useAuth()
  const [pr, setPr] = useState(null)
  const [diff, setDiff] = useState(null)
  const [canCreatePr, setCanCreatePr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [activeTab, setActiveTab] = useState('changes')

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  const loadPr = useCallback(() => {
    if (!username || !repoName || !prId) return
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}`, { headers })
      .then((r) => r.ok ? safeJson(r) : null)
      .then(setPr)
      .catch(() => setPr(null))
      .finally(() => setLoading(false))
  }, [username, repoName, prId, headers])

  useEffect(() => {
    loadPr()
  }, [loadPr])

  useEffect(() => {
    if (!username || !repoName) return
    fetch(`${API_BASE}/repos/${username}/${repoName}/can-pr`, { headers })
      .then((r) => r.ok ? safeJson(r) : { canCreatePr: false })
      .then((d) => setCanCreatePr(!!(d?.canCreatePr)))
      .catch(() => setCanCreatePr(false))
  }, [username, repoName, headers])

  useEffect(() => {
    if (!pr || !username || !repoName || !prId) return
    setDiffLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/diff`, { headers })
      .then((r) => (r.ok ? safeJson(r) : null))
      .then((data) => {
        setDiff(data && Array.isArray(data.files) ? data : { files: data?.files ?? [] })
      })
      .catch(() => setDiff({ files: [] }))
      .finally(() => setDiffLoading(false))
  }, [pr?.id, username, repoName, prId, headers])

  const formatDate = (ts) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleDateString()
  }

  const handleReview = async () => {
    setActionError('')
    setActionLoading(true)
    try {
      const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/review`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (r.ok) {
        await loadPr()
      } else {
        const d = await safeJson(r)
        throw new Error(d?.error || `Request failed (${r.status})`)
      }
    } catch (e) {
      setActionError(e?.message || 'Start Review failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = () => {
    setActionError('')
    setActionLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/approve`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? loadPr() : safeJson(r).then((d) => Promise.reject(new Error(d?.error || 'Failed')))))
      .catch((e) => setActionError(e.message || 'Approval failed.'))
      .finally(() => setActionLoading(false))
  }

  const handleReject = () => {
    setActionError('')
    setActionLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/reject`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? loadPr() : safeJson(r).then((d) => Promise.reject(new Error(d?.error || 'Failed')))))
      .catch((e) => setActionError(e.message || 'Reject failed.'))
      .finally(() => setActionLoading(false))
  }

  const handleMerge = () => {
    setActionError('')
    setActionLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/merge`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? loadPr() : safeJson(r).then((d) => Promise.reject(new Error(d?.error || 'Merge failed')))))
      .catch((e) => setActionError(e.message || 'Merge failed.'))
      .finally(() => setActionLoading(false))
  }

  if (loading || !pr) {
    return (
      <div className={styles.container}>
        <Link to={`/repos/${username}/${repoName}`} className={styles.back}>&larr; Back to {repoName}</Link>
        <div className={styles.loading}>{loading ? 'Loading...' : 'Pull request not found'}</div>
      </div>
    )
  }

  const fileCount = diff?.files?.length || 0

  return (
    <div className={styles.container}>
      <Link to={`/repos/${username}/${repoName}`} className={styles.back}>&larr; Back to {repoName}</Link>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.header}>
            <h1>Pull Request Detail View #{prId.replace('PR-', '')}</h1>
            <div className={styles.tags}>
              <span className={styles.vegaTag}>VEGA</span>
              {pr.riskLevel && (
                <span className={pr.riskLevel === 'HIGH' ? styles.riskTagHigh : pr.riskLevel === 'MEDIUM' ? styles.riskTagMedium : styles.riskTagLow}>
                  Risk: {pr.riskLevel}
                </span>
              )}
              <span className={styles.branchInfo}>
                {username}/{repoName} · {pr.sourceBranch} → {pr.targetBranch}
              </span>
            </div>
            <div className={styles.meta}>
              <span>{pr.author}</span>
              <span>{pr.status}</span>
              <span>{formatDate(pr.createdTimestamp)}</span>
              {pr.hasConflicts && <span className={styles.conflict}>Conflicts</span>}
            </div>
            {actionError && <p className={styles.actionError} role="alert">{actionError}</p>}
            {canCreatePr && pr.status !== 'MERGED' && !pr.hasConflicts && (
              <div className={styles.prActions}>
                {pr.status === 'OPEN' && (
                  <button type="button" onClick={handleReview} disabled={actionLoading} className={styles.actionBtn}>
                    Start Review
                  </button>
                )}
                {(pr.status === 'OPEN' || pr.status === 'REVIEWING') && (
                  <>
                    <button type="button" onClick={handleApprove} disabled={actionLoading} className={styles.actionBtnApprove}>
                      Approve
                    </button>
                    <button type="button" onClick={handleReject} disabled={actionLoading} className={styles.actionBtnReject}>
                      Reject
                    </button>
                  </>
                )}
                {pr.status === 'APPROVED' && (
                  <button type="button" onClick={handleMerge} disabled={actionLoading} className={styles.actionBtnApprove}>
                    Merge to {pr.targetBranch}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'changes' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              Changes {fileCount > 0 && `(${fileCount})`}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'insights' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              Insights
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'comments' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments
            </button>
          </div>

          {activeTab === 'changes' && (
            <div className={styles.diffSection}>
              {diffLoading ? (
                <p className={styles.loading}>Loading diff...</p>
              ) : diff?.files?.length === 0 ? (
                <p className={styles.empty}>No file changes</p>
              ) : (
                diff?.files?.map((f) => (
                  <div key={f.path} className={styles.diffFile}>
                    <div className={styles.diffFileHeader}>
                      <span className={styles.diffPath}>{f.path}</span>
                      <span className={`${styles.diffStatus} ${f.status === 'added' ? styles.diffAdded : f.status === 'deleted' ? styles.diffDeleted : styles.diffModified}`}>
                        {f.status}
                      </span>
                    </div>
                    {f.unifiedDiff && (
                      <div className={styles.diffContent}>
                        {f.unifiedDiff.split('\n').map((line, i) => (
                          <div key={i} className={line.startsWith('+') ? styles.diffAdd : line.startsWith('-') ? styles.diffDel : styles.diffContext}>
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'insights' && (
            <div className={styles.insightsSection}>
              {(pr.summaryFilesChanged != null || pr.riskLevel) ? (
                <>
                  <h4>PR Summary & Risk (VEGA)</h4>
                  {pr.summaryFilesChanged != null && (
                    <p>{pr.summaryFilesChanged} files changed, +{pr.summaryLinesAdded ?? 0} / −{pr.summaryLinesRemoved ?? 0} lines</p>
                  )}
                  {pr.riskLevel && (
                    <p>Risk Level: <strong>{pr.riskLevel}</strong></p>
                  )}
                  {pr.riskReasons && pr.riskReasons.length > 0 && (
                    <>
                      <p><strong>Reasons:</strong></p>
                      <ul>
                        {pr.riskReasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </>
                  )}
                  {pr.riskRecommendations && pr.riskRecommendations.length > 0 && (
                    <>
                      <p><strong>Recommendations:</strong></p>
                      <ul>
                        {pr.riskRecommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <p className={styles.empty}>PR Summary & Risk (rule-based) sync from CLI. AI insights (future).</p>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className={styles.commentsSection}>
              <div className={styles.commentInput}>
                <input type="text" placeholder="Post a comment..." className={styles.commentField} />
                <button type="button" className={styles.postBtn}>Post Comment</button>
              </div>
              <p className={styles.empty}>No comments yet.</p>
            </div>
          )}
        </div>

        <aside className={styles.sidebar}>
          {(pr.summaryFilesChanged != null || pr.riskLevel) && (
            <div className={styles.sidebarBlock}>
              <h3>PR Summary & Risk</h3>
              {pr.summaryFilesChanged != null && (
                <p className={styles.summaryStats}>
                  {pr.summaryFilesChanged} files · +{pr.summaryLinesAdded ?? 0} −{pr.summaryLinesRemoved ?? 0}
                </p>
              )}
              {pr.riskLevel && (
                <p className={styles.riskLevel}>
                  <strong>Risk:</strong>{' '}
                  <span className={pr.riskLevel === 'HIGH' ? styles.riskHigh : pr.riskLevel === 'MEDIUM' ? styles.riskMedium : styles.riskLow}>
                    {pr.riskLevel}
                  </span>
                </p>
              )}
              {pr.riskReasons && pr.riskReasons.length > 0 && (
                <ul className={styles.riskReasons}>
                  {pr.riskReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {pr.riskRecommendations && pr.riskRecommendations.length > 0 && (
                <>
                  <p><strong>Recommendations:</strong></p>
                  <ul className={styles.riskReasons}>
                    {pr.riskRecommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className={styles.vegaHint}>Metric-based analysis by VEGA</p>
            </div>
          )}
          <div className={styles.sidebarBlock}>
            <h3>AI Contributions</h3>
            <div className={styles.contribution}>
              <span className={styles.contributor}>{pr.author}</span>
              <span className={styles.vegaBadge}>VEGA</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
