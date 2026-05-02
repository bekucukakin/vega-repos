import { useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { API_BASE } from '../../config/api'
import styles from '../../pages/RepoDetailPage.module.css'

const ROLE_COLORS = {
  maintainer: '#f59e0b',
  reviewer:   '#6366f1',
  developer:  '#22c55e',
  reader:     '#6b7280',
}

const ROLE_LABELS = {
  maintainer: 'Maintainer',
  reviewer:   'Reviewer',
  developer:  'Developer',
  reader:     'Reader',
}

export default function CollaboratorsTab({
  username, repoName, headers, isOwner,
  collaborators, setCollaborators,
  pendingRequests, setPendingRequests,
  pendingInvites, setPendingInvites,
}) {
  const toast = useToast()
  const [newCollaborator, setNewCollaborator] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [addCollaboratorLoading, setAddCollaboratorLoading] = useState(false)
  const [collaboratorError, setCollaboratorError] = useState('')

  const handleSendInvite = (e) => {
    e.preventDefault()
    const toAdd = newCollaborator.trim()
    if (!toAdd) return
    setCollaboratorError('')
    setAddCollaboratorLoading(true)
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: toAdd, role: inviteRole }),
    })
      .then((r) => {
        if (r.ok) {
          setNewCollaborator('')
          toast.success(`Invite sent to ${toAdd}`)
          return fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/pending-invites`, { headers })
        }
        if (r.status === 400) throw new Error('User not found, already a collaborator, or invite already sent.')
        throw new Error('Failed to send invite.')
      })
      .then((r) => r.json())
      .then(setPendingInvites)
      .catch((err) => setCollaboratorError(err.message || 'Failed to send invite.'))
      .finally(() => setAddCollaboratorLoading(false))
  }

  const handleApprove = (r) => {
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/requests/${r.id}/approve`, {
      method: 'POST', headers,
    }).then((res) => {
      if (res.ok) {
        toast.success(`${r.requesterUsername} approved`)
        setPendingRequests((prev) => prev.filter((x) => x.id !== r.id))
        fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators`, { headers })
          .then((res2) => res2.ok ? res2.json() : [])
          .then(setCollaborators)
          .catch(() => {})
      } else {
        toast.error('Failed to approve request')
      }
    }).catch(() => toast.error('Failed to approve request'))
  }

  const handleReject = (r) => {
    fetch(`${API_BASE}/repos/${username}/${repoName}/collaborators/requests/${r.id}/reject`, {
      method: 'POST', headers,
    }).then((res) => {
      if (res.ok) {
        toast.info('Request rejected')
        setPendingRequests((prev) => prev.filter((x) => x.id !== r.id))
      } else {
        toast.error('Failed to reject request')
      }
    }).catch(() => toast.error('Failed to reject request'))
  }

  return (
    <section className={styles.section}>
      <h3>Collaborators</h3>

      {/* Invite */}
      <div className={styles.settingsBlock}>
        <div className={styles.settingRow}>
          <div style={{ flex: 1 }}>
            <strong>Invite a collaborator</strong>
            <p className={styles.settingHint}>
              Send an invite by username. The user will see it in Collaborator Requests and can accept to join.
            </p>
            {collaboratorError && <p className={styles.collabAlert} role="alert">{collaboratorError}</p>}
            <form onSubmit={handleSendInvite} className={styles.collabForm}>
              <input
                type="text"
                className={styles.settingInput}
                placeholder="Username (e.g. developer1)"
                value={newCollaborator}
                onChange={(e) => setNewCollaborator(e.target.value)}
              />
              <select
                className={styles.settingInput}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={{ width: 'auto', marginLeft: 8 }}
              >
                <option value="reader">Reader</option>
                <option value="developer">Developer</option>
                <option value="reviewer">Reviewer</option>
                {isOwner && <option value="maintainer">Maintainer</option>}
              </select>
              <button type="submit" disabled={addCollaboratorLoading} className={styles.btnSuccess}>
                {addCollaboratorLoading ? 'Sending...' : 'Send invite'}
              </button>
            </form>
            {inviteRole === 'developer' && (
              <p className={styles.roleHint}>
                Developers can push branches and create PRs. They cannot approve or merge without a reviewer.
              </p>
            )}
            {inviteRole === 'reviewer' && (
              <p className={styles.roleHint}>
                Reviewers can approve and reject PRs but cannot push code or create PRs.
              </p>
            )}
            {inviteRole === 'reader' && (
              <p className={styles.roleHint}>
                Readers have read-only access — they can view code and PRs but cannot write.
              </p>
            )}
            {inviteRole === 'maintainer' && (
              <p className={styles.roleHint}>
                Maintainers have full access except deleting the repository. They can manage collaborators but cannot grant Maintainer to others.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pending Invites */}
      <div className={styles.settingsBlock} style={{ marginTop: 'var(--space-5)' }}>
        <strong>Pending invites</strong>
        <p className={styles.settingHint}>Users you&apos;ve invited who haven&apos;t responded yet.</p>
        {pendingInvites.length === 0 ? (
          <p className={styles.collabEmpty}>No pending invites.</p>
        ) : (
          <div className={styles.collabList}>
            {pendingInvites.map((r) => (
              <div key={r.id} className={styles.collabItem}>
                <span className={styles.collabName}>{r.requesterUsername}</span>
                <span className={styles.collabBadgeWaiting}>Waiting</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Access Requests */}
      <div className={styles.settingsBlock} style={{ marginTop: 'var(--space-5)' }}>
        <strong>Access requests</strong>
        <p className={styles.settingHint}>Users who requested access to this repository.</p>
        {pendingRequests.length === 0 ? (
          <p className={styles.collabEmpty}>No pending requests.</p>
        ) : (
          <div className={styles.collabList}>
            {pendingRequests.map((r) => (
              <div key={r.id} className={styles.collabItem}>
                <span className={styles.collabName}>{r.requesterUsername}</span>
                <div className={styles.collabItemActions}>
                  <button type="button" className={styles.btnSuccessSmall} onClick={() => handleApprove(r)}>
                    Approve
                  </button>
                  <button type="button" className={styles.btnDangerSmall} onClick={() => handleReject(r)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Collaborators */}
      <div className={styles.settingsBlock} style={{ marginTop: 'var(--space-5)' }}>
        <strong>Active collaborators</strong>
        <p className={styles.settingHint}>Users with access to this repository.</p>
        {collaborators.length === 0 ? (
          <p className={styles.collabEmpty}>No collaborators yet. Accepted invites will appear here.</p>
        ) : (
          <div className={styles.collabList}>
            {collaborators.map((c) => (
              <div key={c.id} className={styles.collabItem}>
                <span className={styles.collabName}>{c.username}</span>
                <span className={styles.roleBadge} style={{ background: ROLE_COLORS[c.role] ?? '#22c55e' }}>
                  {ROLE_LABELS[c.role] ?? 'Developer'}
                </span>
                {c.role === 'developer' && (
                  <span className={c.canCreatePr ? styles.prBadgeOn : styles.prBadgeOff}>
                    {c.canCreatePr ? 'Can create PR' : 'No PR access'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
