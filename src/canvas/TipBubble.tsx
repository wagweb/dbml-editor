import { Lightbulb } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { dismissTip, useTips, type TipId } from '@/app/tips'
import { useDiagram } from '@/store/diagram'
import { Button } from '@/ui/Button'
import { Kbd } from '@/ui/Kbd'

const TEXT: Record<TipId, ReactNode> = {
  path: (
    <>
      <Kbd shortcut="shift" className="relative -top-px align-middle" /> click another table to see
      how the two connect.
    </>
  ),
  rename: (
    <>
      Double-click a table or column name to rename it. The code follows, and{' '}
      <Kbd shortcut="mod+Z" className="relative -top-px align-middle" /> takes it back.
    </>
  ),
  link: <>Drag the dot at the end of a row onto another column to add a relation.</>,
}

/** A one-time hint about a gesture, shown above the toolbar right after it becomes useful. */
export function TipBubble() {
  const tip = useTips((s) => s.current)
  const selected = useDiagram((s) => s.selectedTableId !== null)
  const pathAsked = useDiagram((s) => s.pathTargetId !== null)

  // The tip is about the selected table; it goes when the selection goes, or once used.
  useEffect(() => {
    if (!selected || (tip === 'path' && pathAsked)) dismissTip()
  }, [selected, pathAsked, tip])

  if (!tip) return null
  return (
    <div
      role="status"
      data-canvas-interactive
      className="absolute bottom-[68px] left-1/2 z-10 flex w-max max-w-[min(440px,calc(100%-24px))] -translate-x-1/2 animate-pop-in items-center gap-3 rounded-panel bg-surface py-1.5 pr-1.5 pl-3 text-[13px] text-ink-2 shadow-pop"
    >
      <Lightbulb aria-hidden className="size-4 shrink-0 text-accent" />
      <p className="min-w-0 leading-snug">{TEXT[tip]}</p>
      <Button variant="ghost" className="h-7 shrink-0 px-2.5 text-xs" onClick={dismissTip}>
        Got it
      </Button>
    </div>
  )
}
