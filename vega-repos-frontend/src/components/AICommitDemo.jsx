import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './AICommitDemo.module.css'

/* ── Tracking ───────────────────────────────────────────────────────────────── */
const track = (event, data = {}) => {
  const payload = { event, ts: Date.now(), ...data }
  console.info('[VEGA Demo]', payload)
  try {
    const key = 'vega_demo_events'
    const prev = JSON.parse(sessionStorage.getItem(key) || '[]')
    sessionStorage.setItem(key, JSON.stringify([...prev, payload]))
  } catch (_) {}
}

/* ── Diff content ───────────────────────────────────────────────────────────── */
const DIFF_LINES = [
  { type: 'meta',    text: 'diff --git a/src/payment/TransactionService.java b/src/payment/TransactionService.java' },
  { type: 'meta',    text: '--- a/src/payment/TransactionService.java' },
  { type: 'meta',    text: '+++ b/src/payment/TransactionService.java' },
  { type: 'hunk',    text: '@@ -42,14 +42,18 @@ public class TransactionService {' },
  { type: 'context', text: '   public TransactionResult process(Transaction tx) {' },
  { type: 'removed', text: '-    if (tx == null) throw new RuntimeException("tx null");' },
  { type: 'added',   text: '+    if (tx == null) throw new NullPointerException("Transaction must not be null");' },
  { type: 'removed', text: '-    double fee = tx.amount * FEE_RATE;' },
  { type: 'added',   text: '+    double fee = calculateFee(tx.amount, tx.currency);' },
  { type: 'added',   text: '+    fee = Math.round(fee * 100.0) / 100.0; // prevent floating-point drift' },
  { type: 'context', text: '   }' },
  { type: 'hunk',    text: '@@ -61,6 +65,14 @@ public class TransactionService {' },
  { type: 'removed', text: '-    // TODO: add currency support' },
  { type: 'added',   text: '+  private double calculateFee(double amount, String currency) {' },
  { type: 'added',   text: '+    double rate = CURRENCY_RATES.getOrDefault(currency, DEFAULT_RATE);' },
  { type: 'added',   text: '+    return amount * rate * FEE_MULTIPLIER;' },
  { type: 'added',   text: '+  }' },
]

const AI_MESSAGE = 'refactor(payment): fix null pointer in transaction flow and add currency-aware fee calculation'

const QUALITY_BADGES = [
  { icon: '✦', label: 'Conventional commit format', color: '#58a6ff' },
  { icon: '✦', label: 'Describes the why, not just the what', color: '#3fb950' },
  { icon: '✦', label: 'Scope clearly identified', color: '#c084fc' },
  { icon: '✦', label: 'Scannable in git log', color: '#f97316' },
]

