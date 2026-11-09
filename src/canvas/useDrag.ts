import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { snapToGrid } from '@/layout/geometry'
import type { Point } from '@/layout/router'
import { getOwn } from '@/lib/record'
import { endDrag, moveTables, useDiagram } from '@/store/diagram'
import { useViewport } from '@/store/viewport'
import { isSpacePanning } from './useCanvasGestures'

const CLICK_SLOP = 3

interface DragSession {
  pointerId: number
  startX: number
  startY: number
  origins: Map<string, Point>
  dragging: boolean
}

interface DragOptions {
  /** Tables that move together; read when the press starts. */
  ids: () => string[]
  onClick?: () => void
  onDragChange?: (dragging: boolean) => void
}

/** Pointer handlers that move one or more tables, or report a click when nothing moved. */
export function useDrag({ ids, onClick, onDragChange }: DragOptions) {
  const session = useRef<DragSession | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isSpacePanning()) return
    // Text fields and buttons inside a draggable keep their own behaviour.
    if (event.target instanceof Element && event.target.closest('button, a, input')) return
    const { positions } = useDiagram.getState()
    const origins = new Map<string, Point>()
    for (const id of ids()) {
      const point = getOwn(positions, id)
      if (point) origins.set(id, point)
    }
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origins,
      dragging: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.dragging) {
      if (Math.abs(dx) + Math.abs(dy) <= CLICK_SLOP) return
      current.dragging = true
      onDragChange?.(true)
    }
    const { k } = useViewport.getState()
    moveTables(
      Object.fromEntries(
        [...current.origins].map(([id, origin]) => [
          id,
          { x: snapToGrid(origin.x + dx / k), y: snapToGrid(origin.y + dy / k) },
        ]),
      ),
    )
  }

  const finish = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    session.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (current.dragging) {
      onDragChange?.(false)
      endDrag()
    } else if (!cancelled) {
      onClick?.()
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
  }
}
