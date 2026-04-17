import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FileTree from '../components/FileTree'
import CodeViewer from '../components/CodeViewer'
import styles from './RepoDetailPage.module.css'

const API_BASE = '/api'

const BRANCH_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
  '#10b981',
  '#f97316',
]

/** GitHub-style "Updated 3 days ago" (no extra deps) */
function formatRelativeUpdated(ts) {
  if (ts == null || ts === 0) return '—'
  const diff = Date.now() - ts
  if (diff < 0) return formatBranchTipDateStatic(ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`
  const yr = Math.floor(day / 365)
  return `${yr} year${yr === 1 ? '' : 's'} ago`
}

function formatBranchTipDateStatic(ts) {
  if (ts == null || ts === 0) return '—'
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function isOpenPipelinePrStatus(status) {
  const u = String(status || '').toUpperCase()
  return u === 'OPEN' || u === 'REVIEWING' || u === 'APPROVED'
}

function prStatusBadgeClass(styles, status) {
  const u = String(status || '').toUpperCase()
  if (u === 'APPROVED') return styles.statusApproved
  if (u === 'REJECTED') return styles.statusRejected
  if (u === 'MERGED') return styles.statusMerged
  if (u === 'REVIEWING') return styles.statusReviewing
  return styles.statusOpen
}

/** Newest PR per source branch: prefer open pipeline, then merged, else most recent. */
function buildPrBySourceBranch(pullRequests) {
  const by = new Map()
  for (const pr of pullRequests || []) {
    const src = pr.sourceBranch
    if (!src) continue
    if (!by.has(src)) by.set(src, [])
    by.get(src).push(pr)
  }
  const out = new Map()
  for (const [src, arr] of by) {
    const sorted = [...arr].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
    const active = sorted.find((p) => isOpenPipelinePrStatus(p.status))
    if (active) {
      out.set(src, active)
      continue
    }
    const merged = sorted.find((p) => String(p.status || '').toUpperCase() === 'MERGED')
    out.set(src, merged || sorted[0])
  }
  return out
}

function truncatePrDesc(s, max = 36) {
  if (!s || !String(s).trim()) return ''
  const t = String(s).trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function buildGraphLayout(commits) {
  if (!commits || commits.length === 0) return []

  // Assign colors to known branches
  const branchColorMap = new Map()
  let colorIdx = 0
  commits.forEach((c) => {
    ;(c.branches || []).forEach((b) => {
      if (!branchColorMap.has(b)) {
        branchColorMap.set(b, BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length])
      }
    })
  })

  // lanes[col] = hash expected in this lane (null = free)
  const lanes = []
  const hashToLane = new Map()
  const laneColorArr = []

  const result = commits.map((c) => {
    // Snapshot lane state BEFORE processing this commit
    const activeLanesBefore = [...lanes]
    const laneColorsBefore = [...laneColorArr]

    // Find or assign this commit's column
    const wasPreAssigned = hashToLane.has(c.fullHash)
    let col
    if (wasPreAssigned) {
      col = hashToLane.get(c.fullHash)
    } else {
      col = lanes.indexOf(null)
      if (col === -1) { col = lanes.length; lanes.push(null); laneColorArr.push(null) }
    }

    // Determine color
    let color
    if (c.branches?.length > 0) {
      color = branchColorMap.get(c.branches[0]) || BRANCH_COLORS[col % BRANCH_COLORS.length]
    } else {
      color = laneColorArr[col] || BRANCH_COLORS[col % BRANCH_COLORS.length]
    }
    laneColorArr[col] = color

    // Free this lane slot (commit has arrived)
    lanes[col] = null
    hashToLane.delete(c.fullHash)

    // Get parent hashes (p2 = second parent for merge commits)
    const p1 = c.parentHash || null
    const p2 = c.secondParentHash || c.mergeParentHash ||
      (Array.isArray(c.parentHashes) && c.parentHashes.length > 1 ? c.parentHashes[1] : null)

    // Assign primary parent to a lane
    let parentCol = null
    if (p1) {
      if (hashToLane.has(p1)) {
        parentCol = hashToLane.get(p1)
      } else {
        // Continue in the same lane
        lanes[col] = p1
        hashToLane.set(p1, col)
        parentCol = col
      }
    }

    // Assign secondary parent to a lane (merge commit)
    let secondParentCol = null
    if (p2) {
      if (hashToLane.has(p2)) {
        secondParentCol = hashToLane.get(p2)
      } else {
        let newCol = lanes.indexOf(null)
        if (newCol === -1) { newCol = lanes.length; lanes.push(null); laneColorArr.push(null) }
        lanes[newCol] = p2
        hashToLane.set(p2, newCol)
        laneColorArr[newCol] = color
        secondParentCol = newCol
      }
    }

    // If lane ended up truly free (no parent), clear its stale color so
    // reused slots don't inherit the wrong color from a previous branch
    if (lanes[col] === null) {
      laneColorArr[col] = null
    }

    return {
      ...c,
      col,
      parentCol,
      secondParentCol,
      color,
      isMerge: !!p2,
      hasLineAbove: wasPreAssigned,
      activeLanesBefore,
      laneColorsBefore,
    }
  })

  // Track the widest lane count seen during processing (JS array.length only grows)
  let maxLanes = 1
  result.forEach((r) => { if (r.activeLanesBefore.length > maxLanes) maxLanes = r.activeLanesBefore.length })
  maxLanes = Math.max(maxLanes, lanes.length, 1)
  return result.map((r) => ({ ...r, totalLanes: maxLanes }))
}

export default function RepoDetailPage() {
  const { username, repoName } = useParams()
  const { user, token } = useAuth()
  const isOwner = user?.username === username
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])
  const [repo, setRepo] = useState(null)
  const [branches, setBranches] = useState([])
  const [commits, setCommits] = useState([])
  const [graphCommits, setGraphCommits] = useState([])
  const [fileTree, setFileTree] = useState([])
  const [fileTreeLoading, setFileTreeLoading] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState('master')
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')
  const [collaboratorError, setCollaboratorError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [activeTab, setActiveTab] = useState('files')
  const [collaborators, setCollaborators] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [newCollaborator, setNewCollaborator] = useState('')
  const [addCollaboratorLoading, setAddCollaboratorLoading] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [requestAccessSent, setRequestAccessSent] = useState(false)
  const [pullRequests, setPullRequests] = useState([])
  const [branchSearch, setBranchSearch] = useState('')
  const [selectedCommit, setSelectedCommit] = useState(null)
  const [commitDiff, setCommitDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [userRole, setUserRole] = useState('public')
  const [inviteRole, setInviteRole] = useState('developer')

  // ── AI Commit Panel state ─────────────────────────────────────────────
  const [aiAnalysis, setAiAnalysis] = useState(null)      // { summary, changes, risks, riskLevel }
  const [aiLoading, setAiLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState([])       // [{role,message}]
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [savedInsights, setSavedInsights] = useState([])   // persisted Q&A from DB
  const [expandedDiffFiles, setExpandedDiffFiles] = useState({})

  const loadRepoData = useCallback(async () => {
    setAccessDenied(false)
    try {
      const repoRes = await fetch(`${API_BASE}/repos/${username}/${repoName}`, { headers })
      if (repoRes.status === 403) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      if (!repoRes.ok) {
        throw new Error(`Failed to fetch repository: ${repoRes.status}`)
      }
      const repoData = await repoRes.json()
      
      const [branchRes, commitRes, graphRes] = await Promise.all([
        fetch(`${API_BASE}/repos/${username}/${repoName}/branches`, { headers }),
        fetch(`${API_BASE}/repos/${username}/${repoName}/commits?limit=20`, { headers }),
        fetch(`${API_BASE}/repos/${username}/${repoName}/commits/graph?limit=50`, { headers }),
      ])
      const branchData = branchRes.ok ? await branchRes.json() : []
      const commitData = commitRes.ok ? await commitRes.json() : []
      const graphData = graphRes.ok ? await graphRes.json() : []
      setRepo(repoData)
      setBranches(branchData || [])
      setCommits(commitData || [])
      setGraphCommits(buildGraphLayout(graphData || []))
      const branchesList = branchData || []
      const hasMaster = branchesList.some((b) => b.name === 'master')
      setSelectedBranch((prev) =>
        hasMaster ? 'master' : (branchesList[0]?.name || prev)
      )
      // Fetch current user's role in this repo
      try {
        const roleRes = await fetch(`${API_BASE}/repos/${username}/${repoName}/can-pr`, { headers })
        if (roleRes.ok) {
          const roleData = await roleRes.json()
          setUserRole(roleData?.role || 'public')
        }
      } catch { /* role stays 'public' */ }
    } catch (err) {
      console.error('loadRepoData error:', err)
      setError('Failed to load repository')
      setRepo(null)
    } finally {
      setLoading(false)
    }
  }, [username, repoName, headers])

  const defaultBranchName = useMemo(() => {
    if (!branches?.length) return 'master'
    if (branches.some((b) => b.name === 'master')) return 'master'
    if (branches.some((b) => b.name === 'main')) return 'main'
    return branches[0].name
  }, [branches])

  const filteredBranchesGh = useMemo(() => {
    const q = branchSearch.trim().toLowerCase()
    const list = q
      ? branches.filter((b) => b.name.toLowerCase().includes(q))
      : [...branches]
    list.sort((a, b) => {
      const aDef = a.name === defaultBranchName ? 0 : 1
      const bDef = b.name === defaultBranchName ? 0 : 1
      if (aDef !== bDef) return aDef - bDef
      const ta = a.tipTimestamp || 0
      const tb = b.tipTimestamp || 0
      if (tb !== ta) return tb - ta
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return list
  }, [branches, branchSearch, defaultBranchName])

  const prBySourceBranch = useMemo(() => buildPrBySourceBranch(pullRequests), [pullRequests])

  useEffect(() => {
    loadRepoData()
  }, [loadRepoData])

  // Owner or maintainer can manage collaborators and settings
  const canManage = isOwner || userRole === 'maintainer'

  useEffect(() => {
    if (!canManage || !username || !repoName) return
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setCollaborators)
      .catch(() => setCollaborators([]))
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/requests`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setPendingRequests)
      .catch(() => setPendingRequests([]))
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/pending-invites`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setPendingInvites)
      .catch(() => setPendingInvites([]))
  }, [canManage, username, repoName, headers])

  useEffect(() => {
    if (!username || !repoName) return
    fetch(`${API_BASE}/repos/${username}/${repoName}/pull-requests`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setPullRequests)
      .catch(() => setPullRequests([]))
  }, [username, repoName, headers])

  const handleSendInvite = (e) => {
    e.preventDefault()
    const toAdd = newCollaborator.trim()
    if (!toAdd) return
    setCollaboratorError('')
    setInviteSent(false)
    setAddCollaboratorLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: toAdd, role: inviteRole }),
    })
      .then((r) => {
        if (r.ok) {
          setNewCollaborator('')
          setCollaboratorError('')
          setInviteSent(true)
          setTimeout(() => setInviteSent(false), 4000)
          return fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/pending-invites`, { headers })
        }
        if (r.status === 400) throw new Error('User not found, already a collaborator, or invite already sent.')
        throw new Error('Failed to send invite.')
      })
      .then((r) => r.json())
      .then(setPendingInvites)
      .catch((err) => setCollaboratorError(err.message || 'Failed to send invite.'))
      .finally(() => setAddCollaboratorLoading(false))
  }

  useEffect(() => {
    if (!username || !repoName) return
    setFileTree([])
    setSelectedFile(null)
    setFileContent(null)
    setFileTreeLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/files?branch=${encodeURIComponent(selectedBranch)}`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setFileTree)
      .catch(() => setFileTree([]))
      .finally(() => setFileTreeLoading(false))
  }, [username, repoName, selectedBranch])

  const handleSelectFile = (path) => {
    setSelectedFile(path)
    setFileLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/files/content?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(selectedBranch)}`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setFileContent(data || { path, content: '', binary: false }))
      .catch(() => setFileContent({ path, content: '', binary: false }))
      .finally(() => setFileLoading(false))
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`${API_BASE}/repos/${username}/${repoName}/download`, { headers })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repoName}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err) {
      setError(err.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (ts) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleDateString()
  }

  /** Branches tab: show time too; backend uses ms since epoch */
  const formatBranchTipDate = (ts) => {
    if (ts == null || ts === 0) return '—'
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return '—'
    }
  }

  const handleCommitClick = async (c) => {
    setSelectedCommit(c)
    setDiffLoading(true)
    setCommitDiff(null)
    setAiAnalysis(null)
    setAiLoading(true)
    setChatHistory([])
    setChatInput('')
    setSavedInsights([])
    setExpandedDiffFiles({})

    const hashForDiff = c.fullHash || c.hash

    // Run diff + AI analysis + saved insights in parallel
    const [diffRes, insightsRes] = await Promise.allSettled([
      fetch(`${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/diff`, { headers }),
      fetch(`${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/insights`, { headers }),
    ])

    if (diffRes.status === 'fulfilled' && diffRes.value.ok) {
      const diffData = await diffRes.value.json()
      setCommitDiff(diffData)
      const openByDefault = {}
      ;(diffData?.files || []).forEach((f) => { openByDefault[f.path] = f.status === 'added' })
      setExpandedDiffFiles(openByDefault)
    } else {
      setCommitDiff(null)
    }
    setDiffLoading(false)

    if (insightsRes.status === 'fulfilled' && insightsRes.value.ok) {
      setSavedInsights(await insightsRes.value.json())
    }

    // AI analysis (separate — can be slow)
    try {
      const aiRes = await fetch('http://localhost:8084/api/agent/analyze-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          commitHash: hashForDiff,
          commitMessage: c.message,
          author: c.author,
          diff: '',
        }),
      })
      if (aiRes.ok) {
        const data = await aiRes.json()
        if (data.success) setAiAnalysis(data)
      }
    } catch { /* AI unavailable — panel stays empty */ } finally {
      setAiLoading(false)
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatSending || !selectedCommit) return
    const question = chatInput.trim()
    setChatInput('')
    setChatSending(true)
    const newHistory = [...chatHistory, { role: 'user', message: question }]
    setChatHistory(newHistory)
    try {
      const c = selectedCommit
      const files = (commitDiff?.files || [])
      const changedFiles = files.length
      const added = files.filter((f) => f.status === 'added').length
      const modified = files.filter((f) => f.status === 'modified').length
      const deleted = files.filter((f) => f.status === 'deleted').length
      const diffSamples = files.slice(0, 8).map((f) => {
        const raw = f.unifiedDiff && f.unifiedDiff !== '(binary file changed)'
          ? f.unifiedDiff.split('\n').slice(0, 80).join('\n')
          : (f.unifiedDiff || '(no text diff)')
        return `File: ${f.path}\nStatus: ${f.status}\n${raw}`
      }).join('\n\n---\n\n')
      const commitContext = [
        `Commit: ${c.fullHash || c.hash}`,
        `Message: ${c.message || '(no message)'}`,
        `Author: ${c.author || ''}`,
        `Metrics: files=${changedFiles}, added=${added}, modified=${modified}, deleted=${deleted}`,
        aiAnalysis?.riskLevel ? `AI risk level: ${aiAnalysis.riskLevel}` : '',
        aiAnalysis?.summary ? `AI summary: ${aiAnalysis.summary}` : '',
        savedInsights.length > 0 ? `Saved insights count: ${savedInsights.length}` : '',
        'Changed file details:',
        diffSamples || '(diff unavailable)',
      ].filter(Boolean).join('\n')
      const res = await fetch('http://localhost:8084/api/agent/commit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ commitContext, question, history: newHistory }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setChatHistory([...newHistory, { role: 'assistant', message: data.answer, question }])
        }
      }
    } catch { /* silent */ } finally {
      setChatSending(false)
    }
  }

  const toggleDiffFile = (path) => {
    setExpandedDiffFiles((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const handleSaveInsight = async (question, answer) => {
    if (!selectedCommit) return
    const hashForDiff = selectedCommit.fullHash || selectedCommit.hash
    try {
      const res = await fetch(
        `${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/insights`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ question, answer }),
        }
      )
      if (res.ok) {
        const saved = await res.json()
        setSavedInsights((prev) => [saved, ...prev])
      }
    } catch { /* silent */ }
  }

  const handleLikeInsight = async (insightId) => {
    try {
      const res = await fetch(`${API_BASE}/repos/insights/${insightId}/like`, {
        method: 'POST', headers,
      })
      if (res.ok) {
        const updated = await res.json()
        setSavedInsights((prev) => prev.map((i) => i.id === insightId ? updated : i)
          .sort((a, b) => b.likes - a.likes))
      }
    } catch { /* silent */ }
  }

  const [accessRequestError, setAccessRequestError] = useState('')
  const [accessRequestLoading, setAccessRequestLoading] = useState(false)

  const handleRequestAccess = () => {
    setAccessRequestError('')
    setAccessRequestLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/request`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    })
      .then(async (r) => {
        if (r.ok) {
          setRequestAccessSent(true)
        } else {
          const data = await r.json().catch(() => null)
          if (r.status === 400) {
            setAccessRequestError(data?.message || 'Request already sent or you are already a collaborator.')
          } else {
            setAccessRequestError('Failed to send request. Please try again.')
          }
        }
      })
      .catch(() => setAccessRequestError('Network error. Please try again.'))
      .finally(() => setAccessRequestLoading(false))
  }

  if (loading) return <div className={styles.loading}>Loading...</div>
  if (accessDenied) {
    return (
      <div className={styles.container}>
        <Link to="/repos" className={styles.back}>&larr; Back to Repositories</Link>
        <div className={styles.section}>
          <h2>Access Denied</h2>
          <p>You don&apos;t have access to {username}/{repoName}.</p>
          {requestAccessSent ? (
            <p className={styles.empty}>Request sent. The owner will be notified.</p>
          ) : (
            <>
              <button onClick={handleRequestAccess} disabled={accessRequestLoading}>
                {accessRequestLoading ? 'Sending...' : 'Request Access'}
              </button>
              {accessRequestError && (
                <p className={styles.error} style={{marginTop:'var(--space-3)'}}>{accessRequestError}</p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }
  if (error || !repo) return <div className={styles.error}>{error || 'Repository not found'}</div>

  return (
    <div className={styles.container}>
      <Link to="/repos" className={styles.back}>&larr; Back to Repositories</Link>

      <div className={styles.header}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <h1>{repo.name}</h1>
            <span className={repo.isPublic ? styles.badgePublic : styles.badgePrivate}>
              {repo.isPublic ? 'Public' : 'Private'}
            </span>
          </div>
          <p className={styles.path}>{repo.owner}/{repo.name}</p>
          {repo.description && <p className={styles.repoDesc}>{repo.description}</p>}
        </div>
        <div className={styles.headerActions}>
          <select
            className={styles.branchSelect}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            title="Select branch"
          >
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
            {branches.length === 0 && <option value="master">master</option>}
          </select>
          <button onClick={handleDownload} disabled={downloading} className={styles.downloadBtn}>
            {downloading ? 'Downloading...' : 'Download ZIP'}
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'files' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'branches' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          Branches
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'commits' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('commits')}
        >
          Commits
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'prs' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('prs')}
        >
          Pull Requests
        </button>
        {canManage && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'collaborators' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('collaborators')}
          >
            Collaborators
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        )}
      </div>

      {activeTab === 'files' && (
        <div className={styles.filesSection}>
          <div className={styles.explorerHeader}>
            <span className={styles.explorerTitle}>Files &amp; directories</span>
            <span className={styles.explorerBranch}>Branch: {selectedBranch}</span>
          </div>
          <div className={styles.explorer}>
            <div className={styles.fileTreePanel}>
              <h3 className={styles.panelTitle}>File Explorer</h3>
              <div className={styles.fileTreeContent}>
                {fileTreeLoading ? (
                  <div className={styles.fileLoading}>
                    <span className={styles.spinner} />
                    Loading files...
                  </div>
                ) : (
                  <FileTree
                    nodes={fileTree}
                    onSelectFile={handleSelectFile}
                    selectedPath={selectedFile}
                  />
                )}
              </div>
            </div>
            <div className={styles.contentPanel}>
              {fileLoading ? (
                <div className={styles.fileLoading}>
                  <span className={styles.spinner} />
                  Loading file...
                </div>
              ) : (
                <CodeViewer
                  path={selectedFile || fileContent?.path}
                  content={fileContent?.content}
                  binary={fileContent?.binary}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'branches' && (
        <section className={styles.section}>
          {branches.length === 0 ? (
            <p className={styles.empty}>No branches</p>
          ) : (
            <div className={styles.ghBranchesWrap}>
              <div className={styles.ghBranchesToolbar}>
                <div className={styles.ghBranchesCount}>
                  <span className={styles.ghBranchesCountNum}>{filteredBranchesGh.length}</span>
                  <span className={styles.ghBranchesCountLabel}>branch{filteredBranchesGh.length === 1 ? '' : 'es'}</span>
                </div>
                <label className={styles.ghBranchesSearchLabel}>
                  <span className={styles.visuallyHidden}>Search branches</span>
                  <input
                    type="search"
                    className={styles.ghBranchesSearch}
                    placeholder="Search branches…"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className={styles.ghBranchesTableScroll}>
                <table className={styles.ghBranchesTable}>
                  <thead>
                    <tr>
                      <th className={styles.ghBranchesTh}>Branch</th>
                      <th className={styles.ghBranchesTh}>Updated</th>
                      <th className={styles.ghBranchesThPr}>Pull request</th>
                      <th className={styles.ghBranchesTh}>Latest commit</th>
                      <th className={styles.ghBranchesThIcon} aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBranchesGh.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.ghBranchesEmptyRow}>
                          No branches match your search.
                        </td>
                      </tr>
                    ) : null}
                    {filteredBranchesGh.map((b) => {
                      const shortH =
                        b.tipShortHash ||
                        (b.commitHash && b.commitHash.length > 12 ? b.commitHash.slice(0, 12) : b.commitHash)
                      const isDefault = b.name === defaultBranchName
                      const pr = prBySourceBranch.get(b.name)
                      const prDescShort = truncatePrDesc(pr?.description)
                      const newPrSearch = `?source=${encodeURIComponent(b.name)}&target=${encodeURIComponent(defaultBranchName)}`
                      const openBranch = () => {
                        setSelectedBranch(b.name)
                        setActiveTab('files')
                      }
                      return (
                        <tr
                          key={b.name}
                          className={styles.ghBranchesTr}
                          role="button"
                          tabIndex={0}
                          onClick={openBranch}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openBranch()
                            }
                          }}
                        >
                          <td className={styles.ghBranchesTdBranch}>
                            <div className={styles.ghBranchCell}>
                              <svg className={styles.ghBranchIcon} width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 9.5 3.25zm-5 0a2.25 2.25 0 1 1 3 2.122v6.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 4.5 3.25z" />
                              </svg>
                              <span className={styles.ghBranchName}>{b.name}</span>
                              {isDefault ? (
                                <span className={styles.ghDefaultBadge}>default</span>
                              ) : null}
                              <button
                                type="button"
                                className={styles.ghCopyBranchBtn}
                                title="Copy branch name"
                                aria-label={`Copy ${b.name}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigator.clipboard?.writeText(b.name)
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            </div>
                          </td>
                          <td
                            className={styles.ghBranchesTdMuted}
                            title={formatBranchTipDate(b.tipTimestamp)}
                          >
                            {formatRelativeUpdated(b.tipTimestamp)}
                          </td>
                          <td className={styles.ghBranchesTdPr} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.ghPrCell}>
                              {pr ? (
                                <Link
                                  to={`/repos/${username}/${repoName}/pull-requests/${pr.id}`}
                                  className={styles.ghPrLinkInline}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{pr.id}</span>
                                  {prDescShort ? (
                                    <span className={styles.ghPrDescMuted} title={pr.description || ''}>
                                      {prDescShort}
                                    </span>
                                  ) : null}
                                  <span className={prStatusBadgeClass(styles, pr.status)}>{pr.status}</span>
                                </Link>
                              ) : !isDefault ? (
                                <Link
                                  to={`/repos/${username}/${repoName}/pull-requests/new${newPrSearch}`}
                                  className={styles.ghCreatePrLink}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Create pull request
                                </Link>
                              ) : (
                                <span className={styles.ghPrEmpty}>—</span>
                              )}
                            </div>
                          </td>
                          <td className={styles.ghBranchesTdCommit}>
                            <div className={styles.ghCommitMeta}>
                              {b.tipMessage?.trim() && (
                                <span
                                  className={styles.ghCommitMessage}
                                  title={b.tipMessage.trim()}
                                >
                                  {b.tipMessage.trim()}
                                </span>
                              )}
                              <div className={styles.ghCommitSubRow}>
                                <code className={styles.ghCommitHash} title={b.commitHash || ''}>{shortH || '—'}</code>
                                <span className={styles.ghCommitAuthor}>
                                  {b.tipAuthor?.trim() ? (
                                    <>by <strong className={styles.ghCommitAuthorName}>{b.tipAuthor.trim()}</strong></>
                                  ) : (
                                    <span className={styles.ghCommitUnknown}>Unknown author</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className={styles.ghBranchesTdIcon}>
                            <span className={styles.ghRowChevron} aria-hidden="true">→</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className={styles.ghBranchesFootnote}>Click a row to open that branch in Files.</p>
            </div>
          )}
        </section>
      )}

      {activeTab === 'prs' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Pull Requests</h3>
            <Link to={`/repos/${username}/${repoName}/pull-requests/new`} className={styles.createPrBtn}>
              + New Pull Request
            </Link>
          </div>
          {pullRequests.length === 0 ? (
            <div className={styles.emptyPrs}>
              <p>No pull requests yet.</p>
              <p>
                <Link to={`/repos/${username}/${repoName}/pull-requests/new`} className={styles.emptyPrLink}>
                  Create the first pull request
                </Link>
                {' '}to propose merging changes between branches.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {pullRequests.map((pr) => (
                <li key={pr.id} className={styles.commit}>
                  <Link to={`/repos/${username}/${repoName}/pull-requests/${pr.id}`} className={styles.prLink}>
                    <div className={styles.commitInfo}>
                      <div className={styles.prRow}>
                        <strong>{pr.id}</strong>
                        {pr.description && <span className={styles.prDesc}>{pr.description}</span>}
                        <span className={pr.status === 'APPROVED' ? styles.statusApproved : pr.status === 'REJECTED' ? styles.statusRejected : pr.status === 'MERGED' ? styles.statusMerged : pr.status === 'REVIEWING' ? styles.statusReviewing : styles.statusOpen}>
                          {pr.status}
                        </span>
                        {pr.hasConflicts && <span className={styles.conflictBadge}>Conflicts</span>}
                        {pr.riskLevel && (
                          <span className={pr.riskLevel === 'HIGH' ? styles.riskHigh : pr.riskLevel === 'MEDIUM' ? styles.riskMedium : styles.riskLow}>
                            {pr.riskLevel}
                          </span>
                        )}
                      </div>
                      <div className={styles.prMeta}>
                        <span className={styles.branchChip}>{pr.sourceBranch}</span>
                        <span>→</span>
                        <span className={styles.branchChip}>{pr.targetBranch}</span>
                        <span className={styles.prAuthor}>by {pr.author}</span>
                        {pr.summaryFilesChanged != null && (
                          <span className={styles.prStats}>
                            {pr.summaryFilesChanged} files · <span style={{color:'#22c55e'}}>+{pr.summaryLinesAdded ?? 0}</span> <span style={{color:'#ef4444'}}>-{pr.summaryLinesRemoved ?? 0}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'commits' && (
        <section className={styles.section}>
          {graphCommits.length === 0 ? (
            <p className={styles.empty}>No commits</p>
          ) : (
            <div className={styles.graphContainer}>
              <div className={styles.graphHeader}>
                <span className={styles.graphHeaderCount}>{graphCommits.length} commits</span>
              </div>
              {graphCommits.map((c) => {
                const ROW_H = 56
                const COL_W = 26
                const R = 5.5
                const graphW = Math.max(c.totalLanes * COL_W + COL_W, 56)
                const cx = c.col * COL_W + COL_W / 2
                const cy = ROW_H / 2

                // Pass-through vertical lines for other active lanes
                const passLines = []
                if (c.activeLanesBefore) {
                  c.activeLanesBefore.forEach((hash, lane) => {
                    if (!hash || lane === c.col) return
                    const lx = lane * COL_W + COL_W / 2
                    const passColor = c.laneColorsBefore?.[lane] || BRANCH_COLORS[lane % BRANCH_COLORS.length]
                    passLines.push(
                      <line key={`pass-${lane}`} x1={lx} y1={0} x2={lx} y2={ROW_H}
                        stroke={passColor} strokeWidth="2" />
                    )
                  })
                }

                // Line UP: straight vertical from row top to circle
                const lineUp = c.hasLineAbove ? (
                  <line x1={cx} y1={0} x2={cx} y2={cy - R - 1}
                    stroke={c.color} strokeWidth="2" />
                ) : null

                // Line DOWN: from circle to row bottom, bezier for cross-lane
                let lineDown = null
                if (c.parentCol !== null) {
                  const px = c.parentCol * COL_W + COL_W / 2
                  if (px === cx) {
                    lineDown = (
                      <line x1={cx} y1={cy + R + 1} x2={cx} y2={ROW_H}
                        stroke={c.color} strokeWidth="2" />
                    )
                  } else {
                    const cpY = cy + R + 1 + (ROW_H - cy - R - 1) * 0.5
                    lineDown = (
                      <path
                        d={`M ${cx} ${cy + R + 1} C ${cx} ${cpY} ${px} ${cpY} ${px} ${ROW_H}`}
                        stroke={c.color} strokeWidth="2.5" fill="none"
                      />
                    )
                  }
                }

                // MERGE line: from circle to secondary parent column (bezier)
                // Always use the current commit's color — it was assigned to the new lane
                let mergeLine = null
                if (c.secondParentCol !== null) {
                  const spx = c.secondParentCol * COL_W + COL_W / 2
                  const cpY = cy + R + 1 + (ROW_H - cy - R - 1) * 0.5
                  mergeLine = (
                    <path
                      d={`M ${cx} ${cy + R + 1} C ${cx} ${cpY} ${spx} ${cpY} ${spx} ${ROW_H}`}
                      stroke={c.color} strokeWidth="2.5" fill="none"
                    />
                  )
                }

                return (
                  <div
                    key={c.fullHash}
                    className={styles.graphRow}
                    onClick={() => handleCommitClick(c)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitClick(c)}
                    role="button"
                    tabIndex={0}
                    style={{ minHeight: ROW_H }}
                  >
                    <svg className={styles.graphSvg} width={graphW} height={ROW_H} style={{ minWidth: graphW }}>
                      {passLines}
                      {lineDown}
                      {mergeLine}
                      {lineUp}
                      {c.isMerge && (
                        <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.4" />
                      )}
                      <circle cx={cx} cy={cy} r={R} fill={c.color}>
                        <title>
                          {c.branches?.length > 0
                            ? `Branch: ${c.branches.join(', ')}`
                            : `Color: ${c.color}`}
                        </title>
                      </circle>
                      {!c.parentHash && (
                        <circle cx={cx} cy={cy} r={R + 3} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.5" />
                      )}
                    </svg>
                    <div className={styles.graphInfo}>
                      <div className={styles.graphMsgRow}>
                        <span className={styles.message} title={c.message || undefined}>
                          {c.message || '(no message)'}
                        </span>
                        {c.aiGenerated && <span className={styles.vegaBadge} title="VEGA AI generated">VEGA</span>}
                        {c.isMerge && <span className={styles.mergeBadge}>Merge PR</span>}
                        {c.branches && c.branches.map((b) => (
                          <span
                            key={b}
                            className={styles.graphBranchTag}
                            style={{ borderColor: c.color, color: c.color }}
                            title={b.length > 14 ? b : undefined}
                          >
                            {b.length > 14 ? `${b.slice(0, 12)}…` : b}
                          </span>
                        ))}
                      </div>
                      <div className={styles.graphMetaRow}>
                        <code className={styles.graphHash}>{c.hash}</code>
                        <span className={styles.graphAuthor}>{c.author}</span>
                        <span
                          className={styles.graphDate}
                          title={formatDate(c.timestamp)}
                        >
                          {formatRelativeUpdated(c.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {selectedCommit && (
            <div className={styles.diffModal} onClick={() => setSelectedCommit(null)}>
              <div className={styles.diffModalContent} onClick={(e) => e.stopPropagation()}>

                {/* ── Header ─────────────────────────────────────────── */}
                <div className={styles.cmHeader}>
                  <div className={styles.cmHeaderLeft}>
                    <div className={styles.cmHashRow}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)',flexShrink:0}}>
                        <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z"/>
                      </svg>
                      <code className={styles.cmHash}>{selectedCommit.hash}</code>
                      {selectedCommit.aiGenerated && <span className={styles.cmAiBadge}>AI generated</span>}
                      {selectedCommit.isMerge && <span className={styles.cmMergeBadge}>Merge commit</span>}
                    </div>
                    <p className={styles.cmMessage}>{selectedCommit.message || '(no message)'}</p>
                    <div className={styles.cmMeta}>
                      <span className={styles.cmAuthor}>{selectedCommit.author}</span>
                      <span className={styles.cmMetaDot}>·</span>
                      <span className={styles.cmDate}>{selectedCommit.timestamp ? new Date(selectedCommit.timestamp).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}) : ''}</span>
                    </div>
                  </div>
                  <button type="button" className={styles.diffModalClose} onClick={() => setSelectedCommit(null)} aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
                  </button>
                </div>

                {/* ── Two-panel body ─────────────────────────────────── */}
                <div className={styles.commitPanelBody}>

                  {/* LEFT: Diff ─────────────────────────────────────── */}
                  <div className={styles.commitDiffSide}>
                    <div className={styles.diffPanelHeader}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)'}}>
                        <path d="M2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75C1 1.784 1.784 1 2.75 1zm0 1.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H2.75z"/>
                        <path d="M8 4a.75.75 0 01.75.75V6.5h1.75a.75.75 0 010 1.5H8.75v1.75a.75.75 0 01-1.5 0V8H5.5a.75.75 0 010-1.5h1.75V4.75A.75.75 0 018 4z"/>
                      </svg>
                      <span>Changed files</span>
                      {commitDiff?.files && <span className={styles.diffFileCount}>{commitDiff.files.length}</span>}
                    </div>

                    {diffLoading ? (
                      <div className={styles.diffLoadingState}>
                        <span className={styles.spinner} />
                        <span>Loading diff...</span>
                      </div>
                    ) : commitDiff?.files?.length > 0 ? (
                      <div className={styles.diffBody}>
                        {commitDiff.files.map((f) => (
                          <div key={f.path} className={styles.diffFile}>
                            <div
                              className={styles.diffFileHeader}
                              onClick={() => toggleDiffFile(f.path)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  toggleDiffFile(f.path)
                                }
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)',flexShrink:0}}>
                                <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5H3.75zm6.75.896V4.25c0 .138.112.25.25.25h1.854L10.5 2.396z"/>
                              </svg>
                              <span className={styles.diffPath}>{f.path}</span>
                              <span className={`${styles.diffStatus} ${f.status === 'added' ? styles.diffAdded : f.status === 'deleted' ? styles.diffDeleted : styles.diffModified}`}>
                                {f.status}
                              </span>
                              <span className={styles.diffToggleHint}>{expandedDiffFiles[f.path] ? 'Hide content' : 'Show content'}</span>
                            </div>
                            {expandedDiffFiles[f.path] && f.unifiedDiff && f.unifiedDiff !== '(binary file changed)' ? (
                              <div className={styles.diffContent}>
                                {f.unifiedDiff.split('\n').map((line, i) => (
                                  <div key={i} className={
                                    line.startsWith('---') || line.startsWith('+++') ? styles.diffFileInfo :
                                    line.startsWith('@@') ? styles.diffHunk :
                                    line.startsWith('+') ? styles.diffAdd :
                                    line.startsWith('-') ? styles.diffDel :
                                    styles.diffContext
                                  }>{line || ' '}</div>
                                ))}
                              </div>
                            ) : expandedDiffFiles[f.path] && f.unifiedDiff === '(binary file changed)' ? (
                              <div className={styles.diffBinary}>Binary file — diff not available</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : commitDiff?.files?.length === 0 ? (
                      <div className={styles.diffEmptyState}>
                        <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)',opacity:0.4}}>
                          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75z"/>
                        </svg>
                        <p>No file changes in this commit</p>
                      </div>
                    ) : (
                      <div className={styles.diffEmptyState}>
                        <p>Diff not available for this commit</p>
                      </div>
                    )}
                  </div>

                  {/* RIGHT: AI Panel ─────────────────────────────────── */}
                  <div className={styles.commitAiSide}>

                    {/* Analysis card */}
                    <div className={styles.aiCard}>
                      <div className={styles.aiCardHeader}>
                        <div className={styles.aiCardTitle}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--accent)'}}>
                            <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75Zm7.251 10.324l.004-5.073-.002-2.253A2.25 2.25 0 005.003 2.5H1.5v9h3.757a3.75 3.75 0 012 .584ZM8.755 4.75l-.004 7.322a3.752 3.752 0 012-.572H14.5v-9h-3.495a2.25 2.25 0 00-2.25 2.25Z"/>
                          </svg>
                          <span>Vega AI Analysis</span>
                        </div>
                        {aiAnalysis && (
                          <span className={`${styles.riskPill} ${styles['risk' + aiAnalysis.riskLevel]}`}>
                            {aiAnalysis.riskLevel === 'LOW' && '● '}
                            {aiAnalysis.riskLevel === 'MEDIUM' && '● '}
                            {aiAnalysis.riskLevel === 'HIGH' && '● '}
                            {aiAnalysis.riskLevel} risk
                          </span>
                        )}
                      </div>

                      {aiLoading ? (
                        <div className={styles.aiSkeletonWrap}>
                          <div className={styles.aiSkeleton} style={{width:'92%'}} />
                          <div className={styles.aiSkeleton} style={{width:'78%'}} />
                          <div className={styles.aiSkeleton} style={{width:'85%',marginTop:'8px'}} />
                          <div className={styles.aiSkeleton} style={{width:'60%'}} />
                        </div>
                      ) : aiAnalysis ? (
                        <div className={styles.aiCardBody}>
                          {aiAnalysis.summary && (
                            <div className={styles.aiSection}>
                              <div className={styles.aiSectionLabel}>What it does</div>
                              <div className={styles.aiSectionText}>{aiAnalysis.summary}</div>
                            </div>
                          )}
                          {aiAnalysis.changes && (
                            <div className={styles.aiSection}>
                              <div className={styles.aiSectionLabel}>What changed</div>
                              <div className={styles.aiSectionText} style={{whiteSpace:'pre-line'}}>{aiAnalysis.changes}</div>
                            </div>
                          )}
                          {aiAnalysis.risks && (
                            <div className={styles.aiSection}>
                              <div className={styles.aiSectionLabel}>Risks &amp; gaps</div>
                              <div className={styles.aiSectionText} style={{whiteSpace:'pre-line'}}>{aiAnalysis.risks}</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.aiUnavailable}>
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)',opacity:.5}}>
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zm9.78-2.22a.75.75 0 00-1.06-1.06L7.25 6.69 5.78 5.22a.75.75 0 00-1.06 1.06l1.47 1.47-1.47 1.47a.75.75 0 101.06 1.06L7.25 9.31l1.97 1.97a.75.75 0 101.06-1.06L8.31 8.25l1.97-1.97z"/>
                          </svg>
                          <p>AI service unavailable</p>
                          <span>Start the agent service to enable analysis</span>
                        </div>
                      )}
                    </div>

                    {/* Saved insights */}
                    {savedInsights.length > 0 && (
                      <div className={styles.insightsCard}>
                        <div className={styles.aiCardHeader}>
                          <div className={styles.aiCardTitle}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--warning)'}}>
                              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                            </svg>
                            <span>Top Saved Answers</span>
                          </div>
                          <span className={styles.insightCount}>{savedInsights.length}</span>
                        </div>
                        <div className={styles.insightsList}>
                          {savedInsights.map((ins) => (
                            <div key={ins.id} className={styles.insightItem}>
                              <div className={styles.insightQuestion}>{ins.question}</div>
                              <div className={styles.insightAnswer}>{ins.answer}</div>
                              <div className={styles.insightFooter}>
                                <span className={styles.insightBy}>{ins.askedBy}</span>
                                <button className={styles.likeBtn} onClick={() => handleLikeInsight(ins.id)}>
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
                                  {ins.likes}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chat */}
                    <div className={styles.chatCard}>
                      <div className={styles.aiCardHeader}>
                        <div className={styles.aiCardTitle}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-secondary)'}}>
                            <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25Zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.749.749 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75z"/>
                          </svg>
                          <span>Ask the AI</span>
                        </div>
                      </div>

                      {/* Suggestion chips */}
                      <div className={styles.chipRow}>
                        {['Why was this done?', 'Any missing tests?', 'Is this safe?'].map((q) => (
                          <button key={q} className={styles.chip} onClick={() => setChatInput(q)}>{q}</button>
                        ))}
                      </div>

                      {/* Message thread */}
                      <div className={styles.chatThread}>
                        {chatHistory.length === 0 && !chatSending && (
                          <div className={styles.chatEmpty}>
                            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style={{color:'var(--text-tertiary)',opacity:.35}}>
                              <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25Zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.749.749 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75z"/>
                            </svg>
                            <p>Ask anything about this commit</p>
                          </div>
                        )}
                        {chatHistory.map((turn, i) => (
                          <div key={i} className={turn.role === 'user' ? styles.msgUser : styles.msgAssistant}>
                            {turn.role === 'assistant' && (
                              <div className={styles.msgAvatar}>AI</div>
                            )}
                            <div className={styles.msgContent}>
                              <div className={styles.msgBubble}>{turn.message}</div>
                              {turn.role === 'assistant' && turn.question && (
                                <button className={styles.saveBtn} onClick={() => handleSaveInsight(turn.question, turn.message)}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.53 4.75A.75.75 0 015.28 4h5.44a.75.75 0 010 1.5H8.75v5.19l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l1.72 1.72V5.5H5.28a.75.75 0 01-.75-.75z"/></svg>
                                  Save answer
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {chatSending && (
                          <div className={styles.msgAssistant}>
                            <div className={styles.msgAvatar}>AI</div>
                            <div className={styles.msgContent}>
                              <div className={`${styles.msgBubble} ${styles.msgTyping}`}>
                                <span /><span /><span />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input */}
                      <div className={styles.chatBar}>
                        <input
                          className={styles.chatBarInput}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                          placeholder="Ask about this commit..."
                          disabled={chatSending}
                          autoComplete="off"
                        />
                        <button
                          className={styles.chatBarSend}
                          onClick={handleSendChat}
                          disabled={chatSending || !chatInput.trim()}
                          aria-label="Send"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8.75 1.75a.75.75 0 00-1.5 0v5.69L5.03 5.22a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l3.5-3.5a.75.75 0 00-1.06-1.06L8.75 7.44V1.75z" transform="rotate(180,8,8)"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                  </div>{/* end commitAiSide */}
                </div>{/* end commitPanelBody */}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'collaborators' && canManage && (
        <section className={styles.section}>
          <h3>Collaborators</h3>

          {/* Invite */}
          <div className={styles.settingsBlock}>
            <div className={styles.settingRow}>
              <div style={{flex:1}}>
                <strong>Invite a collaborator</strong>
                <p className={styles.settingHint}>
                  Send an invite by username. The user will see it in Collaborator Requests and can accept to join.
                </p>
                {collaboratorError && <p className={styles.collabAlert} role="alert">{collaboratorError}</p>}
                {inviteSent && <p className={styles.collabSuccess} role="status">Invite sent successfully.</p>}
                <form onSubmit={handleSendInvite} className={styles.collabForm}>
                  <input
                    type="text"
                    className={styles.settingInput}
                    placeholder="Username (e.g. developer1)"
                    value={newCollaborator}
                    onChange={(e) => setNewCollaborator(e.target.value)}
                  />
                  <select
                    className={styles.settingInput}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    style={{width: 'auto', marginLeft: 8}}
                  >
                    <option value="reader">Reader</option>
                    <option value="developer">Developer</option>
                    <option value="reviewer">Reviewer</option>
                    {isOwner && <option value="maintainer">Maintainer</option>}
                  </select>
                  <button type="submit" disabled={addCollaboratorLoading} className={styles.btnSuccess}>
                    {addCollaboratorLoading ? 'Sending...' : 'Send invite'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Pending Invites */}
          <div className={styles.settingsBlock} style={{marginTop:'var(--space-5)'}}>
            <strong>Pending invites</strong>
            <p className={styles.settingHint}>Users you&apos;ve invited who haven&apos;t responded yet.</p>
            {pendingInvites.length === 0 ? (
              <p className={styles.collabEmpty}>No pending invites.</p>
            ) : (
              <div className={styles.collabList}>
                {pendingInvites.map((r) => (
                  <div key={r.id} className={styles.collabItem}>
                    <span className={styles.collabName}>{r.requesterUsername}</span>
                    <span className={styles.collabBadgeWaiting}>Waiting</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Access Requests */}
          <div className={styles.settingsBlock} style={{marginTop:'var(--space-5)'}}>
            <strong>Access requests</strong>
            <p className={styles.settingHint}>Users who requested access to this repository.</p>
            {pendingRequests.length === 0 ? (
              <p className={styles.collabEmpty}>No pending requests.</p>
            ) : (
              <div className={styles.collabList}>
                {pendingRequests.map((r) => (
                  <div key={r.id} className={styles.collabItem}>
                    <span className={styles.collabName}>{r.requesterUsername}</span>
                    <div className={styles.collabItemActions}>
                      <button
                        type="button"
                        className={styles.btnSuccessSmall}
                        onClick={() => {
                          fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/requests/${r.id}/approve`, {
                            method: 'POST',
                            headers,
                          }).then((res) => {
                            if (res.ok) {
                              setPendingRequests((prev) => prev.filter((x) => x.id !== r.id))
                              fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators`, { headers })
                                .then((res2) => res2.ok ? res2.json() : [])
                                .then(setCollaborators)
                                .catch(() => {})
                            }
                          }).catch(() => {})
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.btnDangerSmall}
                        onClick={() => {
                          fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/requests/${r.id}/reject`, {
                            method: 'POST',
                            headers,
                          }).then((res) => {
                            if (res.ok) setPendingRequests((prev) => prev.filter((x) => x.id !== r.id))
                          }).catch(() => {})
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Collaborators */}
          <div className={styles.settingsBlock} style={{marginTop:'var(--space-5)'}}>
            <strong>Active collaborators</strong>
            <p className={styles.settingHint}>Users with access to this repository.</p>
            {collaborators.length === 0 ? (
              <p className={styles.collabEmpty}>No collaborators yet. Accepted invites will appear here.</p>
            ) : (
              <div className={styles.collabList}>
                {collaborators.map((c) => (
                  <div key={c.id} className={styles.collabItem}>
                    <span className={styles.collabName}>{c.username}</span>
                    <span className={styles.collabBadgePr} style={{
                      background: {
                        maintainer: '#f59e0b',
                        reviewer:   '#6366f1',
                        developer:  '#22c55e',
                        reader:     '#6b7280',
                      }[c.role] ?? '#22c55e',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {{
                        maintainer: 'Maintainer',
                        reviewer:   'Reviewer',
                        developer:  'Developer',
                        reader:     'Reader',
                      }[c.role] ?? 'Developer'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'settings' && canManage && (
        <section className={styles.section}>
          <h3>Repository Settings</h3>
          <div className={styles.settingsBlock}>
            <div className={styles.settingRow}>
              <div>
                <strong>Visibility</strong>
                <p className={styles.settingHint}>
                  {repo.isPublic
                    ? 'Public — Anyone can view this repository. Non-collaborators can clone and create branches/PRs but cannot push to main/master.'
                    : 'Private — Only you and collaborators can access this repository.'}
                </p>
              </div>
              <button
                type="button"
                className={repo.isPublic ? styles.btnDanger : styles.btnSuccess}
                onClick={async () => {
                  const newVal = !repo.isPublic
                  try {
                    const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/settings`, {
                      method: 'POST',
                      headers: { ...headers, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ isPublic: newVal }),
                    })
                    if (r.ok) {
                      setRepo({ ...repo, isPublic: newVal })
                    }
                  } catch {}
                }}
              >
                {repo.isPublic ? 'Make Private' : 'Make Public'}
              </button>
            </div>
            <div className={styles.settingRow}>
              <div style={{flex:1}}>
                <strong>Description</strong>
                <input
                  type="text"
                  className={styles.settingInput}
                  placeholder="Add a short description..."
                  defaultValue={repo.description || ''}
                  onBlur={async (e) => {
                    const desc = e.target.value.trim()
                    try {
                      await fetch(`${API_BASE}/repos/${username}/${repoName}/settings`, {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isPublic: repo.isPublic, description: desc }),
                      })
                      setRepo({ ...repo, description: desc })
                    } catch {}
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
