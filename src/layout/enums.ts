import type { RefModel, SchemaModel } from '@/dbml/model'
import { crossesAny, routeAvoiding } from './avoid'
// Types only: elk.ts calls this module, so a value import from there would be a cycle.
import type { Side, StoredRoute } from './elk'
import { GEOMETRY, portOffsetY, snapToGrid, type TableBox } from './geometry'
import { groupRegions } from './groups'
import {
  inflate,
  intersects,
  routeSignature,
  STUB,
  type Anchor,
  type Point,
  type Rect,
} from './router'

export interface EnumPlacementRequest {
  model: SchemaModel
  boxes: ReadonlyMap<string, TableBox>
  positions: Readonly<Record<string, Point>>
  routes: Readonly<Record<string, StoredRoute>>
  /** Least horizontal distance between an enum card and the table beside it. */
  gap?: number
  /** Clear space kept between an enum card and other cards or group regions. */
  clearance?: number
}

export interface EnumPlacement {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
}

/** Below two stubs a link would have to double back between the two cards. */
const MIN_GAP = 2 * STUB
const DEFAULT_GAP = 64
const DEFAULT_CLEARANCE = 28
/** Clear space between an enum card and the lines of other relations. */
const LINE_CLEARANCE = 2 * GEOMETRY.grid
/** Same price as in the avoiding router: a bend is worth this much detour. */
const BEND_COST = 36
/** Extra distance an enum card may travel, per relation, to stay off that side. */
const SIDE_COST = 48
const CROSSING_COST = 48
/** A link planned through a card has to go around it: two bends and two stubs at least. */
const CARD_COST = 2 * BEND_COST + 2 * STUB
/** Search windows around the first user, tried in turn before falling back. */
const REACHES = [480, 960, 1920]

interface Size {
  width: number
  height: number
}

interface Candidate {
  point: Point
  /** Distance, bends and side preference; a lower bound of the full cost. */
  base: number
  /** Edge of the user the link leaves from. */
  side: Side
  /** Above or below the user, so the link runs around a lane on `side`. */
  around: boolean
}

interface SpotSearch {
  size: Size
  user: Rect
  /** Height of the row that uses the enum. */
  rowY: number
  /** Where the link meets the enum card, measured from its top. */
  headerOffset: number
  /** Relations attached to each edge of the user, apart from enum links being rebuilt. */
  busy: Record<Side, number>
  gap: number
  /** Cards and group regions, already grown by the clearance. */
  blocked: Rect[]
  /** Cards a link should not be planned through, as drawn. */
  cards: Rect[]
  lines: Point[][]
}

/**
 * Enum cards are ordinary nodes for the layered layout, so a widely used enum can land far
 * from its users with a long dashed link. This moves every enum card next to the first
 * table that uses it (first in model order), preferring the side where that table has
 * fewer relations, and never onto a card, a group region or another relation's line.
 * Positions are snapped to the grid. The links of a moved card get new routes that go
 * around the cards; every other route is kept as it is.
 */
