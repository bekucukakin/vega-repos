import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect, useRef } from 'react'
import styles from './LandingPage.module.css'

/* ─── Terminal steps ─────────────────────────────────────────────────────── */
const STEPS = [
  { kind: 'cmd', text: 'vega init' },
  { kind: 'out', text: 'Initialized Vega repository in .vega/', dim: true },
  { kind: 'cmd', text: 'vega add .' },
  { kind: 'out', text: '5 files staged for commit', dim: true },
  { kind: 'cmd', text: 'vega commit --ai' },
  { kind: 'ai',  text: 'Analyzing diff…' },
  { kind: 'out', text: '✓ feat: add JWT authentication middleware', success: true },
  { kind: 'cmd', text: 'vega push origin main' },
  { kind: 'out', text: '✓ Pushed to remote · 5 objects written to HDFS', success: true },
  { kind: 'cmd', text: 'vega merge feature/auth --ai' },
  { kind: 'ai',  text: 'Resolving conflicts in auth/handler.js…' },
  { kind: 'out', text: '✓ 2 conflicts auto-resolved · merge complete', success: true },
]
 
// ms delay before each step appears
const STEP_MS = [0, 400, 900, 1200, 1700, 2500, 3500, 4300, 4900, 5700, 6500, 7600]

/* ─── Neural-network SVG background ─────────────────────────────────────── */
const NODES = [
  [90, 55], [240, 25], [400, 75], [560, 40], [720, 85], [870, 50],
  [40, 160], [175, 135], [330, 175], [490, 150], [650, 185], [800, 160], [940, 120],
  [110, 275], [265, 245], [430, 290], [595, 260], [755, 300], [900, 260],
  [60, 385], [210, 355], [375, 400], [540, 370], [700, 408], [850, 375],
]

const EDGES = (() => {
  const out = []
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0]
      const dy = NODES[i][1] - NODES[j][1]
      if (Math.sqrt(dx * dx + dy * dy) < 205) out.push([i, j])
    }
  return out
})()

const NeuralBg = () => (
  <svg className={styles.neuralBg} viewBox="0 0 980 440"
    preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {EDGES.map(([i, j], k) => (
      <line key={k}
        x1={NODES[i][0]} y1={NODES[i][1]}
        x2={NODES[j][0]} y2={NODES[j][1]}
        stroke="rgba(88,166,255,0.55)" strokeWidth="0.75" />
    ))}
    {NODES.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={2.5} fill="rgba(88,166,255,0.85)" />
    ))}
  </svg>
)

