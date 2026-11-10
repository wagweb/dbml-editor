import { useEffect, useState } from 'react'

/** A flag that turns itself off again, e.g. to say "Copied" on the button that copied. */
export function useFlash(ms = 1600): [on: boolean, flash: () => void] {
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => setOn(0), ms)
    return () => clearTimeout(timer)
  }, [on, ms])
  // A counter, so flashing again while on restarts the time.
  return [on > 0, () => setOn((n) => n + 1)]
}
