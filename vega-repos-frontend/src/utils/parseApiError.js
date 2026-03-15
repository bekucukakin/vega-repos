/**
 * Extracts a user-friendly error message from API error responses.
 * Handles: raw JSON strings, { error: "..." }, { message: "..." }, etc.
 */
export function parseApiError(err) {
  if (!err) return 'An error occurred.'
  const msg = typeof err === 'string' ? err : err?.message || String(err)
  // If message contains JSON, try to extract readable text
  const jsonMatch = msg.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const text = parsed.message || parsed.error || parsed.reason || parsed.detail
      if (text) return text
    } catch { /* ignore */ }
    // Fallback: if it looks like "Login failed: {...}", extract message from inner JSON
    const innerMatch = msg.match(/"message"\s*:\s*"([^"]+)"/)
    if (innerMatch) return innerMatch[1]
    const errMatch = msg.match(/"error"\s*:\s*"([^"]+)"/)
    if (errMatch) return errMatch[1]
  }
  return msg
}
