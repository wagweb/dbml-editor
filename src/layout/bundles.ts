import type { EdgeEnd, EdgeGeometry } from './edges'
import { roundedPath, type Point } from './router'

/**
 * Bundled lines. Relations that attach to the same row leave it on one line, and the layout
 * engine keeps them together for as long as they go the same way (a hyperedge). Drawn as
 * they come, that shared stretch looks like a single relation and a branch looks like a
 * crossing. This module finds the shared stretches so the canvas and the export can draw
 * them as a bundle: heavier the more relations run in it, with a dot where one branches.
 */

/** Points closer than this are the same place; rounding to whole pixels leaves small gaps. */
const TOLERANCE = 0.5

/** Line width of a stretch carried by `count` relations; a single relation is 1.25. */
export function bundleWidth(count: number): number {
  return Math.min(1.25 + 0.75 * (count - 1), 3.5)
}

/** A branch dot is this much wider than the bundle it sits on. */
export const JUNCTION_GROWTH = 4

/** Where a bundle starts: the row all of its relations attach to. */
export interface BundleRoot {
  tableId: string
  column: string | undefined
  /** True when the relations reference this row, false when it is their foreign key. */
  referenced: boolean
}

/** A stretch that two or more relations share. */
export interface BundlePiece {
  key: string
  root: BundleRoot
  /** From the end nearer the root outwards. */
  points: Point[]
  path: string
  /** The relations running along it, in model order. */
  refIds: string[]
}

/** A point where relations of one bundle go separate ways. */
export interface BundleJunction {
  key: string
  point: Point
  /** Every relation that passes through it. */
  refIds: string[]
}

export interface BundledEdges {
  /** The same edges; a corner where a line branches off a bundle is drawn square. */
  edges: EdgeGeometry[]
  pieces: BundlePiece[]
  junctions: BundleJunction[]
}

interface Strand {
  edge: EdgeGeometry
  /** The edge's points, starting at the bundle's root. */
  points: Point[]
  length: number
}

export function bundleEdges(edges: readonly EdgeGeometry[]): BundledEdges {
  const groups = new Map<string, { root: BundleRoot; strands: Strand[] }>()
  const order = new Map(edges.map((edge, index) => [edge.refId, index]))

  for (const edge of edges) {
    // A column's link to its enum card is a type, not a relation; a loop stays a loop.
    if (edge.kind === 'enum' || edge.start.tableId === edge.end.tableId) continue
    const points = clean(edge.points)
    if (points.length < 2) continue
    for (const [end, oriented] of [
      [edge.start, points],
      [edge.end, [...points].reverse()],
    ] as const) {
      const key = `${end.tableId}\u0000${placeKey(end.point)}`
      const group = groups.get(key) ?? { root: rootOf(edge, end), strands: [] }
      group.strands.push({ edge, points: oriented, length: lengthOf(oriented) })
      groups.set(key, group)
    }
  }

  const pieces = new Map<string, BundlePiece>()
  const junctions = new Map<string, { point: Point; refIds: Set<string> }>()
  for (const [groupKey, { root, strands }] of groups) {
    if (strands.length < 2) continue
    const shared = strands.map((a) => strands.map((b) => (a === b ? a.length : sharedLength(a, b))))

    strands.forEach((strand, i) => {
      const row = shared[i]!
      const breaks = [
        ...new Set(row.filter((s, j) => j !== i && s > TOLERANCE).map(roundLength)),
      ].sort((p, q) => p - q)
      let from = 0
      for (const to of breaks) {
        const members = strands.filter((_, j) => row[j]! >= to - TOLERANCE)
        if (members.length >= 2) {
          const refIds = members
            .map((m) => m.edge.refId)
            .sort((a, b) => order.get(a)! - order.get(b)!)
          const key = `${groupKey}\u0000${refIds.join('\u0000')}`
          if (!pieces.has(key)) {
            const points = slice(strand.points, from, to)
            pieces.set(key, { key, root, points, path: roundedPath(points), refIds })
          }
          // Some of the members part here while this one goes on: a branch.
          if (to < strand.length - TOLERANCE) {
            const point = pointAt(strand.points, to)
            const junction = junctions.get(placeKey(point)) ?? { point, refIds: new Set() }
            for (const id of refIds) junction.refIds.add(id)
            junctions.set(placeKey(point), junction)
          }
        }
        from = to
      }
    })
  }

  if (pieces.size === 0) return { edges: [...edges], pieces: [], junctions: [] }

  // A line that turns where it leaves a bundle turns square, so the dot sits in its corner.
  const corners = new Set(junctions.keys())
  const bundled = edges.map((edge) => {
    const sharp = new Set<number>()
    edge.points.forEach((point, index) => {
      if (index > 0 && index < edge.points.length - 1 && corners.has(placeKey(point))) {
        sharp.add(index)
      }
    })
    return sharp.size === 0 ? edge : { ...edge, path: roundedPath(edge.points, 8, sharp) }
  })

  return {
    edges: bundled,
    pieces: [...pieces.values()],
    junctions: [...junctions].map(([key, { point, refIds }]) => ({
      key,
      point,
      refIds: [...refIds].sort((a, b) => order.get(a)! - order.get(b)!),
    })),
  }
}