export function placeEnumsNearUsers(request: EnumPlacementRequest): EnumPlacement {
  const { model, boxes } = request
  const gap = Math.max(request.gap ?? DEFAULT_GAP, MIN_GAP)
  const clearance = request.clearance ?? DEFAULT_CLEARANCE
  // Maps, not records: a table may be called `__proto__` or `constructor`.
  const positions = new Map(Object.entries(request.positions))
  const routes = new Map(Object.entries(request.routes))
  const tableOrder = new Map(model.tables.map((table, index) => [table.id, index]))

  const rectOf = (id: string): Rect | undefined => {
    const box = boxes.get(id)
    const position = positions.get(id)
    return box && position ? { ...position, width: box.width, height: box.height } : undefined
  }

  // The links of every enum card, ordered by their table's place in the model.
  const linksOf = new Map<string, RefModel[]>()
  for (const ref of model.refs) {
    if (ref.kind !== 'enum' || !rectOf(ref.child.tableId)) continue
    linksOf.set(ref.parent.tableId, [...(linksOf.get(ref.parent.tableId) ?? []), ref])
  }
  const order = (ref: RefModel) => tableOrder.get(ref.child.tableId) ?? Infinity
  for (const links of linksOf.values()) links.sort((a, b) => order(a) - order(b))

  const movable = model.tables.filter(
    (table) => table.kind === 'enum' && rectOf(table.id) && linksOf.has(table.id),
  )
  if (movable.length === 0) {
    return { positions: Object.fromEntries(positions), routes: Object.fromEntries(routes) }
  }

  // Links of cards that are about to move are rebuilt, so they neither block nor count.
  const pending = new Set(movable.flatMap((table) => linksOf.get(table.id)!.map((ref) => ref.id)))
  const unplaced = new Set(movable.map((table) => table.id))
  const refById = new Map(model.refs.map((ref) => [ref.id, ref]))
  const regions = groupRegions(model, boxes, request.positions).map((region) => region.rect)

  const cards = (except: ReadonlySet<string>): Rect[] =>
    model.tables
      .filter((table) => !unplaced.has(table.id) && !except.has(table.id))
      .map((table) => rectOf(table.id))
      .filter((rect): rect is Rect => rect !== undefined)
  const lines = (): Point[][] =>
    [...routes].filter(([refId]) => !pending.has(refId)).map(([, route]) => route.points)

  for (const card of movable) {
    const box = boxes.get(card.id)!
    const first = linksOf.get(card.id)![0]!
    const userId = first.child.tableId
    const user = rectOf(userId)!

    unplaced.delete(card.id)
    const point = findSpot({
      size: { width: box.width, height: box.height },
      user,
      rowY: user.y + portOffsetY(boxes.get(userId)!, first.child.columns[0]),
      headerOffset: portOffsetY(box, undefined),
      busy: sideLoad(userId, routes, refById, pending),
      gap,
      blocked: [...cards(new Set([card.id])), ...regions].map((rect) => inflate(rect, clearance)),
      cards: cards(new Set([card.id, userId])),
      lines: lines(),
    })
    positions.set(card.id, point)

    for (const ref of linksOf.get(card.id)!) {
      const others = cards(new Set([card.id, ref.child.tableId]))
      routes.set(ref.id, linkRoute(ref, rectOf, boxes, others))
      pending.delete(ref.id)
    }
  }

  return { positions: Object.fromEntries(positions), routes: Object.fromEntries(routes) }
}

/** How many relations attach to each edge of a table, judged by their stored routes. */
function sideLoad(
  tableId: string,
  routes: ReadonlyMap<string, StoredRoute>,
  refById: ReadonlyMap<string, RefModel>,
  pending: ReadonlySet<string>,
): Record<Side, number> {
  const load: Record<Side, number> = { E: 0, W: 0 }
  for (const [refId, route] of routes) {
    const ref = refById.get(refId)
    if (!ref || pending.has(refId)) continue
    if (route.startTableId === tableId) load[route.startSide] += 1
    else if (ref.child.tableId === tableId || ref.parent.tableId === tableId) {
      load[route.endSide] += 1
    }
  }
  return load
}

/**
 * The cheapest free grid position near the user. Candidates are visited by their lower
 * bound, so the search stops as soon as no remaining one can beat the best free one.
 */
function findSpot(search: SpotSearch): Point {
  const { size, user, rowY, blocked, cards, lines } = search
  const lineRects = lines.flatMap(segmentsOf).map((rect) => inflate(rect, LINE_CLEARANCE))
  const isFree = (point: Point) => {
    const rect = { ...point, ...size }
    return (
      !blocked.some((other) => intersects(rect, other)) &&
      !lineRects.some((other) => intersects(rect, other))
    )
  }

  for (const reach of REACHES) {
    const candidates: Candidate[] = []
    const left = snapToGrid(user.x - reach - size.width)
    const right = snapToGrid(user.x + user.width + reach)
    const top = snapToGrid(rowY - reach - size.height)
    const bottom = snapToGrid(rowY + reach)
    for (let x = left; x <= right; x += GEOMETRY.grid) {
      for (let y = top; y <= bottom; y += GEOMETRY.grid) {
        const candidate = assess({ x, y }, search)
        if (candidate) candidates.push(candidate)
      }
    }
    candidates.sort((a, b) => a.base - b.base || a.point.y - b.point.y || a.point.x - b.point.x)

    let best: { point: Point; cost: number } | null = null
    for (const candidate of candidates) {
      if (best && candidate.base >= best.cost) break
      if (!isFree(candidate.point)) continue
      const link = plannedLink(candidate, search)
      const cost =
        candidate.base +
        CROSSING_COST * crossings(link, lines) +
        CARD_COST * cards.filter((card) => crossesAny(link, [card])).length
      if (!best || cost < best.cost) best = { point: candidate.point, cost }
    }
    if (best) return best.point
  }

  // Crowded all around: below everything that is drawn is always free.
  const floor = Math.max(
    user.y + user.height,
    ...blocked.map((rect) => rect.y + rect.height),
    ...lineRects.map((rect) => rect.y + rect.height),
  )
  return { x: snapToGrid(user.x), y: snapToGrid(floor + GEOMETRY.grid) }
}

