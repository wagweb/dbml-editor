import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk-api'
import type { SchemaModel } from '@/dbml/model'
import { placeEnumsNearUsers } from './enums'
import { GEOMETRY, portOffsetY, type TableBox } from './geometry'
import { GROUP_INSET } from './groups'
import { orientRefs } from './orient'
import { sidesTopDown, type Extent } from './sides'
import {
  chooseRelaxedPairs,
  estimateSize,
  pairKey,
  type Gaps,
  type Size,
  type WeightedEdge,
} from './relax'
import { routeSignature, simplify, STUB, type Point } from './router'

export { routeSignature } from './router'

export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>
}

export interface LayoutPreferences {
  /** 'right' is today's layout: referenced tables left of the tables that reference them. */
  direction: 'right' | 'down'
  spacing: 'compact' | 'normal' | 'airy'
  /** Place each enum card next to the first table that uses it. */
  enumsNearUsers: boolean
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  direction: 'right',
  spacing: 'normal',
  enumsNearUsers: true,
}

/** How far each spacing setting stretches the distances tuned for 'normal'. */
export const SPACING_FACTORS: Readonly<Record<LayoutPreferences['spacing'], number>> = {
  compact: 0.7,
  normal: 1,
  airy: 1.4,
}

export interface LayoutRequest {
  model: SchemaModel
  boxes: ReadonlyMap<string, TableBox>
  /** Screen area the diagram should fill; decides how much the layout may wrap. */
  viewport?: Size
  /**
   * Where the tables sat before this change. The engine then follows their order on screen
   * instead of the order of the source, so a small edit moves little and the diagram stays
   * recognisable.
   */
  previous?: Readonly<Record<string, Point>>
  /**
   * Block pairs that were stacked last time. Reused as they are, so the groups do not
   * swap places when only the size of the cards changes.
   */
  stacked?: readonly string[]
  /** Reading direction, spacing and enum placement; `DEFAULT_LAYOUT_PREFERENCES` if absent. */
  options?: LayoutPreferences
}

export type Side = 'E' | 'W'

export interface StoredRoute {
  points: Point[]
  /** Table the first point belongs to. */
  startTableId: string
  startSide: Side
  endSide: Side
  /** Endpoint fingerprint; the route is only valid while both ends still sit there. */
  signature: string
}

export interface LayoutResult {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  /** Block pairs drawn as brackets (stacked instead of side by side). */
  stacked?: string[]
}

export interface Padding {
  top: number
  side: number
  bottom: number
}

/** Space a group reserves around its tables at 'normal' spacing, matching the canvas. */
export const GROUP_PADDING: Padding = { top: 44, side: 20, bottom: 20 }

const DEFAULT_VIEWPORT: Size = { width: 1280, height: 800 }
/** Bracket relations are only worth it if the diagram can be shown this much larger. */
const MIN_WRAP_GAIN = 1.1

/** Distances at 'normal' spacing, in pixels. Other settings scale them. */
const SPACING = {
  // Room between layers for cardinality markers and one lane per relation.
  'elk.layered.spacing.nodeNodeBetweenLayers': 64,
  'elk.layered.spacing.edgeNodeBetweenLayers': 24,
  'elk.layered.spacing.edgeEdgeBetweenLayers': 12,
  'elk.spacing.nodeNode': 28,
  'elk.spacing.edgeNode': 22,
  'elk.spacing.edgeEdge': 12,
  'elk.spacing.componentComponent': 56,
} as const

/** Applies to the root and to every group, since ELK does not inherit options. */
const SHARED_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.thoroughness': '24',
}

const ROOT_OPTIONS: LayoutOptions = {
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  // Follow the order of the DBML source wherever it costs no crossings, so the diagram
  // stays predictable while typing. Root only: ELK crashes when groups carry this option.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.compaction.connectedComponents': 'true',
  'elk.separateConnectedComponents': 'true',
}

