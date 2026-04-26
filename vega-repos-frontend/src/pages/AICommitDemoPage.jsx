import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import styles from './AICommitDemoPage.module.css'

/* ── Tracking ─────────────────────────────────────────────────────────────── */
const track = (event, data = {}) => {
  const payload = { event, ts: Date.now(), ...data }
  console.info('[VEGA Demo]', payload)
  try {
    const prev = JSON.parse(sessionStorage.getItem('vega_demo_events') || '[]')
    sessionStorage.setItem('vega_demo_events', JSON.stringify([...prev, payload]))
  } catch (_) {}
}

/* ── Static data ─────────────────────────────────────────────────────────── */
const DIFF_LINES = [
  { type: 'context', text: '   public TransactionResult process(Transaction tx) {' },
  { type: 'removed', text: '-    if (tx == null) throw new RuntimeException("tx null");' },
  { type: 'added',   text: '+    if (tx == null) throw new NullPointerException("Transaction must not be null");' },
  { type: 'context', text: '   ' },
  { type: 'removed', text: '-    double fee = tx.amount * FEE_RATE;' },
  { type: 'added',   text: '+    double fee = calculateFee(tx.amount, tx.currency);' },
  { type: 'added',   text: '+    fee = Math.round(fee * 100.0) / 100.0;' },
  { type: 'context', text: '   }' },
  { type: 'context', text: '   ' },
  { type: 'removed', text: '-    // TODO: add currency support' },
  { type: 'added',   text: '+  private double calculateFee(double amount, String currency) {' },
  { type: 'added',   text: '+    double rate = CURRENCY_RATES.getOrDefault(currency, DEFAULT_RATE);' },
  { type: 'added',   text: '+    return amount * rate * FEE_MULTIPLIER;' },
  { type: 'added',   text: '+  }' },
]

const AI_MESSAGE = 'refactor(payment): fix null pointer in transaction flow and add currency-aware fee calculation'

const IMPROVEMENTS = [
  { label: 'Conventional commit format',       color: '#58a6ff' },
  { label: 'Describes the why, not just what', color: '#3fb950' },
  { label: 'Scope clearly identified',         color: '#c084fc' },
  { label: 'Readable in git log at a glance',  color: '#8b949e' },
]

