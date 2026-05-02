export function timeAgo(input) {
  if (!input) return null
  const d = typeof input === 'number' ? new Date(input) : new Date(input)
  if (isNaN(d)) return null
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 0) return formatDateShort(d)
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`
  return `${Math.floor(diff / 31536000)} years ago`
}

export function formatDateShort(input) {
  if (!input) return '—'
  try {
    return new Date(input).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return '—'
  }
}

export function formatDateTime(input) {
  if (!input) return '—'
  try {
    return new Date(input).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}
