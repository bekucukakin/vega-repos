import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './MetricsPage.module.css'

const API_BASE = '/api'

function StatCard({ value, label, accent }) {
  return (
    <div className={`${styles.statCard} ${accent ? styles[`accent${accent}`] : ''}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function MetricRow({ label, value, description }) {
  return (
    <div className={styles.metricRow}>
      <div className={styles.metricInfo}>
        <span className={styles.metricLabel}>{label}</span>
        {description && <span className={styles.metricDesc}>{description}</span>}
      </div>
      <span className={styles.metricValue}>{value}</span>
    </div>
  )
}

function ProgressBar({ percent, color }) {
  return (
    <div className={styles.progressBarBg}>
      <div
        className={styles.progressBarFill}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color || 'var(--accent)' }}
      />
    </div>
  )
}

export default function PrMetricsPage() {
  const { getAuthHeader, user } = useAuth()
  const [myMetrics, setMyMetrics] = useState(null)
  const [globalMetrics, setGlobalMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const headers = getAuthHeader()
    Promise.all([
      fetch(`${API_BASE}/metrics/me`, { headers }),
      fetch(`${API_BASE}/metrics/global`, { headers }),
    ])
      .then(([r1, r2]) => {
        if (!r1.ok || !r2.ok) throw new Error('Failed to fetch metrics')
        return Promise.all([r1.json(), r2.json()])
      })
      .then(([me, global]) => { setMyMetrics(me); setGlobalMetrics(global) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={styles.loading}>Loading metrics...</div>
  if (error) return <div className={styles.error}>{error}</div>

  const mp = myMetrics?.prMetrics || {}
  const gp = globalMetrics?.prMetrics || {}
  const pct = (v) => typeof v === 'number' ? v.toFixed(1) : '0.0'
  const num = (v) => typeof v === 'number' ? v : 0

  return (
    <div className={styles.container}>
      <h1>PR Review Metrics</h1>
      <p className={styles.subtitle}>
        Tracks pull request activity, review outcomes, and the impact of VEGA PR Summary & Risk analysis on review efficiency.
      </p>

      <div className={styles.scopeBlock}>
        <h3>My Pull Requests ({user?.username})</h3>
        <div className={styles.statsRow}>
          <StatCard value={num(mp.totalPrs)} label="My PRs" accent="Blue" />
          <StatCard value={num(mp.openCount)} label="Open" accent="Yellow" />
          <StatCard value={num(mp.reviewingCount)} label="Reviewing" accent="Purple" />
          <StatCard value={num(mp.approvedCount)} label="Approved" accent="Green" />
          <StatCard value={num(mp.rejectedCount)} label="Rejected" accent="Red" />
          <StatCard value={num(mp.mergedCount)} label="Merged" accent="Cyan" />
        </div>
        <div className={styles.metricBlock}>
          <MetricRow
            label="PRs with Risk Analysis"
            value={num(mp.withRiskAnalysisCount)}
            description="Pull requests that have VEGA Risk Level assessment (LOW/MEDIUM/HIGH)"
          />
          <MetricRow
            label="Risk Analysis Coverage"
            value={num(mp.totalPrs) > 0 ? `${((num(mp.withRiskAnalysisCount) / num(mp.totalPrs)) * 100).toFixed(1)}%` : '-'}
            description="Percentage of PRs analyzed by VEGA PR Summary & Risk"
          />
          {num(mp.totalPrs) > 0 && (
            <ProgressBar
              percent={num(mp.totalPrs) > 0 ? (num(mp.withRiskAnalysisCount) / num(mp.totalPrs)) * 100 : 0}
              color="var(--accent)"
            />
          )}
        </div>
        {(num(mp.reviewerApprovedCount) > 0 || num(mp.reviewerRejectedCount) > 0) && (
          <div className={styles.metricBlock}>
            <h4>My Review Activity (as Reviewer)</h4>
            <MetricRow label="PRs I Approved" value={num(mp.reviewerApprovedCount)} description="Pull requests you approved as a reviewer" />
            <MetricRow label="PRs I Rejected" value={num(mp.reviewerRejectedCount)} description="Pull requests you rejected as a reviewer" />
          </div>
        )}
        {(num(mp.prsWithFeatureCount) > 0 || num(mp.prsWithoutFeatureCount) > 0) && (
          <div className={styles.metricBlock}>
            <h4>Review Time Analysis</h4>
            <MetricRow label="Reviews with PR Summary" value={num(mp.prsWithFeatureCount)} description="PRs reviewed with VEGA PR Summary & Risk feature enabled" />
            <MetricRow label="Reviews without PR Summary" value={num(mp.prsWithoutFeatureCount)} description="PRs reviewed without the feature" />
            <MetricRow label="Avg Review Time (with feature)" value={num(mp.avgReviewTimeWithFeatureMs) > 0 ? `${(num(mp.avgReviewTimeWithFeatureMs) / 1000).toFixed(1)}s` : '-'} description="Average time to complete review when PR Summary was available" />
            <MetricRow label="Avg Review Time (without feature)" value={num(mp.avgReviewTimeWithoutFeatureMs) > 0 ? `${(num(mp.avgReviewTimeWithoutFeatureMs) / 1000).toFixed(1)}s` : '-'} description="Average time to complete review without PR Summary" />
            <MetricRow label="Review Time Improvement" value={`${pct(mp.reviewTimeImprovementPercent)}%`} description="How much faster reviews are with VEGA PR Summary" />
            {num(mp.reviewTimeImprovementPercent) > 0 && (
              <ProgressBar percent={num(mp.reviewTimeImprovementPercent)} color="var(--success)" />
            )}
          </div>
        )}
      </div>

      <div className={styles.scopeBlock}>
        <h3>VEGA Global (All Users)</h3>
        <div className={styles.statsRow}>
          <StatCard value={num(gp.totalPrs)} label="Total PRs" accent="Blue" />
          <StatCard value={num(gp.openCount)} label="Open" accent="Yellow" />
          <StatCard value={num(gp.reviewingCount)} label="Reviewing" accent="Purple" />
          <StatCard value={num(gp.approvedCount)} label="Approved" accent="Green" />
          <StatCard value={num(gp.rejectedCount)} label="Rejected" accent="Red" />
          <StatCard value={num(gp.mergedCount)} label="Merged" accent="Cyan" />
        </div>
        <div className={styles.metricBlock}>
          <MetricRow
            label="Global Risk Analysis Coverage"
            value={num(gp.totalPrs) > 0 ? `${((num(gp.withRiskAnalysisCount) / num(gp.totalPrs)) * 100).toFixed(1)}%` : '-'}
            description="Percentage of all VEGA PRs with Risk Level analysis"
          />
          {num(gp.totalPrs) > 0 && (
            <ProgressBar
              percent={num(gp.totalPrs) > 0 ? (num(gp.withRiskAnalysisCount) / num(gp.totalPrs)) * 100 : 0}
              color="var(--accent)"
            />
          )}
        </div>
      </div>
    </div>
  )
}
