import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../../config/api'
import styles from './InsightsTab.module.css'

function fmt(ms) {
  if (!ms || ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `${d}d ${Math.floor((ms % 86400000) / 3600000)}h`
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`
  return `${Math.floor(ms / 60000)}m`
}

function weekLabel(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function weekRange(ts) {
  const start = new Date(ts)
  const end = new Date(ts + 6 * 86400000)
  return `${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
}

const Icons = {
  commits: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <line x1="1" y1="8" x2="5.5" y2="8" />
      <line x1="10.5" y1="8" x2="15" y2="8" />
    </svg>
  ),
  branch: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <line x1="4" y1="5" x2="4" y2="11" />
      <path d="M4 5.5 Q4 6.5 12 6.5" />
    </svg>
  ),
  pr: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <line x1="4" y1="5" x2="4" y2="11" />
      <path d="M12 6.5 L12 10 Q12 12 10 12 L6 12" />
      <polyline points="3,10.5 4,12 5,10.5" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5 L9.8 6H14.5L10.7 8.8L12.2 13.5L8 10.8L3.8 13.5L5.3 8.8L1.5 6H6.2Z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4.5 8,8 10.5,10" />
    </svg>
  ),
}

// ── Bar Chart ──────────────────────────────────────────────────────────────────

function BarChart({ data }) {
  const [tooltip, setTooltip] = useState(null)
  const bodyRef = useRef(null)

  if (!data?.length) return <p className={styles.empty}>No activity data</p>

  const peak = Math.max(...data.map((d) => d.commitCount), 1)
  const peakIdx = data.findIndex((d) => d.commitCount === peak)

  const handleEnter = (e, w) => {
    const areaRect = bodyRef.current?.getBoundingClientRect()
    const colRect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      x: colRect.left - areaRect.left + colRect.width / 2,
      label: `${w.commitCount} commit${w.commitCount !== 1 ? 's' : ''}`,
      sub: weekRange(w.weekStart),
    })
  }

  return (
    <div className={styles.barChartOuter}>
      {/* Y-axis */}
      <div className={styles.yAxis}>
        {[100, 75, 50, 25].map((pct) => (
          <span key={pct} className={styles.yLabel} style={{ bottom: `${pct}%` }}>
            {Math.round((peak * pct) / 100)}
          </span>
        ))}
      </div>

      {/* Chart body */}
      <div className={styles.barChartBody} ref={bodyRef}>
        {/* Gridlines */}
        {[25, 50, 75, 100].map((pct) => (
          <div key={pct} className={styles.gridLine} style={{ bottom: `${pct}%` }} />
        ))}

        {/* Bars */}
        {data.map((w, i) => {
          const pct = peak > 0 ? (w.commitCount / peak) * 100 : 0
          const h = `${Math.max(pct, w.commitCount > 0 ? 3 : 0)}%`
          const isPeak = i === peakIdx && w.commitCount > 0
          return (
            <div
              key={i}
              className={styles.barColWrap}
              onMouseEnter={(e) => handleEnter(e, w)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div
                className={`${styles.bar} ${isPeak ? styles.barPeak : ''}`}
                style={{ '--bar-h': h, '--bar-delay': `${i * 28}ms` }}
              />
            </div>
          )
        })}

        {/* Tooltip */}
        {tooltip && (
          <div className={styles.tooltip} style={{ left: tooltip.x }}>
            <span className={styles.tooltipMain}>{tooltip.label}</span>
            <span className={styles.tooltipSub}>{tooltip.sub}</span>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className={styles.xAxis}>
        {data.map((w, i) => (
          <span key={i} className={styles.xLabel}>{weekLabel(w.weekStart)}</span>
        ))}
      </div>
    </div>
  )
}

// ── Contributor bar ────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

function avatarColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function initials(name) {
  return name.split(/[\s._\-@]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

function ContributorBar({ stat, max, rank, total }) {
  const pct     = max > 0 ? (stat.commitCount / max) * 100 : 0
  const aiPct   = stat.commitCount > 0 ? (stat.aiCommitCount / stat.commitCount) * 100 : 0
  const sharePct = total > 0 ? Math.round((stat.commitCount / total) * 100) : 0

  return (
    <div className={styles.contributorRow}>
      <span className={styles.contribRank}>#{rank}</span>
      <div className={styles.contribAvatar} style={{ background: avatarColor(stat.author) }}>
        {initials(stat.author)}
      </div>
      <span className={styles.contribName}>{stat.author}</span>
      <div className={styles.contribBarWrap}>
        <div className={styles.contribBar} style={{ width: `${pct}%` }}>
          {aiPct > 0 && (
            <div className={styles.contribBarAi} style={{ width: `${aiPct}%` }} title={`${stat.aiCommitCount} AI commits`} />
          )}
        </div>
      </div>
      <span className={styles.contribShare}>{sharePct}%</span>
      <span className={styles.contribCount}>{stat.commitCount}</span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={`${styles.statCard} ${accent ? styles.statCardAccent : ''}`}>
      {icon && <span className={styles.statIcon}>{icon}</span>}
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────

const TAU = 2 * Math.PI

function DonutChart({ open, merged, rejected, total }) {
  const R    = 52
  const circ = TAU * R
  const gap  = total > 0 ? circ * 0.015 : 0

  const segments = [
    { label: 'Merged',   count: merged,   color: '#22c55e' },
    { label: 'Open',     count: open,     color: '#6366f1' },
    { label: 'Rejected', count: rejected, color: '#ef4444' },
  ]

  let offset = 0

  return (
    <div className={styles.donutWrap}>
      <svg className={styles.donutSvg} viewBox="0 0 140 140">
        {total === 0 ? (
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-border,#2a2a3e)" strokeWidth="16" />
        ) : (
          segments.map(({ label, count, color }) => {
            const arcLen     = (count / total) * circ - gap
            const seg        = arcLen > 0 ? arcLen : 0
            const dashOffset = -offset
            offset          += (count / total) * circ
            return (
              <circle
                key={label}
                cx="70" cy="70" r={R}
                fill="none"
                stroke={color}
                strokeWidth="16"
                strokeDasharray={`${seg} ${circ}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
              />
            )
          })
        )}
        <text x="70" y="65" textAnchor="middle" className={styles.donutTotal}>{total}</text>
        <text x="70" y="80" textAnchor="middle" className={styles.donutSub}>PRs total</text>
      </svg>

      <div className={styles.donutLegend}>
        {segments.map(({ label, count, color }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={label} className={styles.donutRow}>
              <span className={styles.donutDot} style={{ background: color }} />
              <span className={styles.donutLabel}>{label}</span>
              <span className={styles.donutCount}>{count}</span>
              <span className={styles.donutPct}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className={styles.root}>
      <div className={styles.skeletonCards}>
        {[1,2,3,4,5].map((i) => <div key={i} className={styles.skeletonCard} style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
      <div className={styles.skeletonChartOuter}>
        <div className={styles.skeletonYAxis} />
        <div className={styles.skeletonBars}>
          {[60,90,45,75,55,100,80,65,40,70,85,50].map((h, i) => (
            <div key={i} className={styles.skeletonBar} style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InsightsTab({ username, repoName, headers }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!username || !repoName) return
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/repos/${username}/${repoName}/insights`, { headers })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch((e) => setError(`Failed to load insights: ${e.message}`))
      .finally(() => setLoading(false))
  }, [username, repoName, headers])

  if (loading) return <Skeleton />
  if (error)   return <div className={styles.error}>{error}</div>
  if (!data)   return null

  const maxContrib        = data.contributors?.[0]?.commitCount ?? 1
  const totalWeekCommits  = data.commitActivity?.reduce((s, w) => s + w.commitCount, 0) ?? 0
  const totalContribCount = data.contributors?.reduce((s, c) => s + c.commitCount, 0) ?? 1

  return (
    <div className={styles.root}>

      {/* Overview */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Overview</h3>
        <div className={styles.statGrid}>
          <StatCard icon={Icons.commits} label="Commits"      value={data.totalCommits}       sub={`${totalWeekCommits} last 12 wks`} />
          <StatCard icon={Icons.branch}  label="Branches"     value={data.totalBranches} />
          <StatCard icon={Icons.pr}      label="Pull Requests" value={data.totalPRs}           sub={`${data.openPRs} open · ${data.mergedPRs} merged`} />
          <StatCard icon={Icons.ai}      label="AI Adoption"  value={`${data.aiAdoptionRate}%`} sub="of commits AI-generated" accent={data.aiAdoptionRate > 0} />
          <StatCard icon={Icons.clock}   label="Avg PR Review" value={fmt(data.avgPrReviewTimeMs)} sub="time to close" />
        </div>
      </section>

      {/* Commit Activity */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Commit Activity — last 12 weeks</h3>
        <div className={styles.card}>
          <BarChart data={data.commitActivity} />
        </div>
      </section>

      {/* Contributors */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Contributors</h3>
        <div className={styles.card}>
          {data.contributors?.length === 0 && <p className={styles.empty}>No contributors yet</p>}
          <div className={styles.contributorList}>
            {(data.contributors || []).map((c, i) => (
              <ContributorBar key={c.author} stat={c} max={maxContrib} rank={i + 1} total={totalContribCount} />
            ))}
          </div>
          {data.contributors?.some((c) => c.aiCommitCount > 0) && (
            <p className={styles.legend}>
              <span className={styles.legendDot} style={{ background: 'var(--vega-accent)' }} />
              AI-generated commits
            </p>
          )}
        </div>
      </section>

      {/* PR Breakdown */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Pull Request Breakdown</h3>
        <div className={styles.card}>
          <DonutChart open={data.openPRs} merged={data.mergedPRs} rejected={data.rejectedPRs} total={data.totalPRs} />
        </div>
      </section>

    </div>
  )
}
