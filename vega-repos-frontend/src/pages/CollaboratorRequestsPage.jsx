import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { API_BASE } from '../config/api'
import styles from './CollaboratorRequestsPage.module.css'

export default function CollaboratorRequestsPage() {
  const { user, getAuthHeader } = useAuth()
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    Promise.all([
      fetch(`${API_BASE}/collaborator-requests`, { headers: getAuthHeader() }),
      fetch(`${API_BASE}/collaborator-invites`, { headers: getAuthHeader() }),
    ])
      .then(async ([r1, r2]) => {
        if (r1.status === 401 || r2.status === 401) throw new Error('Unauthorized — please log in again.')
        if (r1.status === 403 || r2.status === 403) throw new Error('Forbidden — you do not have permission.')
        const reqs = r1.ok ? await r1.json() : []
        const invs = r2.ok ? await r2.json() : []
        setRequests(Array.isArray(reqs) ? reqs : [])
        setInvites(Array.isArray(invs) ? invs : [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [getAuthHeader])

  useEffect(() => {
    if (!user?.username) return
    load()
  }, [user?.username, load])

  const handleRequest = (url, method, successMsg, errorMsg) =>
    fetch(url, { method, headers: getAuthHeader() })
      .then((r) => {
        if (r.ok) { toast.success(successMsg); return load() }
        if (r.status === 401) return toast.error('Unauthorized — please log in again.')
        if (r.status === 403) return toast.error('Forbidden — you do not have permission for this action.')
        if (r.status === 404) return toast.warn('Not found — the request may have already been processed.')
        return toast.error(`${errorMsg} (${r.status})`)
      })
      .catch((e) => toast.error(e.message || errorMsg))

  const handleApprove = (req) =>
    handleRequest(
      `${API_BASE}/repos/${req.ownerUsername}/${req.repoName}/collaborators/requests/${req.id}/approve`,
      'POST', 'Access request approved', 'Failed to approve request'
    )

  const handleReject = (req) =>
    handleRequest(
      `${API_BASE}/repos/${req.ownerUsername}/${req.repoName}/collaborators/requests/${req.id}/reject`,
      'POST', 'Access request rejected', 'Failed to reject request'
    )

  const handleAcceptInvite = (inv) =>
    handleRequest(`${API_BASE}/collaborator-invites/${inv.id}/accept`, 'POST', 'Invite accepted!', 'Failed to accept invite')

  const handleRejectInvite = (inv) =>
    handleRequest(`${API_BASE}/collaborator-invites/${inv.id}/reject`, 'POST', 'Invite declined', 'Failed to decline invite')

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
                    {r.role && (
                      <span className={styles.roleBadge}>{r.role}</span>
                    )}
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
