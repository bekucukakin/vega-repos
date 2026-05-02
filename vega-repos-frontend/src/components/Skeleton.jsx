/** Generic skeleton block. Pass width/height as CSS strings. */
export function Skeleton({ width = '100%', height = '16px', style }) {
  return (
    <span
      className="skeleton"
      style={{ display: 'block', width, height, ...style }}
      aria-hidden="true"
    />
  )
}

/** Pre-built repo row skeleton */
export function RepoRowSkeleton() {
  return (
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Skeleton width="16px" height="16px" style={{ borderRadius: '3px', flexShrink: 0 }} />
        <Skeleton width="180px" height="15px" />
        <Skeleton width="48px" height="18px" style={{ borderRadius: '20px' }} />
      </div>
      <Skeleton width="280px" height="13px" />
      <Skeleton width="120px" height="11px" />
    </div>
  )
}

/** Pre-built commit row skeleton */
export function CommitRowSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <Skeleton width="40px" height="40px" style={{ borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Skeleton width="70%" height="14px" />
        <Skeleton width="40%" height="12px" />
      </div>
      <Skeleton width="70px" height="12px" />
    </div>
  )
}

/** Pre-built card skeleton */
export function CardSkeleton({ lines = 3 }) {
  return (
    <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton width="40%" height="16px" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${85 - i * 12}%`} height="13px" />
      ))}
    </div>
  )
}
