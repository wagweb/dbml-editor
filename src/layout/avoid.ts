import type { Side } from './elk'
import { routeBetween, simplify, STUB, type Anchor, type Point, type Rect } from './router'

export interface AvoidingRoute {
  points: Point[]
  startSide: Side
  endSide: Side
}

/** Distance a line keeps from the tables it passes. */
const MARGIN = 14
/** How far around the two ends other tables are taken into account. */
const REACH = 360
/** A bend costs as much as this many pixels of detour. */
const BEND_COST = 36
const SIDES: Side[] = ['E', 'W']

/**
 * Orthogonal route between two rows that goes around tables instead of behind them. Used
 * for relations whose tables were arranged by hand, where the layout engine's lanes no
 * longer apply. Runs A* on a sparse grid spanned by the edges of the nearby tables and
 * picks the cheapest of the four ways to leave and enter (left or right on either end).
 */
export function routeAvoiding(a: Anchor, b: Anchor, others: readonly Rect[]): AvoidingRoute {
  let best: (AvoidingRoute & { cost: number }) | null = null
  for (const startSide of SIDES) {
    for (const endSide of SIDES) {
      const candidate = search(a, b, startSide, endSide, others)
      if (candidate && (!best || candidate.cost < best.cost)) best = candidate
    }
  }
  if (best) return { points: best.points, startSide: best.startSide, endSide: best.endSide }

  // Boxed in on every side: fall back to the plain elbow.
  const points = routeBetween(a, b)
  return {
    points,
    startSide: points[0]!.x === a.rect.x ? 'W' : 'E',
    endSide: points.at(-1)!.x === b.rect.x ? 'W' : 'E',
  }
}

/** True when a route passes through the inside of one of the rectangles. */
export function crossesAny(points: readonly Point[], rects: readonly Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i]!
    const q = points[i + 1]!
    const left = Math.min(p.x, q.x)
    const right = Math.max(p.x, q.x)
    const top = Math.min(p.y, q.y)
    const bottom = Math.max(p.y, q.y)
    for (const rect of rects) {
      if (
        left < rect.x + rect.width &&
        right > rect.x &&
        top < rect.y + rect.height &&
        bottom > rect.y
      ) {
        return true
      }
    }
  }
  return false
}

function edgeX(anchor: Anchor, side: Side): number {
  return side === 'E' ? anchor.rect.x + anchor.rect.width : anchor.rect.x
}

function search(
  a: Anchor,
  b: Anchor,
  startSide: Side,
  endSide: Side,
  others: readonly Rect[],
): (AvoidingRoute & { cost: number }) | null {
  const start = { x: edgeX(a, startSide), y: a.y }
  const end = { x: edgeX(b, endSide), y: b.y }
  // The first and last stretch run straight out of the table, clear of markers.
  const from = { x: start.x + (startSide === 'E' ? STUB : -STUB), y: a.y }
  const to = { x: end.x + (endSide === 'E' ? STUB : -STUB), y: b.y }

  const window = {
    left: Math.min(from.x, to.x) - REACH,
    right: Math.max(from.x, to.x) + REACH,
    top: Math.min(from.y, to.y) - REACH,
    bottom: Math.max(from.y, to.y) + REACH,
  }
  // Both end tables are obstacles too, so a line never cuts through its own table.
  const walls = [a.rect, b.rect, ...others]
    .filter(
      (r) =>
        r.x < window.right &&
        r.x + r.width > window.left &&
        r.y < window.bottom &&
        r.y + r.height > window.top,
    )
    .map((r) => ({
      left: r.x - MARGIN,
      right: r.x + r.width + MARGIN,
      top: r.y - MARGIN,
      bottom: r.y + r.height + MARGIN,
    }))

  const inside = (p: Point) =>
    walls.some((w) => p.x > w.left && p.x < w.right && p.y > w.top && p.y < w.bottom)
  if (inside(from) || inside(to)) return null

  const xs = uniqueSorted([from.x, to.x, ...walls.flatMap((w) => [w.left, w.right])])
  const ys = uniqueSorted([from.y, to.y, ...walls.flatMap((w) => [w.top, w.bottom])])

  // A horizontal step on row y from x1 to x2 is blocked by walls that span that row.
  const blockedRow = (y: number, x1: number, x2: number) =>
    walls.some((w) => y > w.top && y < w.bottom && x1 < w.right && x2 > w.left)
  const blockedColumn = (x: number, y1: number, y2: number) =>
    walls.some((w) => x > w.left && x < w.right && y1 < w.bottom && y2 > w.top)

  const columns = xs.length
  const rows = ys.length
  const startIndex = xs.indexOf(from.x) + ys.indexOf(from.y) * columns
  const goalIndex = xs.indexOf(to.x) + ys.indexOf(to.y) * columns

  // State: grid node plus the direction it was entered from (0 horizontal, 1 vertical).
  const best = new Float64Array(columns * rows * 2).fill(Infinity)
  const parent = new Int32Array(columns * rows * 2).fill(-1)
  const open: { state: number; score: number }[] = []
  const estimate = (index: number) =>
    Math.abs(xs[index % columns]! - to.x) + Math.abs(ys[Math.floor(index / columns)]! - to.y)

  // Leaving sideways is free; the stub already points that way.
  best[startIndex * 2] = 0
  open.push({ state: startIndex * 2, score: estimate(startIndex) })

  while (open.length > 0) {
    let pick = 0
    for (let i = 1; i < open.length; i += 1) if (open[i]!.score < open[pick]!.score) pick = i
    const { state } = open.splice(pick, 1)[0]!
    const index = state >> 1
    const direction = state & 1
    const cost = best[state]!

    if (index === goalIndex) {
      // Arriving vertically needs one more bend to enter the table sideways.
      if (direction === 1 && !Number.isFinite(best[goalIndex * 2]!)) {
        best[goalIndex * 2] = cost + BEND_COST
        parent[goalIndex * 2] = state
      }
      const final = direction === 0 ? state : goalIndex * 2
      const path: Point[] = []
      for (let s = final; s !== -1; s = parent[s]!) {
        const i = s >> 1
        path.unshift({ x: xs[i % columns]!, y: ys[Math.floor(i / columns)]! })
      }
      return {
        points: simplify([start, ...path, end]),
        startSide,
        endSide,
        cost: best[final]!,
      }
    }

    const column = index % columns
    const row = Math.floor(index / columns)
    const x = xs[column]!
    const y = ys[row]!
    const steps: [number, number, number][] = []
    if (column > 0 && !blockedRow(y, xs[column - 1]!, x))
      steps.push([index - 1, 0, x - xs[column - 1]!])
    if (column < columns - 1 && !blockedRow(y, x, xs[column + 1]!)) {
      steps.push([index + 1, 0, xs[column + 1]! - x])
    }
    if (row > 0 && !blockedColumn(x, ys[row - 1]!, y))
      steps.push([index - columns, 1, y - ys[row - 1]!])
    if (row < rows - 1 && !blockedColumn(x, y, ys[row + 1]!)) {
      steps.push([index + columns, 1, ys[row + 1]! - y])
    }

    for (const [next, nextDirection, length] of steps) {
      const nextState = next * 2 + nextDirection
      const nextCost = cost + length + (nextDirection === direction ? 0 : BEND_COST)
      if (nextCost >= best[nextState]!) continue
      best[nextState] = nextCost
      parent[nextState] = state
      open.push({ state: nextState, score: nextCost + estimate(next) })
    }
  }
  return null
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((p, q) => p - q)
}
