/**
 * Hexagon + V mark (same as Layout nav / favicon).
 * Pass a unique gradientId per mount so multiple SVGs on one page never clash.
 */
export default function VegaBrandMark({ gradientId, size = 36 }) {
  const url = `url(#${gradientId})`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#58a6ff" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path
        d="M16 2L27.5 8.5V21.5L16 28L4.5 21.5V8.5L16 2Z"
        fill="rgba(88,166,255,0.12)"
        stroke={url}
        strokeWidth="1.25"
      />
      <path
        d="M9.5 10L16 21L22.5 10"
        stroke={url}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="21" r="2" fill="#818cf8" />
    </svg>
  )
}