/**
 * Top to bottom, ports sit on the side edges, across the flow. Brandes-Koepf then lines up
 * the right edge of one card with the left edge of the next and builds staircases; network
 * simplex keeps the lines about 20% shorter on the test schemas at a similar crossing count.
 */
const DOWN_OPTIONS: LayoutOptions = {
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
}

const TABLE_OPTIONS: LayoutOptions = { 'elk.portConstraints': 'FIXED_POS' }

/** Everything the engine derives from the layout preferences. */
interface Settings {
  direction: LayoutPreferences['direction']
  root: LayoutOptions
  group: LayoutOptions
  groupPadding: Padding
  /** Between layers and between neighbours in a layer; enum placement uses them too. */
  gaps: Gaps
}

/**
 * A scaled distance in steps of half a grid cell, so positions stay on whole pixels and
 * the steps between the settings stay visible. 'normal' keeps the tuned values exactly.
 */
export function scaleDistance(value: number, factor: number): number {
  if (factor === 1) return value
  const step = GEOMETRY.grid / 2
  return Math.max(step, Math.round((value * factor) / step) * step)
}

function settingsFor(preferences: LayoutPreferences): Settings {
  const factor = SPACING_FACTORS[preferences.spacing]
  const distance = (key: keyof typeof SPACING) => scaleDistance(SPACING[key], factor)
  const spacing: LayoutOptions = Object.fromEntries(
    Object.keys(SPACING).map((key) => [key, String(distance(key as keyof typeof SPACING))]),
  )
  // Only the padding beyond the region the canvas draws (label and tint) is scaled, so a
  // compact layout never lets one group's tint run into the next.
  const pad = (key: keyof Padding) =>
    GROUP_INSET[key] + scaleDistance(GROUP_PADDING[key] - GROUP_INSET[key], factor)
  const groupPadding: Padding = { top: pad('top'), side: pad('side'), bottom: pad('bottom') }
  const shared: LayoutOptions = {
    ...SHARED_OPTIONS,
    'elk.direction': preferences.direction === 'down' ? 'DOWN' : 'RIGHT',
    ...spacing,
    ...(preferences.direction === 'down' ? DOWN_OPTIONS : {}),
  }
  return {
    direction: preferences.direction,
    root: { ...shared, ...ROOT_OPTIONS },
    group: {
      ...shared,
      'elk.padding': `[top=${groupPadding.top},left=${groupPadding.side},bottom=${groupPadding.bottom},right=${groupPadding.side}]`,
    },
    groupPadding,
    gaps: {
      layer: distance('elk.layered.spacing.nodeNodeBetweenLayers'),
      node: distance('elk.spacing.nodeNode'),
    },
  }
}

interface PlannedEdge {
  refId: string
  /** For a bracket both ends leave towards a junction in a later layer. */
  shape: 'direct' | 'bracket'
  /** Referenced end: drawn first, left of the other table, or above it for 'down'. */
  leftTableId: string
  rightTableId: string
  leftOffsetY: number
  rightOffsetY: number
  leftSide: Side
  rightSide: Side
}

