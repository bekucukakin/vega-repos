import { API_BASE } from '../config/api'

const DEFAULT_TIMEOUT_MS = 30_000

function withTimeout(promise, ms) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), ms)
  return { controller, tid, promise }
}

let _getAuthHeader = () => ({})

export function setAuthHeaderProvider(fn) {
  _getAuthHeader = fn
}

async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        ..._getAuthHeader(),
        ...options.headers,
      },
    })
    return res
  } finally {
    clearTimeout(tid)
  }
}

export const apiClient = {
  get: (path, opts, ms) => request(`${API_BASE}${path}`, { ...opts, method: 'GET' }, ms),
  post: (path, body, opts, ms) =>
    request(`${API_BASE}${path}`, {
      ...opts,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
      body: JSON.stringify(body),
    }, ms),
  put: (path, body, opts, ms) =>
    request(`${API_BASE}${path}`, {
      ...opts,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
      body: JSON.stringify(body),
    }, ms),
  delete: (path, opts, ms) =>
    request(`${API_BASE}${path}`, { ...opts, method: 'DELETE' }, ms),

  /** Direct fetch with full URL (e.g. for agent calls or external) */
  fetch: (url, opts, ms) => request(url, opts, ms),
}
