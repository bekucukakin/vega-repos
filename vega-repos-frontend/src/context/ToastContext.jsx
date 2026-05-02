import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++counter.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const toast = useMemo(() => ({
    success: (msg, dur) => show(msg, 'success', dur),
    error:   (msg, dur) => show(msg, 'error', dur ?? 5000),
    info:    (msg, dur) => show(msg, 'info', dur),
    warn:    (msg, dur) => show(msg, 'warn', dur),
  }), [show])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/* ── Internal toast list rendered at root ── */
function ToastContainer({ toasts, dismiss }) {
  if (toasts.length === 0) return null
  return (
    <div style={containerStyle}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

const ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  warn: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
}

const COLORS = {
  success: { bg: 'rgba(63,185,80,0.12)', border: 'rgba(63,185,80,0.3)', icon: '#3fb950' },
  error:   { bg: 'rgba(248,81,73,0.12)', border: 'rgba(248,81,73,0.3)', icon: '#f85149' },
  warn:    { bg: 'rgba(210,153,34,0.12)', border: 'rgba(210,153,34,0.3)', icon: '#d29922' },
  info:    { bg: 'rgba(88,166,255,0.12)', border: 'rgba(88,166,255,0.3)', icon: '#58a6ff' },
}

function Toast({ toast, onDismiss }) {
  const c = COLORS[toast.type] || COLORS.info
  return (
    <div style={{ ...toastStyle, background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ color: c.icon, flexShrink: 0 }}>{ICONS[toast.type]}</span>
      <span style={{ fontSize: '0.875rem', color: '#e6edf3', lineHeight: 1.5, flex: 1 }}>
        {toast.message}
      </span>
      <button onClick={onDismiss} style={closeStyle} aria-label="Dismiss">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

const containerStyle = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  zIndex: 9999,
  maxWidth: '380px',
  width: 'calc(100vw - 48px)',
}

const toastStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px 14px',
  borderRadius: '10px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  animation: 'toastIn 0.22s cubic-bezier(0.16,1,0.3,1) both',
}

const closeStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.35)',
  padding: 0,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
}
