import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { goToStop, presentStops, stopPresenting } from '@/app/present'
import { useDiagram } from '@/store/diagram'
import { shownDiagram } from '@/store/documents'
import { useUi } from '@/store/ui'
import { useViewport } from '@/store/viewport'
import { Button, IconButton } from '@/ui/Button'
import { Kbd } from '@/ui/Kbd'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' '])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp'])

/** Steps through the diagram while presenting; the keys work wherever focus is. */
export function PresentBar() {
  const stop = useUi((s) => s.presentStop)
  const model = useDiagram((s) => s.model)
  const width = useViewport((s) => s.width)
  const height = useViewport((s) => s.height)
  const stops = useMemo(() => presentStops(model, shownDiagram()?.name ?? 'Diagram'), [model])
  const current = stops[Math.min(stop, stops.length - 1)]!
  const last = stops.length - 1

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { presentStop } = useUi.getState()
      // Space still presses a focused button, e.g. "Exit".
      const onButton = event.target instanceof Element && event.target.closest('button')
      let next: number | null = null
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        stopPresenting()
        return
      }
      if (NEXT_KEYS.has(event.key) && !(event.key === ' ' && onButton)) next = presentStop + 1
      else if (PREVIOUS_KEYS.has(event.key)) next = presentStop - 1
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = Number.MAX_SAFE_INTEGER
      if (next === null) return
      event.preventDefault()
      // The canvas would otherwise pan with the same arrow keys.
      event.stopPropagation()
      goToStop(next)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // Full screen arrives a moment after the presentation starts; frame the stop again.
  useEffect(() => {
    const timer = setTimeout(() => goToStop(useUi.getState().presentStop), 120)
    return () => clearTimeout(timer)
  }, [width, height])

  return (
    <>
      {'note' in current && current.note && (
        <p className="absolute bottom-[72px] left-1/2 z-10 w-max max-w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-panel bg-surface px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2 shadow-pop">
          {current.note}
        </p>
      )}
      <div
        role="group"
        aria-label="Presentation"
        data-canvas-interactive
        className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 rounded-[10px] bg-surface p-1 shadow-pop"
      >
        <IconButton
          label="Previous"
          shortcut="←"
          disabled={stop === 0}
          onClick={() => goToStop(stop - 1)}
        >
          <ChevronLeft />
        </IconButton>
        {/* Announced on every step, so the position is clear without seeing the screen. */}
        <p
          aria-live="polite"
          className="flex h-8 min-w-44 items-center justify-center gap-2 px-2 text-[13px]"
        >
          <span className="max-w-64 truncate font-semibold text-ink">{current.title}</span>
          <span className="shrink-0 text-xs text-ink-3 tabular-nums">
            {stop + 1} of {stops.length}
          </span>
        </p>
        <IconButton
          label="Next"
          shortcut="→"
          disabled={stop >= last}
          onClick={() => goToStop(stop + 1)}
        >
          <ChevronRight />
        </IconButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <Button variant="ghost" className="h-8 gap-2 px-2.5 text-xs" onClick={stopPresenting}>
          Exit
          <Kbd shortcut="Esc" tone="muted" />
        </Button>
      </div>
    </>
  )
}
