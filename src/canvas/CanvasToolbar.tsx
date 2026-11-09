import { Maximize, Minus, Plus, Workflow, ZoomIn } from 'lucide-react'
import { arrangeWithUndo } from '@/app/actions'
import { DETAIL_LEVELS } from '@/app/constants'
import { fitContent, setDetail, useDiagram } from '@/store/diagram'
import { FAR_ZOOM, READABLE_ZOOM, useViewport, zoomAt, zoomTo } from '@/store/viewport'
import { Button, IconButton } from '@/ui/Button'
import { Segmented } from '@/ui/Segmented'
import { Tooltip } from '@/ui/Tooltip'

export function CanvasToolbar() {
  const zoom = useViewport((s) => Math.round(s.k * 100))
  // Below this zoom the cards show names only, whatever the detail level says.
  const namesOnly = useViewport((s) => s.k < FAR_ZOOM)
  const auto = useDiagram((s) => s.auto)
  const detail = useDiagram((s) => s.detail)

  return (
    <div
      role="group"
      aria-label="Diagram view"
      data-canvas-interactive
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 rounded-[10px] bg-surface p-1 shadow-pop"
    >
      <IconButton
        label="Zoom out"
        shortcut="-"
        onClick={() => zoomAt(0.8, undefined, { animate: true })}
      >
        <Minus />
      </IconButton>
      <Tooltip label="Reset zoom to 100%" shortcut="0">
        <button
          type="button"
          aria-label={`Zoom is ${zoom}%. Reset to 100%`}
          className="h-8 w-12 rounded-control text-center font-mono text-xs text-ink-2 tabular-nums hover:bg-fill hover:text-ink"
          onClick={() => zoomTo(1, { animate: true })}
        >
          {zoom}%
        </button>
      </Tooltip>
      <IconButton
        label="Zoom in"
        shortcut="+"
        onClick={() => zoomAt(1.25, undefined, { animate: true })}
      >
        <Plus />
      </IconButton>

      <span aria-hidden className="mx-1 h-5 w-px bg-line" />

      <IconButton label="Fit diagram to screen" shortcut="1" onClick={() => fitContent(true)}>
        <Maximize />
      </IconButton>
      <IconButton
        label={auto ? 'Auto layout is on' : 'Tidy up layout'}
        shortcut="shift+A"
        active={auto}
        className="relative"
        onClick={() => void arrangeWithUndo()}
      >
        <Workflow />
        {/* The dot marks "on" by shape, so the state does not rest on colour alone. */}
        {auto && (
          <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />
        )}
      </IconButton>

      <span aria-hidden className="mx-1 h-5 w-px bg-line max-sm:hidden" />

      {namesOnly ? (
        // Saying "all columns" while none are drawn would be a lie; offer the way back.
        <Tooltip label="Columns are hidden below 50% zoom">
          <Button
            variant="ghost"
            className="h-8 px-2.5 text-xs max-sm:hidden"
            onClick={() => zoomTo(READABLE_ZOOM, { animate: true })}
          >
            <ZoomIn aria-hidden className="size-4" />
            Show columns
          </Button>
        </Tooltip>
      ) : (
        <Segmented
          label="Column detail"
          className="max-sm:hidden"
          value={detail}
          options={DETAIL_LEVELS}
          onChange={(next) => void setDetail(next)}
        />
      )}
    </div>
  )
}
