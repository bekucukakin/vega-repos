import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './VegaAnalyticsDashboard.module.css'
import { API_BASE } from '../config/api'
import InsightsTab from '../components/repo/InsightsTab'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pct = (v) => (typeof v === 'number' ? v.toFixed(1) : '0.0')
const num = (v) => (typeof v === 'number' ? v : 0)
function fmtMs(ms) {
  if (!ms || ms <= 0) return '—'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

// ─── Icon set ────────────────────────────────────────────────────────────────
const S = { fill:"none", stroke:"currentColor", strokeWidth:"1.5", strokeLinecap:"round", strokeLinejoin:"round" }

const IcoCommit    = () => <svg viewBox="0 0 16 16" {...S}><circle cx="8" cy="8" r="2.5"/><line x1="1" y1="8" x2="5.5" y2="8"/><line x1="10.5" y1="8" x2="15" y2="8"/></svg>
const IcoPR        = () => <svg viewBox="0 0 16 16" {...S}><circle cx="4" cy="4" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="4" r="1.5"/><path d="M4 5.5v5a1 1 0 001 1h5.5M12 5.5v5"/></svg>
const IcoAI        = () => <svg viewBox="0 0 16 16" {...S}><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.2 3.2l2.1 2.1M10.7 10.7l2.1 2.1M3.2 12.8l2.1-2.1M10.7 5.3l2.1-2.1"/><circle cx="8" cy="8" r="2"/></svg>
const IcoWarn      = () => <svg viewBox="0 0 16 16" {...S}><path d="M8 1.5L1 14.5h14L8 1.5z"/><line x1="8" y1="6.5" x2="8" y2="10"/><circle cx="8" cy="12" r=".5" fill="currentColor"/></svg>
const IcoShield    = () => <svg viewBox="0 0 16 16" {...S}><path d="M8 1.5l5 2v4.5c0 3-2 5-5 6.5C6 13 4 11 3 8.5V3.5l5-2z"/><path d="M5.5 8l2 2 3-3"/></svg>
const IcoRepo2     = () => <svg viewBox="0 0 16 16" {...S}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M5.5 2.5v11M1.5 6.5h4"/></svg>
const IcoCheck     = () => <svg viewBox="0 0 16 16" {...S}><circle cx="8" cy="8" r="6.5"/><path d="M5.5 8.5l2 2 3-4"/></svg>
const IcoActivity  = () => <svg viewBox="0 0 16 16" {...S}><polyline points="1,9 4,9 6,4 8,13 10,7 12,9 15,9"/></svg>
const IcoMerge     = () => <svg viewBox="0 0 16 16" {...S}><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><path d="M4 5.5v5M5.5 12h5.2a1 1 0 000-2L7 10V7"/></svg>
const IcoUsers     = () => <svg viewBox="0 0 16 16" {...S}><circle cx="6" cy="5" r="2"/><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5"/><circle cx="11.5" cy="4.5" r="1.5"/><path d="M14 13c0-1.93-1.07-3.5-2.5-4"/></svg>
const IcoClock     = () => <svg viewBox="0 0 16 16" {...S}><circle cx="8" cy="8" r="6.5"/><polyline points="8,4.5 8,8 10.5,10"/></svg>
const IcoOpen      = () => <svg viewBox="0 0 16 16" {...S}><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/></svg>

// nav/utility icons
const IconRepo     = () => <svg width="15" height="15" viewBox="0 0 16 16" {...S}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M5.5 2.5v11M1.5 6.5h4"/></svg>
const IconUser     = () => <svg width="15" height="15" viewBox="0 0 16 16" {...S}><circle cx="8" cy="5.5" r="2.5"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>
const IconLock     = () => <svg width="16" height="16" viewBox="0 0 16 16" {...S}><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 016 0v2"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────
function DonutChart({ segments, size = 120, thickness = 22, label, sublabel }) {
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total === 0) {
    return (
      <div className={styles.donutWrap} style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={thickness} />
        </svg>
        <div className={styles.donutCenter}>
          <span className={styles.donutLabel}>{label}</span>
          <span className={styles.donutSub}>{sublabel}</span>
        </div>
      </div>
    )
  }
  let offset = 0
  const slices = segments.map((seg) => {
    const p = seg.value / total
    const dash = p * circumference
    const gap = circumference - dash
    const slice = { ...seg, dash, gap, offset }
    offset += dash
    return slice
  })
  return (
    <div className={styles.donutWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutLabel}>{label}</span>
        <span className={styles.donutSub}>{sublabel}</span>
      </div>
    </div>
  )
}