/* ── Diff block ─────────────────────────────────────────────────────────────── */
function DiffBlock() {
  return (
    <div className={styles.diffBlock}>
      <div className={styles.diffHeader}>
        <span className={styles.diffDot} style={{ background: '#ff5f57' }} />
        <span className={styles.diffDot} style={{ background: '#ffbd2e' }} />
        <span className={styles.diffDot} style={{ background: '#28c840' }} />
        <span className={styles.diffTitle}>TransactionService.java</span>
        <span className={styles.diffBadge}>+12 −4</span>
      </div>
      <div className={styles.diffBody}>
        {DIFF_LINES.map((line, i) => (
          <div key={i} className={`${styles.diffLine} ${styles['diff_' + line.type]}`}>
            <span className={styles.diffGutter}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
            </span>
            <span className={styles.diffText}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Step indicators ────────────────────────────────────────────────────────── */
function Steps({ current }) {
  const labels = ['Write', 'Compare', 'Results', 'Enable']
  return (
    <div className={styles.steps}>
      {labels.map((label, i) => {
        const idx = i + 1
        const done    = idx < current
        const active  = idx === current
        return (
          <div key={label} className={styles.stepWrap}>
            <div className={`${styles.stepDot} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}>
              {done ? '✓' : idx}
            </div>
            <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{label}</span>
            {i < labels.length - 1 && (
              <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function AICommitDemo({ onClose }) {
  const [step, setStep]           = useState(1)
  const [userMsg, setUserMsg]     = useState('')
  const [elapsed, setElapsed]     = useState(0)
  const [timerOn, setTimerOn]     = useState(false)
  const [choice, setChoice]       = useState(null)   // 'mine' | 'ai'
  const [aiTyped, setAiTyped]     = useState('')
  const [showBadges, setShowBadges] = useState(false)
  const timerRef  = useRef(null)
  const inputRef  = useRef(null)
  const startedAt = useRef(null)

  /* track open */
  useEffect(() => { track('demo_started') }, [])

  /* close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  /* timer */
  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => setElapsed(t => t + 10), 10)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [timerOn])

  /* AI typewriter on step 2 */
  useEffect(() => {
    if (step !== 2) return
    setAiTyped('')
    setShowBadges(false)
    let i = 0
    const t = setInterval(() => {
      i++
      setAiTyped(AI_MESSAGE.slice(0, i))
      if (i >= AI_MESSAGE.length) {
        clearInterval(t)
        setTimeout(() => setShowBadges(true), 300)
      }
    }, 22)
    return () => clearInterval(t)
  }, [step])

  const handleFocus = useCallback(() => {
    if (!timerOn && step === 1) {
      setTimerOn(true)
      startedAt.current = Date.now()
      track('manual_commit_started')
    }
  }, [timerOn, step])

  const handleContinue = useCallback(() => {
    if (!userMsg.trim()) return
    setTimerOn(false)
    track('manual_commit_submitted', { duration_ms: elapsed, message: userMsg })
    track('ai_suggestion_viewed')
    setStep(2)
  }, [userMsg, elapsed])

  const handleChoice = useCallback((c) => {
    setChoice(c)
    track('ai_selected', { selected_ai: c === 'ai' })
  }, [])

  const handleToResults = useCallback(() => {
    setStep(3)
  }, [])

  const handleComplete = useCallback(() => {
    track('demo_completed', { chose_ai: choice === 'ai', user_time_ms: elapsed })
    setStep(4)
  }, [choice, elapsed])

  const fmt = (ms) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const pctFaster = elapsed > 2000 ? Math.round((1 - 2000 / elapsed) * 100) : 0
  const minPerDay = Math.round((elapsed / 1000 / 60) * 8)   // ~8 commits/day

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>⚡</span>
            <div>
              <div className={styles.headerTitle}>AI Commit Assistant</div>
              <div className={styles.headerSub}>Stop writing 'fix bug' commits</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <Steps current={step} />

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h2>What changed in your code?</h2>
              <p>Review the diff below, then write a commit message — like you normally would.</p>
            </div>

            <DiffBlock />

            <div className={styles.inputArea}>
              <div className={styles.inputRow}>
                <span className={styles.inputPrompt}>❯</span>
                <input
                  ref={inputRef}
                  className={styles.commitInput}
                  placeholder="Write your commit message…"
                  value={userMsg}
                  onFocus={handleFocus}
                  onChange={e => setUserMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && userMsg.trim() && handleContinue()}
                  autoFocus
                />
                {timerOn && (
                  <span className={styles.timerBadge}>{fmt(elapsed)}</span>
                )}
              </div>
              <div className={styles.inputHint}>Press Enter or click Continue when done</div>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                onClick={handleContinue}
                disabled={!userMsg.trim()}
              >
                Continue
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h2>Here's what AI wrote — in 2 seconds</h2>
              <p>Same diff. Dramatically better message.</p>
            </div>

            <div className={styles.comparison}>
              {/* User side */}
              <div className={`${styles.compCard} ${styles.compUser}`}>
                <div className={styles.compLabel}>
                  <span className={styles.compLabelDot} style={{ background: '#6b7280' }} />
                  You — {fmt(elapsed)}
                </div>
                <div className={styles.compMessage}>{userMsg}</div>
                <div className={styles.compIssues}>
                  {!userMsg.match(/^(feat|fix|refactor|chore|docs|test|style|perf|ci)\(/) && (
                    <span className={styles.issueTag}>No conventional prefix</span>
                  )}
                  {userMsg.length < 30 && (
                    <span className={styles.issueTag}>Too short</span>
                  )}
                  {/(fix|update|change|stuff|wip)/i.test(userMsg) && (
                    <span className={styles.issueTag}>Vague wording</span>
                  )}
                </div>
              </div>

              <div className={styles.vsLabel}>VS</div>

              {/* AI side */}
              <div className={`${styles.compCard} ${styles.compAI}`}>
                <div className={styles.compLabel}>
                  <span className={styles.compLabelDot} style={{ background: '#3fb950' }} />
                  VEGA AI — ~2s
                </div>
                <div className={styles.compMessage}>
                  {aiTyped}
                  <span className={styles.cursor} />
                </div>
                <div className={styles.compMicro}>✨ Clearer, structured, and easier to understand</div>
              </div>
            </div>

            {/* Badges */}
            {showBadges && (
              <div className={styles.badges}>
                {QUALITY_BADGES.map((b, i) => (
                  <div
                    key={i}
                    className={styles.badge}
                    style={{ '--badge-color': b.color, animationDelay: `${i * 80}ms` }}
                  >
                    <span className={styles.badgeIcon}>{b.icon}</span>
                    {b.label}
                  </div>
                ))}
              </div>
            )}

            {/* Which one? */}
            {showBadges && (
              <div className={styles.choiceRow}>
                <span className={styles.choiceLabel}>Which one would you use?</span>
                <button
                  className={`${styles.choiceBtn} ${choice === 'mine' ? styles.choiceBtnActive : ''}`}
                  onClick={() => handleChoice('mine')}
                >Mine</button>
                <button
                  className={`${styles.choiceBtn} ${styles.choiceBtnAI} ${choice === 'ai' ? styles.choiceBtnActive : ''}`}
                  onClick={() => handleChoice('ai')}
                >⚡ AI</button>
              </div>
            )}

            {showBadges && (
              <div className={styles.actions}>
                <button className={styles.btnPrimary} onClick={handleToResults}>
                  See your results
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeading}>
              <h2>Your results</h2>
              <p>Here's what just happened.</p>
            </div>

            <div className={styles.resultsGrid}>
              {/* Time */}
              <div className={styles.resultCard}>
                <div className={styles.resultCardIcon}>⏱</div>
                <div className={styles.resultCardTitle}>Time saved</div>
                <div className={styles.resultRows}>
                  <div className={styles.resultRow}>
                    <span className={styles.resultRowLabel}>You</span>
                    <div className={styles.resultBar}>
                      <div className={styles.resultBarFill} style={{ width: '100%', background: '#4b5563' }} />
                    </div>
                    <span className={styles.resultRowValue}>{fmt(elapsed)}</span>
                  </div>
                  <div className={styles.resultRow}>
                    <span className={styles.resultRowLabel}>AI</span>
                    <div className={styles.resultBar}>
                      <div className={styles.resultBarFill} style={{ width: `${Math.min((2000 / elapsed) * 100, 20)}%`, background: '#3fb950' }} />
                    </div>
                    <span className={styles.resultRowValue} style={{ color: '#3fb950' }}>~2s</span>
                  </div>
                </div>
                {pctFaster > 0 && (
                  <div className={styles.resultStat} style={{ color: '#3fb950' }}>
                    ⚡ {pctFaster}% faster
                  </div>
                )}
              </div>

              {/* Quality */}
              <div className={styles.resultCard}>
                <div className={styles.resultCardIcon}>✦</div>
                <div className={styles.resultCardTitle}>Quality improvement</div>
                <div className={styles.qualityList}>
                  {QUALITY_BADGES.map((b, i) => (
                    <div key={i} className={styles.qualityItem} style={{ '--qi-color': b.color }}>
                      <span className={styles.qualityCheck}>✔</span>
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Impact message */}
            <div className={styles.impactBlock}>
              <div className={styles.impactMain}>
                Your commits will actually reflect what you did.
              </div>
              <div className={styles.impactSub}>
                No more vague commits like <code>'fix stuff'</code> or <code>'update code'</code>
              </div>
              {minPerDay > 0 && (
                <div className={styles.impactStats}>
                  <span className={styles.impactStat}>
                    You could save ~{minPerDay} min/day
                  </span>
                  <span className={styles.impactDot} />
                  <span className={styles.impactStat}>
                    Make your git history 2× more readable
                  </span>
                </div>
              )}
            </div>

            {/* Fun badges */}
            <div className={styles.funBadges}>
              {pctFaster >= 70 && (
                <div className={styles.funBadge}>⚡ Faster than 70% of developers</div>
              )}
              <div className={styles.funBadge}>🧠 Your commits just leveled up</div>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleComplete}>
                Enable AI Commits
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div className={styles.stepContent}>
            <div className={styles.finalScreen}>
              <div className={styles.finalGlow} />
              <div className={styles.finalIcon}>⚡</div>
              <h2 className={styles.finalTitle}>You're ready to write better commits.</h2>
              <p className={styles.finalSub}>
                Run <code>vega commit --ai</code> in any Vega repository.<br />
                Your commits will finally explain your work.
              </p>
              <div className={styles.finalCmd}>
                <span className={styles.finalPrompt}>❯</span>
                <span className={styles.finalCmdText}>vega commit <span style={{ color: '#58a6ff' }}>--ai</span></span>
              </div>
              <div className={styles.finalBadges}>
                <span className={styles.finalBadge} style={{ color: '#3fb950' }}>✔ More descriptive</span>
                <span className={styles.finalBadge} style={{ color: '#58a6ff' }}>✔ Better structure</span>
                <span className={styles.finalBadge} style={{ color: '#c084fc' }}>✔ Easier to scan</span>
              </div>
              <div className={styles.actions} style={{ justifyContent: 'center' }}>
                <button className={styles.btnPrimary} onClick={onClose}>
                  Start writing better commits now
                </button>
                <button className={styles.btnGhost} onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
