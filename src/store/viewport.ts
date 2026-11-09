import { create } from 'zustand'
import { prefersReducedMotion } from '@/lib/platform'
import type { Point, Rect } from '@/layout/router'

export const MIN_ZOOM = 0.08
export const MAX_ZOOM = 2.5
/** Below this zoom the columns are unreadable and tables switch to a large name label. */
export const FAR_ZOOM = 0.5
/** Below this even table names are too small; groups are labelled instead. */
export const OVERVIEW_ZOOM = 0.24
/** Zoom the camera goes to when it has to bring columns back into reading range. */
export const READABLE_ZOOM = 0.75

export interface Camera {
  x: number
  y: number
  k: number
}

/** Screen space covered by floating panels, so content is centred in what stays visible. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

interface ViewportState extends Camera {
  width: number
  height: number
  /** True while the camera still shows the whole diagram as framed by "fit". */
  fitted: boolean
  setSize: (width: number, height: number) => void
  setCamera: (camera: Camera, options?: { fitted?: boolean }) => void
}

export const useViewport = create<ViewportState>()((set) => ({
  x: 0,
  y: 0,
  k: 1,
  width: 0,
  height: 0,
  fitted: true,
  setSize: (width, height) => set({ width, height }),
  setCamera: (camera, options) => set({ ...camera, fitted: options?.fitted ?? false }),
}))

const DEFAULT_INSETS: Insets = { top: 56, right: 56, bottom: 88, left: 56 }

/** Insets that keep content clear of the details panel shown for a selected table. */
export function insetsFor(detailsOpen: boolean): Insets {
  if (!detailsOpen) return DEFAULT_INSETS
  return window.matchMedia('(max-width: 767px)').matches
    ? { top: 24, right: 24, bottom: Math.round(window.innerHeight * 0.5), left: 24 }
    : { ...DEFAULT_INSETS, right: 368 }
}

/**
 * The area a clicked table has to stay in: the canvas minus the details panel, without the
 * comfort margins. A table the user just clicked is visible; nudging it by a few pixels
 * only moves the next target away from under the pointer.
 */
export function clickInsets(): Insets {
  const panel = insetsFor(true)
  return window.matchMedia('(max-width: 767px)').matches
    ? panel
    : { top: 0, right: panel.right - 16, bottom: 0, left: 0 }
}

let animation = 0

function cancelAnimation(): void {
  if (animation) cancelAnimationFrame(animation)
  animation = 0
}

function clampZoom(k: number): number {
  return Math.min(Math.max(k, MIN_ZOOM), MAX_ZOOM)
}

function moveTo(target: Camera, options: { animate?: boolean; fitted?: boolean } = {}): void {
  cancelAnimation()
  const { setCamera, x, y, k } = useViewport.getState()
  const fitted = options.fitted ?? false
  if (!options.animate || prefersReducedMotion()) {
    setCamera(target, { fitted })
    return
  }

  const from = { x, y, k }
  const started = performance.now()
  const duration = 320
  const step = (now: number) => {
    const t = Math.min((now - started) / duration, 1)
    const eased = 1 - (1 - t) ** 3
    setCamera(
      {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        k: from.k + (target.k - from.k) * eased,
      },
      { fitted },
    )
    animation = t < 1 ? requestAnimationFrame(step) : 0
  }
  animation = requestAnimationFrame(step)
}

export function panBy(dx: number, dy: number): void {
  cancelAnimation()
  const { x, y, k, setCamera } = useViewport.getState()
  setCamera({ x: x + dx, y: y + dy, k })
}

/** Zooms by a factor while keeping the given screen point fixed. */
export function zoomAt(factor: number, screen?: Point, options?: { animate?: boolean }): void {
  const { x, y, k, width, height } = useViewport.getState()
  const anchor = screen ?? { x: width / 2, y: height / 2 }
  const next = clampZoom(k * factor)
  const ratio = next / k
  moveTo(
    { x: anchor.x - (anchor.x - x) * ratio, y: anchor.y - (anchor.y - y) * ratio, k: next },
    options,
  )
}

export function zoomTo(zoom: number, options?: { animate?: boolean }): void {
  zoomAt(zoom / useViewport.getState().k, undefined, options)
}

export function cameraForRect(
  rect: Rect,
  size: { width: number; height: number },
  insets: Insets = DEFAULT_INSETS,
  maxZoom = 1,
): Camera {
  const availableWidth = Math.max(size.width - insets.left - insets.right, 80)
  const availableHeight = Math.max(size.height - insets.top - insets.bottom, 80)
  const k = clampZoom(
    Math.min(
      availableWidth / Math.max(rect.width, 1),
      availableHeight / Math.max(rect.height, 1),
      maxZoom,
    ),
  )
  return {
    k,
    x: insets.left + (availableWidth - rect.width * k) / 2 - rect.x * k,
    y: insets.top + (availableHeight - rect.height * k) / 2 - rect.y * k,
  }
}

