import { Link } from 'react-router-dom'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <div className={styles.inner}>
        <div className={styles.code}>404</div>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.sub}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.btnPrimary}>Go home</Link>
          <Link to="/repos" className={styles.btnSecondary}>Your repositories</Link>
        </div>
        <div className={styles.terminal}>
          <span className={styles.prompt}>❯ </span>
          <span className={styles.cmd}>vega navigate /404</span>
          <div className={styles.output}>Error: path not found in remote</div>
        </div>
      </div>
    </div>
  )
}