/**
 * Lower bound of what a card at this point costs: the length of its link, its bends and
 * the price of the user's edge it attaches to. Null where the card would sit too close.
 */
function assess(point: Point, search: SpotSearch): Candidate | null {
  const { size, user, rowY, headerOffset, busy, gap } = search
  const userRight = user.x + user.width
  const cardRight = point.x + size.width
  const rise = Math.abs(point.y + headerOffset - rowY)
  // A jog below one grid step comes from snapping and does not read as a bend.
  const jog = rise > GEOMETRY.grid ? 2 * BEND_COST : 0

  if (point.x >= userRight + gap) {
    return {
      point,
      base: point.x - userRight + rise + jog + SIDE_COST * busy.E,
      side: 'E',
      around: false,
    }
  }
  if (cardRight <= user.x - gap) {
    return {
      point,
      base: user.x - cardRight + rise + jog + SIDE_COST * busy.W,
      side: 'W',
      around: false,
    }
  }
  if (cardRight <= user.x || point.x >= userRight) {
    // Diagonal from the user and closer than the gap: the link would have to double back.
    return null
  }
  // Above or below the user: the link leaves and enters on one edge, around a lane.
  const east = 2 * (Math.max(userRight, cardRight) + STUB) - userRight - cardRight
  const west = user.x + point.x - 2 * (Math.min(user.x, point.x) - STUB)
  const side: Side = east + SIDE_COST * busy.E <= west + SIDE_COST * busy.W ? 'E' : 'W'
  return {
    point,
    base: (side === 'E' ? east : west) + rise + 2 * BEND_COST + SIDE_COST * busy[side],
    side,
    around: true,
  }
}

/** The elbow a candidate's cost assumes, used to count what the link would cross. */
function plannedLink(candidate: Candidate, search: SpotSearch): Point[] {
  const { size, user, rowY, headerOffset } = search
  const { point, side, around } = candidate
  const headerY = point.y + headerOffset
  const userX = side === 'E' ? user.x + user.width : user.x
  const cardRight = point.x + size.width
  let cardX: number
  let lane: number
  if (around) {
    cardX = side === 'E' ? cardRight : point.x
    lane = side === 'E' ? Math.max(userX, cardRight) + STUB : Math.min(user.x, point.x) - STUB
  } else {
    cardX = side === 'E' ? point.x : cardRight
    lane = (userX + cardX) / 2
  }
  return [
    { x: userX, y: rowY },
    { x: lane, y: rowY },
    { x: lane, y: headerY },
    { x: cardX, y: headerY },
  ]
}

/** Axis-aligned segments of a route as thin rectangles. */
function segmentsOf(points: readonly Point[]): Rect[] {
  const rects: Rect[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i]!
    const q = points[i + 1]!
    rects.push({
      x: Math.min(p.x, q.x),
      y: Math.min(p.y, q.y),
      width: Math.abs(p.x - q.x),
      height: Math.abs(p.y - q.y),
    })
  }
  return rects
}

/** Number of times a planned link crosses the lines of other relations. */
function crossings(link: readonly Point[], lines: readonly Point[][]): number {
  const own = segmentsOf(link)
  let count = 0
  for (const line of lines) {
    for (const other of segmentsOf(line)) {
      for (const segment of own) {
        const horizontal = segment.height === 0 ? segment : other
        const vertical = horizontal === segment ? other : segment
        if (horizontal.height !== 0 || vertical.width !== 0) continue
        if (
          vertical.x > horizontal.x &&
          vertical.x < horizontal.x + horizontal.width &&
          horizontal.y > vertical.y &&
          horizontal.y < vertical.y + vertical.height
        ) {
          count += 1
        }
      }
    }
  }
  return count
}

/** Route of an enum link, around the cards, stored like a route of the engine. */
function linkRoute(
  ref: RefModel,
  rectOf: (id: string) => Rect | undefined,
  boxes: ReadonlyMap<string, TableBox>,
  others: Rect[],
): StoredRoute {
  const anchor = (tableId: string, column: string | undefined): Anchor => {
    const rect = rectOf(tableId)!
    return { rect, y: rect.y + portOffsetY(boxes.get(tableId)!, column) }
  }
  const route = routeAvoiding(
    anchor(ref.parent.tableId, ref.parent.columns[0]),
    anchor(ref.child.tableId, ref.child.columns[0]),
    others,
  )
  return {
    points: route.points,
    startTableId: ref.parent.tableId,
    startSide: route.startSide,
    endSide: route.endSide,
    signature: routeSignature(route.points[0]!, route.points.at(-1)!),
  }
}
