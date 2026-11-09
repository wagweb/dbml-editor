import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Kbd } from './Kbd'
import { useUi } from '@/store/ui'

const VISIBLE_MS = 6000
/** Messages that offer an undo stay longer, so there is time to reach the button. */
const VISIBLE_WITH_ACTION_MS = 12_000

/** One message at a time, announced politely to assistive technology. */
export function Toaster() {
  const toast = useUi((s) => s.toast)
  const dismissToast = useUi((s) => s.dismissToast)
  // The countdown stops while the pointer or keyboard focus is on the message.
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!toast || held) return
    const timer = setTimeout(
      () => dismissToast(toast.id),
      toast.action ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS,
    )
    return () => clearTimeout(timer)
  }, [toast, held, dismissToast])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex min-h-10 max-w-md animate-pop-in items-center gap-3 rounded-lg bg-ink py-1.5 pr-1.5 pl-3.5 text-[13px] font-medium text-canvas shadow-lg',
            toast.tone === 'error' && 'bg-danger text-white',
          )}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-md bg-canvas/15 px-2.5 text-xs font-semibold hover:bg-canvas/25"
              onClick={() => {
                toast.action?.run()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
              <Kbd shortcut="mod+Z" className="h-[18px] text-current" />
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-canvas/15"
            onClick={() => dismissToast(toast.id)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