export async function runLayout(
  elk: ElkLike,
  request: LayoutRequest,
  overrides: LayoutOptions = {},
): Promise<LayoutResult> {
  const { model, boxes } = request
  const tables = model.tables.filter((t) => boxes.has(t.id))
  if (tables.length === 0) return { positions: {}, routes: {} }

  const preferences = request.options ?? DEFAULT_LAYOUT_PREFERENCES
  const settings = settingsFor(preferences)
  const groupOf = new Map(tables.map((t) => [t.id, t.groupId]))
  const blockOf = (tableId: string) => groupOf.get(tableId) ?? tableId
  const orientation = orientRefs(
    tables.map((t) => t.id),
    model.refs,
    blockOf,
  )

  const edges: PlannedEdge[] = []
  for (const ref of model.refs) {
    const direction = orientation.get(ref.id)
    const leftBox = direction && boxes.get(direction.leftTableId)
    const rightBox = direction && boxes.get(direction.rightTableId)
    if (!direction || !leftBox || !rightBox) continue
    const leftEnd = ref.parent.tableId === direction.leftTableId ? ref.parent : ref.child
    const rightEnd = leftEnd === ref.parent ? ref.child : ref.parent
    edges.push({
      refId: ref.id,
      shape: 'direct',
      leftTableId: direction.leftTableId,
      rightTableId: direction.rightTableId,
      leftOffsetY: portOffsetY(leftBox, leftEnd.columns[0]),
      rightOffsetY: portOffsetY(rightBox, rightEnd.columns[0]),
      ...sidesOf('direct'),
    })
  }

  const run = async (planned: PlannedEdge[]) =>
    readResult(
      await elk.layout(buildGraph(request, planned, settings, overrides)),
      request,
      planned,
    )
  const layout = async (planned: PlannedEdge[]) => {
    const first = await run(planned)
    if (settings.direction !== 'down') return first
    // Top to bottom, which edge of a card faces its neighbours is only known once the cards
    // are placed. A second pass attaches the relations to those edges.
    const sides = sidesTopDown(
      planned.map((edge) => ({ upper: edge.leftTableId, lower: edge.rightTableId })),
      extentsOf(first.positions, boxes),
    )
    const adjusted = planned.map((edge, index) => ({
      ...edge,
      leftSide: sides[index]!.upper,
      rightSide: sides[index]!.lower,
    }))
    const unchanged = adjusted.every(
      (edge, index) =>
        edge.leftSide === planned[index]!.leftSide && edge.rightSide === planned[index]!.rightSide,
    )
    return unchanged ? first : run(adjusted)
  }
  const finish = (result: LayoutResult, stacked: string[]): LayoutResult => {
    const done = { ...result, stacked }
    if (!preferences.enumsNearUsers) return done
    return {
      ...done,
      ...placeEnumsNearUsers({
        model,
        boxes,
        positions: result.positions,
        routes: result.routes,
        gap: settings.gaps.layer,
        clearance: settings.gaps.node,
      }),
    }
  }
  const stack = (pairs: ReadonlySet<string>) =>
    edges.map((edge) =>
      pairs.has(pairKey(blockOf(edge.leftTableId), blockOf(edge.rightTableId)))
        ? { ...edge, shape: 'bracket' as const, ...sidesOf('bracket') }
        : edge,
    )
  const blockPairs = new Set(
    edges.map((edge) => pairKey(blockOf(edge.leftTableId), blockOf(edge.rightTableId))),
  )

  // A relayout of a known diagram keeps the earlier decision while all its pairs still exist.
  const kept = request.stacked
  if (request.previous && kept && kept.every((pair) => blockPairs.has(pair))) {
    const pairs = new Set(kept)
    return finish(await layout(stack(pairs)), [...pairs])
  }

  const plain = await layout(edges)
  const relaxed = relaxedBlockPairs(request, edges, blockOf, settings)
  if (relaxed.size === 0) return finish(plain, [])

  // The choice above rests on an estimate, so the wrapped variant has to prove itself.
  const wrapped = await layout(stack(relaxed))
  const viewport = request.viewport ?? DEFAULT_VIEWPORT
  const gain = fitScale(wrapped, boxes, viewport) / fitScale(plain, boxes, viewport)
  return gain >= MIN_WRAP_GAIN ? finish(wrapped, [...relaxed]) : finish(plain, [])
}

/**
 * Which edge of each card a relation attaches to before anything is placed. A relation
 * leaves the referenced table on its right edge and enters the other table on its left
 * edge; a bracket leaves both on the right edge, towards the junction in a later layer.
 * Top to bottom this is only the first guess, see `sidesTopDown`.
 */
