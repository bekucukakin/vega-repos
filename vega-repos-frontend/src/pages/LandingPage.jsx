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

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" />
      </svg>
    ),
    label: 'Branching & Merging',
    desc: 'Full branch management with AI-powered conflict resolution via Google Gemini.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    label: 'AI Commit Messages',
    desc: 'Generate meaningful commit messages from staged diffs automatically.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    label: 'Pull Requests & Review',
    desc: 'Code review with inline diffs, risk analysis, and automated metrics.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    label: 'Distributed Storage',
    desc: 'Push and pull repositories backed by Apache Hadoop HDFS.',
  },
]

export default function LandingPage() {
  const { token } = useAuth()

  return (
    <div className={styles.page}>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.pill}>Version Control · AI · HDFS</div>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Go to Repositories
              </Link>
            ) : (
              <>
                <Link to="/login" className={styles.btnPrimary}>
                  Get started
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
                <Link to="/docs" className={styles.btnSecondary}>Documentation</Link>
              </>
            )}
          </div>
        </div>

        {/* Terminal mockup */}
        <div className={styles.terminal}>
          <div className={styles.terminalBar}>
            <span className={styles.dot} style={{ background: '#ff5f57' }} />
            <span className={styles.dot} style={{ background: '#febc2e' }} />
            <span className={styles.dot} style={{ background: '#28c840' }} />
            <span className={styles.terminalTitle}>zsh — vega</span>
          </div>
          <div className={styles.terminalBody}>
            {TERMINAL_LINES.map((line, i) => (
              <div key={i} className={`${styles.termLine} ${line.dim ? styles.dimLine : ''} ${line.success ? styles.successLine : ''}`}>
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
      </section>

      {/* ── Features ── */}
      <section className={styles.features}>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureItem}>
              <div className={styles.featureIconWrap}>{f.icon}</div>
              <div>
                <div className={styles.featureLabel}>{f.label}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Auth CTA (unauthenticated only) ── */}
      {!token && (
        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <div>
              <h2 className={styles.ctaTitle}>Ready to get started?</h2>
              <p className={styles.ctaSub}>Create a free account and push your first repository in minutes.</p>
            </div>
            <div className={styles.ctaActions}>
              <Link to="/register" className={styles.btnPrimary}>Create account</Link>
              <Link to="/login" className={styles.btnSecondary}>Sign in</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
