import { useEffect, useState } from 'react'

/**
 * Keeps the last value on screen for its exit animation after it went away. `leaving` is
 * true in that time, so the element can play its way out and stop taking input.
 */
export function usePresence<T>(
  value: T | null | undefined,
  exitMs: number,
): { shown: T | null; leaving: boolean } {
  const present = value ?? null
  const [last, setLast] = useState<T | null>(present)
  const [gone, setGone] = useState(present === null)

  // Adjusted while rendering, the way React recommends for state that follows a prop.
  if (present !== null && (present !== last || gone)) {
    setLast(present)
    setGone(false)
  }

  useEffect(() => {
    if (present !== null) return
    const timer = setTimeout(() => setGone(true), exitMs)
    return () => clearTimeout(timer)
  }, [present, exitMs])

  if (present !== null) return { shown: present, leaving: false }
  return gone ? { shown: null, leaving: false } : { shown: last, leaving: last !== null }
}
