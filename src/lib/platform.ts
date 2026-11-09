export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Keys of a shortcut as shown on this platform, e.g. `mod+K` is `⌘`, `K` on macOS. */
export function shortcutKeys(shortcut: string): string[] {
  // "+" names the plus key itself; "shift++" would be shift and plus.
  const parts = shortcut === '+' ? ['+'] : shortcut.replace(/\+\+$/, '+plus').split('+')
  return parts.map((part) => {
    if (part === 'plus') return '+'
    if (part === 'mod') return isMac ? '⌘' : 'Ctrl'
    if (part === 'shift') return isMac ? '⇧' : 'Shift'
    if (part === 'alt') return isMac ? '⌥' : 'Alt'
    return part.length === 1 ? part.toUpperCase() : part
  })
}

/** Human readable shortcut, e.g. `mod+K` becomes `⌘K` on macOS and `Ctrl K` elsewhere. */
export function shortcutLabel(shortcut: string): string {
  return shortcutKeys(shortcut).join(isMac ? '' : ' ')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
