import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './PullRequestDetailPage.module.css'

const API_BASE = '/api'

async function safeJson(r) {
  const text = await r.text()
  if (!text || !text.trim()) return null
  try { return JSON.parse(text) } catch { return null }
}

function RiskBadge({ level }) {
  if (!level) return null
  const cls = level === 'HIGH' ? styles.riskHigh : level === 'MEDIUM' ? styles.riskMedium : styles.riskLow
  return <span className={`${styles.riskBadge} ${cls}`}>{level}</span>
}

function StatusBadge({ status }) {
  const map = {
    OPEN: styles.statusOpen,
    REVIEWING: styles.statusReviewing,
    APPROVED: styles.statusApproved,
    REJECTED: styles.statusRejected,
    MERGED: styles.statusMerged,
  }
  return <span className={`${styles.statusBadge} ${map[status] || styles.statusOpen}`}>{status}</span>
}

function formatDate(ts) {
  if (!ts) return '-'
  return new Date(Number(ts)).toLocaleString()
}

export default function PullRequestDetailPage() {
  const { username, repoName, prId } = useParams()
  const { token } = useAuth()
  const [pr, setPr] = useState(null)
  const [diff, setDiff] = useState(null)
  const [canCreatePr, setCanCreatePr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [activeTab, setActiveTab] = useState('changes')
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  const loadPr = useCallback(() => {
    if (!username || !repoName || !prId) return
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}`, { headers })
      .then((r) => r.ok ? safeJson(r) : null)
      .then(setPr)
      .catch(() => setPr(null))
      .finally(() => setLoading(false))
  }, [username, repoName, prId, headers])

  useEffect(() => { loadPr() }, [loadPr])

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
      .then((data) => setDiff(data && Array.isArray(data.files) ? data : { files: [] }))
      .catch(() => setDiff({ files: [] }))
      .finally(() => setDiffLoading(false))
  }, [pr?.id, username, repoName, prId, headers])

  const doAction = async (path) => {
    setActionError('')
    setActionLoading(true)
    try {
      const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      if (r.ok) {
        await loadPr()
      } else {
        const d = await safeJson(r)
        throw new Error(d?.error || `Request failed (${r.status})`)
      }
    } catch (e) {
      setActionError(e?.message || 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAiAnalysis = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiError('')
    setAiAnalysis(null)
    try {
      const r = await fetch(
        `${API_BASE}/repos/${username}/${repoName}/pull-requests/${prId}/ai-analysis`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } }
      )
      const data = await safeJson(r)
      if (r.ok && data?.success !== false) {
        setAiAnalysis(data)
        setActiveTab('insights')
      } else {
        setAiError(data?.error || `AI service returned ${r.status}`)
      }
    } catch (e) {
      setAiError(e?.message || 'Failed to reach AI service.')
    } finally {
      setAiLoading(false)
    }
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
  const isTerminal = pr.status === 'MERGED' || pr.status === 'REJECTED'

  return (
    <div className={styles.container}>
      <Link to={`/repos/${username}/${repoName}`} className={styles.back}>&larr; Back to {repoName}</Link>

      <div className={styles.layout}>
        <div className={styles.main}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTop}>
              <h1 className={styles.prTitle}>
                {pr.description || `PR #${prId.replace('PR-', '')}`}
              </h1>
              <StatusBadge status={pr.status} />
            </div>
            <div className={styles.headerMeta}>
              <span className={styles.branchPill}>{pr.sourceBranch}</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.branchPill}>{pr.targetBranch}</span>
              <span className={styles.metaDot}>·</span>
              <span>by <strong>{pr.author}</strong></span>
              <span className={styles.metaDot}>·</span>
              <span>{formatDate(pr.createdTimestamp)}</span>
            </div>

            {/* Conflict warning */}
            {pr.hasConflicts && (
              <div className={styles.conflictWarning}>
                <span className={styles.conflictIcon}>⚠</span>
                <div>
                  <strong>Merge Conflicts Detected</strong>
                  <p className={styles.conflictNote}>
                    This PR has conflicts between <code>{pr.sourceBranch}</code> and <code>{pr.targetBranch}</code>.
                    Resolve via VEGA CLI before merging.
                  </p>
                  {pr.conflictedFiles && pr.conflictedFiles.length > 0 && (
                    <ul className={styles.conflictFiles}>
                      {pr.conflictedFiles.map((f, i) => <li key={i}><code>{f}</code></li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Audit trail */}
            {(pr.reviewedBy || pr.approvedBy || pr.rejectedBy || pr.mergedBy) && (
              <div className={styles.auditTrail}>
                {pr.reviewedBy && (
                  <div className={styles.auditItem}>
                    <span className={styles.auditLabel}>Reviewed by</span>
                    <strong>{pr.reviewedBy}</strong>
                    {pr.reviewStartedAt && <span className={styles.auditTime}>{formatDate(pr.reviewStartedAt)}</span>}
                  </div>
                )}
                {pr.approvedBy && (
                  <div className={styles.auditItem}>
                    <span className={styles.auditLabel}>Approved by</span>
                    <strong>{pr.approvedBy}</strong>
                    {pr.reviewCompletedAt && <span className={styles.auditTime}>{formatDate(pr.reviewCompletedAt)}</span>}
                  </div>
                )}
                {pr.rejectedBy && (
                  <div className={styles.auditItem}>
                    <span className={styles.auditLabel}>Rejected by</span>
                    <strong>{pr.rejectedBy}</strong>
                    {pr.reviewCompletedAt && <span className={styles.auditTime}>{formatDate(pr.reviewCompletedAt)}</span>}
                  </div>
                )}
                {pr.mergedBy && (
                  <div className={styles.auditItem}>
                    <span className={styles.auditLabel}>Merged by</span>
                    <strong>{pr.mergedBy}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Action error */}
            {actionError && <p className={styles.actionError} role="alert">{actionError}</p>}

            {/* Action buttons */}
            {canCreatePr && !isTerminal && (
              <div className={styles.prActions}>
                {pr.status === 'OPEN' && (
                  <button type="button" onClick={() => doAction('review')} disabled={actionLoading} className={styles.actionBtn}>
                    Start Review
                  </button>
                )}
                {(pr.status === 'OPEN' || pr.status === 'REVIEWING') && (
                  <>
                    <button type="button" onClick={() => doAction('approve')} disabled={actionLoading} className={styles.actionBtnApprove}>
                      Approve
                    </button>
                    <button type="button" onClick={() => doAction('reject')} disabled={actionLoading} className={styles.actionBtnReject}>
                      Reject
                    </button>
                  </>
                )}
                {pr.status === 'APPROVED' && !pr.hasConflicts && (
                  <button type="button" onClick={() => doAction('merge')} disabled={actionLoading} className={styles.actionBtnMerge}>
                    Merge to {pr.targetBranch}
                  </button>
                )}
                {pr.status === 'APPROVED' && pr.hasConflicts && (
                  <span className={styles.mergeBlockedNote}>Merge blocked — resolve conflicts first</span>
                )}
              </div>
            )}

            {/* AI analysis trigger */}
            {!isTerminal && (
              <div className={styles.aiTrigger}>
                <button
                  type="button"
                  onClick={handleAiAnalysis}
                  disabled={aiLoading}
                  className={styles.aiBtn}
                >
                  {aiLoading ? 'Running AI Analysis...' : 'Run AI Analysis (Gemini)'}
                </button>
                {aiError && <span className={styles.aiError}>{aiError}</span>}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button type="button" className={`${styles.tab} ${activeTab === 'changes' ? styles.tabActive : ''}`} onClick={() => setActiveTab('changes')}>
              Changes {fileCount > 0 && `(${fileCount})`}
            </button>
            <button type="button" className={`${styles.tab} ${activeTab === 'insights' ? styles.tabActive : ''}`} onClick={() => setActiveTab('insights')}>
              Insights {aiAnalysis && '✓'}
            </button>
            <button type="button" className={`${styles.tab} ${activeTab === 'commits' ? styles.tabActive : ''}`} onClick={() => setActiveTab('commits')}>
              Commits {pr.commitHashes && `(${pr.commitHashes.length})`}
            </button>
          </div>

          {/* Changes tab */}
          {activeTab === 'changes' && (
            <div className={styles.diffSection}>
              {diffLoading ? (
                <p className={styles.loading}>Loading diff...</p>
              ) : diff?.files?.length === 0 ? (
                <p className={styles.empty}>No file changes detected</p>
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
                          <div
                            key={i}
                            className={
                              line.startsWith('+') ? styles.diffAdd :
                              line.startsWith('-') ? styles.diffDel :
                              line.startsWith('@@') ? styles.diffHunk :
                              styles.diffContext
                            }
                          >
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

          {/* Insights tab */}
          {activeTab === 'insights' && (
            <div className={styles.insightsSection}>
              {/* VEGA rule-based analysis */}
              <div className={styles.insightsBlock}>
                <h3>VEGA Rule-Based Analysis</h3>
                {pr.summaryFilesChanged != null ? (
                  <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                      <span className={styles.statNum}>{pr.summaryFilesChanged}</span>
                      <span className={styles.statLabel}>Files Changed</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statNum} style={{color:'#22c55e'}}>+{pr.summaryLinesAdded ?? 0}</span>
                      <span className={styles.statLabel}>Lines Added</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statNum} style={{color:'#ef4444'}}>-{pr.summaryLinesRemoved ?? 0}</span>
                      <span className={styles.statLabel}>Lines Removed</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statNum}><RiskBadge level={pr.riskLevel} /></span>
                      <span className={styles.statLabel}>Risk Level</span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.empty}>No rule-based analysis data. Create PR from UI for analysis.</p>
                )}
                {pr.riskReasons && pr.riskReasons.length > 0 && (
                  <div className={styles.reasonsBlock}>
                    <h4>Risk Reasons</h4>
                    <ul>{pr.riskReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                {pr.riskRecommendations && pr.riskRecommendations.length > 0 && (
                  <div className={styles.reasonsBlock}>
                    <h4>Recommendations</h4>
                    <ul>{pr.riskRecommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
              </div>

              {/* AI analysis */}
              <div className={styles.insightsBlock}>
                <h3>AI Analysis (Google Gemini)</h3>
                {aiLoading && <p className={styles.loading}>Running Gemini analysis...</p>}
                {!aiLoading && !aiAnalysis && !aiError && (
                  <p className={styles.empty}>
                    No AI analysis yet.{' '}
                    <button type="button" onClick={handleAiAnalysis} className={styles.inlineBtn}>
                      Run AI Analysis
                    </button>
                  </p>
                )}
                {aiError && <p className={styles.aiError}>AI Error: {aiError}</p>}
                {aiAnalysis && (
                  <div className={styles.aiResult}>
                    {aiAnalysis.riskSummary && (
                      <div className={styles.aiBlock}>
                        <h4>Risk Summary</h4>
                        <p>{aiAnalysis.riskSummary}</p>
                      </div>
                    )}
                    {aiAnalysis.explanation && (
                      <div className={styles.aiBlock}>
                        <h4>Detailed Explanation</h4>
                        <p className={styles.aiText}>{aiAnalysis.explanation}</p>
                      </div>
                    )}
                    {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                      <div className={styles.aiBlock}>
                        <h4>AI Suggestions</h4>
                        <ul>{aiAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Conflict details in insights */}
              {pr.hasConflicts && pr.conflictedFiles && pr.conflictedFiles.length > 0 && (
                <div className={styles.insightsBlock}>
                  <h3>Conflicted Files</h3>
                  <p className={styles.conflictNote}>
                    3-way merge check (source vs. target vs. common ancestor):
                  </p>
                  <ul className={styles.conflictFilesList}>
                    {pr.conflictedFiles.map((f, i) => (
                      <li key={i}><code>{f}</code></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Commits tab */}
          {activeTab === 'commits' && (
            <div className={styles.commitsSection}>
              {pr.commitHashes && pr.commitHashes.length > 0 ? (
                <ul className={styles.commitList}>
                  {pr.commitHashes.map((h, i) => (
                    <li key={i} className={styles.commitItem}>
                      <code className={styles.commitHash}>{h.substring(0, 10)}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No commit hashes recorded for this PR.</p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {/* Stats block */}
          {pr.summaryFilesChanged != null && (
            <div className={styles.sidebarBlock}>
              <h3>PR Stats</h3>
              <p className={styles.summaryStats}>
                {pr.summaryFilesChanged} files changed
              </p>
              <p>
                <span className={styles.linesAdded}>+{pr.summaryLinesAdded ?? 0}</span>
                {' / '}
                <span className={styles.linesRemoved}>-{pr.summaryLinesRemoved ?? 0}</span>
              </p>
              {pr.riskLevel && (
                <p>Risk: <RiskBadge level={pr.riskLevel} /></p>
              )}
              <span className={styles.vegaHint}>VEGA rule-based</span>
            </div>
          )}

          {/* Conflict summary in sidebar */}
          {pr.hasConflicts && (
            <div className={`${styles.sidebarBlock} ${styles.sidebarConflict}`}>
              <h3>⚠ Conflicts</h3>
              <p>{pr.conflictedFiles?.length ?? '?'} file(s) conflicted</p>
              {pr.conflictedFiles?.slice(0, 4).map((f, i) => (
                <p key={i} className={styles.conflictFileSm}><code>{f}</code></p>
              ))}
              {(pr.conflictedFiles?.length ?? 0) > 4 && (
                <p className={styles.conflictFileSm}>...and {pr.conflictedFiles.length - 4} more</p>
              )}
            </div>
          )}

          {/* AI result summary in sidebar */}
          {aiAnalysis && (
            <div className={styles.sidebarBlock}>
              <h3>AI Summary</h3>
              {aiAnalysis.riskSummary && <p className={styles.aiSummaryText}>{aiAnalysis.riskSummary.substring(0, 180)}{aiAnalysis.riskSummary.length > 180 ? '...' : ''}</p>}
              <button type="button" onClick={() => setActiveTab('insights')} className={styles.inlineBtn}>
                View full analysis
              </button>
            </div>
          )}

          {/* Participants */}
          <div className={styles.sidebarBlock}>
            <h3>Participants</h3>
            <div className={styles.participant}>
              <span className={styles.participantRole}>Author</span>
              <strong>{pr.author}</strong>
            </div>
            {pr.reviewedBy && (
              <div className={styles.participant}>
                <span className={styles.participantRole}>Reviewer</span>
                <strong>{pr.reviewedBy}</strong>
              </div>
            )}
            {pr.approvedBy && (
              <div className={styles.participant}>
                <span className={styles.participantRole}>Approver</span>
                <strong>{pr.approvedBy}</strong>
              </div>
            )}
            {pr.rejectedBy && (
              <div className={styles.participant}>
                <span className={styles.participantRole}>Rejected by</span>
                <strong>{pr.rejectedBy}</strong>
              </div>
            )}
            {pr.mergedBy && (
              <div className={styles.participant}>
                <span className={styles.participantRole}>Merged by</span>
                <strong>{pr.mergedBy}</strong>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className={styles.sidebarBlock}>
            <h3>Timeline</h3>
            <div className={styles.timelineItem}>
              <span className={styles.timelineLabel}>Created</span>
              <span>{formatDate(pr.createdTimestamp)}</span>
            </div>
            {pr.reviewStartedAt && (
              <div className={styles.timelineItem}>
                <span className={styles.timelineLabel}>Review started</span>
                <span>{formatDate(pr.reviewStartedAt)}</span>
              </div>
            )}
            {pr.reviewCompletedAt && (
              <div className={styles.timelineItem}>
                <span className={styles.timelineLabel}>Completed</span>
                <span>{formatDate(pr.reviewCompletedAt)}</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
