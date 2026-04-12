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

  const maxLanes = Math.max(lanes.length, 1)
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

  useEffect(() => {
    if (!isOwner || !username || !repoName) return
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
  }, [isOwner, username, repoName, headers])

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
      body: JSON.stringify({ username: toAdd }),
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
    try {
      const hashForDiff = c.fullHash || c.hash
      const res = await fetch(`${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/diff`, { headers })
      if (res.ok) {
        const data = await res.json()
        setCommitDiff(data)
      }
    } catch {
      setCommitDiff(null)
    } finally {
      setDiffLoading(false)
    }
  }

  const handleRequestAccess = () => {
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/request`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    })
      .then((r) => r.ok ? setRequestAccessSent(true) : Promise.reject())
      .catch(() => setError('Failed to send request'))
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
            <button onClick={handleRequestAccess}>Request Access</button>
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
        {isOwner && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'collaborators' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('collaborators')}
          >
            Collaborators
          </button>
        )}
        {isOwner && (
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
                            <div
                              className={styles.ghCommitMeta}
                              title={
                                [b.tipMessage?.trim(), b.tipAuthor?.trim() ? `by ${b.tipAuthor.trim()}` : '']
                                  .filter(Boolean)
                                  .join(' · ') || undefined
                              }
                            >
                              <code className={styles.ghCommitHash} title={b.commitHash || ''}>{shortH || '—'}</code>
                              <span className={styles.ghCommitAuthor}>
                                {b.tipAuthor?.trim() ? (
                                  <>
                                    Last commit by <strong className={styles.ghCommitAuthorName}>{b.tipAuthor.trim()}</strong>
                                  </>
                                ) : (
                                  <span className={styles.ghCommitUnknown}>Unknown author</span>
                                )}
                              </span>
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
                    const passColor = c.laneColorsBefore?.[lane] || 'var(--border-default)'
                    passLines.push(
                      <line key={`pass-${lane}`} x1={lx} y1={0} x2={lx} y2={ROW_H}
                        stroke={passColor} strokeWidth="2" opacity="0.4" />
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
                let mergeLine = null
                if (c.secondParentCol !== null) {
                  const spx = c.secondParentCol * COL_W + COL_W / 2
                  const cpY = cy + R + 1 + (ROW_H - cy - R - 1) * 0.5
                  const mergeColor = c.laneColorsBefore?.[c.secondParentCol] ||
                    BRANCH_COLORS[c.secondParentCol % BRANCH_COLORS.length]
                  mergeLine = (
                    <path
                      d={`M ${cx} ${cy + R + 1} C ${cx} ${cpY} ${spx} ${cpY} ${spx} ${ROW_H}`}
                      stroke={mergeColor} strokeWidth="2.5" fill="none"
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
                    style={{ height: ROW_H }}
                  >
                    <svg className={styles.graphSvg} width={graphW} height={ROW_H} style={{ minWidth: graphW }}>
                      {passLines}
                      {lineDown}
                      {mergeLine}
                      {lineUp}
                      {c.isMerge && (
                        <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.4" />
                      )}
                      <circle cx={cx} cy={cy} r={R} fill={c.color} />
                      {!c.parentHash && (
                        <circle cx={cx} cy={cy} r={R + 3} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.5" />
                      )}
                    </svg>
                    <div className={styles.graphInfo}>
                      <div className={styles.graphMsgRow}>
                        <span className={styles.message}>{c.message || '(no message)'}</span>
                        {c.aiGenerated && <span className={styles.vegaBadge} title="VEGA AI generated">VEGA</span>}
                        {c.isMerge && <span className={styles.mergeBadge}>Merge PR</span>}
                        {c.branches && c.branches.map((b) => (
                          <span key={b} className={styles.graphBranchTag} style={{ borderColor: c.color, color: c.color }}>
                            {b}
                          </span>
                        ))}
                      </div>
                      <div className={styles.graphMetaRow}>
                        <code className={styles.graphHash}>{c.hash}</code>
                        <span className={styles.graphAuthor}>{c.author}</span>
                        <span className={styles.graphDate}>{formatDate(c.timestamp)}</span>
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
                <div className={styles.diffModalHeader}>
                  <h3>Commit {selectedCommit.hash} — {selectedCommit.message || '(no message)'}</h3>
                  <button type="button" className={styles.diffModalClose} onClick={() => setSelectedCommit(null)}>×</button>
                </div>
                {diffLoading ? (
                  <p className={styles.loading}>Loading diff...</p>
                ) : commitDiff ? (
                  <div className={styles.diffBody}>
                    {commitDiff.files && commitDiff.files.length === 0 ? (
                      <p className={styles.empty}>(No file changes — initial commit)</p>
                    ) : (
                      commitDiff.files?.map((f) => (
                        <div key={f.path} className={styles.diffFile}>
                          <div className={styles.diffFileHeader}>
                            <span className={styles.diffPath}>{f.path}</span>
                            <span className={`${styles.diffStatus} ${f.status === 'added' ? styles.diffAdded : f.status === 'deleted' ? styles.diffDeleted : styles.diffModified}`}>{f.status}</span>
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
                ) : (
                  <p className={styles.empty}>Diff not available for this commit</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'collaborators' && isOwner && (
        <section className={styles.section}>
          <h3>Collaborators</h3>

          {/* Invite */}
          <div className={styles.settingsBlock}>
            <div className={styles.settingRow}>
              <div style={{flex:1}}>
                <strong>Invite a collaborator</strong>
                <p className={styles.settingHint}>
                  Send an invite by username. The user will see it in Collaborator Requests and can accept to become a collaborator.
                </p>
                {collaboratorError && <p className={styles.collabAlert} role="alert">{collaboratorError}</p>}
                {inviteSent && <p className={styles.collabSuccess} role="status">Invite sent successfully.</p>}
                <form onSubmit={handleSendInvite} className={styles.collabForm}>
                  {/* Sample username aligns with vega_user_service SeedUsers.java (e.g. developer1) */}
                  <input
                    type="text"
                    className={styles.settingInput}
                    placeholder="Username (e.g. developer1)"
                    value={newCollaborator}
                    onChange={(e) => setNewCollaborator(e.target.value)}
                  />
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
                    <Link to="/collaborator-requests" className={styles.collabAction}>Review</Link>
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
                      background: c.role === 'reviewer' ? '#6366f1' : '#22c55e',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {c.role === 'reviewer' ? 'Reviewer' : 'Developer'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'settings' && isOwner && (
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