function sidesOf(shape: PlannedEdge['shape']): Pick<PlannedEdge, 'leftSide' | 'rightSide'> {
  return shape === 'bracket' ? { leftSide: 'E', rightSide: 'E' } : { leftSide: 'E', rightSide: 'W' }
}

function extentsOf(
  positions: Readonly<Record<string, Point>>,
  boxes: ReadonlyMap<string, TableBox>,
): Map<string, Extent> {
  const extents = new Map<string, Extent>()
  for (const [id, point] of Object.entries(positions)) {
    const box = boxes.get(id)
    if (box) extents.set(id, { x: point.x, width: box.width })
  }
  return extents
}

/** Zoom at which the laid out tables fit the viewport, never above 100%. */
function fitScale(
  result: LayoutResult,
  boxes: ReadonlyMap<string, TableBox>,
  viewport: Size,
): number {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [id, point] of Object.entries(result.positions)) {
    const box = boxes.get(id)
    if (!box) continue
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x + box.width)
    bottom = Math.max(bottom, point.y + box.height)
  }
  if (!Number.isFinite(left)) return 1
  return Math.min(
    1,
    viewport.width / Math.max(right - left, 1),
    viewport.height / Math.max(bottom - top, 1),
  )
}

const transpose = (size: Size): Size => ({ width: size.height, height: size.width })

/** Decides which pairs of blocks may stack instead of sitting in consecutive layers. */
function relaxedBlockPairs(
  request: LayoutRequest,
  edges: PlannedEdge[],
  blockOf: (tableId: string) => string,
  settings: Settings,
): Set<string> {
  const { model, boxes } = request
  // The estimate lays layers out from left to right. Top to bottom is the same drawing
  // turned by a quarter, so it is estimated on turned sizes against a turned viewport.
  const turn = settings.direction === 'down' ? transpose : (size: Size) => size
  const members = new Map<string, string[]>()
  for (const table of model.tables) {
    if (!boxes.has(table.id)) continue
    const block = blockOf(table.id)
    members.set(block, [...(members.get(block) ?? []), table.id])
  }

  const padding = settings.groupPadding
  const sizes = new Map<string, Size>()
  for (const [block, tableIds] of members) {
    const inner = edges
      .filter((e) => blockOf(e.leftTableId) === block && blockOf(e.rightTableId) === block)
      .map((e) => ({ from: e.leftTableId, to: e.rightTableId }))
    const content = turn(
      estimateSize(new Map(tableIds.map((id) => [id, turn(boxes.get(id)!)])), inner, settings.gaps),
    )
    const isGroup = tableIds.length > 1 || block !== tableIds[0]
    const size = isGroup
      ? {
          width: content.width + 2 * padding.side,
          height: content.height + padding.top + padding.bottom,
        }
      : content
    sizes.set(block, turn(size))
  }

  const between = new Map<string, WeightedEdge>()
  for (const edge of edges) {
    const from = blockOf(edge.leftTableId)
    const to = blockOf(edge.rightTableId)
    if (from === to) continue
    const key = pairKey(from, to)
    const known = between.get(key)
    if (known) known.weight += 1
    else between.set(key, { from, to, weight: 1 })
  }

  return chooseRelaxedPairs(
    sizes,
    [...between.values()],
    turn(request.viewport ?? DEFAULT_VIEWPORT),
    settings.gaps,
  )
}

function portId(tableId: string, offsetY: number, side: Side): string {
  return `port|${tableId}|${offsetY}|${side}`
}

const junctionId = (refId: string) => `junction|${refId}`
const junctionPort = (refId: string) => `junction-port|${refId}`
const startEdgeId = (refId: string) => `${refId}|start`
const endEdgeId = (refId: string) => `${refId}|end`