// ─── Horizontal Bar ──────────────────────────────────────────────────────────
function HBar({ label, value, max, color, suffix = '' }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={styles.hbar}>
      <div className={styles.hbarLabel}>{label}</div>
      <div className={styles.hbarTrack}>
        <div className={styles.hbarFill} style={{ width: `${p}%`, background: color }} />
      </div>
      <div className={styles.hbarVal}>{value}{suffix}</div>
    </div>
  )
}

// ─── Ring Stat ───────────────────────────────────────────────────────────────
function RingStat({ pct: p, color, label, value }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = Math.min((p / 100) * circ, circ - 0.1)
  return (
    <div className={styles.ringStat}>
      <div className={styles.ringWrap}>
        <svg width={76} height={76} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={38} cy={38} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={5} />
          <circle
            cx={38} cy={38} r={r} fill="none"
            stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div className={styles.ringInner}>
          <span className={styles.ringValue} style={{ color }}>{p > 0 ? `${Math.round(p)}%` : value}</span>
        </div>
      </div>
      <span className={styles.ringLabel}>{label}</span>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, value, label, sub, color }) {
  return (
    <div className={styles.kpiCard} style={{ '--kc': color }}>
      <div className={styles.kpiIconBadge}>{icon}</div>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  )
}

// ─── Funnel Step ─────────────────────────────────────────────────────────────
function FunnelStep({ label, value, total, color, step }) {
  const p = total > 0 ? Math.round((value / total) * 100) : 0
  const width = 40 + p * 0.6
  return (
    <div className={styles.funnelStep}>
      <div className={styles.funnelNum}>{step}</div>
      <div className={styles.funnelBar} style={{ width: `${width}%`, background: color }}>
        <span className={styles.funnelBarLabel}>{value.toLocaleString()}</span>
      </div>
      <div className={styles.funnelMeta}>
        <span className={styles.funnelLabel}>{label}</span>
        <span className={styles.funnelPct}>{p}%</span>
      </div>
    </div>
  )
}

// ─── Insight Chip ────────────────────────────────────────────────────────────
function InsightChip({ text, level }) {
  const cls = level === 'good' ? styles.insightGood : level === 'warn' ? styles.insightWarn : styles.insightInfo
  return (
    <div className={`${styles.insightChip} ${cls}`}>
      <span className={styles.insightDot} />
      <span>{text}</span>
    </div>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ data, color = 'var(--accent)', height = 36 }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 1)
  const w = 6
  const gap = 3
  const totalW = data.length * (w + gap) - gap
  return (
    <svg width={totalW} height={height} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * height)
        return (
          <rect
            key={i}
            x={i * (w + gap)} y={height - h}
            width={w} height={h}
            rx={2}
            fill={color}
            opacity={0.7 + (v / max) * 0.3}
          />
        )
      })}
    </svg>
  )
}

// ─── Tab Button ──────────────────────────────────────────────────────────────
function TabBtn({ icon, label, active, onClick, count }) {
  return (
    <button className={`${styles.tabBtn} ${active ? styles.tabBtnActive : ''}`} onClick={onClick}>
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {label}
      {count !== undefined && <span className={styles.tabCount}>{count}</span>}
    </button>
  )
}

// ─── Section Header ──────────────────────────────────────────────────────────
function SectionHead({ title, badge, desc }) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionHeadLeft}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {badge && <span className={styles.sectionBadge}>{badge}</span>}
      </div>
      {desc && <p className={styles.sectionDesc}>{desc}</p>}
    </div>
  )
}

