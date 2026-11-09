/** Two tables and the relation between them; the relation carries the accent colour. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <rect x="2" y="2" width="7" height="7" rx="1.75" fill="currentColor" />
      <path
        d="M5.5 9v3.5a2 2 0 0 0 2 2H11"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="11.75"
        y="11.25"
        width="6.5"
        height="6.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}
