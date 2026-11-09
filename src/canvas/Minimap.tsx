import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { contentBounds, tableRect, tableTones } from '@/layout/groups'
import { inflate } from '@/layout/router'
import { useDiagram } from '@/store/diagram'
import { jumpTo, useViewport } from '@/store/viewport'

const WIDTH = 184
const HEIGHT = 116
const PADDING = 8

/** Overview of the whole diagram with the visible area marked. Click or drag to move. */
export function Minimap() {
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const selectedTableId = useDiagram((s) => s.selectedTableId)
  const frame = useRef<SVGRectElement>(null)

  const tones = useMemo(() => tableTones(model), [model])

  const projection = useMemo(() => {
    const area = contentBounds(model, boxes, positions)
    const world = area ? inflate(area, 40) : { x: 0, y: 0, width: 1, height: 1 }
    const scale = Math.min(
      (WIDTH - 2 * PADDING) / world.width,
      (HEIGHT - 2 * PADDING) / world.height,
    )
    return {
      world,
      scale,
      offsetX: (WIDTH - world.width * scale) / 2,
      offsetY: (HEIGHT - world.height * scale) / 2,
    }
  }, [model, boxes, positions])

  const rects = useMemo(
    () =>
      model.tables.flatMap((table) => {
        const rect = tableRect(table, boxes, positions)
        return rect ? [{ id: table.id, rect, tone: tones.get(table.id) }] : []
      }),
    [model, boxes, positions, tones],
  )

  // The frame follows the camera without re-rendering. The projection is read from a ref
  // so the camera subscription is set up once, not on every drag step.
  const latest = useRef(projection)
  const updateFrame = useRef(() => {
    const { world, scale, offsetX, offsetY } = latest.current
    const { x, y, k, width, height } = useViewport.getState()
    const element = frame.current
    if (!element || k === 0) return
    element.setAttribute('x', String(offsetX + (-x / k - world.x) * scale))
    element.setAttribute('y', String(offsetY + (-y / k - world.y) * scale))
    element.setAttribute('width', String(Math.max((width / k) * scale, 2)))
    element.setAttribute('height', String(Math.max((height / k) * scale, 2)))
  })

  useEffect(() => {
    latest.current = projection
    updateFrame.current()
  }, [projection])

  useEffect(() => useViewport.subscribe(() => updateFrame.current()), [])

  const moveCamera = (event: PointerEvent<SVGSVGElement>) => {
    const { world, scale, offsetX, offsetY } = projection
    const bounds = event.currentTarget.getBoundingClientRect()
    const worldX = world.x + (event.clientX - bounds.left - offsetX) / scale
    const worldY = world.y + (event.clientY - bounds.top - offsetY) / scale
    const { k, width, height } = useViewport.getState()
    jumpTo({ k, x: width / 2 - worldX * k, y: height / 2 - worldY * k })
  }

  // With the whole diagram on screen an overview adds nothing and only covers tables.
  const area = useMemo(() => contentBounds(model, boxes, positions), [model, boxes, positions])
  const needed = useViewport((s) => {
    if (!area || s.width === 0) return false
    const slack = 8
    return (
      area.x * s.k + s.x < -slack ||
      area.y * s.k + s.y < -slack ||
      (area.x + area.width) * s.k + s.x > s.width + slack ||
      (area.y + area.height) * s.k + s.y > s.height + slack
    )
  })

  if (rects.length === 0) return null
  const { world, scale, offsetX, offsetY } = projection

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Overview map of the diagram"
      aria-hidden={!needed}
      data-canvas-interactive
      data-visible={needed}
      className="absolute right-4 bottom-4 z-10 cursor-crosshair rounded-[10px] bg-surface shadow-pop transition-opacity duration-150 data-[visible=false]:pointer-events-none data-[visible=false]:opacity-0 max-md:hidden"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        moveCamera(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) moveCamera(event)
      }}
    >
      {rects.map(({ id, rect, tone }) => (
        <rect
          key={id}
          x={offsetX + (rect.x - world.x) * scale}
          y={offsetY + (rect.y - world.y) * scale}
          width={Math.max(rect.width * scale, 2)}
          height={Math.max(rect.height * scale, 2)}
          rx={1.5}
          fill={id === selectedTableId ? 'var(--accent)' : (tone ?? 'var(--ink-3)')}
          fillOpacity={id === selectedTableId ? 1 : tone ? 0.55 : 0.4}
        />
      ))}
      <rect
        ref={frame}
        rx={3}
        fill="var(--accent)"
        fillOpacity={0.06}
        stroke="var(--accent)"
        strokeWidth={1.25}
      />
    </svg>
  )
}
