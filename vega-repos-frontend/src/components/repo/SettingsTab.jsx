import { useToast } from '../../context/ToastContext'
import { API_BASE } from '../../config/api'
import styles from '../../pages/RepoDetailPage.module.css'

export default function SettingsTab({ username, repoName, headers, repo, setRepo }) {
  const toast = useToast()

  const toggleVisibility = async () => {
    const newVal = !repo.isPublic
    try {
      const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/settings`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newVal }),
      })
      if (r.ok) {
        setRepo({ ...repo, isPublic: newVal })
        toast.success(`Repository is now ${newVal ? 'public' : 'private'}`)
      } else {
        toast.error('Failed to update visibility')
      }
    } catch {
      toast.error('Failed to update visibility')
    }
  }

  const saveDescription = async (desc) => {
    try {
      const r = await fetch(`${API_BASE}/repos/${username}/${repoName}/settings`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: repo.isPublic, description: desc }),
      })
      if (r.ok) {
        setRepo({ ...repo, description: desc })
        toast.success('Description saved')
      } else {
        toast.error('Failed to save description')
      }
    } catch {
      toast.error('Failed to save description')
    }
  }

  return (
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
            onClick={toggleVisibility}
          >
            {repo.isPublic ? 'Make Private' : 'Make Public'}
          </button>
        </div>
        <div className={styles.settingRow}>
          <div style={{ flex: 1 }}>
            <strong>Description</strong>
            <input
              type="text"
              className={styles.settingInput}
              placeholder="Add a short description..."
              defaultValue={repo.description || ''}
              onBlur={(e) => saveDescription(e.target.value.trim())}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
