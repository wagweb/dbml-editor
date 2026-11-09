import { cn } from '@/lib/cn'
import { shortcutKeys } from '@/lib/platform'

/** Modifier symbols are drawn small in most fonts; they get a size up to match the letters. */
const SYMBOLS = new Set(['⌘', '⇧', '⌥', '↵'])

interface KbdProps {
  /** Shortcut in `mod+K` notation, rendered for the current platform. */
  shortcut: string
  /** Text only, for places where a row of keycaps would be too loud (menus, tooltips). */
  plain?: boolean
  className?: string
}

/**
 * A keyboard shortcut as a small keycap. The cap is a tint of the text colour, so it works
 * on any surface, including inverted ones.
 */
export function Kbd({ shortcut, plain, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-sans text-[11px] leading-none font-medium text-ink-2',
        !plain &&
          'h-5 min-w-5 rounded-[5px] bg-[color-mix(in_oklab,currentColor_10%,transparent)] px-1.5',
        className,
      )}
    >
      {/* Trimmed to cap height, so the keys sit in the optical centre of the cap. */}
      <span className="flex items-center gap-[3px] [text-box:trim-both_cap_alphabetic]">
        {shortcutKeys(shortcut).map((key, index) => (
          <span key={index} className={SYMBOLS.has(key) ? 'text-[12px]' : undefined}>
            {key}
          </span>
        ))}
      </span>
    </kbd>
  )
}