function buildGraph(
  request: LayoutRequest,
  edges: PlannedEdge[],
  settings: Settings,
  overrides: LayoutOptions,
): ElkNode {
  const { model, boxes, previous } = request
  // The engine follows model order wherever it costs nothing. Without previous positions
  // that is the order of the source; with them it is the order on screen, top to bottom,
  // so a relayout after a small change keeps tables and groups where the eye left them.
  const tables = previous ? sortBySeat(model.tables, previous) : model.tables

  const ports = new Map<string, Map<string, ElkPort>>()
  const addPort = (tableId: string, offsetY: number, side: Side) => {
    const box = boxes.get(tableId)
    if (!box) return
    const id = portId(tableId, offsetY, side)
    const tablePorts = ports.get(tableId) ?? new Map<string, ElkPort>()
    tablePorts.set(id, {
      id,
      x: side === 'E' ? box.width : 0,
      y: offsetY,
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': side === 'E' ? 'EAST' : 'WEST' },
    })
    ports.set(tableId, tablePorts)
  }
  for (const edge of edges) {
    addPort(edge.leftTableId, edge.leftOffsetY, edge.leftSide)
    addPort(edge.rightTableId, edge.rightOffsetY, edge.rightSide)
  }

  const tableNode = (id: string): ElkNode | undefined => {
    const box = boxes.get(id)
    if (!box) return undefined
    return {
      id,
      width: box.width,
      height: box.height,
      layoutOptions: TABLE_OPTIONS,
      ports: [...(ports.get(id)?.values() ?? [])],
    }
  }

  const grouped = new Set<string>()
  const groupNodes = new Map<string, ElkNode>()
  for (const group of model.groups) {
    const memberIds = previous
      ? sortBySeat(
          group.tableIds.map((id) => ({ id })),
          previous,
        ).map((t) => t.id)
      : group.tableIds
    const children = memberIds
      .filter((id) => !grouped.has(id))
      .map((id) => {
        grouped.add(id)
        return tableNode(id)
      })
      .filter((node): node is ElkNode => node !== undefined)
    if (children.length > 0) {
      groupNodes.set(group.id, {
        id: group.id,
        layoutOptions: { ...settings.group, ...overrides },
        children,
      })
    }
  }

  // Keep model order at the top level: a group takes the slot of its first table.
  const children: ElkNode[] = []
  const emittedGroups = new Set<string>()
  for (const table of tables) {
    if (!grouped.has(table.id)) {
      const node = tableNode(table.id)
      if (node) children.push(node)
      continue
    }
    const group = model.groups.find((g) => g.tableIds.includes(table.id) && groupNodes.has(g.id))
    const node = group && groupNodes.get(group.id)
    if (group && node && !emittedGroups.has(group.id)) {
      emittedGroups.add(group.id)
      children.push(node)
    }
  }

  const down = settings.direction === 'down'
  const elkEdges: ElkExtendedEdge[] = []
  for (const edge of edges) {
    const left = portId(edge.leftTableId, edge.leftOffsetY, edge.leftSide)
    const right = portId(edge.rightTableId, edge.rightOffsetY, edge.rightSide)
    if (edge.shape === 'direct') {
      elkEdges.push({ id: edge.refId, sources: [left], targets: [right] })
      continue
    }
    // A bracket is two edges that meet in an invisible junction in a later layer, to the
    // right of both tables (or below both for 'down').
    children.push({
      id: junctionId(edge.refId),
      width: 1,
      height: 1,
      layoutOptions: TABLE_OPTIONS,
      ports: [
        {
          id: junctionPort(edge.refId),
          x: down ? 0.5 : 0,
          y: down ? 0 : 0.5,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': down ? 'NORTH' : 'WEST' },
        },
      ],
    })
    elkEdges.push(
      { id: startEdgeId(edge.refId), sources: [left], targets: [junctionPort(edge.refId)] },
      { id: endEdgeId(edge.refId), sources: [right], targets: [junctionPort(edge.refId)] },
    )
  }

  return {
    id: 'root',
    layoutOptions: { ...settings.root, ...overrides },
    children,
    edges: elkEdges,
  }
}