function rootOf(edge: EdgeGeometry, end: EdgeEnd): BundleRoot {
  // The path starts at the referencing table exactly when `startsAtChild` is set.
  const atStart = end === edge.start
  const referenced = atStart !== edge.startsAtChild
  return { tableId: end.tableId, column: end.column, referenced }
}

/**
 * How far two strands from the same root run together: they share a stretch for as long
 * as they head the same way. Both start at the root, so equal steps keep them on top of
 * each other; the shared part ends where one turns and the other does not.
 */
function sharedLength(a: Strand, b: Strand): number {
  const p = a.points
  const q = b.points
  let i = 0
  let j = 0
  let here = p[0]!
  let there = q[0]!
  let length = 0
  while (i < p.length - 1 && j < q.length - 1) {
    const restA = distance(here, p[i + 1]!)
    const restB = distance(there, q[j + 1]!)
    const headingA = heading(here, p[i + 1]!)
    const headingB = heading(there, q[j + 1]!)
    if (headingA[0] !== headingB[0] || headingA[1] !== headingB[1]) break
    const step = Math.min(restA, restB)
    length += step
    if (restA - step <= TOLERANCE) {
      i += 1
      here = p[i]!
    } else {
      here = { x: here.x + headingA[0] * step, y: here.y + headingA[1] * step }
    }
    if (restB - step <= TOLERANCE) {
      j += 1
      there = q[j]!
    } else {
      there = { x: there.x + headingB[0] * step, y: there.y + headingB[1] * step }
    }
  }
  return length
}

/** Drops points that repeat their predecessor or sit on a straight line through it. */
function clean(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last && distance(last, point) <= TOLERANCE) continue
    const before = result.at(-2)
    if (before && last) {
      const a = heading(before, last)
      const b = heading(last, point)
      if (a[0] === b[0] && a[1] === b[1]) result.pop()
    }
    result.push(point)
  }
  return result
}

/** The axis direction from one point to the next; routes only run straight across or down. */
function heading(from: Point, to: Point): [number, number] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]
}

function distance(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
}

function lengthOf(points: readonly Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i += 1) length += distance(points[i - 1]!, points[i]!)
  return length
}

function pointAt(points: readonly Point[], at: number): Point {
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const step = distance(a, b)
    if (walked + step >= at - TOLERANCE) {
      const t = step === 0 ? 0 : Math.min(1, Math.max(0, (at - walked) / step))
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    walked += step
  }
  return points.at(-1)!
}

/** The stretch of a polyline between two distances from its start. */
function slice(points: readonly Point[], from: number, to: number): Point[] {
  const result = [pointAt(points, from)]
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    walked += distance(points[i - 1]!, points[i]!)
    if (walked > from + TOLERANCE && walked < to - TOLERANCE) result.push(points[i]!)
  }
  result.push(pointAt(points, to))
  return clean(result)
}

function roundLength(value: number): number {
  return Math.round(value * 100) / 100
}

function placeKey(point: Point): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`
}
