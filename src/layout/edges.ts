import type { Cardinality, RefModel, SchemaModel } from '@/dbml/model'
import { getOwn } from '@/lib/record'
import { crossesAny, routeAvoiding } from './avoid'
import type { Side, StoredRoute } from './elk'
import { routeSignature } from './elk'
import { portOffsetY, type TableBox } from './geometry'
import { roundedPath, routeSelf, type Anchor, type Point, type Rect } from './router'

export interface EdgeEnd {
  tableId: string
  point: Point
  /** +1 when the line leaves the table to the right, -1 to the left. */
  direction: 1 | -1
  cardinality: Cardinality
}

export interface EdgeGeometry {
  refId: string
  points: Point[]
  path: string
  /** Cardinality markers of both ends as one path. */
  markers: string
  start: EdgeEnd
  end: EdgeEnd
  /** True when the path starts at the referencing table. */
  startsAtChild: boolean
}

const MANY_LENGTH = 11
const MANY_SPREAD = 5
const ONE_DISTANCE = 7
const ONE_HALF = 4.5

export function computeEdges(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
  routes: Readonly<Record<string, StoredRoute>>,
): EdgeGeometry[] {
  const rects = placedRects(model, boxes, positions)
  const edges: EdgeGeometry[] = []
  for (const ref of model.refs) {
    const edge = computeEdge(ref, boxes, positions, getOwn(routes, ref.id), rects)
    if (edge) edges.push(edge)
  }
  return edges
}

/**
 * Routes for tables arranged by hand. Routes from the layout engine stay as long as both
 * ends sit where they were and no table has been moved onto the line; every other
 * relation gets a route that goes around the tables in its way.
 */
export function refreshRoutes(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
  routes: Readonly<Record<string, StoredRoute>>,
): Record<string, StoredRoute> {
  const rects = placedRects(model, boxes, positions)
  const next: Record<string, StoredRoute> = {}
  for (const ref of model.refs) {
    if (ref.child.tableId === ref.parent.tableId) continue
    const child = anchorOf(ref.child.tableId, ref.child.columns[0], boxes, positions)
    const parent = anchorOf(ref.parent.tableId, ref.parent.columns[0], boxes, positions)
    if (!child || !parent) continue
    const others = obstacles(rects, ref)
    const stored = getOwn(routes, ref.id)
    if (stored && storedPoints(stored, ref, child, parent) && !crossesAny(stored.points, others)) {
      next[ref.id] = stored
      continue
    }
    const route = routeAvoiding(parent, child, others)
    next[ref.id] = {
      points: route.points,
      startTableId: ref.parent.tableId,
      startSide: route.startSide,
      endSide: route.endSide,
      signature: routeSignature(route.points[0]!, route.points.at(-1)!),
    }
  }
  return next
}

function placedRects(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const table of model.tables) {
    const box = boxes.get(table.id)
    const position = getOwn(positions, table.id)
    if (box && position) {
      rects.set(table.id, { x: position.x, y: position.y, width: box.width, height: box.height })
    }
  }
  return rects
}

/** Every placed card except the two a relation connects. */
function obstacles(rects: ReadonlyMap<string, Rect>, ref: RefModel): Rect[] {
  const result: Rect[] = []
  for (const [id, rect] of rects) {
    if (id !== ref.child.tableId && id !== ref.parent.tableId) result.push(rect)
  }
  return result
}

function computeEdge(
  ref: RefModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
  stored: StoredRoute | undefined,
  rects: ReadonlyMap<string, Rect>,
): EdgeGeometry | null {
  const child = anchorOf(ref.child.tableId, ref.child.columns[0], boxes, positions)
  const parent = anchorOf(ref.parent.tableId, ref.parent.columns[0], boxes, positions)
  if (!child || !parent) return null

  let points: Point[]
  let startsAtChild: boolean

  if (ref.child.tableId === ref.parent.tableId) {
    points = routeSelf(child, parent.y)
    startsAtChild = true
  } else {
    const fromStored = stored && storedPoints(stored, ref, child, parent)
    if (fromStored) {
      points = fromStored
      startsAtChild = stored.startTableId === ref.child.tableId
    } else {
      // No engine route for this pair, for example while it is being dragged.
      points = routeAvoiding(parent, child, obstacles(rects, ref)).points
      startsAtChild = false
    }
  }

  const first = points[0]
  const last = points.at(-1)
  if (!first || !last || points.length < 2) return null

  const startEndpoint = startsAtChild ? ref.child : ref.parent
  const endEndpoint = startsAtChild ? ref.parent : ref.child
  const start: EdgeEnd = {
    tableId: startEndpoint.tableId,
    point: first,
    direction: directionOf(first, points[1]!),
    cardinality: startEndpoint.cardinality,
  }
  const end: EdgeEnd = {
    tableId: endEndpoint.tableId,
    point: last,
    direction: directionOf(last, points.at(-2)!),
    cardinality: endEndpoint.cardinality,
  }

  return {
    refId: ref.id,
    points,
    path: roundedPath(points),
    // The link from a column to its enum type is not a foreign key; it carries no cardinality.
    markers: ref.kind === 'enum' ? '' : marker(start) + marker(end),
    start,
    end,
    startsAtChild,
  }
}

function anchorOf(
  tableId: string,
  column: string | undefined,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
): Anchor | null {
  const box = boxes.get(tableId)
  const position = getOwn(positions, tableId)
  if (!box || !position) return null
  return {
    rect: { x: position.x, y: position.y, width: box.width, height: box.height },
    y: position.y + portOffsetY(box, column),
  }
}

/** The engine's route is reused only while both tables still sit where it was computed. */
function storedPoints(
  stored: StoredRoute,
  ref: RefModel,
  child: Anchor,
  parent: Anchor,
): Point[] | null {
  const first = stored.startTableId === ref.child.tableId ? child : parent
  const last = first === child ? parent : child
  const start = { x: sideX(first, stored.startSide), y: first.y }
  const end = { x: sideX(last, stored.endSide), y: last.y }
  return routeSignature(start, end) === stored.signature ? stored.points : null
}

function sideX(anchor: Anchor, side: Side): number {
  return side === 'E' ? anchor.rect.x + anchor.rect.width : anchor.rect.x
}

function directionOf(end: Point, neighbour: Point): 1 | -1 {
  return neighbour.x >= end.x ? 1 : -1
}

function marker(end: EdgeEnd): string {
  const { x, y } = end.point
  if (end.cardinality === 'many') {
    const tip = x + end.direction * MANY_LENGTH
    return `M${tip} ${y}L${x} ${y - MANY_SPREAD}M${tip} ${y}L${x} ${y + MANY_SPREAD}`
  }
  const bar = x + end.direction * ONE_DISTANCE
  return `M${bar} ${y - ONE_HALF}L${bar} ${y + ONE_HALF}`
}
