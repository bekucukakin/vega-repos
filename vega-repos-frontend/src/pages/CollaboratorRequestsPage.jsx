import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './CollaboratorRequestsPage.module.css'

const API_BASE = '/api'

export default function CollaboratorRequestsPage() {
  const { user, getAuthHeader } = useAuth()
  const [requests, setRequests] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    Promise.all([
      fetch(`${API_BASE}/collaborator-requests`, { headers: getAuthHeader() }),
      fetch(`${API_BASE}/collaborator-invites`, { headers: getAuthHeader() }),
    ])
      .then(([r1, r2]) => Promise.all([
        r1.ok ? r1.json() : [],
        r2.ok ? r2.json() : [],
      ]))
      .then(([reqs, invs]) => {
        setRequests(Array.isArray(reqs) ? reqs : [])
        setInvites(Array.isArray(invs) ? invs : [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!user?.username) return
    load()
  }, [user?.username, getAuthHeader])

  const handleApprove = (req) => {
    fetch(`${API_BASE}/repos/${req.ownerUsername}/${req.repoName}/collaborators/requests/${req.id}/approve`, {
      method: 'POST',
      headers: getAuthHeader(),
    })
      .then((r) => r.ok ? load() : Promise.reject())
      .catch(() => setError('Failed to approve'))
  }

  const handleReject = (req) => {
    fetch(`${API_BASE}/repos/${req.ownerUsername}/${req.repoName}/collaborators/requests/${req.id}/reject`, {
      method: 'POST',
      headers: getAuthHeader(),
    })
      .then((r) => r.ok ? load() : Promise.reject())
      .catch(() => setError('Failed to reject'))
  }

  const handleAcceptInvite = (inv) => {
    fetch(`${API_BASE}/collaborator-invites/${inv.id}/accept`, {
      method: 'POST',
      headers: getAuthHeader(),
    })
      .then((r) => r.ok ? load() : Promise.reject())
      .catch(() => setError('Failed to accept invite'))
  }

  const handleRejectInvite = (inv) => {
    fetch(`${API_BASE}/collaborator-invites/${inv.id}/reject`, {
      method: 'POST',
      headers: getAuthHeader(),
    })
      .then((r) => r.ok ? load() : Promise.reject())
      .catch(() => setError('Failed to reject invite'))
  }

  if (loading) return <div className={styles.loading}>Loading...</div>

  return (
    <div className={styles.container}>
      <h1>Collaborator Requests</h1>
      <p className={styles.subtitle}>Manage invitations and access requests for your repositories.</p>

      {error && <p className={styles.alert}>{error}</p>}

      {/* Invites for you */}
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <strong>Invites for you</strong>
          <span className={styles.count}>{invites.length}</span>
        </div>
        <p className={styles.blockHint}>Repositories you were invited to collaborate on.</p>
        {invites.length === 0 ? (
          <p className={styles.empty}>No pending invites.</p>
        ) : (
          <div className={styles.list}>
            {invites.map((r) => (
              <div key={r.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemTitle}>
                    <strong>{r.ownerUsername}</strong> invited you to{' '}
                    <Link to={`/repos/${r.ownerUsername}/${r.repoName}`} className={styles.repoLink}>
                      {r.ownerUsername}/{r.repoName}
                    </Link>
                  </span>
                  {r.createdAt && (
                    <span className={styles.itemDate}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
                <div className={styles.itemActions}>
                  <button onClick={() => handleAcceptInvite(r)} className={styles.btnAccept}>Accept</button>
                  <button onClick={() => handleRejectInvite(r)} className={styles.btnReject}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Requests for your repos */}
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <strong>Access requests for your repos</strong>
          <span className={styles.count}>{requests.length}</span>
        </div>
        <p className={styles.blockHint}>Users who requested access to your repositories.</p>
        {requests.length === 0 ? (
          <p className={styles.empty}>No pending requests.</p>
        ) : (
          <div className={styles.list}>
            {requests.map((r) => (
              <div key={r.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemTitle}>
                    <strong>{r.requesterUsername}</strong> requested access to{' '}
                    <Link to={`/repos/${r.ownerUsername}/${r.repoName}`} className={styles.repoLink}>
                      {r.ownerUsername}/{r.repoName}
                    </Link>
                  </span>
                  {r.message && <span className={styles.itemMsg}>{r.message}</span>}
                  {r.createdAt && (
                    <span className={styles.itemDate}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
                <div className={styles.itemActions}>
                  <button onClick={() => handleApprove(r)} className={styles.btnAccept}>Approve</button>
                  <button onClick={() => handleReject(r)} className={styles.btnReject}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
