import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FileTree from '../components/FileTree'
import CodeViewer from '../components/CodeViewer'
import styles from './RepoDetailPage.module.css'

const API_BASE = '/api'

const BRANCH_COLORS = [
  'var(--accent)',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
]

function buildGraphLayout(commits) {
  if (!commits || commits.length === 0) return []

  const lanes = []
  const laneForHash = new Map()
  const branchColorMap = new Map()
  const lastColorForLane = new Map()
  let colorIdx = 0

  commits.forEach((c) => {
    if (c.branches) {
      c.branches.forEach((b) => {
        if (!branchColorMap.has(b)) {
          branchColorMap.set(b, BRANCH_COLORS[colorIdx % BRANCH_COLORS.length])
          colorIdx++
        }
      })
    }
  })

  const result = commits.map((c) => {
    let col = laneForHash.get(c.fullHash)
    if (col === undefined) {
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }
    lanes[col] = c.parentHash || null

    let parentCol = null
    if (c.parentHash) {
      const existingLane = laneForHash.get(c.parentHash)
      if (existingLane !== undefined) {
        parentCol = existingLane
      } else {
        laneForHash.set(c.parentHash, col)
        parentCol = col
      }
    }

    let color = 'var(--accent)'
    if (c.branches && c.branches.length > 0) {
      color = branchColorMap.get(c.branches[0]) || 'var(--accent)'
    } else if (lastColorForLane.has(col)) {
      color = lastColorForLane.get(col)
    }
    lastColorForLane.set(col, color)

    return { ...c, col, parentCol, color, totalLanes: lanes.length }
  })

  const maxLanes = lanes.length || 1
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
          <p className={styles.branchHelp}>Select a branch above to view files.</p>
          {branches.length === 0 ? (
            <p className={styles.empty}>No branches</p>
          ) : (
            <ul className={styles.list}>
              {branches.map((b) => (
                <li key={b.name} className={styles.branch}>
                  <span className={styles.branchName}>{b.name}</span>
                  {b.commitHash ? (
                    <>
                      <code className={styles.hash}>{b.commitHash}</code>
                      <span className={styles.branchOk} title="Branch points to valid commit">✓</span>
                    </>
                  ) : (
                    <span className={styles.branchWarn}>No commit</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'prs' && (
        <section className={styles.section}>
          <h3>Pull Requests (from HDFS)</h3>
          {pullRequests.length === 0 ? (
            <p className={styles.empty}>No pull requests yet.</p>
          ) : (
            <ul className={styles.list}>
              {pullRequests.map((pr) => (
                <li key={pr.id} className={styles.commit}>
                  <Link to={`/repos/${username}/${repoName}/pull-requests/${pr.id}`} className={styles.prLink}>
                    <div className={styles.commitInfo}>
                      <strong>{pr.id}</strong> {pr.sourceBranch} &rarr; {pr.targetBranch} · <span className={pr.status === 'APPROVED' ? styles.statusApproved : pr.status === 'REJECTED' ? styles.statusRejected : pr.status === 'MERGED' ? styles.statusMerged : ''}>{pr.status}</span> · {pr.author}
                      {pr.diffSummary && <p className={styles.meta}>{pr.diffSummary}</p>}
                      {pr.hasConflicts && <span className={styles.conflictBadge}>Conflicts</span>}
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
              {graphCommits.map((c, idx) => {
                const ROW_H = 60
                const COL_W = 24
                const graphW = (c.totalLanes + 1) * COL_W
                const cx = c.col * COL_W + COL_W / 2
                const cy = ROW_H / 2

                const parentIdx = c.parentHash ? graphCommits.findIndex(p => p.fullHash === c.parentHash) : -1
                const hasChildAbove = idx > 0 && graphCommits[idx - 1].parentHash === c.fullHash
                const hasParentBelow = parentIdx >= 0 && parentIdx > idx

                let lineUp = null
                if (hasChildAbove) {
                  lineUp = (
                    <line x1={cx} y1={0} x2={cx} y2={cy - 6} stroke={c.color} strokeWidth="2" opacity="0.7" />
                  )
                }

                let lineDown = null
                if (hasParentBelow) {
                  const parent = graphCommits[parentIdx]
                  const px = parent.col * COL_W + COL_W / 2
                  if (c.col === parent.col) {
                    lineDown = (
                      <line x1={cx} y1={cy + 6} x2={cx} y2={ROW_H} stroke={c.color} strokeWidth="2" opacity="0.7" />
                    )
                  } else {
                    lineDown = (
                      <path
                        d={`M ${cx} ${cy + 6} L ${cx} ${ROW_H} L ${px} ${ROW_H}`}
                        stroke={c.color} strokeWidth="2" fill="none" opacity="0.7"
                      />
                    )
                  }
                }

                const verticalLines = []
                for (let lane = 0; lane < c.totalLanes; lane++) {
                  if (lane === c.col) continue
                  const hasActive = graphCommits.some((gc, gi) => {
                    if (gi <= idx) return false
                    return gc.col === lane && gi > idx
                  }) && graphCommits.some((gc, gi) => {
                    if (gi >= idx) return false
                    return gc.col === lane
                  })
                  if (hasActive) {
                    const lx = lane * COL_W + COL_W / 2
                    const passColor = graphCommits.find((gc, gi) => gi < idx && gc.col === lane)?.color || 'var(--border-default)'
                    verticalLines.push(
                      <line key={`pass-${lane}`} x1={lx} y1={0} x2={lx} y2={ROW_H}
                        stroke={passColor} strokeWidth="2" opacity="0.25" strokeDasharray="3,3" />
                    )
                  }
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
                    <svg className={styles.graphSvg} width={graphW} height={ROW_H} style={{minWidth: graphW}}>
                      {verticalLines}
                      {lineUp}
                      {lineDown}
                      <circle cx={cx} cy={cy} r={5} fill={c.color} />
                      {!c.parentHash && (
                        <circle cx={cx} cy={cy} r={8} fill="none" stroke={c.color} strokeWidth="1.5" opacity="0.5" />
                      )}
                    </svg>
                    <div className={styles.graphInfo}>
                      <div className={styles.graphMsgRow}>
                        <span className={styles.message}>{c.message || '(no message)'}</span>
                        {c.aiGenerated && <span className={styles.vegaBadge} title="VEGA AI generated">VEGA</span>}
                        {c.branches && c.branches.map((b) => (
                          <span key={b} className={styles.graphBranchTag} style={{borderColor: c.color, color: c.color}}>
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
                  <input
                    type="text"
                    className={styles.settingInput}
                    placeholder="Username (e.g. versionengineai)"
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
                    {c.canCreatePr && <span className={styles.collabBadgePr}>Can create PR</span>}
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
