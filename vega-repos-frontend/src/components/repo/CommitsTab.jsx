import { useState, useRef } from 'react'
import { API_BASE, AGENT_BASE } from '../../config/api'
import { fetchWithTimeout } from '../../utils/fetchWithTimeout'
import { timeAgo, formatDateShort } from '../../utils/formatDate'
import { BRANCH_COLORS } from '../../utils/commitGraph'
import styles from '../../pages/RepoDetailPage.module.css'

const formatDate = (ts) => ts ? formatDateShort(ts) : '-'
const formatRelativeUpdated = (ts) => ts == null || ts === 0 ? '—' : timeAgo(ts) ?? '—'

export default function CommitsTab({ username, repoName, headers, graphCommits }) {
  const [selectedCommit, setSelectedCommit] = useState(null)
  const [commitDiff, setCommitDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const aiRequestRef = useRef(null)
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [savedInsights, setSavedInsights] = useState([])
  const [expandedDiffFiles, setExpandedDiffFiles] = useState({})

  const handleCommitClick = async (c) => {
    setSelectedCommit(c)
    setDiffLoading(true)
    setCommitDiff(null)
    const thisHash = c.fullHash || c.hash
    aiRequestRef.current = thisHash
    setAiAnalysis(null)
    setAiLoading(true)
    setChatHistory([])
    setChatInput('')
    setSavedInsights([])
    setExpandedDiffFiles({})

    const hashForDiff = c.fullHash || c.hash

    const [diffRes, insightsRes] = await Promise.allSettled([
      fetch(`${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/diff`, { headers }),
      fetch(`${API_BASE}/repos/${username}/${repoName}/commits/${encodeURIComponent(hashForDiff)}/insights`, { headers }),
    ])

    let diffTextForAI = ''
    if (diffRes.status === 'fulfilled' && diffRes.value.ok) {
      const diffData = await diffRes.value.json()
      setCommitDiff(diffData)
      const openByDefault = {}
      ;(diffData?.files || []).forEach((f) => { openByDefault[f.path] = f.status === 'added' })
      setExpandedDiffFiles(openByDefault)
      diffTextForAI = (diffData?.files || []).slice(0, 10).map((f) =>
        `File: ${f.path}\nStatus: ${f.status}\n${(f.unifiedDiff || '').slice(0, 1500)}`
      ).join('\n\n---\n\n')
    } else {
      setCommitDiff(null)
    }
    setDiffLoading(false)

    if (insightsRes.status === 'fulfilled' && insightsRes.value.ok) {
      setSavedInsights(await insightsRes.value.json())
    }

    try {
      if (aiRequestRef.current !== thisHash) return
      const aiRes = await fetchWithTimeout(`${AGENT_BASE}/analyze-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          commitHash: hashForDiff,
          commitMessage: c.message,
          author: c.author,
          diff: diffTextForAI,
        }),
      })
      if (aiRequestRef.current !== thisHash) return
      if (aiRes.ok) {
        const data = await aiRes.json()
        if (data.success) setAiAnalysis(data)
      }
    } catch { /* AI unavailable or timeout */ } finally {
      if (aiRequestRef.current === thisHash) setAiLoading(false)
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatSending || !selectedCommit) return
    const question = chatInput.trim()
    setChatInput('')
    setChatSending(true)
    setChatError('')
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
      const res = await fetchWithTimeout(`${AGENT_BASE}/commit-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ commitContext, question, history: newHistory }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setChatHistory([...newHistory, { role: 'assistant', message: data.answer, question }])
        } else {
          setChatError(data.error || 'AI response could not be generated.')
        }
      } else {
        const data = await res.json().catch(() => null)
        setChatError(data?.error || 'AI service returned an error.')
      }
    } catch (e) {
      setChatError(e?.name === 'AbortError'
        ? 'AI response timed out. Please try a shorter question or retry.'
        : 'Could not reach AI service.')
    } finally {
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
        setSavedInsights((prev) =>
          prev.map((i) => i.id === insightId ? updated : i).sort((a, b) => b.likes - a.likes)
        )
      }
    } catch { /* silent */ }
  }

  return (
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

            const lineUp = c.hasLineAbove ? (
              <line x1={cx} y1={0} x2={cx} y2={cy - R - 1}
                stroke={c.color} strokeWidth="2" />
            ) : null

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
                    <span className={styles.graphDate} title={formatDate(c.timestamp)}>
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

            {/* Header */}
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
                  <span className={styles.cmDate}>
                    {selectedCommit.timestamp
                      ? new Date(selectedCommit.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                      : ''}
                  </span>
                </div>
              </div>
              <button type="button" className={styles.diffModalClose} onClick={() => setSelectedCommit(null)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                </svg>
              </button>
            </div>

            {/* Two-panel body */}
            <div className={styles.commitPanelBody}>

              {/* LEFT: Diff */}
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

              {/* RIGHT: AI Panel */}
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
                        {'● '}
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
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                              </svg>
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

                  <div className={styles.chipRow}>
                    {['Why was this done?', 'Any missing tests?', 'Is this safe?'].map((q) => (
                      <button key={q} className={styles.chip} onClick={() => setChatInput(q)}>{q}</button>
                    ))}
                  </div>

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
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.53 4.75A.75.75 0 015.28 4h5.44a.75.75 0 010 1.5H8.75v5.19l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l1.72 1.72V5.5H5.28a.75.75 0 01-.75-.75z"/>
                              </svg>
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

                  {chatError && <p className={styles.error}>{chatError}</p>}
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

              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
