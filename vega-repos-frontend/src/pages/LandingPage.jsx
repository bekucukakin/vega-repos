import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './LandingPage.module.css'

const TERMINAL_LINES = [
  { prefix: '$ ', text: 'vega init', delay: 0 },
  { prefix: '  ', text: 'Initialized empty Vega repository in .vega', dim: true, delay: 1 },
  { prefix: '$ ', text: 'vega add . && vega commit --ai', delay: 2 },
  { prefix: '  ', text: '✓ AI commit: "Add user authentication module"', success: true, delay: 3 },
  { prefix: '$ ', text: 'vega push my-project', delay: 4 },
  { prefix: '  ', text: '✓ Repository pushed to HDFS — ozantest/my-project', success: true, delay: 5 },
  { prefix: '$ ', text: 'vega merge feature --ai', delay: 6 },
  { prefix: '  ', text: '✓ 3 conflicts resolved by Gemini AI', success: true, delay: 7 },
]

const STATS = [
  { value: '3-way', label: 'merge algorithm' },
  { value: 'AI', label: 'conflict resolution' },
  { value: 'HDFS', label: 'distributed storage' },
  { value: 'PR', label: 'review metrics' },
]

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" />
      </svg>
    ),
    label: 'Branching & Merging',
    desc: 'Full branch management with bidirectional BFS ancestor detection and AI-powered conflict resolution via Google Gemini.',
    accent: '#58a6ff',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 8v4l3 3" />
        <path d="M16 2l4 4-4 4" />
      </svg>
    ),
    label: 'AI Commit Messages',
    desc: 'Generate meaningful, context-aware commit messages from staged diffs — powered by the Gemini language model.',
    accent: '#818cf8',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    label: 'Pull Requests & Review',
    desc: 'Code review workflow with risk analysis, PR summaries, inline diffs, and automated review-time metrics.',
    accent: '#3fb950',
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
    desc: 'Push and pull repositories backed by Apache Hadoop HDFS for resilient, scalable object storage.',
    accent: '#f0883e',
  },
]

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Initialize & stage',
    desc: 'Run vega init in any directory. Stage changes the same way you know and love.',
    code: 'vega init\nvega add .',
  },
  {
    step: '02',
    title: 'AI-powered commit',
    desc: 'Let the AI read your diff and write a commit message that actually explains the change.',
    code: 'vega commit --ai',
  },
  {
    step: '03',
    title: 'Push to HDFS',
    desc: 'Your repository is replicated to Hadoop distributed storage — durable across node failures.',
    code: 'vega push my-project',
  },
  {
    step: '04',
    title: 'Merge intelligently',
    desc: 'Three-way merge with Gemini AI resolving conflicts and flagging unsafe resolutions for human review.',
    code: 'vega merge feature --ai',
  },
]

export default function LandingPage() {
  const { token } = useAuth()

  return (
    <div className={styles.page}>

      {/* ══ Hero ══ */}
      <section className={styles.hero}>
        <div className={styles.heroGlowLeft} />
        <div className={styles.heroGlowRight} />

        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.pill}>
              <span className={styles.pillDot} />
              Version Control · AI · HDFS
            </div>
            <h1 className={styles.heroTitle}>
              Where code meets<br />
              <span className={styles.gradient}>intelligence</span>
            </h1>
            <p className={styles.heroSub}>
              VEGA is an AI-powered version control system built for modern teams.
              Commit, branch, review, and resolve conflicts — all from a familiar CLI.
            </p>
            <div className={styles.heroCtas}>
              {token ? (
                <Link to="/repos" className={styles.btnPrimary}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Go to Repositories
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
                    Documentation
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Terminal mockup */}
          <div className={styles.terminal}>
            <div className={styles.terminalBar}>
              <div className={styles.terminalDots}>
                <span className={styles.dot} style={{ background: '#ff5f57' }} />
                <span className={styles.dot} style={{ background: '#febc2e' }} />
                <span className={styles.dot} style={{ background: '#28c840' }} />
              </div>
              <span className={styles.terminalTitle}>zsh — vega</span>
              <div style={{ width: 52 }} />
            </div>
            <div className={styles.terminalBody}>
              {TERMINAL_LINES.map((line, i) => (
                <div key={i} className={`${styles.termLine} ${line.dim ? styles.dimLine : ''} ${line.success ? styles.successLine : ''}`}
                  style={{ animationDelay: `${line.delay * 0.25}s` }}>
                  <span className={styles.termPrefix}>{line.prefix}</span>
                  <span>{line.text}</span>
                </div>
              ))}
              <div className={styles.termLine}>
                <span className={styles.termPrefix}>$ </span>
                <span className={styles.cursor}>_</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Stats strip ══ */}
      <div className={styles.statsStrip}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ══ Features ══ */}
      <section className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Everything your team needs</h2>
          <p className={styles.sectionSub}>Built on proven VCS principles, extended with AI where it matters most.</p>
        </div>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureCard}>
              <div className={styles.featureIconWrap} style={{ '--feat-accent': f.accent }}>
                {f.icon}
              </div>
              <div className={styles.featureLabel}>{f.label}</div>
              <div className={styles.featureDesc}>{f.desc}</div>
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
            <div key={w.step} className={styles.workflowStep}>
              <div className={styles.stepNumber}>{w.step}</div>
              {i < WORKFLOW_STEPS.length - 1 && <div className={styles.stepConnector} />}
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{w.title}</div>
                <div className={styles.stepDesc}>{w.desc}</div>
                <div className={styles.stepCode}>
                  {w.code.split('\n').map((line, j) => (
                    <div key={j} className={styles.codeLine}>
                      <span className={styles.codePrompt}>$</span>
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