/** Frames the whole diagram. */
export function fitRect(
  rect: Rect | null,
  options: { animate?: boolean; insets?: Insets } = {},
): void {
  const { width, height } = useViewport.getState()
  if (!rect || width === 0 || height === 0) return
  moveTo(cameraForRect(rect, { width, height }, options.insets), {
    animate: options.animate,
    fitted: true,
  })
}

/** True when the rectangle is fully on screen and clear of the floating controls. */
export function isInView(rect: Rect, insets: Insets = DEFAULT_INSETS): boolean {
  const { x, y, k, width, height } = useViewport.getState()
  return (
    rect.x * k + x >= insets.left - 0.5 &&
    rect.y * k + y >= insets.top - 0.5 &&
    (rect.x + rect.width) * k + x <= width - insets.right + 0.5 &&
    (rect.y + rect.height) * k + y <= height - insets.bottom + 0.5
  )
}

/**
 * Frames a diagram that was just opened. It is fitted as a whole when that still shows
 * its columns; a larger diagram opens at the smallest zoom that shows columns, starting at
 * its top left corner, and the overview map shows the rest.
 */
export function frameOnOpen(rect: Rect | null, insets: Insets = DEFAULT_INSETS): void {
  const { width, height } = useViewport.getState()
  if (!rect || width === 0 || height === 0) return
  const fit = cameraForRect(rect, { width, height }, insets)
  if (fit.k >= FAR_ZOOM) {
    moveTo(fit, { fitted: true })
    return
  }
  const k = FAR_ZOOM
  const availableHeight = height - insets.top - insets.bottom
  moveTo({
    k,
    x: insets.left - rect.x * k,
    // A diagram that is only too wide stays centred vertically.
    y:
      rect.height * k <= availableHeight
        ? insets.top + (availableHeight - rect.height * k) / 2 - rect.y * k
        : insets.top - rect.y * k,
  })
}

/** Frames a part of the diagram, zooming out as far as needed but never in beyond 100%. */
export function frameRect(rect: Rect, options: { insets?: Insets } = {}): void {
  const { width, height } = useViewport.getState()
  if (width === 0 || height === 0) return
  moveTo(cameraForRect(rect, { width, height }, options.insets, 1), { animate: true })
}

/**
 * Brings a table into view, together with the tables around it when they fit. The camera
 * moves as little as possible: no zoom change while columns are readable, and only the
 * pan needed to clear the edges and the floating panels. Zoomed far out, a jump from search
 * zooms in to a readable level first; a click in the diagram never zooms.
 */
export function revealRect(
  rect: Rect,
  options: {
    insets?: Insets
    around?: Rect
    /**
     * False for pointer clicks: the table is on screen already, and zooming in would switch
     * every card to rows halfway through the move.
     */
    zoom?: boolean
  } = {},
): void {
  const { width, height, x, y, k } = useViewport.getState()
  if (width === 0 || height === 0) return
  const insets = options.insets ?? DEFAULT_INSETS
  const availableWidth = width - insets.left - insets.right
  const availableHeight = height - insets.top - insets.bottom
  const around = options.around ?? rect

  if (k < FAR_ZOOM && options.zoom !== false) {
    // Columns are hidden at this zoom: zoom in to read them, around the table.
    const zoom = Math.min(
      READABLE_ZOOM,
      Math.max(FAR_ZOOM, cameraForRect(around, { width, height }, insets).k),
    )
    const target = fitsAt(around, zoom) ? around : rect
    moveTo(
      {
        k: zoom,
        x: insets.left + availableWidth / 2 - (target.x + target.width / 2) * zoom,
        y: insets.top + availableHeight / 2 - (target.y + target.height / 2) * zoom,
      },
      { animate: true },
    )
    return
  }

  function fitsAt(area: Rect, zoom: number): boolean {
    return area.width * zoom <= availableWidth && area.height * zoom <= availableHeight
  }

  const target = fitsAt(around, k) ? around : rect
  const nudge = (start: number, size: number, low: number, high: number) => {
    if (size > high - low) return low + (high - low - size) / 2 - start
    if (start < low) return low - start
    if (start + size > high) return high - (start + size)
    return 0
  }
  const dx = nudge(target.x * k + x, target.width * k, insets.left, width - insets.right)
  const dy = nudge(target.y * k + y, target.height * k, insets.top, height - insets.bottom)
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
  moveTo({ k, x: x + dx, y: y + dy }, { animate: true })
}

export function screenToWorld(screen: Point): Point {
  const { x, y, k } = useViewport.getState()
  return { x: (screen.x - x) / k, y: (screen.y - y) / k }
}

export function jumpTo(camera: Camera): void {
  moveTo(camera)
}
