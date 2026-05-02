import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config/api'
import styles from './PrComments.module.css'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - Number(ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function CommentItem({ comment, currentUser, onDelete, onReply, depth = 0, replies, allComments }) {
  const childReplies = allComments.filter((c) => c.parentCommentId === comment.id)
  return (
    <div className={styles.commentItem} style={{ marginLeft: depth > 0 ? '1.5rem' : 0 }}>
      <div className={styles.commentHeader}>
        <span className={styles.commentAuthor}>{comment.author}</span>
        <span className={styles.commentTime}>{timeAgo(comment.createdAt)}</span>
        {comment.filePath && (
          <span className={styles.commentFile}>{comment.filePath}{comment.lineNumber != null ? `:${comment.lineNumber}` : ''}</span>
        )}
        <div className={styles.commentActions}>
          {depth === 0 && (
            <button className={styles.replyBtn} onClick={() => onReply(comment.id)}>Reply</button>
          )}
          {currentUser === comment.author && (
            <button className={styles.deleteBtn} onClick={() => onDelete(comment.id)}>Delete</button>
          )}
        </div>
      </div>
      <div className={styles.commentBody}>{comment.content}</div>
      {childReplies.length > 0 && (
        <div className={styles.replies}>
          {childReplies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              currentUser={currentUser}
              onDelete={onDelete}
              onReply={() => {}}
              depth={depth + 1}
              allComments={allComments}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PrComments({ ownerUsername, repoName, prId, currentUser, headers }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [error, setError] = useState('')

  const endpoint = `${API_BASE}/repos/${ownerUsername}/${repoName}/pull-requests/${prId}/comments`

  const load = useCallback(() => {
    fetch(endpoint, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [endpoint, headers])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          parentCommentId: replyTo ?? null,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const created = await res.json()
      setComments((prev) => [...prev, created])
      setText('')
      setReplyTo(null)
    } catch (err) {
      setError(`Failed to post comment: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId) => {
    const res = await fetch(`${endpoint}/${commentId}`, { method: 'DELETE', headers })
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  // Only top-level comments in the list (replies are nested)
  const topLevel = comments.filter((c) => !c.parentCommentId)

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>
        Comments <span className={styles.count}>{comments.length}</span>
      </h3>

      {loading ? (
        <p className={styles.loading}>Loading comments…</p>
      ) : topLevel.length === 0 ? (
        <p className={styles.empty}>No comments yet. Be the first to comment.</p>
      ) : (
        <div className={styles.list}>
          {topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUser={currentUser}
              onDelete={handleDelete}
              onReply={(id) => setReplyTo(id)}
              depth={0}
              allComments={comments}
            />
          ))}
        </div>
      )}

      {currentUser && (
        <form className={styles.form} onSubmit={handleSubmit}>
          {replyTo != null && (
            <div className={styles.replyBanner}>
              Replying to comment #{replyTo}
              <button type="button" className={styles.cancelReply} onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <textarea
            className={styles.textarea}
            placeholder="Write a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={submitting}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting || !text.trim()}>
              {submitting ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