/** Top to bottom, then left to right; tables without a seat keep their relative order last. */
function sortBySeat<T extends { id: string }>(
  items: readonly T[],
  previous: Readonly<Record<string, Point>>,
): T[] {
  const at = (item: T) => (Object.hasOwn(previous, item.id) ? previous[item.id] : undefined)
  return items
    .map((item, index) => ({ item, index, point: at(item) }))
    .sort((a, b) => {
      if (!a.point || !b.point) return Number(!a.point) - Number(!b.point) || a.index - b.index
      return a.point.y - b.point.y || a.point.x - b.point.x || a.index - b.index
    })
    .map((entry) => entry.item)
}

function readResult(graph: ElkNode, request: LayoutRequest, edges: PlannedEdge[]): LayoutResult {
  const { boxes } = request
  // Collected in a Map: a table may be called `__proto__` or `constructor`.
  const placed = new Map<string, Point>()
  const sections = new Map<string, Point[]>()

  const visit = (node: ElkNode) => {
    if (boxes.has(node.id)) {
      placed.set(node.id, { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) })
    }
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0]
      if (section) {
        sections.set(edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(graph)

  const routes: Record<string, StoredRoute> = {}
  for (const edge of edges) {
    const left = placed.get(edge.leftTableId)
    const right = placed.get(edge.rightTableId)
    const leftBox = boxes.get(edge.leftTableId)
    const rightBox = boxes.get(edge.rightTableId)
    if (!left || !right || !leftBox || !rightBox) continue

    const raw =
      edge.shape === 'bracket'
        ? joinAtJunction(sections.get(startEdgeId(edge.refId)), sections.get(endEdgeId(edge.refId)))
        : sections.get(edge.refId)
    if (!raw) continue

    const start = { x: sideX(left, leftBox, edge.leftSide), y: left.y + edge.leftOffsetY }
    const end = { x: sideX(right, rightBox, edge.rightSide), y: right.y + edge.rightOffsetY }
    routes[edge.refId] = {
      points: snapEnds(raw, start, end, edge.leftSide, edge.rightSide),
      startTableId: edge.leftTableId,
      startSide: edge.leftSide,
      endSide: edge.rightSide,
      signature: routeSignature(start, end),
    }
  }

  return { positions: Object.fromEntries(placed), routes }
}

function sideX(position: Point, box: TableBox, side: Side): number {
  return side === 'E' ? position.x + box.width : position.x
}

/** Both halves of a bracket end in the junction; the second half is walked backwards. */
function joinAtJunction(
  first: Point[] | undefined,
  second: Point[] | undefined,
): Point[] | undefined {
  if (!first || !second) return undefined
  return [...first, ...second.toReversed()]
}

/**
 * Tables land on whole pixels, so the route's ends are re-attached to the rounded ports
 * and the neighbouring bends follow to keep every segment axis-aligned.
 */
function snapEnds(raw: Point[], start: Point, end: Point, startSide: Side, endSide: Side): Point[] {
  const points = simplify(raw.map((p) => ({ x: p.x, y: p.y })))
  if (points.length <= 3) return elbowBetween(start, end, startSide, endSide)
  points[0] = start
  points[1] = { x: points[1]!.x, y: start.y }
  points[points.length - 1] = end
  points[points.length - 2] = { x: points[points.length - 2]!.x, y: end.y }
  return simplify(points)
}

/** Replacement for a route that rounding flattened to almost nothing. */
function elbowBetween(start: Point, end: Point, startSide: Side, endSide: Side): Point[] {
  if (startSide === endSide) {
    // Both ends on the same edge: one lane just outside the further of the two.
    const lane =
      startSide === 'E' ? Math.max(start.x, end.x) + STUB : Math.min(start.x, end.x) - STUB
    return simplify([start, { x: lane, y: start.y }, { x: lane, y: end.y }, end])
  }
  if (start.y === end.y) return [start, end]
  const middle = start.x === end.x ? start.x + STUB : (start.x + end.x) / 2
  return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end]
}
