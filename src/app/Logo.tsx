/**
 * App icon: two tables that share a key. The overlap, the relation, is the solid part.
 * The tile takes the ink colour and the drawing the canvas colour, so the icon flips with
 * the theme like the primary button. Keep `public/favicon.svg` in sync with the drawing.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="7.5" fill="var(--ink)" />
      <g stroke="var(--canvas)" strokeWidth="2">
        <rect x="6.75" y="6.75" width="12.5" height="12.5" rx="3.25" />
        <rect x="12.75" y="12.75" width="12.5" height="12.5" rx="3.25" />
      </g>
      <rect x="12.75" y="12.75" width="6.5" height="6.5" rx="1" fill="var(--canvas)" />
    </svg>
  )
}
