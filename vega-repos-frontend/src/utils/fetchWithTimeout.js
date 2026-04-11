const DEFAULT_MS = 30_000

/**
 * fetch that always settles within timeoutMs (AbortController), so UI loading states cannot hang forever.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_MS) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(tid)
  }
}
