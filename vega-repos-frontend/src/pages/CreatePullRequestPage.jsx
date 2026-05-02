import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './CreatePullRequestPage.module.css'
import { API_BASE } from '../config/api'


async function safeJson(r) {
  const text = await r.text()
  if (!text || !text.trim()) return null
  try { return JSON.parse(text) } catch { return null }
}

export default function CreatePullRequestPage() {
  const { username, repoName } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [branches, setBranches] = useState([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('main')
  const [description, setDescription] = useState('')
  const [prType, setPrType] = useState('')
  const [assignedReviewer, setAssignedReviewer] = useState('')
  const [reviewers, setReviewers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const PR_TYPES = [
    { value: 'BUG_FIX',       label: 'Bug Fix',       icon: '🐛', desc: 'Fix a defect or regression',    risk: 'medium' },
    { value: 'HOTFIX',        label: 'Hotfix',        icon: '🚨', desc: 'Emergency critical patch',       risk: 'high'   },
    { value: 'NEW_FEATURE',   label: 'New Feature',   icon: '✨', desc: 'Add new functionality',          risk: 'medium' },
    { value: 'REFACTOR',      label: 'Refactor',      icon: '🔧', desc: 'Restructure existing code',      risk: 'medium' },
    { value: 'PERFORMANCE',   label: 'Performance',   icon: '⚡', desc: 'Improve speed or efficiency',    risk: 'medium' },
    { value: 'SECURITY',      label: 'Security',      icon: '🔒', desc: 'Fix security vulnerability',     risk: 'high'   },
    { value: 'DOCUMENTATION', label: 'Docs',          icon: '📝', desc: 'Update docs or comments',        risk: 'low'    },
    { value: 'CHORE',         label: 'Chore',         icon: '🛠', desc: 'Config, build, deps cleanup',    risk: 'low'    },
  ]

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])
  const prQuerySource = searchParams.get('source') ?? ''
  const prQueryTarget = searchParams.get('target') ?? ''

  useEffect(() => {
    if (!username || !repoName) return
    setBranchesLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/branches`, { headers })
      .then((r) => r.ok ? safeJson(r) : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setBranches(list)
        const mainBranch = list.find(b => b.name === 'main' || b.name === 'master')
        let target = mainBranch?.name || 'main'
        if (prQueryTarget && list.some((b) => b.name === prQueryTarget)) target = prQueryTarget
        setTargetBranch(target)

        let source = ''
        const others = list.filter(b => b.name !== 'main' && b.name !== 'master')
        if (others.length > 0) source = others[0].name
        else if (list.length > 1) source = list[1].name
        if (prQuerySource && list.some((b) => b.name === prQuerySource)) source = prQuerySource
        setSourceBranch(source)
      })
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false))
    // Load reviewer-role collaborators
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators`, { headers })
      .then((r) => r.ok ? safeJson(r) : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setReviewers(list.filter(c => c.role === 'reviewer' || c.role === 'maintainer'))
      })
      .catch(() => setReviewers([]))
  }, [username, repoName, headers, prQuerySource, prQueryTarget])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sourceBranch || !targetBranch) {
      setError('Please select both source and target branches.')
      return
    }
    if (sourceBranch === targetBranch) {
      setError('Source and target branches must be different.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBranch, targetBranch, description, prType: prType || undefined, assignedReviewer: assignedReviewer || undefined }),
      })
      const data = await safeJson(r)
      if (r.ok && data?.id) {
        navigate(`/repos/${username}/${repoName}/pull-requests/${data.id}`, {
          state: { hasConflicts: !!data.hasConflicts, conflictedFiles: data.conflictedFiles ?? [] }
        })
      } else {
        throw new Error(data?.error || `Server returned ${r.status}`)
      }
    } catch (e) {
      setError(e?.message || 'Failed to create pull request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <Link to={`/repos/${username}/${repoName}`} className={styles.back}>&larr; Back to {repoName}</Link>

      <div className={styles.card}>
        <h1 className={styles.title}>Create Pull Request</h1>
        <p className={styles.subtitle}>
          <strong>{username}/{repoName}</strong> — Merge changes from one branch into another.
          VEGA will automatically analyze conflicts and risk.
        </p>

        {branchesLoading ? (
          <p className={styles.loading}>Loading branches...</p>
        ) : branches.length < 2 ? (
          <div className={styles.noBranches}>
            <p>You need at least 2 branches to create a pull request.</p>
            <p>Use <code>vega branch &lt;name&gt;</code> and <code>vega push</code> to push a feature branch.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.branchRow}>
              <div className={styles.field}>
                <label className={styles.label}>Source Branch</label>
                <p className={styles.hint}>The branch with your changes</p>
                <select
                  className={styles.select}
                  value={sourceBranch}
                  onChange={(e) => setSourceBranch(e.target.value)}
                  required
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.arrowSep}>→</div>

              <div className={styles.field}>
                <label className={styles.label}>Target Branch</label>
                <p className={styles.hint}>The branch to merge into</p>
                <select
                  className={styles.select}
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  required
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {sourceBranch && targetBranch && sourceBranch !== targetBranch && (
              <div className={styles.preview}>
                Merging <code>{sourceBranch}</code> → <code>{targetBranch}</code>
              </div>
            )}
            {sourceBranch && targetBranch && sourceBranch === targetBranch && (
              <div className={styles.sameError}>Source and target branches must be different.</div>
            )}

            {/* PR Type Selector */}
            <div className={styles.typeSection}>
              <label className={styles.typeLabel}>
                PR Type <span className={styles.optional}>(optional — affects risk score)</span>
              </label>
              <p className={styles.typeHint}>Select the purpose of this pull request for more accurate risk analysis</p>
              <div className={styles.typeGrid}>
                {PR_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeCard} ${prType === t.value ? styles.typeSelected : ''}`}
                    onClick={() => setPrType(prType === t.value ? '' : t.value)}
                    title={t.desc}
                  >
                    <span className={styles.typeIcon}>{t.icon}</span>
                    <span className={styles.typeName}>{t.label}</span>
                    <span className={styles.typeDesc}>{t.desc}</span>
                    <span className={styles.typeRiskBadge} data-risk={t.risk}>{t.risk.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
              <textarea
                className={styles.textarea}
                placeholder="Describe what this PR does, why the changes are needed, or any notes for reviewers..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {reviewers.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Assign Reviewer <span className={styles.optional}>(optional)</span></label>
                <p className={styles.hint}>Assign a specific reviewer, or leave empty for any reviewer to approve</p>
                <select
                  className={styles.select}
                  value={assignedReviewer}
                  onChange={(e) => setAssignedReviewer(e.target.value)}
                >
                  <option value="">Any reviewer</option>
                  {reviewers.map((r) => (
                    <option key={r.username} value={r.username}>{r.username}</option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className={styles.errorMsg} role="alert">{error}</p>}

            <div className={styles.actions}>
              <Link to={`/repos/${username}/${repoName}`} className={styles.cancelBtn}>Cancel</Link>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting || !sourceBranch || !targetBranch || sourceBranch === targetBranch}
              >
                {submitting ? 'Creating...' : 'Create Pull Request'}
              </button>
            </div>

            <p className={styles.footer}>
              VEGA will perform conflict detection, 8-metric rule-based analysis, and AI review on PR creation.
              {prType && ` PR type "${prType.replace(/_/g, ' ')}" will be factored into the risk score.`}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
