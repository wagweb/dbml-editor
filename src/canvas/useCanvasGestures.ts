import { useEffect, type RefObject } from 'react'
import { isEditableTarget } from '@/lib/platform'
import { fitContent, selectTable } from '@/store/diagram'
import { panBy, zoomAt, zoomTo } from '@/store/viewport'

const CLICK_SLOP = 3
const KEY_PAN = 48

let spaceHeld = false

/** While Space is held, a drag pans the canvas, also when it starts on a table. */
export function isSpacePanning(): boolean {
  return spaceHeld
}

/** True for elements that handle their own pointer input (tables, group labels, overlays). */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-canvas-interactive]') !== null
}

/**
 * Camera input for the canvas. Scrolling pans and pinch or Ctrl/Cmd + scroll zooms, the
 * convention of drawing tools, so a trackpad never zooms by accident.
 */
export function useCanvasGestures(viewportRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    // Measuring on every wheel event would force a style flush per frame.
    let bounds: DOMRect | null = null
    const invalidateBounds = () => {
      bounds = null
    }
    const resizeObserver = new ResizeObserver(invalidateBounds)
    resizeObserver.observe(element)
    const localPoint = (event: { clientX: number; clientY: number }) => {
      bounds ??= element.getBoundingClientRect()
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }

    const onWheel = (event: WheelEvent) => {
      if (isEditableTarget(event.target)) return
      const zooming = event.ctrlKey || event.metaKey
      const overScrollable =
        event.target instanceof Element && event.target.closest('[data-canvas-scrollable]')
      if (overScrollable) {
        // Panels scroll on their own, but a pinch must not zoom the whole page.
        if (zooming) event.preventDefault()
        return
      }
      event.preventDefault()
      if (zooming) {
        // Pinch gestures arrive as small ctrl+wheel deltas, mouse wheels as large ones.
        const delta = Math.max(-60, Math.min(60, event.deltaY))
        zoomAt(Math.exp(-delta * 0.01), localPoint(event))
        return
      }
      const scale = event.deltaMode === 1 ? 16 : 1
      panBy(-event.deltaX * scale, -event.deltaY * scale)
    }

    const pointers = new Map<number, { x: number; y: number }>()
    let pan: { id: number; x: number; y: number; travelled: number } | null = null
    let pinch: { distance: number; x: number; y: number } | null = null

    const pinchState = () => {
      const [a, b] = [...pointers.values()]
      if (!a || !b) return null
      return { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    const onPointerDown = (event: PointerEvent) => {
      const background = !isInteractive(event.target)
      const wantsPan = event.button === 1 || (event.button === 0 && (background || spaceHeld))
      if (!wantsPan) return
      if (event.button === 1) event.preventDefault()

      pointers.set(event.pointerId, localPoint(event))
      element.setPointerCapture(event.pointerId)
      if (pointers.size === 2) {
        pinch = pinchState()
        pan = null
        delete element.dataset.panning
        return
      }
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, travelled: 0 }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, localPoint(event))

      if (pinch && pointers.size === 2) {
        const next = pinchState()
        if (!next) return
        panBy(next.x - pinch.x, next.y - pinch.y)
        if (pinch.distance > 0) zoomAt(next.distance / pinch.distance, { x: next.x, y: next.y })
        pinch = next
        return
      }
      if (!pan || pan.id !== event.pointerId) return
      const dx = event.clientX - pan.x
      const dy = event.clientY - pan.y
      pan.travelled += Math.abs(dx) + Math.abs(dy)
      pan.x = event.clientX
      pan.y = event.clientY
      if (pan.travelled > CLICK_SLOP) {
        element.dataset.panning = 'true'
        panBy(dx, dy)
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      pinch = null
      if (pan?.id === event.pointerId) {
        // A press on empty canvas that did not turn into a pan clears the selection.
        const clicked = pan.travelled <= CLICK_SLOP && event.type === 'pointerup'
        if (clicked && !isInteractive(event.target)) selectTable(null)
        pan = null
      }
      if (!pan) delete element.dataset.panning
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditableTarget(event.target)) spaceHeld = true
      // Keys act on the canvas while focus is anywhere inside it, e.g. on a table.
      const inside = event.target instanceof Node && element.contains(event.target)
      if (!inside || isEditableTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // Space and Enter on a focused control must keep activating that control.
      const onControl =
        event.target instanceof Element && event.target.closest('button, a') !== null
      if (onControl) return

      const step = event.shiftKey ? KEY_PAN * 4 : KEY_PAN
      const actions: Record<string, () => void> = {
        ArrowLeft: () => panBy(step, 0),
        ArrowRight: () => panBy(-step, 0),
        ArrowUp: () => panBy(0, step),
        ArrowDown: () => panBy(0, -step),
        '+': () => zoomAt(1.25, undefined, { animate: true }),
        '=': () => zoomAt(1.25, undefined, { animate: true }),
        '-': () => zoomAt(0.8, undefined, { animate: true }),
        '0': () => zoomTo(1, { animate: true }),
        '1': () => fitContent(true),
        f: () => fitContent(true),
      }
      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }

    const releaseSpace = () => {
      spaceHeld = false
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') releaseSpace()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    // The key-up never arrives when the window loses focus while Space is down.
    window.addEventListener('blur', releaseSpace)
    window.addEventListener('resize', invalidateBounds)
    return () => {
      resizeObserver.disconnect()
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseSpace)
      window.removeEventListener('resize', invalidateBounds)
      releaseSpace()
    }
  }, [viewportRef])
}
