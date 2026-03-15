import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './LandingPage.module.css'

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'AI Merge Resolution',
    desc: 'Automatically resolve complex merge conflicts using Gemini AI with a single command.',
    code: 'vega merge --ai',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    title: 'AI Commit Messages',
    desc: 'Generate meaningful, conventional commit messages from your staged changes automatically.',
    code: 'vega commit --ai',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" />
      </svg>
    ),
    title: 'Pull Request & Code Review',
    desc: 'Create, review, and approve pull requests with a modern web interface and inline diffs.',
    code: null,
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    title: 'Hadoop HDFS Storage',
    desc: 'Distributed repository storage with push/pull operations powered by Hadoop HDFS.',
    code: 'vega push my-repo',
  },
]

const STATS = [
  { value: 'Git-like', label: 'CLI Experience' },
  { value: 'AI', label: 'Powered Merges' },
  { value: 'HDFS', label: 'Distributed Storage' },
  { value: 'Web', label: 'UI & Code Review' },
]

export default function LandingPage() {
  const { token } = useAuth()

  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.heroBg} />
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.badge}>Open Source VCS</div>
            <h1 className={styles.title}>
              Version Control,<br />
              <span className={styles.gradient}>Reimagined with AI</span>
            </h1>
            <p className={styles.description}>
              VEGA is a full-featured, AI-powered version control system. Resolve merge conflicts automatically,
              generate commit messages, and deploy to Hadoop HDFS — all with a familiar Git-compatible CLI.
            </p>
            <div className={styles.heroCtas}>
              {token ? (
                <Link to="/repos" className={styles.ctaPrimary}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  View Repositories
                </Link>
              ) : (
                <>
                  <Link to="/login" className={styles.ctaPrimary}>
                    Get Started
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </Link>
                  <Link to="/docs" className={styles.ctaSecondary}>Read the Docs</Link>
                </>
              )}
            </div>
          </div>

          {!token && (
            <div className={styles.loginCard}>
              <div className={styles.loginCardInner}>
                <h2 className={styles.loginTitle}>Welcome back</h2>
                <p className={styles.loginSub}>Sign in to access your repositories</p>
                <Link to="/login" className={styles.loginBtn}>Sign in to VEGA</Link>
                <p className={styles.loginFooter}>
                  New user? <Link to="/register">Create account</Link>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className={styles.statsBar}>
          {STATS.map((s) => (
            <div key={s.label} className={styles.stat}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Core Capabilities</h2>
        <p className={styles.sectionSub}>Everything you need for modern version control, powered by AI.</p>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              {f.code && <code className={styles.featureCode}>{f.code}</code>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
