import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './CreatePullRequestPage.module.css'

const API_BASE = '/api'

async function safeJson(r) {
  const text = await r.text()
  if (!text || !text.trim()) return null
  try { return JSON.parse(text) } catch { return null }
}

export default function CreatePullRequestPage() {
  const { username, repoName } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [branches, setBranches] = useState([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('main')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  useEffect(() => {
    if (!username || !repoName) return
    setBranchesLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/branches`, { headers })
      .then((r) => r.ok ? safeJson(r) : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setBranches(list)
        // Default: target = main or master, source = first non-main branch
        const mainBranch = list.find(b => b.name === 'main' || b.name === 'master')
        if (mainBranch) setTargetBranch(mainBranch.name)
        const others = list.filter(b => b.name !== 'main' && b.name !== 'master')
        if (others.length > 0) setSourceBranch(others[0].name)
        else if (list.length > 1) setSourceBranch(list[1].name)
      })
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false))
  }, [username, repoName, headers])

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
        body: JSON.stringify({ sourceBranch, targetBranch, description }),
      })
      const data = await safeJson(r)
      if (r.ok && data?.id) {
        navigate(`/repos/${username}/${repoName}/pull-requests/${data.id}`)
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
              VEGA will perform 3-way conflict detection and rule-based risk analysis on PR creation.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