/* ── Diff block ──────────────────────────────────────────────────────────── */
function DiffBlock() {
  return (
    <div className={styles.diffBlock}>
      <div className={styles.diffHeader}>
        <div className={styles.diffDots}>
          <span style={{ background: '#ff5f57' }} />
          <span style={{ background: '#ffbd2e' }} />
          <span style={{ background: '#28c840' }} />
        </div>
        <span className={styles.diffFilename}>TransactionService.java</span>
        <span className={styles.diffStat}>+12 &minus;4</span>
      </div>
      <div className={styles.diffBody}>
        {DIFF_LINES.map((line, i) => (
          <div key={i} className={`${styles.line} ${styles['line_' + line.type]}`}>
            <span className={styles.lineGutter}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '\u00a0'}
            </span>
            <span className={styles.lineText}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Step bar ────────────────────────────────────────────────────────────── */
function StepBar({ current }) {
  const steps = ['Write', 'Compare', 'Result', 'Done']
  return (
    <div className={styles.stepBar}>
      {steps.map((label, i) => {
        const n = i + 1
        return (
          <div key={label} className={styles.stepItem}>
            <div className={[
              styles.stepNum,
              n < current ? styles.stepPast : '',
              n === current ? styles.stepCurrent : '',
            ].join(' ')}>
              {n < current ? '✓' : n}
            </div>
            <span className={[styles.stepLabel, n === current ? styles.stepLabelActive : ''].join(' ')}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={[styles.stepLine, n < current ? styles.stepLineDone : ''].join(' ')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function AICommitDemoPage() {
  const [step,       setStep]       = useState(1)
  const [userMsg,    setUserMsg]    = useState('')
  const [elapsed,    setElapsed]    = useState(0)
  const [timerOn,    setTimerOn]    = useState(false)
  const [choice,     setChoice]     = useState(null)
  const [aiTyped,    setAiTyped]    = useState('')
  const [badgesIn,   setBadgesIn]   = useState(false)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { track('demo_started') }, [])

  /* timer */
  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => setElapsed(t => t + 10), 10)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [timerOn])

  /* typewriter on step 2 */
  useEffect(() => {
    if (step !== 2) return
    setAiTyped(''); setBadgesIn(false)
    let i = 0
    const t = setInterval(() => {
      i++
      setAiTyped(AI_MESSAGE.slice(0, i))
      if (i >= AI_MESSAGE.length) { clearInterval(t); setTimeout(() => setBadgesIn(true), 250) }
    }, 20)
    return () => clearInterval(t)
  }, [step])

  const handleFocus = useCallback(() => {
    if (!timerOn && step === 1) {
      setTimerOn(true)
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

  const handleToResult = useCallback(() => setStep(3), [])

  const handleComplete = useCallback(() => {
    track('demo_completed', { chose_ai: choice === 'ai', user_time_ms: elapsed })
    setStep(4)
  }, [choice, elapsed])

  const fmt = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  const pct = elapsed > 2000 ? Math.round((1 - 2000 / elapsed) * 100) : 0

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* Back */}
        <Link to="/" className={styles.backLink}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>

        {/* Heading */}
        <div className={styles.heading}>
          <h1>AI Commit Assistant</h1>
          <p>See how much time you save and how much clearer your commits become.</p>
        </div>

        <StepBar current={step} />

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Review the diff, write your commit</h2>
              <p>Start typing to begin the timer.</p>
            </div>

            <DiffBlock />

            <div className={styles.inputWrap}>
              <span className={styles.prompt}>$</span>
              <input
                ref={inputRef}
                autoFocus
                className={styles.input}
                placeholder="git commit -m &quot;...&quot;"
                value={userMsg}
                onFocus={handleFocus}
                onChange={e => setUserMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && userMsg.trim() && handleContinue()}
              />
              {timerOn && <span className={styles.timer}>{fmt(elapsed)}</span>}
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleContinue} disabled={!userMsg.trim()}>
                Continue
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Same diff — here's what AI wrote</h2>
              <p>Generated in under 2 seconds.</p>
            </div>

            <div className={styles.compare}>
              <div className={styles.compareCol}>
                <div className={styles.compareLabel}>You &mdash; {fmt(elapsed)}</div>
                <div className={styles.compareMsg}>{userMsg}</div>
                <div className={styles.issueList}>
                  {!userMsg.match(/^(feat|fix|refactor|chore|docs|test|style|perf|ci)\(/) && (
                    <span className={styles.issue}>No conventional prefix</span>
                  )}
                  {userMsg.length < 30 && (
                    <span className={styles.issue}>Too short</span>
                  )}
                  {/(fix|update|change|stuff|wip)/i.test(userMsg) && (
                    <span className={styles.issue}>Vague wording</span>
                  )}
                </div>
              </div>

              <div className={styles.vsDivider}>vs</div>

              <div className={`${styles.compareCol} ${styles.compareColAI}`}>
                <div className={styles.compareLabel} style={{ color: '#3fb950' }}>
                  VEGA AI &mdash; ~2s
                </div>
                <div className={styles.compareMsg}>
                  {aiTyped}
                  <span className={styles.caret} />
                </div>
                {badgesIn && (
                  <div className={styles.aiNote}>Clearer, structured, and easier to understand</div>
                )}
              </div>
            </div>

            {badgesIn && (
              <div className={styles.improvements}>
                {IMPROVEMENTS.map((b, i) => (
                  <div
                    key={i}
                    className={styles.improvementItem}
                    style={{ '--c': b.color, animationDelay: `${i * 70}ms` }}
                  >
                    <span className={styles.improvementDot} />
                    {b.label}
                  </div>
                ))}
              </div>
            )}

            {badgesIn && (
              <div className={styles.choiceRow}>
                <span className={styles.choiceQuestion}>Which one would you use?</span>
                <button
                  className={[styles.choiceBtn, choice === 'mine' ? styles.choiceBtnSelected : ''].join(' ')}
                  onClick={() => handleChoice('mine')}
                >Mine</button>
                <button
                  className={[styles.choiceBtn, styles.choiceBtnGreen, choice === 'ai' ? styles.choiceBtnSelected : ''].join(' ')}
                  onClick={() => handleChoice('ai')}
                >AI</button>
              </div>
            )}

            {badgesIn && (
              <div className={styles.actions}>
                <button className={styles.btnPrimary} onClick={handleToResult}>
                  See results
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Your results</h2>
            </div>

            <div className={styles.results}>
              {/* Time */}
              <div className={styles.resultBlock}>
                <div className={styles.resultTitle}>Time</div>
                <div className={styles.resultRows}>
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>You</span>
                    <div className={styles.bar}><div className={styles.barFill} style={{ width: '100%', background: '#30363d' }} /></div>
                    <span className={styles.resultVal}>{fmt(elapsed)}</span>
                  </div>
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>AI</span>
                    <div className={styles.bar}><div className={styles.barFill} style={{ width: `${Math.min((2000 / elapsed) * 100, 18)}%`, background: '#3fb950' }} /></div>
                    <span className={styles.resultVal} style={{ color: '#3fb950' }}>~2s</span>
                  </div>
                </div>
                {pct > 0 && (
                  <div className={styles.resultNote}>{pct}% faster</div>
                )}
              </div>

              {/* Quality */}
              <div className={styles.resultBlock}>
                <div className={styles.resultTitle}>Quality</div>
                <div className={styles.qualityList}>
                  {IMPROVEMENTS.map((b, i) => (
                    <div key={i} className={styles.qualityItem}>
                      <span className={styles.qualityCheck} style={{ color: b.color }}>✓</span>
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.impactBox}>
              <div className={styles.impactHeadline}>
                Your commits will actually reflect what you did.
              </div>
              <div className={styles.impactBody}>
                No more vague messages like <code>fix stuff</code> or <code>update code</code>.
                Every commit tells a story.
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleComplete}>
                Enable AI Commits
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4 ── */}
        {step === 4 && (
          <div className={styles.card}>
            <div className={styles.finalWrap}>
              <div className={styles.finalGlow} />
              <h2 className={styles.finalTitle}>You're ready to write better commits.</h2>
              <p className={styles.finalSub}>
                Run the command below in any Vega repository.<br />
                Your commits will finally explain your work.
              </p>
              <div className={styles.finalCmd}>
                <span className={styles.finalPrompt}>$</span>
                <span>vega commit <span className={styles.finalFlag}>--ai</span></span>
              </div>
              <div className={styles.finalBadges}>
                <span style={{ color: '#3fb950' }}>✓ More descriptive</span>
                <span style={{ color: '#58a6ff' }}>✓ Better structure</span>
                <span style={{ color: '#c084fc' }}>✓ Easier to scan in history</span>
              </div>
              <div className={styles.actions} style={{ justifyContent: 'center' }}>
                <Link to="/register" className={styles.btnPrimary}>Start writing better commits</Link>
                <Link to="/" className={styles.btnSecondary}>Back to home</Link>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
