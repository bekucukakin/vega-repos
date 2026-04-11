const GENERIC_SERVER = 'Something went wrong. Please try again.'

/** Hide JDBC/SQL/stack fragments that should never appear in the UI. */
function looksLikeInternalLeak(msg) {
  const s = String(msg).toLowerCase()
  return (
    s.includes('jdbc')
    || s.includes('hibernate')
    || s.includes('sql')
    || s.includes('preparedstatement')
    || s.includes('could not prepare statement')
    || s.includes('could not execute statement')
    || s.includes('repo_collaborator')
    || /\[42\d{2}/.test(msg)
    || /\[235\d{2}/.test(msg)
    || (s.includes('select ') && s.includes(' from '))
  )
}

/**
 * Extracts a user-friendly error message from API error responses.
 * Handles: raw JSON strings, { error: "..." }, { message: "..." }, etc.
 */
export function parseApiError(err) {
  if (!err) return 'An error occurred.'
  if (typeof err === 'object' && err?.name === 'AbortError') {
    return 'Request timed out. Check that Vega Repos API and user service are running and reachable.'
  }
  const msg = typeof err === 'string' ? err : err?.message || String(err)
  if (looksLikeInternalLeak(msg)) {
    return GENERIC_SERVER
  }
  // If message contains JSON, try to extract readable text
  const jsonMatch = msg.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const text = parsed.message || parsed.error || parsed.reason || parsed.detail
      if (text) return looksLikeInternalLeak(text) ? GENERIC_SERVER : text
    } catch { /* ignore */ }
    // Fallback: if it looks like "Login failed: {...}", extract message from inner JSON
    const innerMatch = msg.match(/"message"\s*:\s*"([^"]+)"/)
    if (innerMatch) {
      const inner = innerMatch[1]
      return looksLikeInternalLeak(inner) ? GENERIC_SERVER : inner
    }
    const errMatch = msg.match(/"error"\s*:\s*"([^"]+)"/)
    if (errMatch) {
      const inner = errMatch[1]
      return looksLikeInternalLeak(inner) ? GENERIC_SERVER : inner
    }
  }
  return looksLikeInternalLeak(msg) ? GENERIC_SERVER : msg
}