/* ─── Terminal widget ────────────────────────────────────────────────────── */
function TerminalWidget() {
  const [count, setCount] = useState(0)
  const [dots, setDots] = useState(1)
  const bodyRef = useRef(null)

  useEffect(() => {
    const timers = STEP_MS.map((ms, i) => setTimeout(() => setCount(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d % 3) + 1), 380)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [count])

  return (
    <div className={styles.terminal}>

      {/* macOS-style chrome */}
      <div className={styles.terminalBar}>
        <div className={styles.terminalDots}>
          <span className={styles.dot} style={{ background: '#ff5f57' }} />
          <span className={styles.dot} style={{ background: '#febc2e' }} />
          <span className={styles.dot} style={{ background: '#58a6ff' }} />
        </div>
        <div className={styles.terminalTab}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          vega — zsh
        </div>
        <div style={{ width: 52 }} />
      </div>

      {/* Terminal body */}
      <div className={styles.terminalBody} ref={bodyRef}>
        {STEPS.slice(0, count).map((step, i) => {

          /* command line */
          if (step.kind === 'cmd') return (
            <div key={i} className={`${styles.termLine} ${styles.termLineCmd}`}>
              <span className={styles.promptArrow}>❯ </span>
              <span className={styles.promptCmd}>{step.text}</span>
            </div>
          )

          /* output line */
          if (step.kind === 'out') return (
            <div key={i} className={`${styles.termLine} ${styles.termLineOut} ${step.dim ? styles.dimLine : ''} ${step.success ? styles.successLine : ''}`}>
              {step.text}
            </div>
          )

          /* AI thinking */
          if (step.kind === 'ai') {
            const isActive = i === count - 1
            return (
              <div key={i} className={styles.thinkingLine}>
                <span className={styles.thinkingDots}>
                  {isActive
                    ? Array.from({ length: 3 }, (_, k) => (
                        <span key={k} className={styles.thinkingDot}
                          style={{ animationDelay: `${k * 0.16}s`, opacity: k < dots ? 1 : 0.18 }} />
                      ))
                    : <span className={styles.thinkingDone}>◆</span>
                  }
                </span>
                <span className={styles.thinkingText}>{step.text}</span>
              </div>
            )
          }

          return null
        })}

        {/* blinking cursor */}
        <div className={`${styles.termLine} ${styles.termLineCmd}`}>
          <span className={styles.promptArrow}>❯ </span>
          <span className={styles.cursor}>▋</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Stats ──────────────────────────────────────────────────────────────── */
const STATS = [
  {
    value: 'Full',
    label: 'version control system',
    gradient: 'linear-gradient(135deg,#58a6ff,#818cf8)',
    chips: [
      { text: 'Branching', color: '#58a6ff' },
      { text: 'History & Diffs', color: '#79c0ff' },
    ],
  },
  {
    value: 'AI',
    label: 'powered engine',
    gradient: 'linear-gradient(135deg,#818cf8,#c084fc)',
    chips: [
      { text: 'Conflict Solver', color: '#c084fc' },
      { text: 'Commit Generator', color: '#818cf8' },
    ],
  },
  {
    value: 'HDFS',
    label: 'distributed storage',
    gradient: 'linear-gradient(135deg,#f97316,#fb923c)',
    chips: [
      { text: 'Replication', color: '#f97316' },
      { text: 'Delta Push', color: '#fb923c' },
    ],
  },
  {
    value: 'Smart',
    label: 'PR intelligence',
    gradient: 'linear-gradient(135deg,#f97316,#818cf8)',
    chips: [
      { text: 'Risk Scoring', color: '#f97316' },
      { text: 'AI Summary', color: '#818cf8' },
    ],
  },
]

/* ─── Features ───────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" />
      </svg>
    ),
    label: 'AI Merge Engine',
    tagline: 'Conflict-free merges, automatically.',
    bullets: [
      'Resolve complex merge conflicts using AI.',
      'Understands intent, not just lines of code.',
    ],
    accent: '#58a6ff',
    glowColor: 'rgba(88,166,255,0.18)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.823a.5.5 0 0 1-.62-.62l.823-2.872a2 2 0 0 1 .506-.854z" />
      </svg>
    ),
    label: 'Smart Commits',
    tagline: 'No more "fix bug" commit messages.',
    bullets: [
      'Generate meaningful commit messages from code changes.',
      'AI reads your diff — you ship faster.',
    ],
    accent: '#818cf8',
    glowColor: 'rgba(129,140,248,0.18)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    label: 'Distributed Storage',
    tagline: 'Built for massive teams.',
    bullets: [
      'Store large repositories on Apache HDFS.',
      'Resilient, scalable — survives node failures.',
    ],
    accent: '#f97316',
    glowColor: 'rgba(249,115,22,0.18)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    label: 'PR Intelligence',
    tagline: 'Review faster, merge safer.',
    bullets: [
      'Risk scoring, AI summaries, and inline diffs.',
      'Automated review-time metrics at a glance.',
    ],
    accent: '#818cf8',
    glowColor: 'rgba(129,140,248,0.2)',
  },
]

/* ─── Workflow steps ──────────────────────────────────────────────────────── */
const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Initialize & stage',
    desc: 'Run vega init in any directory. Stage changes the same way you know and love.',
    code: 'vega init\nvega add .',
    accent: '#58a6ff',
  },
  {
    step: '02',
    title: 'AI-powered commit',
    desc: 'Let the AI read your diff and write a commit message that actually explains the change.',
    code: 'vega commit --ai',
    accent: '#818cf8',
  },
  {
    step: '03',
    title: 'Push to HDFS',
    desc: 'Your repository is replicated to Hadoop distributed storage — durable across node failures.',
    code: 'vega push',
    accent: '#f97316',
  },
  {
    step: '04',
    title: 'Merge intelligently',
    desc: 'AI detects and resolves conflicts automatically, flagging unsafe resolutions for human review.',
    code: 'vega merge feature --ai',
    accent: '#c084fc',
  },
]

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { token } = useAuth()

  return (
    <div className={styles.page}>
      <NeuralBg />

      {/* ══ Hero ══ */}
      <section className={styles.hero}>
        <div className={styles.heroGlowLeft} />
        <div className={styles.heroGlowRight} />
        <div className={styles.heroGlowOrange} />

        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.pill}>
              <span className={styles.pillDot} />
              VEGA - Version Engine AI
            </div>
            <h1 className={styles.heroTitle}>
              VEGA resolves the conflicts.<br />
              <span className={styles.gradient}>You ship the features.</span>
            </h1>
            <p className={styles.heroSub}>
            Vega automatically resolves merge conflicts, generates meaningful commit messages,
            and flags risky pull requests instantly — so you can focus on building, not fixing.
            </p>
            <div className={styles.heroCtas}>
              {token ? (
                <Link to="/repos" className={styles.btnPrimary}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Start Managing Repos
                </Link>
              ) : (
                <>
                  <Link to="/login" className={styles.btnPrimary}>
                    Get started free
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </Link>
                  <Link to="/docs" className={styles.btnSecondary}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                    Read the docs
                  </Link>
                </>
              )}
            </div>
            <Link to="/commit-demo" className={styles.demoBtn}>
              <span className={styles.demoBtnGlow} />
              <span className={styles.demoBtnContent}>
                <span className={styles.demoBtnMain}>Try AI Commit Assistant</span>
                <span className={styles.demoBtnSub}>Write better commits in seconds</span>
              </span>
            </Link>
          </div>

          <TerminalWidget />
        </div>
      </section>

      {/* ══ Stats strip ══ */}
      <div className={styles.statsStrip}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue} style={{ '--stat-grad': s.gradient }}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
            {s.chips && (
              <div className={styles.statChips}>
                {s.chips.map((c) => (
                  <span key={c.text} className={styles.statChip} style={{ '--chip-color': c.color }}>
                    <span className={styles.statChipDot} />
                    {c.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ══ Features ══ */}
      <section className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Solve the real problems</h2>
          <p className={styles.sectionSub}>From merge hell to confident deploys — built on proven VCS principles, powered by AI where it matters.</p>
        </div>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureCard}
              style={{ '--feat-accent': f.accent, '--feat-glow': f.glowColor }}>
              <div className={styles.featureCardGlow} />
              <div className={styles.featureIconWrap}>
                {f.icon}
              </div>
              <div className={styles.featureLabel}>{f.label}</div>
              <div className={styles.featureTagline}>{f.tagline}</div>
              <ul className={styles.featureBullets}>
                {f.bullets.map((b, i) => (
                  <li key={i} className={styles.featureBullet}>
                    <span className={styles.bulletCheck}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══ Workflow ══ */}
      <section className={styles.workflow}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <p className={styles.sectionSub}>From empty directory to distributed repository in four commands.</p>
        </div>
        <div className={styles.workflowSteps}>
          {WORKFLOW_STEPS.map((w, i) => (
            <div key={w.step} className={styles.workflowStep}
              style={{ '--step-accent': w.accent, '--step-accent-muted': w.accent + '18' }}>
              <div className={styles.stepNumber}>{w.step}</div>
              {i < WORKFLOW_STEPS.length - 1 && <div className={styles.stepConnector} />}
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{w.title}</div>
                <div className={styles.stepDesc}>{w.desc}</div>
                <div className={styles.stepCode}>
                  {w.code.split('\n').map((line, j) => (
                    <div key={j} className={styles.codeLine}>
                      <span className={styles.codePrompt}>❯</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA (unauthenticated only) ══ */}
      {!token && (
        <section className={styles.cta}>
          <div className={styles.ctaGlow} />
          <div className={styles.ctaGlowOrange} />
          <div className={styles.ctaInner}>
            <div className={styles.ctaTextBlock}>
              <h2 className={styles.ctaTitle}>Start building with Vega today</h2>
              <p className={styles.ctaSub}>
                Create a free account and push your first repository in minutes.
                No configuration required — just a CLI and your code.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link to="/register" className={styles.btnPrimary}>Create free account</Link>
              <Link to="/login" className={styles.btnGhost}>Sign in</Link>
            </div>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Vega Version Control System</span>
        <Link to="/docs" className={styles.footerLink}>Documentation</Link>
      </footer>
    </div>
  )
}
