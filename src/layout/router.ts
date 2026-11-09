export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A table rectangle plus the absolute y of the row a relation attaches to. */
export interface Anchor {
  rect: Rect
  y: number
}

/** Horizontal run that keeps cardinality markers clear of the first bend. */
export const STUB = 24
const SELF_LOOP_REACH = 28
const SELF_LOOP_MIN_DROP = 18

/**
 * Orthogonal fallback route between two rows. Used for relations whose tables were moved
 * by hand, where the layout engine's lane assignment no longer applies.
 */
export function routeBetween(a: Anchor, b: Anchor): Point[] {
  const aRight = a.rect.x + a.rect.width
  const bRight = b.rect.x + b.rect.width

  if (b.rect.x - aRight >= 2 * STUB) {
    return elbow({ x: aRight, y: a.y }, { x: b.rect.x, y: b.y })
  }
  if (a.rect.x - bRight >= 2 * STUB) {
    return elbow({ x: a.rect.x, y: a.y }, { x: bRight, y: b.y })
  }

  // The tables overlap horizontally: leave both on the same side and loop around.
  const rightLane = Math.max(aRight, bRight) + STUB
  const leftLane = Math.min(a.rect.x, b.rect.x) - STUB
  const rightCost = rightLane - aRight + (rightLane - bRight)
  const leftCost = a.rect.x - leftLane + (b.rect.x - leftLane)

  if (rightCost <= leftCost) {
    return [
      { x: aRight, y: a.y },
      { x: rightLane, y: a.y },
      { x: rightLane, y: b.y },
      { x: bRight, y: b.y },
    ]
  }
  return [
    { x: a.rect.x, y: a.y },
    { x: leftLane, y: a.y },
    { x: leftLane, y: b.y },
    { x: b.rect.x, y: b.y },
  ]
}

function elbow(start: Point, end: Point): Point[] {
  if (start.y === end.y) return [start, end]
  const middle = (start.x + end.x) / 2
  return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end]
}

/** Loop for a table that references itself, leaving and re-entering on the right side. */
export function routeSelf(a: Anchor, targetY: number): Point[] {
  const right = a.rect.x + a.rect.width
  const lane = right + SELF_LOOP_REACH
  const endY = targetY === a.y ? a.y + SELF_LOOP_MIN_DROP : targetY
  return [
    { x: right, y: a.y },
    { x: lane, y: a.y },
    { x: lane, y: endY },
    { x: right, y: endY },
  ]
}

/** Drops repeated points and points that sit on a straight line between their neighbours. */
export function simplify(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last && last.x === point.x && last.y === point.y) continue
    const before = result.at(-2)
    if (before && last) {
      const collinear =
        (before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y)
      if (collinear) result.pop()
    }
    result.push(point)
  }
  return result
}

/** SVG path through the points with rounded corners. */
export function roundedPath(points: Point[], radius = 8): string {
  const first = points[0]
  if (!first || points.length < 2) return ''

  let d = `M${format(first.x)} ${format(first.y)}`
  let cursor = first

  const lineTo = (point: Point) => {
    if (point.x === cursor.x && point.y === cursor.y) return
    d += `L${format(point.x)} ${format(point.y)}`
    cursor = point
  }

  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1]!
    const corner = points[i]!
    const next = points[i + 1]!
    const before = distance(previous, corner)
    const after = distance(corner, next)
    const r = Math.min(radius, before / 2, after / 2)
    if (r <= 0) {
      lineTo(corner)
      continue
    }
    const entry = towards(corner, previous, r)
    const exit = towards(corner, next, r)
    lineTo(entry)
    d += `Q${format(corner.x)} ${format(corner.y)} ${format(exit.x)} ${format(exit.y)}`
    cursor = exit
  }

  lineTo(points.at(-1)!)
  return d
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function towards(from: Point, to: Point, length: number): Point {
  const total = distance(from, to)
  if (total === 0) return from
  return {
    x: from.x + ((to.x - from.x) * length) / total,
    y: from.y + ((to.y - from.y) * length) / total,
  }
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function bounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export function inflate(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  }
}
