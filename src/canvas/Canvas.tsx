import { TriangleAlert } from 'lucide-react'
import { memo, useEffect, useMemo, useRef } from 'react'
import { goToFirstProblem, loadSampleHere } from '@/app/actions'
import { SAMPLES } from '@/dbml/samples'
import { refColumnsByTable } from '@/layout/geometry'
import { tableTones } from '@/layout/groups'
import { fitContent, useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { FAR_ZOOM, OVERVIEW_ZOOM, useViewport } from '@/store/viewport'
import { Button } from '@/ui/Button'
import { CanvasChips } from './CanvasChips'
import { CanvasToolbar } from './CanvasToolbar'
import { EdgeLayer } from './EdgeLayer'
import { EdgeTooltip } from './EdgeTooltip'
import { GroupLayer, GroupOverviewLabels } from './GroupLayer'
import { Inspector } from './Inspector'
import { Minimap } from './Minimap'
import { TableNode } from './TableNode'
import { useCanvasGestures } from './useCanvasGestures'

const GRID = 32

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export const Canvas = memo(function Canvas() {
  const viewportRef = useRef<HTMLElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const ready = useDiagram((s) => s.ready)
  const stale = useDiagram((s) => s.stale)
  const animating = useDiagram((s) => s.animating)
  const minimapOpen = useUi((s) => s.minimapOpen)

  useCanvasGestures(viewportRef)

  // The camera is applied straight to the DOM; panning must not re-render React.
  useEffect(() => {
    const fonts = { lod: '', group: '' }
    const apply = () => {
      const { x, y, k } = useViewport.getState()
      const world = worldRef.current
      const grid = gridRef.current
      if (!world || !grid) return
      world.style.transform = `translate(${x}px, ${y}px) scale(${k})`
      const lod = k < OVERVIEW_ZOOM ? 'overview' : k < FAR_ZOOM ? 'far' : 'near'
      if (world.dataset.lod !== lod) world.dataset.lod = lod

      // World size a label needs to read as about 11.5px on screen. Labels use it up to
      // the size that still fits their box. A custom property restyles everything below
      // the world, so it is only written when the rounded value changes.
      const need = String(Math.round(11.5 / k))
      const groupFont = `${clamp(Math.round(10.5 / k), 12, 28)}px`
      if (fonts.lod !== need) world.style.setProperty('--lod-need', (fonts.lod = need))
      if (fonts.group !== groupFont) {
        world.style.setProperty('--group-font', (fonts.group = groupFont))
      }

      // Thin out the marks when zoomed out so they never turn into noise.
      const size = GRID * k * (k < 0.25 ? 4 : k < 0.55 ? 2 : 1)
      grid.style.setProperty('--grid-size', `${size}px`)
      grid.style.setProperty('--grid-x', `${x % size}px`)
      grid.style.setProperty('--grid-y', `${y % size}px`)
    }
    apply()
    return useViewport.subscribe(apply)
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      const viewport = useViewport.getState()
      viewport.setSize(width, height)
      // Keep the whole diagram framed until the user takes over the camera.
      if (viewport.fitted) fitContent(false)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const tones = useMemo(() => tableTones(model), [model])
  const refColumns = useMemo(() => refColumnsByTable(model), [model])
  const relationCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ref of model.refs) {
      for (const id of new Set([ref.child.tableId, ref.parent.tableId])) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return counts
  }, [model])

  // Every parse creates new objects. This fingerprint lets a table skip re-rendering when
  // nothing it draws has changed.
  const contentKeys = useMemo(() => {
    const keys = new Map<string, string>()
    for (const table of model.tables) {
      const box = boxes.get(table.id)
      const columns = (box?.rows ?? []).map((c) => `${c.name}:${c.type}:${+c.pk}${+c.fk}`)
      keys.set(
        table.id,
        [
          table.kind,
          table.schema,
          table.name,
          table.groupId,
          table.columns.length,
          Boolean(table.note),
          box?.width,
          box?.height,
          box?.hiddenCount,
          box?.lines?.join('\n'),
          [...(refColumns.get(table.id) ?? [])].join(','),
          columns.join('|'),
        ].join('\u0000'),
      )
    }
    return keys
  }, [model, boxes, refColumns])

  const empty = ready && model.tables.length === 0

  return (
    <section
      ref={viewportRef}
      className="canvas-viewport h-full outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
      aria-label="Diagram"
      aria-describedby="canvas-help"
      tabIndex={0}
    >
      <p id="canvas-help" className="sr-only">
        Arrow keys move the view, plus and minus zoom, 1 fits the diagram. Tab steps through the
        tables. On a table, Enter opens its details, F2 renames it and Shift with an arrow key moves
        it.
      </p>
      {/* Said aloud when the code breaks; the visible notice below may mount too late. */}
      <p role="status" className="sr-only">
        {stale ? 'The code has a problem. The diagram shows the last version without errors.' : ''}
      </p>
      <div ref={gridRef} className="canvas-grid" />

      {/* Controls come before the tables in the tab order, whatever the diagram's size. */}
      <CanvasChips />
      <CanvasToolbar />
      <Inspector />

      <div ref={worldRef} className="canvas-world" data-animating={animating}>
        {ready && (
          <>
            <GroupLayer />
            <EdgeLayer />
            {model.tables.map((table) => {
              const box = boxes.get(table.id)
              if (!box) return null
              return (
                <TableNode
                  key={table.id}
                  table={table}
                  box={box}
                  contentKey={contentKeys.get(table.id) ?? ''}
                  tone={tones.get(table.id)}
                  refColumns={refColumns.get(table.id)}
                  relationCount={relationCounts.get(table.id) ?? 0}
                />
              )
            })}
            <GroupOverviewLabels />
          </>
        )}
      </div>

      {stale && !empty && (
        <div
          data-canvas-interactive
          className="absolute top-4 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 animate-pop-in items-center gap-2 rounded-lg bg-surface py-1 pr-1 pl-3 text-[13px] shadow-pop"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          <span className="text-ink-2">Showing the last version without errors</span>
          <Button variant="ghost" className="h-7 shrink-0 px-2 text-ink" onClick={goToFirstProblem}>
            Go to problem
          </Button>
        </div>
      )}

      {empty && <EmptyState hasProblem={stale} />}

      <EdgeTooltip />
      {minimapOpen && <Minimap />}
    </section>
  )
})

function EmptyState({ hasProblem }: { hasProblem: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div data-canvas-interactive className="pointer-events-auto max-w-sm text-center">
        <h2 className="text-[15px] font-semibold text-ink">
          {hasProblem ? 'This schema has a problem' : 'Nothing to draw yet'}
        </h2>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {hasProblem
            ? 'The diagram appears as soon as the DBML is valid.'
            : 'Describe a table in the editor and it shows up here. Or start from an example:'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {hasProblem ? (
            <Button onClick={goToFirstProblem}>Go to problem</Button>
          ) : (
            SAMPLES.map((sample) => (
              <Button key={sample.id} onClick={() => loadSampleHere(sample)}>
                {sample.name}
              </Button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
