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

const PR_TYPE_META = {
  BUG_FIX:       { label: 'Bug Fix',       color: '#f97316' },
  HOTFIX:        { label: 'Hotfix',        color: '#ef4444' },
  NEW_FEATURE:   { label: 'New Feature',   color: '#6366f1' },
  REFACTOR:      { label: 'Refactor',      color: '#8b5cf6' },
  PERFORMANCE:   { label: 'Performance',   color: '#eab308' },
  SECURITY:      { label: 'Security',      color: '#dc2626' },
  DOCUMENTATION: { label: 'Documentation', color: '#22c55e' },
  CHORE:         { label: 'Chore',         color: '#6b7280' },
}

function PrTypeBadge({ type }) {
  if (!type) return null
  const meta = PR_TYPE_META[type] || { label: type.replace(/_/g, ' '), color: '#6b7280' }
  return (
    <span className={styles.prTypeBadge} style={{ borderColor: meta.color + '55', color: meta.color }}>
      <span className={styles.prTypeDot} style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

function MetricRow({ tag, label, value, detail, warn, statusText }) {
  return (
    <div className={`${styles.metricRow} ${warn ? styles.metricRowWarn : ''}`}>
      <span className={styles.metricTag}>{tag}</span>
      <div className={styles.metricBody}>
        <span className={styles.metricName}>{label}</span>
        <span className={styles.metricDetail}>{detail}</span>
      </div>
      <div className={styles.metricRight}>
        <span className={styles.metricValue}>{value}</span>
        <span className={styles.metricStatus} data-warn={warn}>{statusText}</span>
      </div>
    </div>
  )
}

function parseTreeNode(s) {
  const parts = s.split(':::')
  return {
    icon: parts[0] || '•',
    metric: parts[1] || '',
    delta: parseInt(parts[2]) || 0,
    reason: parts[3] || '',
  }
}

function parseAiFinding(s) {
  const parts = s.split(':::')
  return {
    severity: parts[0] || 'MEDIUM',
    category: parts[1] || 'CODE_QUALITY',
    description: parts[2] || '',
    delta: parseInt(parts[3]) || 0,
  }
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
  const [canApprovePr, setCanApprovePr] = useState(false)
  const [canMergePr, setCanMergePr] = useState(false)
  const [userRole, setUserRole] = useState('public')
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
      .then((r) => r.ok ? safeJson(r) : {})
      .then((d) => {
        setCanCreatePr(!!(d?.canCreatePr))
        setCanApprovePr(!!(d?.canApprovePr))
        setCanMergePr(!!(d?.canMergePr))
        setUserRole(d?.role || 'public')
      })
      .catch(() => {
        setCanCreatePr(false)
        setCanApprovePr(false)
        setCanMergePr(false)
        setUserRole('public')
      })
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
              {pr.assignedReviewer && (
                <><span className={styles.metaDot}>·</span>
                <span>reviewer: <strong>{pr.assignedReviewer}</strong></span></>
              )}
              <span className={styles.metaDot}>·</span>
              <span>{formatDate(pr.createdTimestamp)}</span>
              {pr.prType && <><span className={styles.metaDot}>·</span><PrTypeBadge type={pr.prType} /></>}
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
            {!isTerminal && (canApprovePr || canMergePr) && (
              <div className={styles.prActions}>
                {canApprovePr && pr.status === 'OPEN' && (
                  <button type="button" onClick={() => doAction('review')} disabled={actionLoading} className={styles.actionBtn}>
                    Start Review
                  </button>
                )}
                {canApprovePr && (pr.status === 'OPEN' || pr.status === 'REVIEWING') && (
                  <>
                    <button type="button" onClick={() => doAction('approve')} disabled={actionLoading} className={styles.actionBtnApprove}>
                      Approve
                    </button>
                    <button type="button" onClick={() => doAction('reject')} disabled={actionLoading} className={styles.actionBtnReject}>
                      Reject
                    </button>
                  </>
                )}
                {canMergePr && pr.status === 'APPROVED' && !pr.hasConflicts && (
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
                              line.startsWith('---') || line.startsWith('+++') ? styles.diffFileInfo :
                              line.startsWith('@@') ? styles.diffHunk :
                              line.startsWith('+') ? styles.diffAdd :
                              line.startsWith('-') ? styles.diffDel :
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
              {!isTerminal && pr.hasConflicts && (
                <div className={styles.mergeConflictMetricsBanner} role="alert">
                  <strong>Merge not possible</strong>
                  <p>
                    This pull request currently has merge conflicts (source and target both changed the same paths).
                    Resolve them with the VEGA CLI before merging. The row below stays in sync with the repository.
                  </p>
                </div>
              )}
              {/* ── Risk Overview ── */}
              <div className={styles.insightsBlock}>
                <div className={styles.riskScoreHeader}>
                  <div>
                    <h3>Risk Analysis</h3>
                    <p className={styles.riskScoreSubtitle}>
                      9 metrics · computed at PR creation
                      {pr.prType && <> · <span className={styles.prTypeInline}>{pr.prType.replace(/_/g, ' ')}</span></>}
                    </p>
                  </div>
                  {pr.riskScore != null && (
                    <div className={styles.riskScoreBadge} data-level={pr.riskLevel}>
                      <span className={styles.riskScoreNum}>{pr.riskScore}</span>
                      <span className={styles.riskScoreLabel}>{pr.riskLevel}</span>
                    </div>
                  )}
                </div>

                {/* Core stats */}
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
                      <span className={styles.statNum}>{pr.testCoveragePercent != null ? `${pr.testCoveragePercent}%` : '—'}</span>
                      <span className={styles.statLabel}>Test Coverage</span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.empty}>No analysis data. Create PR from UI for full analysis.</p>
                )}

                {/* ── Merge conflicts: always shown for open PRs (not only when riskScore exists) ── */}
                {!isTerminal && (
                  <div className={styles.metricTable}>
                    <MetricRow
                      tag="CONFLICTS"
                      label="Merge conflicts (live)"
                      value={
                        pr.hasConflicts
                          ? `${pr.conflictedFiles?.length ?? 0} conflict${(pr.conflictedFiles?.length ?? 0) !== 1 ? 's' : ''}`
                          : 'Clean'
                      }
                      detail={
                        pr.hasConflicts
                          ? 'Source and target both modified these paths vs. common ancestor — merge is blocked until resolved'
                          : 'No 3-way merge conflicts at current branch tips'
                      }
                      warn={!!pr.hasConflicts}
                      statusText={pr.hasConflicts ? 'BLOCKED' : 'OK'}
                    />
                  </div>
                )}

                {/* ── Metric Table ── */}
                {pr.riskScore != null && (
                  <div className={styles.metricTable}>
                    <MetricRow
                      tag="AGE" label="File Age"
                      value={pr.fileAgeDaysMax != null ? `Max ${pr.fileAgeDaysMax}d` : 'N/A'}
                      detail={pr.staleFiles?.length > 0 ? `${pr.staleFiles.length} stale file${pr.staleFiles.length > 1 ? 's' : ''}` : 'No stale files'}
                      warn={pr.staleFiles?.length > 0}
                      statusText={pr.staleFiles?.length > 0 ? 'STALE' : 'OK'}
                    />
                    <MetricRow
                      tag="COVERAGE" label="Test Coverage"
                      value={pr.testCoveragePercent != null ? `${pr.testCoveragePercent}%` : 'N/A'}
                      detail="of changed source files have tests"
                      warn={pr.testCoveragePercent != null && pr.testCoveragePercent < 30}
                      statusText={pr.testCoveragePercent != null && pr.testCoveragePercent < 30 ? 'LOW' : 'OK'}
                    />
                    <MetricRow
                      tag="SECURITY" label="Security Sensitivity"
                      value={pr.criticalPatternFiles?.length > 0 ? `${pr.criticalPatternFiles.length} sensitive file${pr.criticalPatternFiles.length > 1 ? 's' : ''}` : 'None detected'}
                      detail={pr.criticalPatternFiles?.slice(0, 2).join(', ') || 'No auth/secret/key paths'}
                      warn={pr.criticalPatternFiles?.length > 0}
                      statusText={pr.criticalPatternFiles?.length > 0 ? 'WARN' : 'OK'}
                    />
                    <MetricRow
                      tag="CHURN" label="Change Concentration"
                      value={pr.changeConcentration != null ? `${pr.changeConcentration.toFixed(0)} lines/file` : 'N/A'}
                      detail={pr.changeConcentration > 150 ? 'Deep, concentrated change' : 'Focused change'}
                      warn={pr.changeConcentration > 150}
                      statusText={pr.changeConcentration > 150 ? 'HIGH' : 'OK'}
                    />
                    <MetricRow
                      tag="AUTHORS" label="Author Diversity"
                      value={pr.authorDiversityCount != null ? `${pr.authorDiversityCount} author${pr.authorDiversityCount !== 1 ? 's' : ''} in history` : 'N/A'}
                      detail={pr.authorDiversityCount === 1 ? 'Knowledge concentration — bus-factor risk' : pr.authorDiversityCount >= 5 ? 'High coordination complexity' : 'Healthy distribution'}
                      warn={pr.authorDiversityCount === 1 || pr.authorDiversityCount >= 5}
                      statusText={pr.authorDiversityCount === 1 || pr.authorDiversityCount >= 5 ? 'WARN' : 'OK'}
                    />
                    <MetricRow
                      tag="FAMILIARITY" label="First-Time Files"
                      value={pr.firstTimeFiles?.length > 0 ? `${pr.firstTimeFiles.length} unfamiliar file${pr.firstTimeFiles.length > 1 ? 's' : ''}` : 'Author has prior history'}
                      detail={pr.firstTimeFiles?.length > 0 ? 'Author has no prior commits in these files' : 'Familiar territory for this author'}
                      warn={pr.firstTimeFiles?.length > 0}
                      statusText={pr.firstTimeFiles?.length > 0 ? 'WARN' : 'OK'}
                    />
                    <MetricRow
                      tag="HOTSPOTS" label="Hotspot Files"
                      value={pr.hotspotFiles?.length > 0 ? `${pr.hotspotFiles.length} hotspot${pr.hotspotFiles.length > 1 ? 's' : ''} detected` : 'None detected'}
                      detail={pr.hotspotFiles?.length > 0 ? 'Changed 6+ times recently — potentially unstable' : 'No high-churn files in this change'}
                      warn={pr.hotspotFiles?.length > 0}
                      statusText={pr.hotspotFiles?.length > 0 ? 'WARN' : 'OK'}
                    />
                  </div>
                )}

                {/* ── Score Breakdown ── */}
                {pr.analysisTree && pr.analysisTree.length > 0 && (
                  <div className={styles.reasonsBlock}>
                    <h4>Score Breakdown</h4>
                    <p className={styles.treeSubtitle}>
                      How each metric contributed to the final score of <strong>{pr.riskScore}</strong>
                    </p>
                    <div className={styles.analysisTree}>
                      {pr.analysisTree.map((nodeStr, i) => {
                        const node = parseTreeNode(nodeStr)
                        const isPositive = node.delta > 0
                        const isNegative = node.delta < 0
                        return (
                          <div key={i} className={`${styles.treeNode} ${isPositive ? styles.treeNodeWarn : isNegative ? styles.treeNodeGood : styles.treeNodeNeutral}`}>
                            <div className={styles.treeNodeLeft}>
                              <span className={styles.treeIndicator} data-sign={isPositive ? 'pos' : isNegative ? 'neg' : 'zero'} />
                              <div className={styles.treeNodeBody}>
                                <span className={styles.treeMetric}>{node.metric}</span>
                                <span className={styles.treeReason}>{node.reason}</span>
                              </div>
                            </div>
                            <span className={`${styles.treeDelta} ${isPositive ? styles.treeDeltaPos : isNegative ? styles.treeDeltaNeg : styles.treeDeltaZero}`}>
                              {isPositive ? '+' : ''}{node.delta}
                            </span>
                          </div>
                        )
                      })}
                      <div className={styles.treeTotal}>
                        <span>Total Risk Score</span>
                        <span className={styles.treeTotalScore} data-level={pr.riskLevel}>{pr.riskScore}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── AI Findings (from PR creation) ── */}
                {pr.aiFindings && pr.aiFindings.length > 0 && (
                  <div className={styles.reasonsBlock}>
                    <h4>AI Review — Gemini Findings</h4>
                    {pr.aiScoreDelta > 0 && (
                      <p className={styles.treeSubtitle}>Added +{pr.aiScoreDelta} to the risk score</p>
                    )}
                    <div className={styles.aiFindingsGrid}>
                      {pr.aiFindings.map((findingStr, i) => {
                        const f = parseAiFinding(findingStr)
                        const sevCls = f.severity === 'HIGH' ? styles.findingHigh : f.severity === 'LOW' ? styles.findingLow : styles.findingMedium
                        return (
                          <div key={i} className={`${styles.findingCard} ${sevCls}`}>
                            <div className={styles.findingHeader}>
                              <span className={styles.findingSev}>{f.severity}</span>
                              <span className={styles.findingCat}>{f.category.replace(/_/g, ' ')}</span>
                              {f.delta > 0 && <span className={styles.findingDelta}>+{f.delta}</span>}
                            </div>
                            <p className={styles.findingDesc}>{f.description}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Recommendations ── */}
                {pr.riskRecommendations && pr.riskRecommendations.length > 0 && (
                  <div className={styles.reasonsBlock}>
                    <h4>Recommendations</h4>
                    <ul className={styles.reasonsList}>
                      {pr.riskRecommendations.map((rec, i) => (
                        <li key={i} className={styles.reasonItem}>
                          <span className={styles.recDot} />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* ── On-demand AI Analysis ── */}
              <div className={styles.insightsBlock}>
                <h3>On-Demand AI Review</h3>
                {aiLoading && <p className={styles.loading}>Running Gemini analysis...</p>}
                {!aiLoading && !aiAnalysis && !aiError && (
                  <p className={styles.empty}>
                    Trigger a fresh review at any time.{' '}
                    <button type="button" onClick={handleAiAnalysis} className={styles.inlineBtn}>
                      Run Analysis
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
                        <h4>Explanation</h4>
                        <p className={styles.aiText}>{aiAnalysis.explanation}</p>
                      </div>
                    )}
                    {aiAnalysis.findings && aiAnalysis.findings.length > 0 && (
                      <div className={styles.aiBlock}>
                        <h4>Findings</h4>
                        <div className={styles.aiFindingsGrid}>
                          {aiAnalysis.findings.map((findingStr, i) => {
                            const f = parseAiFinding(findingStr)
                            const sevCls = f.severity === 'HIGH' ? styles.findingHigh : f.severity === 'LOW' ? styles.findingLow : styles.findingMedium
                            return (
                              <div key={i} className={`${styles.findingCard} ${sevCls}`}>
                                <div className={styles.findingHeader}>
                                  <span className={styles.findingSev}>{f.severity}</span>
                                  <span className={styles.findingCat}>{f.category.replace(/_/g, ' ')}</span>
                                </div>
                                <p className={styles.findingDesc}>{f.description}</p>
                              </div>
                            )
                          })}
                        </div>
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
          {/* PR Type block */}
          {pr.prType && (
            <div className={styles.sidebarBlock}>
              <h3>PR Type</h3>
              <PrTypeBadge type={pr.prType} />
            </div>
          )}

          {/* Stats block */}
          {pr.summaryFilesChanged != null && (
            <div className={styles.sidebarBlock}>
              <h3>PR Stats</h3>
              <p className={styles.summaryStats}>{pr.summaryFilesChanged} files changed</p>
              <p>
                <span className={styles.linesAdded}>+{pr.summaryLinesAdded ?? 0}</span>
                {' / '}
                <span className={styles.linesRemoved}>-{pr.summaryLinesRemoved ?? 0}</span>
              </p>
              {pr.riskLevel && (
                <p style={{marginTop:'var(--space-2)'}}>
                  Risk: <RiskBadge level={pr.riskLevel} />
                  {pr.riskScore != null && (
                    <span style={{marginLeft:'var(--space-2)', fontSize:'0.75rem', color:'var(--text-tertiary)'}}>
                      (score: {pr.riskScore})
                    </span>
                  )}
                </p>
              )}
              {pr.riskScore != null && (
                <div className={styles.sidebarMiniStats}>
                  {pr.fileAgeDaysMax > 0 && (
                    <div className={styles.sidebarMiniRow}>
                      <span>File age</span>
                      <span>{pr.fileAgeDaysMax}d max</span>
                    </div>
                  )}
                  {pr.authorDiversityCount != null && (
                    <div className={styles.sidebarMiniRow}>
                      <span>Authors</span>
                      <span>{pr.authorDiversityCount}</span>
                    </div>
                  )}
                  {pr.testCoveragePercent != null && (
                    <div className={styles.sidebarMiniRow}>
                      <span>Test coverage</span>
                      <span>{pr.testCoveragePercent}%</span>
                    </div>
                  )}
                  {pr.aiScoreDelta > 0 && (
                    <div className={styles.sidebarMiniRow}>
                      <span>AI contribution</span>
                      <span>+{pr.aiScoreDelta} pts</span>
                    </div>
                  )}
                </div>
              )}
              <span className={styles.vegaHint}>9 metrics + Gemini AI</span>
            </div>
          )}

          {/* Conflict summary in sidebar */}
          {pr.hasConflicts && (
            <div className={`${styles.sidebarBlock} ${styles.sidebarConflict}`}>
              <h3>Conflicts</h3>
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
