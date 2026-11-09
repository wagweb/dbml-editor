export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Human readable shortcut, e.g. `mod+K` becomes `⌘K` on macOS and `Ctrl K` elsewhere. */
export function shortcutLabel(shortcut: string): string {
  const parts = shortcut.split('+').map((part) => {
    if (part === 'mod') return isMac ? '⌘' : 'Ctrl'
    if (part === 'shift') return isMac ? '⇧' : 'Shift'
    if (part === 'alt') return isMac ? '⌥' : 'Alt'
    return part.length === 1 ? part.toUpperCase() : part
  })
  return parts.join(isMac ? '' : ' ')
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
