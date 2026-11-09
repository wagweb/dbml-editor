import { snapToGrid } from './geometry'
import { bounds, inflate, intersects, type Point, type Rect } from './router'

export interface Size {
  width: number
  height: number
}

export interface PlacementRequest {
  sizes: ReadonlyMap<string, Size>
  /** Tables that already sit on the canvas. They never move. */
  positions: Readonly<Record<string, Point>>
  newIds: readonly string[]
  neighbors: (id: string) => readonly string[]
}

const GAP_X = 96
const GAP_Y = 40
const CLEARANCE = 24
const RING_STEP = 48
const MAX_RINGS = 60

/**
 * Finds a free spot for tables that appear while the layout is arranged by hand. A new
 * table lands next to a table it relates to; unrelated tables are parked below the diagram.
 */
export function placeNewTables(request: PlacementRequest): Record<string, Point> {
  const { sizes, positions, newIds, neighbors } = request
  const occupied = new Map<string, Rect>()
  for (const [id, point] of Object.entries(positions)) {
    const size = sizes.get(id)
    if (size) occupied.set(id, { ...point, ...size })
  }

  const placed = new Map<string, Point>()
  for (const id of newIds) {
    const size = sizes.get(id)
    if (!size || occupied.has(id)) continue

    const taken = [...occupied.values()]
    const isFree = (point: Point) =>
      taken.every((rect) => !intersects(inflate({ ...point, ...size }, CLEARANCE), rect))

    const related = neighbors(id)
      .map((neighbor) => occupied.get(neighbor))
      .filter((rect): rect is Rect => rect !== undefined)

    const point =
      (related.length > 0 ? besideNeighbors(related, size, isFree) : undefined) ??
      belowDiagram(taken, size, isFree)

    placed.set(id, point)
    occupied.set(id, { ...point, ...size })
  }
  return Object.fromEntries(placed)
}

function besideNeighbors(
  related: Rect[],
  size: Size,
  isFree: (point: Point) => boolean,
): Point | undefined {
  const sides: ((rect: Rect) => Point)[] = [
    (rect) => ({ x: rect.x + rect.width + GAP_X, y: rect.y }),
    (rect) => ({ x: rect.x, y: rect.y + rect.height + GAP_Y }),
    (rect) => ({ x: rect.x - size.width - GAP_X, y: rect.y }),
    (rect) => ({ x: rect.x, y: rect.y - size.height - GAP_Y }),
  ]
  for (const side of sides) {
    for (const rect of related) {
      const candidate = snap(side(rect))
      if (isFree(candidate)) return candidate
    }
  }

  // Everything next to the neighbours is taken: search outwards in growing rings.
  const origin = related[0]!
  for (let ring = 1; ring <= MAX_RINGS; ring += 1) {
    const reach = ring * RING_STEP
    for (let step = -ring; step <= ring; step += 1) {
      const offset = step * RING_STEP
      const candidates: Point[] = [
        { x: origin.x + reach, y: origin.y + offset },
        { x: origin.x + offset, y: origin.y + reach },
        { x: origin.x - reach, y: origin.y + offset },
        { x: origin.x + offset, y: origin.y - reach },
      ]
      const free = candidates.map(snap).find(isFree)
      if (free) return free
    }
  }
  return undefined
}

function belowDiagram(taken: Rect[], size: Size, isFree: (point: Point) => boolean): Point {
  const area = bounds(taken)
  if (!area) return { x: 0, y: 0 }

  const y = area.y + area.height + 2 * GAP_Y
  let x = area.x
  // Rows below the diagram are empty, so walking right always terminates.
  for (;;) {
    const candidate = snap({ x, y })
    if (isFree(candidate)) return candidate
    x += size.width + GAP_Y
  }
}

function snap(point: Point): Point {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}
