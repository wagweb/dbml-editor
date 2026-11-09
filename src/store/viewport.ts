import { create } from 'zustand'
import { prefersReducedMotion } from '@/lib/platform'
import type { Point, Rect } from '@/layout/router'

export const MIN_ZOOM = 0.08
export const MAX_ZOOM = 2.5
/** Below this zoom the columns are unreadable and tables switch to a large name label. */
export const FAR_ZOOM = 0.5
/** Below this even table names are too small; groups are labelled instead. */
export const OVERVIEW_ZOOM = 0.24

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

/** Share of a world rectangle that is on screen and clear of the floating panels, 0 to 1. */
export function visibleFraction(rect: Rect, insets: Insets = DEFAULT_INSETS): number {
  const { x, y, k, width, height } = useViewport.getState()
  if (width === 0 || height === 0 || rect.width === 0 || rect.height === 0) return 0
  const left = Math.max(rect.x * k + x, insets.left)
  const top = Math.max(rect.y * k + y, insets.top)
  const right = Math.min((rect.x + rect.width) * k + x, width - insets.right)
  const bottom = Math.min((rect.y + rect.height) * k + y, height - insets.bottom)
  if (right <= left || bottom <= top) return 0
  return ((right - left) * (bottom - top)) / (rect.width * k * (rect.height * k))
}

/** Frames a part of the diagram, zooming out as far as needed but never in beyond 100%. */
export function frameRect(rect: Rect, options: { insets?: Insets } = {}): void {
  const { width, height } = useViewport.getState()
  if (width === 0 || height === 0) return
  moveTo(cameraForRect(rect, { width, height }, options.insets, 1), { animate: true })
}

/** Brings one table into view without zooming out further than needed to read it. */
export function revealRect(rect: Rect, options: { insets?: Insets } = {}): void {
  const { width, height, x, y, k } = useViewport.getState()
  if (width === 0 || height === 0) return
  const insets = options.insets ?? DEFAULT_INSETS
  const zoom = Math.max(k, 0.7)
  const visible =
    k >= FAR_ZOOM &&
    rect.x * k + x >= insets.left &&
    rect.y * k + y >= insets.top &&
    (rect.x + rect.width) * k + x <= width - insets.right &&
    (rect.y + rect.height) * k + y <= height - insets.bottom
  if (visible) return

  const availableWidth = width - insets.left - insets.right
  const availableHeight = height - insets.top - insets.bottom
  moveTo(
    {
      k: zoom,
      x: insets.left + availableWidth / 2 - (rect.x + rect.width / 2) * zoom,
      y: insets.top + availableHeight / 2 - (rect.y + rect.height / 2) * zoom,
    },
    { animate: true },
  )
}

export function screenToWorld(screen: Point): Point {
  const { x, y, k } = useViewport.getState()
  return { x: (screen.x - x) / k, y: (screen.y - y) / k }
}

export function jumpTo(camera: Camera): void {
  moveTo(camera)
}
