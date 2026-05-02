import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FileTree from '../components/FileTree'
import CodeViewer from '../components/CodeViewer'
import CollaboratorsTab from '../components/repo/CollaboratorsTab'
import SettingsTab from '../components/repo/SettingsTab'
import CommitsTab from '../components/repo/CommitsTab'
import InsightsTab from '../components/repo/InsightsTab'
import ReadmeViewer from '../components/ReadmeViewer'
import { API_BASE } from '../config/api'
import { timeAgo, formatDateTime } from '../utils/formatDate'
import { buildGraphLayout } from '../utils/commitGraph'
import styles from './RepoDetailPage.module.css'

const formatRelativeUpdated = (ts) => ts == null || ts === 0 ? '—' : timeAgo(ts) ?? '—'

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

export default function RepoDetailPage() {
  const { username, repoName } = useParams()
  const { user, token } = useAuth()
  const isOwner = user?.username === username
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])
  const [repo, setRepo] = useState(null)
  const [branches, setBranches] = useState([])
  const [graphCommits, setGraphCommits] = useState([])
  const [fileTree, setFileTree] = useState([])
  const [fileTreeLoading, setFileTreeLoading] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState('master')
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [activeTab, setActiveTab] = useState('files')
  const [collaborators, setCollaborators] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [accessDenied, setAccessDenied] = useState(false)
  const [requestAccessSent, setRequestAccessSent] = useState(false)
  const [pullRequests, setPullRequests] = useState([])
  const [branchSearch, setBranchSearch] = useState('')
  const [userRole, setUserRole] = useState('public')
  const [readme, setReadme] = useState(null)

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
      
      const [branchRes, graphRes] = await Promise.all([
        fetch(`${API_BASE}/repos/${username}/${repoName}/branches`, { headers }),
        fetch(`${API_BASE}/repos/${username}/${repoName}/commits/graph?limit=50`, { headers }),
      ])
      const branchData = branchRes.ok ? await branchRes.json() : []
      const graphData = graphRes.ok ? await graphRes.json() : []
      setRepo(repoData)
      setBranches(branchData || [])
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
    fetch(`${API_BASE}/repos/${username}/${repoName}/readme`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReadme)
      .catch(() => setReadme(null))
  }, [username, repoName, headers])

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

  const formatBranchTipDate = formatDateTime

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
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'insights' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          Insights
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
              ) : selectedFile || fileContent ? (
                <CodeViewer
                  path={selectedFile || fileContent?.path}
                  content={fileContent?.content}
                  binary={fileContent?.binary}
                />
              ) : readme ? (
                <ReadmeViewer path={readme.path} content={readme.content} />
              ) : (
                <CodeViewer path={null} content={null} binary={false} />
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

      {/* CommitsTab stays mounted after first visit so state (selected commit, chat, AI) persists across tab switches */}
      <div style={{ display: activeTab === 'commits' ? undefined : 'none' }}>
        <CommitsTab
          username={username}
          repoName={repoName}
          headers={headers}
          graphCommits={graphCommits}
        />
      </div>

      {activeTab === 'collaborators' && canManage && (
        <CollaboratorsTab
          username={username}
          repoName={repoName}
          headers={headers}
          isOwner={isOwner}
          collaborators={collaborators}
          setCollaborators={setCollaborators}
          pendingRequests={pendingRequests}
          setPendingRequests={setPendingRequests}
          pendingInvites={pendingInvites}
          setPendingInvites={setPendingInvites}
        />
      )}
      {activeTab === 'settings' && canManage && (
        <SettingsTab
          username={username}
          repoName={repoName}
          headers={headers}
          repo={repo}
          setRepo={setRepo}
        />
      )}

      {activeTab === 'insights' && (
        <InsightsTab
          username={username}
          repoName={repoName}
          headers={headers}
        />
      )}
    </div>
  )
}