// ─── User Metrics Content ────────────────────────────────────────────────────
function UserMetricsContent({ data, targetUsername }) {
  const mc = data?.commitMetrics || {}
  const mp = data?.prMetrics || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Commit KPIs */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Commit Metrics</span>
          <span className={styles.cardSub}>{targetUsername}</span>
        </div>
        <div className={styles.kpiGrid} style={{ marginTop: '1rem' }}>
          <KpiCard icon={<IcoCommit />}   value={num(mc.totalCommits)}                  label="Total Commits" color="#818cf8" />
          <KpiCard icon={<IcoAI />}       value={num(mc.aiGeneratedCount)}              label="AI Generated"  color="#22c55e" />
          <KpiCard icon={<IcoActivity />} value={num(mc.manualCount)}                   label="Manual"        color="#64748b" />
          <KpiCard icon={<IcoActivity />} value={`${pct(mc.aiAdoptionRatePercent)}%`}   label="AI Adoption"   color="#6366f1" />
        </div>
        {num(mc.totalGenerated) > 0 && (
          <div className={styles.metricTable} style={{ marginTop: '1.25rem' }}>
            <HBar label="Accepted (First Try)"        value={num(mc.acceptedFirst)}           max={num(mc.totalGenerated)} color="#22c55e" />
            <HBar label="Accepted (After Regenerate)" value={num(mc.acceptedAfterRegenerate)} max={num(mc.totalGenerated)} color="#6366f1" />
            <HBar label="Rejected"                    value={num(mc.rejected)}                max={num(mc.totalGenerated)} color="#ef4444" />
          </div>
        )}
        {num(mc.totalGenerated) > 0 && (
          <div className={styles.statList} style={{ marginTop: '1rem' }}>
            <div className={styles.statListRow}>
              <span>Accept Rate</span>
              <span className={styles.statListVal} style={{ color: '#22c55e' }}>{pct(mc.acceptRatePercent)}%</span>
            </div>
            <div className={styles.statListRow}>
              <span>First-Try Accept Rate</span>
              <span className={styles.statListVal}>{pct(mc.firstTryAcceptRatePercent)}%</span>
            </div>
            <div className={styles.statListRow}>
              <span>Avg Time to Accept</span>
              <span className={styles.statListVal}>{fmtMs(num(mc.avgTimeToAcceptMs))}</span>
            </div>
          </div>
        )}
      </div>

      {/* PR KPIs */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>PR Review Metrics</span>
          <span className={styles.cardSub}>{targetUsername}</span>
        </div>
        <div className={styles.kpiGrid} style={{ marginTop: '1rem' }}>
          <KpiCard icon={<IcoPR />}      value={num(mp.totalPrs)}               label="Total PRs"     color="#818cf8" />
          <KpiCard icon={<IcoMerge />}   value={num(mp.mergedCount)}            label="Merged"        color="#22c55e" />
          <KpiCard icon={<IcoOpen />}    value={num(mp.openCount)}              label="Open"          color="#eab308" />
          <KpiCard icon={<IcoCheck />}   value={num(mp.approvedCount)}          label="Approved"      color="#6366f1" />
          <KpiCard icon={<IcoWarn />}    value={num(mp.rejectedCount)}          label="Rejected"      color="#ef4444" />
          <KpiCard icon={<IcoShield />}  value={num(mp.withRiskAnalysisCount)}  label="Risk Analyzed" color="#f97316" />
        </div>
        {(num(mp.prsWithFeatureCount) > 0 || num(mp.prsWithoutFeatureCount) > 0) && (
          <div className={styles.statList} style={{ marginTop: '1.25rem' }}>
            <div className={styles.statListRow}>
              <span>Reviews with PR Summary</span>
              <span className={styles.statListVal}>{num(mp.prsWithFeatureCount)}</span>
            </div>
            <div className={styles.statListRow}>
              <span>Reviews without PR Summary</span>
              <span className={styles.statListVal}>{num(mp.prsWithoutFeatureCount)}</span>
            </div>
            <div className={styles.statListRow}>
              <span>Avg Review Time (with)</span>
              <span className={styles.statListVal} style={{ color: '#22c55e' }}>{fmtMs(num(mp.avgReviewTimeWithFeatureMs))}</span>
            </div>
            <div className={styles.statListRow}>
              <span>Avg Review Time (without)</span>
              <span className={styles.statListVal}>{fmtMs(num(mp.avgReviewTimeWithoutFeatureMs))}</span>
            </div>
            <div className={styles.statListRow}>
              <span>Review Time Improvement</span>
              <span className={styles.statListVal} style={{ color: '#22c55e' }}>{pct(mp.reviewTimeImprovementPercent)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Role pill helper ─────────────────────────────────────────────────────────
const ROLE_PILL_CLASS = {
  owner:       'rolePillOwner',
  maintainer:  'rolePillMaintainer',
  developer:   'rolePillDeveloper',
  reviewer:    'rolePillReviewer',
  reader:      'rolePillReader',
}

// ─── Repo Tab ─────────────────────────────────────────────────────────────────
function RepoTab({ repos, reposLoading, headers, currentUsername }) {
  const [selected, setSelected]     = useState(null)
  const [role, setRole]             = useState(null)
  const [roleLoading, setRoleLoading] = useState(false)

  const handleSelect = (e) => {
    const val = e.target.value
    if (!val) { setSelected(null); setRole(null); return }
    const slash = val.indexOf('/')
    setSelected({ owner: val.slice(0, slash), name: val.slice(slash + 1) })
  }

  useEffect(() => {
    if (!selected) { setRole(null); return }
    if (selected.owner === currentUsername) { setRole('owner'); return }
    setRoleLoading(true)
    fetch(`${API_BASE}/repos/${selected.owner}/${selected.name}/collaborators`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data?.collaborators ?? []
        const me = list.find(c => c.username === currentUsername)
        setRole(me?.role?.toLowerCase() || 'collaborator')
      })
      .catch(() => setRole('collaborator'))
      .finally(() => setRoleLoading(false))
  }, [selected])

  const pillCls = role ? ROLE_PILL_CLASS[role] || 'rolePillCollab' : null

  return (
    <div>
      <div className={styles.selectorRow}>
        <span className={styles.selectorLabel}><IconRepo /> Repository</span>
        {reposLoading ? (
          <span className={styles.selectorEmpty}>Loading repositories…</span>
        ) : repos.length === 0 ? (
          <span className={styles.selectorEmpty}>No repositories found</span>
        ) : (
          <select
            className={styles.selector}
            value={selected ? `${selected.owner}/${selected.name}` : ''}
            onChange={handleSelect}
          >
            <option value="">Select a repository…</option>
            {repos.map((r) => (
              <option key={`${r.owner}/${r.name}`} value={`${r.owner}/${r.name}`}>
                {r.owner}/{r.name}
              </option>
            ))}
          </select>
        )}
        {role && !roleLoading && (
          <span className={`${styles.rolePill} ${styles[pillCls]}`}>
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </span>
        )}
        {roleLoading && <span className={styles.selectorEmpty}>…</span>}
      </div>

      {!selected ? (
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}><IconRepo /></div>
          <p className={styles.placeholderTitle}>Select a repository</p>
          <p className={styles.placeholderSub}>
            View commit activity, contributors, PR breakdown, and AI adoption for any repository you have access to.
          </p>
        </div>
      ) : (
        <div className={styles.insightsWrap}>
          <InsightsTab username={selected.owner} repoName={selected.name} headers={headers} />
        </div>
      )}
    </div>
  )
}

// ─── User Tab ─────────────────────────────────────────────────────────────────
function UserTab({ headers, currentUsername }) {
  const [query, setQuery]       = useState('')
  const [suggestions, setSugg]  = useState([])
  const [sugOpen, setSugOpen]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [metrics, setMetrics]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const debounceRef             = useRef(null)
  const wrapRef                 = useRef(null)

  const fetchMetrics = useCallback((username) => {
    setLoading(true)
    setError('')
    setMetrics(null)
    fetch(`${API_BASE}/metrics/user/${encodeURIComponent(username)}`, { headers })
      .then((r) => {
        if (r.status === 403) throw new Error('forbidden')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setMetrics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [headers])

  const loadUser = useCallback((u) => {
    setSelected(u)
    setQuery(u.username)
    setSugOpen(false)
    setSugg([])
    fetchMetrics(u.username)
  }, [fetchMetrics])

  useEffect(() => {
    loadUser({ username: currentUsername })
  }, [currentUsername])

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setSugOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSugg([]); setSugOpen(false); return }
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/people/search?q=${encodeURIComponent(val)}&limit=10`, { headers })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => { setSugg(Array.isArray(data) ? data : []); setSugOpen(true) })
        .catch(() => {})
    }, 280)
  }

  const isSelf = selected?.username === currentUsername

  return (
    <div>
      <div className={styles.selectorRow}>
        <span className={styles.selectorLabel}><IconUser /> User</span>
        <div className={styles.searchWrap} ref={wrapRef}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setSugOpen(true)}
            placeholder="Search for a user…"
            autoComplete="off"
          />
          {sugOpen && suggestions.length > 0 && (
            <div className={styles.suggestions}>
              {suggestions.map((s) => (
                <button key={s.username} className={styles.suggItem} onMouseDown={() => loadUser(s)}>
                  <span className={styles.suggUsername}>{s.username}</span>
                  {(s.firstName || s.lastName) && (
                    <span className={styles.suggFullName}>
                      {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {s.username === currentUsername && <span className={styles.suggYou}>You</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <span className={`${styles.rolePill} ${isSelf ? styles.rolePillOwner : styles.rolePillCollab}`}>
            {isSelf ? 'You' : 'Viewing as Owner / Maintainer'}
          </span>
        )}
      </div>

      {!isSelf && (
        <div className={styles.permHint}>
          <IconLock />
          You can view another user's metrics only if they are a collaborator in a repository you own or manage.
        </div>
      )}

      {loading && <div className={styles.tabLoading}>Loading metrics…</div>}

      {error === 'forbidden' && (
        <div className={styles.permError}>
          <IconLock />
          <div>
            <strong>Access denied</strong>
            <p>
              You can only view metrics for <strong>{selected?.username}</strong> if they are a collaborator
              in a repository you own or manage.
            </p>
          </div>
        </div>
      )}

      {error && error !== 'forbidden' && (
        <div className={styles.tabError}>Failed to load metrics: {error}</div>
      )}

      {!loading && !error && metrics && (
        <UserMetricsContent data={metrics} targetUsername={selected?.username} />
      )}
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function VegaAnalyticsDashboard() {
  const { getAuthHeader, user } = useAuth()
  const [my, setMy] = useState(null)
  const [global, setGlobal] = useState(null)
  const [allPrs, setAllPrs] = useState([])
  const [repos, setRepos] = useState([])
  const [reposLoading, setReposLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [timeRange] = useState('ALL_TIME')

  const headers = useCallback(() => getAuthHeader(), [getAuthHeader])

  useEffect(() => {
    const h = headers()
    Promise.all([
      fetch(`${API_BASE}/metrics/me`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/metrics/global`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/repos/me`, { headers: h }).then(r => r.ok ? r.json() : null),
    ])
      .then(async ([meData, globalData, reposData]) => {
        setMy(meData)
        setGlobal(globalData)
        const repoList = Array.isArray(reposData) ? reposData
          : reposData?.repositories ?? reposData?.repos ?? []
        setRepos(repoList)
        setReposLoading(false)

        const username = meData?.username || user?.username
        if (username && repoList.length > 0) {
          const prFetches = repoList.slice(0, 8).map(repo => {
            const name = repo.name || repo
            return fetch(`${API_BASE}/repos/${username}/${name}/pull-requests`, { headers: h })
              .then(r => r.ok ? r.json() : [])
              .then(d => Array.isArray(d) ? d : d?.pullRequests ?? d?.content ?? [])
              .catch(() => [])
          })
          const prArrays = await Promise.all(prFetches)
          setAllPrs(prArrays.flat())
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading analytics...</span>
      </div>
    )
  }

  // ── Derived Metrics ──────────────────────────────────────────────────────
  const mc = my?.commitMetrics || {}
  const mp = my?.prMetrics || {}
  const gc = global?.commitMetrics || {}
  const gp = global?.prMetrics || {}

  // personal commit metrics (from /metrics/me)
  const totalCommits  = mc.totalCommits || 0
  const aiCommits     = mc.aiGeneratedCount || 0
  const manualCommits = mc.manualCount || 0
  const aiAdoptionPct = mc.aiAdoptionRatePercent || 0

  // PR metrics from live-fetched allPrs (user's own repos); fall back to personal /metrics/me
  const totalPrs     = allPrs.length     || mp.totalPrs     || 0
  const openPrs      = allPrs.filter(p => p.status === 'OPEN').length      || mp.openCount      || 0
  const mergedPrs    = allPrs.filter(p => p.status === 'MERGED').length    || mp.mergedCount    || 0
  const approvedPrs  = allPrs.filter(p => p.status === 'APPROVED').length  || mp.approvedCount  || 0
  const rejectedPrs  = allPrs.filter(p => p.status === 'REJECTED').length  || mp.rejectedCount  || 0
  const reviewingPrs = allPrs.filter(p => p.status === 'REVIEWING').length || mp.reviewingCount || 0

  const riskHigh = allPrs.filter(p => p.riskLevel === 'HIGH').length
  const riskMedium = allPrs.filter(p => p.riskLevel === 'MEDIUM').length
  const riskLow = allPrs.filter(p => p.riskLevel === 'LOW').length
  const conflictPrs = allPrs.filter(p => p.hasConflicts).length
  const riskAnalysisCoverage = totalPrs > 0 ? (allPrs.filter(p => p.riskLevel).length / totalPrs) * 100 : 100

  const avgRiskScore = allPrs.length > 0
    ? Math.round(allPrs.reduce((s, p) => s + (p.riskScore || 0), 0) / allPrs.length)
    : 0

  const totalFilesChanged = allPrs.reduce((s, p) => s + (p.summaryFilesChanged || 0), 0)
  const totalLinesAdded = allPrs.reduce((s, p) => s + (p.summaryLinesAdded || 0), 0)
  const totalLinesRemoved = allPrs.reduce((s, p) => s + (p.summaryLinesRemoved || 0), 0)

  const prSuccessRate = totalPrs > 0
    ? Math.round(((mergedPrs + approvedPrs) / totalPrs) * 100)
    : 0

  // ── Chart Data ───────────────────────────────────────────────────────────
  const commitDonut = [
    { label: 'AI Generated', value: aiCommits, color: '#818cf8' },
    { label: 'Manual', value: manualCommits, color: 'var(--border)' },
  ]
  const riskDonut = [
    { label: 'HIGH', value: riskHigh, color: '#ef4444' },
    { label: 'MEDIUM', value: riskMedium, color: '#f97316' },
    { label: 'LOW', value: riskLow, color: '#22c55e' },
  ]
  const prStatusDonut = [
    { label: 'Open', value: openPrs, color: '#818cf8' },
    { label: 'Merged', value: mergedPrs, color: '#22c55e' },
    { label: 'Approved', value: approvedPrs, color: '#6366f1' },
    { label: 'Rejected', value: rejectedPrs, color: '#ef4444' },
    { label: 'Reviewing', value: reviewingPrs, color: '#eab308' },
  ]

  const sparkData = [4, 7, 5, 12, 9, 15, 11, Math.min(totalCommits, 30)]

  const insights = []
  if (aiAdoptionPct >= 20) insights.push({ text: `AI commit adoption is ${aiAdoptionPct.toFixed(1)}% — strong AI integration`, level: 'good' })
  else insights.push({ text: `AI adoption at ${aiAdoptionPct.toFixed(1)}% — try vega commit --ai for faster messages`, level: 'info' })
  if (riskHigh > riskMedium + riskLow) insights.push({ text: `${riskHigh} HIGH-risk PRs detected — review priority queue recommended`, level: 'warn' })
  if (conflictPrs > 0) insights.push({ text: `${conflictPrs} PR${conflictPrs > 1 ? 's' : ''} with active conflicts — resolve to unblock merge`, level: 'warn' })
  if (prSuccessRate >= 60) insights.push({ text: `${prSuccessRate}% PR success rate (approved + merged)`, level: 'good' })
  if (riskAnalysisCoverage === 100) insights.push({ text: `100% of PRs have automated risk analysis`, level: 'good' })

  const authHeaders = headers()

  return (
    <div className={styles.container}>
      {/* ── Top Header ──────────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.pageTitle}>VEGA Analytics</h1>
          <p className={styles.pageSubtitle}>
            Developer intelligence · {timeRange.replace('_', ' ')}
          </p>
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.userTag}>{user?.username || my?.username}</span>
          <span className={styles.liveDot} title="Live data" />
          <span className={styles.liveLabel}>Live</span>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        <TabBtn label="Overview"        active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
        <TabBtn label="Commits"         active={activeTab === 'commits'}  onClick={() => setActiveTab('commits')}  count={totalCommits} />
        <TabBtn label="Pull Requests"   active={activeTab === 'prs'}      onClick={() => setActiveTab('prs')}      count={totalPrs} />
        <TabBtn icon={<IconRepo />} label="By Repository" active={activeTab === 'repo'} onClick={() => setActiveTab('repo')} />
        <TabBtn icon={<IconUser />} label="By User"       active={activeTab === 'user'} onClick={() => setActiveTab('user')} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className={styles.tabContent}>
          <div className={styles.metricsContextBar}>
            <span className={styles.metricsContextTitle}>YOUR METRICS</span>
            <span className={styles.metricsContextPill}>
              <IcoUsers />
              {user?.username || my?.username}
            </span>
            <span className={styles.metricsContextDot} />
            <span className={styles.metricsContextSub}>Personal activity · All time</span>
          </div>
          <div className={styles.kpiGrid}>
            <KpiCard icon={<IcoCommit />}   value={totalCommits}                        label="Total Commits"    sub={`${aiCommits} AI-generated`}    color="#818cf8" />
            <KpiCard icon={<IcoPR />}       value={totalPrs}                            label="Pull Requests"    sub={`${mergedPrs} merged`}           color="#6366f1" />
            <KpiCard icon={<IcoAI />}       value={`${aiAdoptionPct.toFixed(1)}%`}      label="AI Adoption"      sub="commit messages"                  color="#22c55e" />
            <KpiCard icon={<IcoWarn />}     value={conflictPrs}                         label="Active Conflicts"  sub="PRs blocked"                    color={conflictPrs > 0 ? '#ef4444' : '#6366f1'} />
            <KpiCard icon={<IcoShield />}   value={`${riskAnalysisCoverage.toFixed(0)}%`} label="Risk Coverage"  sub="PRs with analysis"              color="#f97316" />
            <KpiCard icon={<IcoRepo2 />}    value={repos.length}                        label="Repositories"     sub="tracked"                         color="#eab308" />
          </div>

          <div className={styles.insightsRow}>
            <span className={styles.insightsTitle}>Insights</span>
            {insights.map((ins, i) => (
              <InsightChip key={i} text={ins.text} level={ins.level} />
            ))}
          </div>

          <div className={styles.overviewGrid}>
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Commit Breakdown</span>
                <span className={styles.cardSub}>AI vs Manual</span>
              </div>
              <div className={styles.donutRow}>
                <DonutChart segments={commitDonut} size={130} thickness={24} label={`${aiAdoptionPct.toFixed(0)}%`} sublabel="AI" />
                <div className={styles.legend}>
                  {commitDonut.map(s => (
                    <div key={s.label} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendVal}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.sparkRow}>
                <span className={styles.sparkLabel}>Activity trend</span>
                <Sparkline data={sparkData} color="#818cf8" />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>PR Risk Distribution</span>
                <span className={styles.cardSub}>Avg score: {avgRiskScore}</span>
              </div>
              <div className={styles.donutRow}>
                <DonutChart segments={riskDonut} size={130} thickness={24} label={`${totalPrs}`} sublabel="PRs" />
                <div className={styles.legend}>
                  {riskDonut.map(s => (
                    <div key={s.label} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendVal}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.riskBarRow}>
                <HBar label="HIGH" value={riskHigh} max={totalPrs} color="#ef4444" />
                <HBar label="MED" value={riskMedium} max={totalPrs} color="#f97316" />
                <HBar label="LOW" value={riskLow} max={totalPrs} color="#22c55e" />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>PR Status Pipeline</span>
                <span className={styles.cardSub}>{prSuccessRate}% success rate</span>
              </div>
              <div className={styles.donutRow}>
                <DonutChart segments={prStatusDonut} size={130} thickness={24} label={`${prSuccessRate}%`} sublabel="Success" />
                <div className={styles.legend}>
                  {prStatusDonut.map(s => (
                    <div key={s.label} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendVal}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.card} style={{ marginTop: '1.5rem' }}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>AI Impact Overview</span>
              <span className={styles.cardSub}>Your metrics</span>
            </div>
            <div className={styles.ringsRow}>
              <RingStat pct={riskAnalysisCoverage} color="#6366f1" label="Risk analysis coverage" value="100%" />
              <RingStat pct={aiAdoptionPct}         color="#eab308" label="AI commit adoption"     value={`${aiAdoptionPct.toFixed(0)}%`} />
              <RingStat pct={prSuccessRate}         color="#06b6d4" label="PR success rate"        value={`${prSuccessRate}%`} />
            </div>
          </div>


        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: COMMITS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'commits' && (
        <div className={styles.tabContent}>
          <SectionHead title="Commit Intelligence" badge={user?.username || my?.username} desc="Your personal commit history — commits you pushed to any VEGA repository, including AI message adoption." />
          <div className={styles.kpiGrid}>
            <KpiCard icon={<IcoCommit />}  value={totalCommits}  label="Total Commits"  color="#818cf8" />
            <KpiCard icon={<IcoAI />}      value={aiCommits}     label="AI-Generated"   sub={`${aiAdoptionPct.toFixed(1)}%`} color="#22c55e" />
            <KpiCard icon={<IcoActivity />} value={manualCommits} label="Manual Commits" color="#64748b" />
            <KpiCard icon={<IcoRepo2 />}   value={repos.length}  label="Repositories"   color="#6366f1" />
          </div>

          <div className={styles.twoCol}>
            <div className={styles.card}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>AI vs Manual Split</span></div>
              <div className={styles.donutRow}>
                <DonutChart segments={commitDonut} size={150} thickness={28} label={`${aiAdoptionPct.toFixed(0)}%`} sublabel="AI" />
                <div>
                  <div className={styles.bigStat} style={{ color: '#818cf8' }}>{aiCommits} <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>AI-generated</span></div>
                  <div className={styles.bigStat} style={{ color: 'var(--text-secondary)' }}>{manualCommits} <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>manual</span></div>
                  <div style={{ marginTop: '1rem' }}>
                    <div className={styles.hbar}>
                      <div className={styles.hbarTrack}>
                        <div className={styles.hbarFill} style={{ width: `${aiAdoptionPct}%`, background: '#818cf8' }} />
                      </div>
                    </div>
                    <div className={styles.hbarCaption}>AI Adoption Rate: {aiAdoptionPct.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>Per-Repo Breakdown</span></div>
              <div className={styles.repoList}>
                {repos.slice(0, 7).map((repo, i) => {
                  const name = repo.name || repo
                  return (
                    <div key={i} className={styles.repoRow}>
                      <span className={styles.repoIcon}><IcoRepo2 /></span>
                      <span className={styles.repoName}>{name}</span>
                    </div>
                  )
                })}
              </div>
              <div className={styles.cardFoot}>
                <span className={styles.footNote}>{repos.length} repositories tracked</span>
              </div>
            </div>
          </div>

          {mc.totalGenerated > 0 && (
            <div className={styles.card} style={{ marginTop: '1.5rem' }}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>AI Message Generation Details</span></div>
              <div className={styles.metricTable}>
                {[
                  { label: 'Total AI Generated', value: mc.totalGenerated, color: '#818cf8' },
                  { label: 'Accepted (First Try)', value: mc.acceptedFirst, color: '#22c55e' },
                  { label: 'Accepted (After Regenerate)', value: mc.acceptedAfterRegenerate, color: '#6366f1' },
                  { label: 'Rejected', value: mc.rejected, color: '#ef4444' },
                ].map(row => (
                  <HBar key={row.label} label={row.label} value={row.value} max={mc.totalGenerated} color={row.color} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: PULL REQUESTS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'prs' && (
        <div className={styles.tabContent}>
          <SectionHead title="Pull Request Analytics" badge="Live Data" desc="Complete lifecycle analytics across all PRs with automated risk analysis and conflict tracking." />

          <div className={styles.kpiGrid}>
            <KpiCard icon={<IcoPR />}      value={totalPrs}                               label="Total PRs"      color="#818cf8" />
            <KpiCard icon={<IcoMerge />}   value={mergedPrs}                              label="Merged"         color="#22c55e" />
            <KpiCard icon={<IcoOpen />}    value={openPrs}                                label="Open"           color="#eab308" />
            <KpiCard icon={<IcoWarn />}    value={conflictPrs}                            label="Conflicts"      color="#ef4444" />
            <KpiCard icon={<IcoShield />}  value={`${riskAnalysisCoverage.toFixed(0)}%`}  label="Risk Coverage"  color="#6366f1" />
            <KpiCard icon={<IcoActivity />} value={avgRiskScore}                          label="Avg Risk Score" color="#f97316" />
          </div>

          <div className={styles.threeCol}>
            <div className={styles.card}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>Risk Distribution</span></div>
              <div className={styles.donutRow}>
                <DonutChart segments={riskDonut} size={130} thickness={24} label={avgRiskScore.toString()} sublabel="avg" />
                <div className={styles.legend}>
                  {riskDonut.map(s => (
                    <div key={s.label} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendVal}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>Status Distribution</span></div>
              <div className={styles.donutRow}>
                <DonutChart segments={prStatusDonut} size={130} thickness={24} label={`${prSuccessRate}%`} sublabel="success" />
                <div className={styles.legend}>
                  {prStatusDonut.map(s => (
                    <div key={s.label} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendVal}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}><span className={styles.cardTitle}>Code Change Volume</span></div>
              <div className={styles.statList}>
                <div className={styles.statListRow}><span>Files changed</span><span className={styles.statListVal}>{totalFilesChanged.toLocaleString()}</span></div>
                <div className={styles.statListRow}><span>Lines added</span><span className={styles.statListVal} style={{ color: '#22c55e' }}>+{totalLinesAdded.toLocaleString()}</span></div>
                <div className={styles.statListRow}><span>Lines removed</span><span className={styles.statListVal} style={{ color: '#ef4444' }}>-{totalLinesRemoved.toLocaleString()}</span></div>
                <div className={styles.statListRow}><span>Conflicts active</span><span className={styles.statListVal} style={{ color: conflictPrs > 0 ? '#ef4444' : '#22c55e' }}>{conflictPrs}</span></div>
                <div className={styles.statListRow}><span>Risk analysis rate</span><span className={styles.statListVal} style={{ color: '#818cf8' }}>{riskAnalysisCoverage.toFixed(0)}%</span></div>
              </div>
            </div>
          </div>

          <div className={styles.card} style={{ marginTop: '1.5rem' }}>
            <div className={styles.cardHead}><span className={styles.cardTitle}>Risk Level Breakdown</span></div>
            <div className={styles.metricTable}>
              <HBar label="HIGH Risk"      value={riskHigh}    max={totalPrs || 1} color="#ef4444" />
              <HBar label="MEDIUM Risk"    value={riskMedium}  max={totalPrs || 1} color="#f97316" />
              <HBar label="LOW Risk"       value={riskLow}     max={totalPrs || 1} color="#22c55e" />
              <HBar label="With Conflicts" value={conflictPrs} max={totalPrs || 1} color="#ef4444" />
              <HBar label="Merged"         value={mergedPrs}   max={totalPrs || 1} color="#22c55e" />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: BY REPOSITORY
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'repo' && (
        <div className={styles.tabContent}>
          <SectionHead
            title="Repository Insights"
            badge="Per-Repo"
            desc="Select any repository you own or collaborate on to explore its commit activity, contributors, PR breakdown, and AI adoption."
          />
          <RepoTab
            repos={repos}
            reposLoading={reposLoading}
            headers={authHeaders}
            currentUsername={user?.username}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: BY USER
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'user' && (
        <div className={styles.tabContent}>
          <SectionHead
            title="User Metrics"
            badge="Per-User"
            desc="View detailed metrics for any user. You can view your own metrics, or metrics for collaborators in repositories you own or manage."
          />
          <UserTab headers={authHeaders} currentUsername={user?.username} />
        </div>
      )}
    </div>
  )
}
