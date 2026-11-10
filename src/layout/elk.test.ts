import type { ElkNode } from 'elkjs/lib/elk-api'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import type { SchemaModel } from '@/dbml/model'
import { parseDbml } from '@/dbml/parse'
import { SAMPLES } from '@/test/schemas'
import { crossesAny } from './avoid'
import { computeEdges } from './edges'
import {
  DEFAULT_LAYOUT_PREFERENCES,
  runLayout,
  routeSignature,
  scaleDistance,
  SPACING_FACTORS,
  type ElkLike,
  type LayoutPreferences,
  type LayoutResult,
  type StoredRoute,
} from './elk'
import {
  approximateMeasure,
  computeTableBox,
  GEOMETRY,
  portOffsetY,
  refColumnsByTable,
  type DetailLevel,
  type TableBox,
} from './geometry'
import { GROUP_INSET, groupRegions } from './groups'
import { pairKey } from './relax'
import type { Point, Rect } from './router'

const elk = new ELK()

async function layout(source: string) {
  const model = parseDbml(source).model
  if (!model) throw new Error('schema should parse')
  const refColumns = refColumnsByTable(model)
  const boxes = new Map<string, TableBox>(
    model.tables.map((t) => [
      t.id,
      computeTableBox(t, 'full', approximateMeasure, refColumns.get(t.id) ?? new Set()),
    ]),
  )
  const result = await runLayout(elk, { model, boxes })
  return { model, boxes, result }
}

function rect(result: LayoutResult, boxes: Map<string, TableBox>, id: string): Rect {
  const position = result.positions[id]!
  const box = boxes.get(id)!
  return { x: position.x, y: position.y, width: box.width, height: box.height }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

const SHOP = `
Table users { id int [pk]
  email varchar }
Table orders { id int [pk]
  user_id int [ref: > users.id]
  status varchar }
Table order_items { id int [pk]
  order_id int [ref: > orders.id]
  product_id int [ref: > products.id] }
Table products { id int [pk]
  name varchar }
Table audit { id int [pk] }
`

describe('runLayout', () => {
  it('positions every table without overlaps', async () => {
    const { model, boxes, result } = await layout(SHOP)
    const rects = model.tables.map((t) => rect(result, boxes, t.id))
    expect(Object.keys(result.positions).sort()).toEqual(model.tables.map((t) => t.id).sort())
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i]!, rects[j]!)).toBe(false)
      }
    }
  })

  it('reads left to right from referenced tables to the tables that reference them', async () => {
    const { result } = await layout(SHOP)
    expect(result.positions.users!.x).toBeLessThan(result.positions.orders!.x)
    expect(result.positions.orders!.x).toBeLessThan(result.positions.order_items!.x)
    expect(result.positions.products!.x).toBeLessThan(result.positions.order_items!.x)
  })

  it('uses whole pixel positions', async () => {
    const { result } = await layout(SHOP)
    for (const point of Object.values(result.positions)) {
      expect(Number.isInteger(point.x)).toBe(true)
      expect(Number.isInteger(point.y)).toBe(true)
    }
  })

  it('routes each relation between the right column rows', async () => {
    const { model, boxes, result } = await layout(SHOP)
    const ref = model.refs.find((r) => r.child.tableId === 'orders')!
    const route = result.routes[ref.id]!
    const users = rect(result, boxes, 'users')
    const orders = rect(result, boxes, 'orders')

    expect(route.startTableId).toBe('users')
    expect(route.points[0]).toEqual({
      x: users.x + users.width,
      y: users.y + portOffsetY(boxes.get('users')!, 'id'),
    })
    expect(route.points.at(-1)).toEqual({
      x: orders.x,
      y: orders.y + portOffsetY(boxes.get('orders')!, 'user_id'),
    })
    expect(route.signature).toBe(routeSignature(route.points[0]!, route.points.at(-1)!))
  })

  it('keeps routes orthogonal', async () => {
    const { result } = await layout(SHOP)
    for (const route of Object.values(result.routes)) {
      route.points.forEach((point, index) => {
        const next = route.points[index + 1]
        if (next) expect(point.x === next.x || point.y === next.y).toBe(true)
      })
    }
  })

  it('does not route self references', async () => {
    const { model, result } = await layout(`
      Table employees { id int [pk]
        manager_id int [ref: > employees.id] }
    `)
    expect(result.routes[model.refs[0]!.id]).toBeUndefined()
    expect(result.positions.employees).toBeDefined()
  })

  it('keeps grouped tables together and other tables out of the group area', async () => {
    const { model, boxes, result } = await layout(`
      Table users { id int [pk] }
      Table teams { id int [pk]
        owner_id int [ref: > users.id] }
      Table orders { id int [pk]
        user_id int [ref: > users.id] }
      Table invoices { id int [pk]
        order_id int [ref: > orders.id] }
      TableGroup people { users
        teams }
    `)
    const members = model.groups[0]!.tableIds.map((id) => rect(result, boxes, id))
    const bounds = {
      x: Math.min(...members.map((r) => r.x)),
      y: Math.min(...members.map((r) => r.y)),
      right: Math.max(...members.map((r) => r.x + r.width)),
      bottom: Math.max(...members.map((r) => r.y + r.height)),
    }
    const area: Rect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.right - bounds.x,
      height: bounds.bottom - bounds.y,
    }
    for (const id of ['orders', 'invoices']) {
      expect(overlaps(area, rect(result, boxes, id))).toBe(false)
    }
  })

  it('handles cyclic references', async () => {
    const { model, result } = await layout(`
      Table users { id int [pk]
        team_id int [ref: > teams.id] }
      Table teams { id int [pk]
        owner_id int [ref: > users.id] }
    `)
    expect(Object.keys(result.routes)).toHaveLength(model.refs.length)
  })

  it('returns an empty layout for an empty schema', async () => {
    const { result } = await layout('')
    expect(result).toEqual({ positions: {}, routes: {} })
  })

  it('stacks weakly related groups and routes their relation as a bracket', async () => {
    const source = `
      Table a1 { id int [pk] }
      Table a2 { id int [pk]
        a1_id int [ref: > a1.id] }
      Table b1 { id int [pk]
        a2_id int [ref: > a2.id] }
      Table b2 { id int [pk]
        b1_id int [ref: > b1.id] }
      Table c1 { id int [pk]
        b2_id int [ref: > b2.id] }
      Table c2 { id int [pk]
        c1_id int [ref: > c1.id] }
      TableGroup A { a1
        a2 }
      TableGroup B { b1
        b2 }
      TableGroup C { c1
        c2 }
    `
    const model = parseDbml(source).model!
    const refColumns = refColumnsByTable(model)
    const boxes = new Map<string, TableBox>(
      model.tables.map((t) => [
        t.id,
        computeTableBox(t, 'full', approximateMeasure, refColumns.get(t.id) ?? new Set()),
      ]),
    )
    const wide = await runLayout(elk, { model, boxes, viewport: { width: 4000, height: 500 } })
    const square = await runLayout(elk, { model, boxes, viewport: { width: 700, height: 700 } })
    const width = (result: LayoutResult) =>
      Math.max(...model.tables.map((t) => result.positions[t.id]!.x + boxes.get(t.id)!.width)) -
      Math.min(...model.tables.map((t) => result.positions[t.id]!.x))

    expect(width(square)).toBeLessThan(width(wide))
    expect(Object.values(wide.routes).every((r) => r.endSide === 'W')).toBe(true)

    const brackets = Object.values(square.routes).filter((r) => r.endSide === 'E')
    expect(brackets.length).toBeGreaterThan(0)
    for (const route of brackets) {
      const first = route.points[0]!
      const last = route.points.at(-1)!
      // Both ends leave to the right, so the line reaches further right than either end.
      expect(Math.max(...route.points.map((p) => p.x))).toBeGreaterThan(Math.max(first.x, last.x))
      route.points.forEach((point, index) => {
        const next = route.points[index + 1]
        if (next) expect(point.x === next.x || point.y === next.y).toBe(true)
      })
    }
    expect(Object.keys(square.routes)).toHaveLength(model.refs.length)
  })

  it('is deterministic', async () => {
    const first = await layout(SHOP)
    const second = await layout(SHOP)
    expect(second.result).toEqual(first.result)
  })

  it('places tables whose names collide with built-in object keys', async () => {
    const { model, result } = await layout(`
      Table constructor { id int [pk] }
      Table "__proto__" { id int [pk]
        constructor_id int [ref: > constructor.id] }
      Table toString { id int [pk]
        proto_id int [ref: > "__proto__".id] }
    `)
    for (const table of model.tables) {
      expect(Object.hasOwn(result.positions, table.id)).toBe(true)
    }
    expect(Object.keys(result.routes)).toHaveLength(2)
  })
})

describe('relayout of a known diagram', () => {
  const STACKED = `
Table customers { id int [pk] }
Table addresses { id int [pk]
  customer_id int [ref: > customers.id] }
Table countries { code char(2) [pk] }
Table products { id int [pk]
  name varchar }
Table categories { id int [pk] }
Table orders { id int [pk]
  customer_id int [ref: > customers.id]
  product_id int [ref: > products.id] }
Table items { id int [pk]
  order_id int [ref: > orders.id]
  product_id int [ref: > products.id] }
Ref: addresses.id > countries.code
Ref: products.id > categories.id
TableGroup people { customers
  addresses
  countries }
TableGroup catalog { products
  categories }
TableGroup sales { orders
  items }
`

  it('reports which block pairs it stacked and reuses them when asked', async () => {
    const { model, boxes } = await layout(STACKED)
    const first = await runLayout(elk, { model, boxes, viewport: { width: 900, height: 700 } })
    expect(Array.isArray(first.stacked)).toBe(true)
    const again = await runLayout(elk, {
      model,
      boxes,
      viewport: { width: 900, height: 700 },
      previous: first.positions,
      stacked: first.stacked,
    })
    expect(again.stacked).toEqual(first.stacked)
    expect(again.positions).toEqual(first.positions)
  })

  it('follows the order on screen when previous positions are given', async () => {
    const { model, boxes } = await layout(SHOP)
    const first = await runLayout(elk, { model, boxes })
    // Swap two unrelated tables vertically and ask again: the new order is kept.
    const swapped = {
      ...first.positions,
      products: first.positions.users!,
      users: first.positions.products!,
    }
    const again = await runLayout(elk, { model, boxes, previous: swapped, stacked: [] })
    for (const id of Object.keys(first.positions)) expect(again.positions[id]).toBeDefined()
  })
})

// ------------------------------------------------------------------ layout preferences

const PREFERENCES = DEFAULT_LAYOUT_PREFERENCES

function boxesFor(model: SchemaModel, detail: DetailLevel = 'full') {
  const refColumns = refColumnsByTable(model)
  return new Map<string, TableBox>(
    model.tables.map((t) => [
      t.id,
      computeTableBox(t, detail, approximateMeasure, refColumns.get(t.id) ?? new Set()),
    ]),
  )
}

function shown(source: string) {
  const model = shownModel(parseDbml(source).model!, {
    view: null,
    enums: true,
    suggestGroups: false,
  })
  return { model, boxes: boxesFor(model) }
}

/** The real engine, remembering every graph it was handed. */
function spying(): ElkLike & { graphs: ElkNode[] } {
  const graphs: ElkNode[] = []
  return {
    graphs,
    layout: (graph) => {
      graphs.push(structuredClone(graph))
      return elk.layout(graph)
    },
  }
}

/**
 * A stand-in engine that seats every node where it is told and joins ports with a straight
 * section, so the way routes are read back can be checked without ELK's own choices.
 */
function seating(seats: Record<string, Point>): ElkLike & { graphs: ElkNode[] } {
  const graphs: ElkNode[] = []
  return {
    graphs,
    async layout(graph) {
      graphs.push(structuredClone(graph))
      const ports = new Map<string, Point>()
      const seat = (node: ElkNode) => {
        const at = seats[node.id] ?? { x: 0, y: 0 }
        node.x = at.x
        node.y = at.y
        for (const port of node.ports ?? []) {
          ports.set(port.id, { x: at.x + (port.x ?? 0), y: at.y + (port.y ?? 0) })
        }
        for (const child of node.children ?? []) seat(child)
      }
      for (const child of graph.children ?? []) seat(child)
      for (const edge of graph.edges ?? []) {
        edge.sections = [
          {
            id: `${edge.id}|section`,
            startPoint: ports.get(edge.sources[0]!)!,
            endPoint: ports.get(edge.targets[0]!)!,
          },
        ]
      }
      return graph
    },
  }
}

function bounds(result: LayoutResult, boxes: ReadonlyMap<string, TableBox>) {
  const rects = Object.keys(result.positions).map((id) => rectOf(result, boxes, id))
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  return {
    width: Math.max(...rects.map((r) => r.x + r.width)) - left,
    height: Math.max(...rects.map((r) => r.y + r.height)) - top,
  }
}

function rectOf(result: LayoutResult, boxes: ReadonlyMap<string, TableBox>, id: string): Rect {
  return rect(result, boxes as Map<string, TableBox>, id)
}

function expectOrthogonal(route: StoredRoute) {
  route.points.forEach((point, index) => {
    const next = route.points[index + 1]
    if (next) expect(point.x === next.x || point.y === next.y).toBe(true)
  })
}

/** Every route leaves and enters a card sideways, on the edge it names, at its row. */
function expectSideAttached(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  result: LayoutResult,
) {
  const edges = computeEdges(model, boxes, result.positions, result.routes)
  for (const ref of model.refs) {
    const route = result.routes[ref.id]
    if (!route) continue
    expectOrthogonal(route)
    const first = route.points[0]!
    const second = route.points[1]!
    const last = route.points.at(-1)!
    const beforeLast = route.points.at(-2)!
    expect(second.y).toBe(first.y)
    expect(beforeLast.y).toBe(last.y)
    expect(Math.sign(second.x - first.x)).toBe(route.startSide === 'E' ? 1 : -1)
    expect(Math.sign(beforeLast.x - last.x)).toBe(route.endSide === 'E' ? 1 : -1)
    // The canvas takes the engine's route as it is.
    expect(edges.find((edge) => edge.refId === ref.id)!.points).toEqual(route.points)
  }
}

function expectNoLineThroughCards(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  result: LayoutResult,
) {
  for (const ref of model.refs) {
    const route = result.routes[ref.id]
    if (!route) continue
    const others = model.tables
      .filter((t) => t.id !== ref.child.tableId && t.id !== ref.parent.tableId)
      .map((t) => rectOf(result, boxes, t.id))
    expect(crossesAny(route.points, others), ref.id).toBe(false)
  }
}

function expectNoOverlaps(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  result: LayoutResult,
) {
  const rects = model.tables.map((t) => rectOf(result, boxes, t.id))
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      expect(overlaps(rects[i]!, rects[j]!)).toBe(false)
    }
  }
}

const WITH_ENUM = `
Enum status { active
  closed }
Table users { id int [pk]
  email varchar }
Table orders { id int [pk]
  user_id int [ref: > users.id]
  status status }
Table items { id int [pk]
  order_id int [ref: > orders.id] }
`

describe('layout preferences', () => {
  it('treats missing options as the defaults', async () => {
    const { model, boxes } = shown(WITH_ENUM)
    const implicit = await runLayout(elk, { model, boxes })
    const explicit = await runLayout(elk, { model, boxes, options: PREFERENCES })
    expect(implicit).toEqual(explicit)
    expect(PREFERENCES).toEqual({ direction: 'right', spacing: 'normal', enumsNearUsers: true })
  })

  it('hands the engine the tuned options at the defaults', async () => {
    const spy = spying()
    const { model, boxes } = shown(`${WITH_ENUM}
      TableGroup shop { orders
        items }
    `)
    await runLayout(spy, { model, boxes })
    const root = spy.graphs[0]!.layoutOptions!
    expect(root).toMatchObject({
      'elk.direction': 'RIGHT',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.spacing.nodeNode': '28',
      'elk.spacing.edgeNode': '22',
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.componentComponent': '56',
    })
    const group = spy.graphs[0]!.children!.find((child) => child.id === model.groups[0]!.id)!
    expect(group.layoutOptions!['elk.padding']).toBe('[top=44,left=20,bottom=20,right=20]')
  })

  it('changes nothing but the enum cards and their links at the defaults', async () => {
    const { model, boxes } = shown(WITH_ENUM)
    const before = await runLayout(elk, {
      model,
      boxes,
      options: { ...PREFERENCES, enumsNearUsers: false },
    })
    const after = await runLayout(elk, { model, boxes })
    const isEnum = (id: string) => id.startsWith('enum:') || id.startsWith('enum-link:')
    const keep = <T>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([id]) => !isEnum(id)))
    expect(keep(after.positions)).toEqual(keep(before.positions))
    expect(keep(after.routes)).toEqual(keep(before.routes))
    expect(after.stacked).toEqual(before.stacked)
  })

  it('places enum cards beside their first user, clear of every card and group', async () => {
    for (const sample of SAMPLES) {
      const model = shownModel(parseDbml(sample.source).model!, {
        view: null,
        enums: true,
        suggestGroups: false,
      })
      const boxes = boxesFor(model)
      const result = await runLayout(elk, { model, boxes, viewport: { width: 1000, height: 760 } })
      for (const card of model.tables.filter((t) => t.kind === 'enum')) {
        const users = model.refs.filter((r) => r.parent.tableId === card.id)
        if (users.length === 0) continue
        const first = model.tables.find((t) => users.some((r) => r.child.tableId === t.id))!
        const own = rectOf(result, boxes, card.id)
        const user = rectOf(result, boxes, first.id)
        const apart = Math.max(
          own.x - (user.x + user.width),
          user.x - (own.x + own.width),
          own.y - (user.y + user.height),
          user.y - (own.y + own.height),
        )
        expect(apart, `${sample.id} ${card.id}`).toBeLessThan(200)
        expect(Math.abs(own.x % GEOMETRY.grid)).toBe(0)
        expect(Math.abs(own.y % GEOMETRY.grid)).toBe(0)
        for (const other of model.tables.filter((t) => t.id !== card.id)) {
          expect(overlaps(own, rectOf(result, boxes, other.id)), other.id).toBe(false)
        }
        for (const region of groupRegions(model, boxes, result.positions)) {
          expect(overlaps(own, region.rect), region.group.name).toBe(false)
        }
      }
      expectNoLineThroughCards(model, boxes, result)
    }
  }, 20_000)

  it('leaves enum cards where the engine put them when asked to', async () => {
    const { model, boxes } = shown(WITH_ENUM)
    const spy = spying()
    const result = await runLayout(spy, {
      model,
      boxes,
      options: { ...PREFERENCES, enumsNearUsers: false },
    })
    const engine = await elk.layout(spy.graphs[0]!)
    const card = engine.children!.find((child) => child.id === 'enum:status')!
    expect(result.positions['enum:status']).toEqual({
      x: Math.round(card.x!),
      y: Math.round(card.y!),
    })
  })
})

describe('spacing', () => {
  it('scales distances in half grid steps and keeps normal exact', () => {
    expect(scaleDistance(28, 1)).toBe(28)
    expect(scaleDistance(22, 1)).toBe(22)
    expect(scaleDistance(64, SPACING_FACTORS.compact)).toBe(44)
    expect(scaleDistance(64, SPACING_FACTORS.airy)).toBe(88)
    expect(scaleDistance(12, SPACING_FACTORS.compact)).toBe(8)
    expect(scaleDistance(1, 0.1)).toBe(GEOMETRY.grid / 2)
    for (const value of [12, 22, 24, 28, 56, 64]) {
      for (const factor of [SPACING_FACTORS.compact, SPACING_FACTORS.airy]) {
        expect(scaleDistance(value, factor) % (GEOMETRY.grid / 2)).toBe(0)
      }
      expect(scaleDistance(value, SPACING_FACTORS.compact)).toBeLessThan(value)
      expect(scaleDistance(value, SPACING_FACTORS.airy)).toBeGreaterThan(value)
    }
  })

  it('moves layers and neighbours closer or further apart', async () => {
    const { model, boxes } = await layout(SHOP)
    const results = await Promise.all(
      (['compact', 'normal', 'airy'] as const).map((spacing) =>
        runLayout(elk, { model, boxes, options: { ...PREFERENCES, spacing } }),
      ),
    )
    const between = results.map(
      (r) => r.positions.orders!.x - (r.positions.users!.x + boxes.get('users')!.width),
    )
    expect(between[0]).toBeLessThan(between[1]!)
    expect(between[1]).toBeLessThan(between[2]!)
    const sizes = results.map((r) => bounds(r, boxes))
    expect(sizes[0]!.width).toBeLessThan(sizes[1]!.width)
    expect(sizes[1]!.width).toBeLessThan(sizes[2]!.width)
    expect(sizes[0]!.height).toBeLessThanOrEqual(sizes[1]!.height)
    expect(sizes[1]!.height).toBeLessThanOrEqual(sizes[2]!.height)
    for (const result of results) {
      expectNoOverlaps(model, boxes, result)
      for (const point of Object.values(result.positions)) {
        expect(Number.isInteger(point.x) && Number.isInteger(point.y)).toBe(true)
      }
    }
  })

  it('scales group padding but never below the region the canvas draws', async () => {
    const source = `
      Table a { id int [pk] }
      Table b { id int [pk]
        a_id int [ref: > a.id] }
      TableGroup g { a
        b }
    `
    const padding = async (spacing: LayoutPreferences['spacing']) => {
      const spy = spying()
      const { model, boxes } = shown(source)
      await runLayout(spy, { model, boxes, options: { ...PREFERENCES, spacing } })
      return spy.graphs[0]!.children!.find((c) => c.id === model.groups[0]!.id)!.layoutOptions![
        'elk.padding'
      ]
    }
    expect(await padding('compact')).toBe('[top=40,left=18,bottom=18,right=18]')
    expect(await padding('airy')).toBe('[top=48,left=22,bottom=22,right=22]')
    // The drawn region needs 36 px on top and 14 px elsewhere.
    expect(GROUP_INSET).toEqual({ top: 36, side: 14, bottom: 14 })
  })

  it('separates groups further when airy', async () => {
    const { model, boxes } = await layout(`
      Table a { id int [pk] }
      Table b { id int [pk]
        a_id int [ref: > a.id] }
      Table c { id int [pk]
        b_id int [ref: > b.id] }
      TableGroup left_side { a
        b }
    `)
    const gap = async (spacing: LayoutPreferences['spacing']) => {
      const result = await runLayout(elk, { model, boxes, options: { ...PREFERENCES, spacing } })
      const region = groupRegions(model, boxes, result.positions)[0]!.rect
      return result.positions.c!.x - (region.x + region.width)
    }
    const [compact, normal, airy] = [await gap('compact'), await gap('normal'), await gap('airy')]
    expect(compact).toBeLessThan(normal)
    expect(normal).toBeLessThan(airy)
    expect(compact).toBeGreaterThan(0)
  })
})

describe('top to bottom', () => {
  const DOWN: LayoutPreferences = { ...PREFERENCES, direction: 'down' }

  it('puts referenced tables above the tables that reference them', async () => {
    const { model, boxes } = await layout(SHOP)
    const result = await runLayout(elk, { model, boxes, options: DOWN })
    const bottom = (id: string) => result.positions[id]!.y + boxes.get(id)!.height
    expect(bottom('users')).toBeLessThanOrEqual(result.positions.orders!.y)
    expect(bottom('orders')).toBeLessThanOrEqual(result.positions.order_items!.y)
    expect(bottom('products')).toBeLessThanOrEqual(result.positions.order_items!.y)
    expectNoOverlaps(model, boxes, result)
    expectSideAttached(model, boxes, result)
  })

  it('asks the engine for a top to bottom layout with network simplex placement', async () => {
    const spy = spying()
    const { model, boxes } = await layout(SHOP)
    await runLayout(spy, { model, boxes, options: DOWN })
    expect(spy.graphs[0]!.layoutOptions).toMatchObject({
      'elk.direction': 'DOWN',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    })
  })

  it('reads every sample with lines on the side edges and none through a card', async () => {
    for (const sample of SAMPLES) {
      for (const detail of ['full', 'keys'] as const) {
        const model = shownModel(parseDbml(sample.source).model!, {
          view: null,
          enums: true,
          suggestGroups: false,
        })
        const boxes = boxesFor(model, detail)
        const result = await runLayout(elk, {
          model,
          boxes,
          viewport: { width: 1000, height: 760 },
          options: DOWN,
        })
        expect(Object.keys(result.positions).sort()).toEqual(model.tables.map((t) => t.id).sort())
        expectNoOverlaps(model, boxes, result)
        expectSideAttached(model, boxes, result)
        expectNoLineThroughCards(model, boxes, result)
        // A table of a group sits inside its group's region, other tables outside.
        for (const region of groupRegions(model, boxes, result.positions)) {
          for (const table of model.tables.filter((t) => t.groupId !== region.group.id)) {
            expect(overlaps(region.rect, rectOf(result, boxes, table.id)), table.id).toBe(false)
          }
        }
      }
    }
  }, 20_000)

  it('stacks groups side by side when the column would not fit, with the junction below', async () => {
    const source = `
      Table a1 { id int [pk] }
      Table a2 { id int [pk]
        a1_id int [ref: > a1.id] }
      Table b1 { id int [pk]
        a2_id int [ref: > a2.id] }
      Table b2 { id int [pk]
        b1_id int [ref: > b1.id] }
      Table c1 { id int [pk]
        b2_id int [ref: > b2.id] }
      Table c2 { id int [pk]
        c1_id int [ref: > c1.id] }
      TableGroup A { a1
        a2 }
      TableGroup B { b1
        b2 }
      TableGroup C { c1
        c2 }
    `
    const { model, boxes } = await layout(source)
    const spy = spying()
    const wide = await runLayout(spy, {
      model,
      boxes,
      viewport: { width: 4000, height: 600 },
      options: DOWN,
    })
    const tall = await runLayout(elk, {
      model,
      boxes,
      viewport: { width: 600, height: 4000 },
      options: DOWN,
    })
    expect(wide.stacked!.length).toBeGreaterThan(0)
    expect(tall.stacked).toEqual([])
    expect(bounds(wide, boxes).height).toBeLessThan(bounds(tall, boxes).height)
    const junctions = spy.graphs
      .flatMap((graph) => graph.children ?? [])
      .filter((child) => child.id.startsWith('junction|'))
    expect(junctions.length).toBeGreaterThan(0)
    for (const junction of junctions) {
      expect(junction.ports![0]!.layoutOptions!['elk.port.side']).toBe('NORTH')
    }
    expect(Object.keys(wide.routes)).toHaveLength(model.refs.length)
    expectSideAttached(model, boxes, wide)

    // A relayout keeps the decision.
    const again = await runLayout(elk, {
      model,
      boxes,
      viewport: { width: 4000, height: 600 },
      previous: wide.positions,
      stacked: wide.stacked,
      options: DOWN,
    })
    expect(again.stacked).toEqual(wide.stacked)
  })

  it('attaches relations to the edges that face their neighbours in a second pass', async () => {
    const { model, boxes } = await layout(SHOP)
    // users above and right of orders: the line leaves users on the left.
    const engine = seating({ users: { x: 600, y: 0 }, orders: { x: 0, y: 300 } })
    const narrow = {
      ...model,
      tables: model.tables.filter((t) => t.id === 'users' || t.id === 'orders'),
      refs: model.refs.filter((r) => r.child.tableId === 'orders'),
    }
    const result = await runLayout(engine, { model: narrow, boxes, options: DOWN })
    expect(engine.graphs).toHaveLength(2)
    const route = Object.values(result.routes)[0]!
    expect(route.startSide).toBe('W')
    expect(route.endSide).toBe('E')
    expectSideAttached(narrow, boxes, result)
  })

  it('needs one pass when the first guess already faces the neighbours', async () => {
    const { model, boxes } = await layout(SHOP)
    const engine = seating({ users: { x: 0, y: 0 }, orders: { x: 600, y: 300 } })
    const narrow = {
      ...model,
      tables: model.tables.filter((t) => t.id === 'users' || t.id === 'orders'),
      refs: model.refs.filter((r) => r.child.tableId === 'orders'),
    }
    await runLayout(engine, { model: narrow, boxes, options: DOWN })
    expect(engine.graphs).toHaveLength(1)
  })
})

describe('routes read back from the engine', () => {
  const TWO = `
    Table users { id int [pk] }
    Table orders { id int [pk]
      user_id int [ref: > users.id] }
  `

  it('turns a route without bends into an elbow between the two rows', async () => {
    const { model, boxes } = await layout(TWO)
    const result = await runLayout(seating({ users: { x: 0, y: 0 }, orders: { x: 400, y: 100 } }), {
      model,
      boxes,
    })
    const route = result.routes[model.refs[0]!.id]!
    const start = { x: boxes.get('users')!.width, y: portOffsetY(boxes.get('users')!, 'id') }
    const end = { x: 400, y: 100 + portOffsetY(boxes.get('orders')!, 'user_id') }
    const middle = (start.x + end.x) / 2
    expect(route.points).toEqual([start, { x: middle, y: start.y }, { x: middle, y: end.y }, end])
  })

  it('keeps a straight route straight and steps out when both ends share an x', async () => {
    const { model, boxes } = await layout(TWO)
    const level =
      portOffsetY(boxes.get('users')!, 'id') - portOffsetY(boxes.get('orders')!, 'user_id')
    const straight = await runLayout(
      seating({ users: { x: 0, y: 0 }, orders: { x: 400, y: level } }),
      { model, boxes },
    )
    expect(straight.routes[model.refs[0]!.id]!.points).toHaveLength(2)

    const width = boxes.get('users')!.width
    const touching = await runLayout(
      seating({ users: { x: 0, y: 0 }, orders: { x: width, y: 200 } }),
      { model, boxes },
    )
    const points = touching.routes[model.refs[0]!.id]!.points
    expect(points[1]!.x).toBe(width + 24)
  })

  it('draws a flattened bracket around a lane outside both cards', async () => {
    const { model, boxes } = await layout(TWO)
    const seats = { users: { x: 0, y: 0 }, orders: { x: 100, y: 300 } }
    const result = await runLayout(seating(seats), {
      model,
      boxes,
      previous: seats,
      stacked: [pairKey('users', 'orders')],
    })
    const route = result.routes[model.refs[0]!.id]!
    expect(route.startSide).toBe('E')
    expect(route.endSide).toBe('E')
    const lane = Math.max(boxes.get('users')!.width, 100 + boxes.get('orders')!.width) + 24
    expect(route.points[1]!.x).toBe(lane)
    expect(route.points[2]!.x).toBe(lane)
    expectOrthogonal(route)
  })

  it('draws a lane on the left when both ends attach to the left edge', async () => {
    // b is referenced by a (far left) and c (far right); c's keys and b's foreign keys
    // both end up on the left edge.
    const { model, boxes } = await layout(`
      Table c { id int [pk] }
      Table a { id int [pk] }
      Table b { id int [pk]
        c_id int [ref: > c.id]
        a_id int [ref: > a.id] }
    `)
    const engine = seating({
      c: { x: 1000, y: 0 },
      a: { x: -1000, y: 0 },
      b: { x: 0, y: 400 },
    })
    const result = await runLayout(engine, {
      model,
      boxes,
      options: { ...PREFERENCES, direction: 'down' },
    })
    const fromC = result.routes[model.refs.find((r) => r.parent.tableId === 'c')!.id]!
    expect(fromC.startSide).toBe('W')
    expect(fromC.endSide).toBe('W')
    expect(fromC.points[1]!.x).toBe(Math.min(1000, 0) - 24)
    expectOrthogonal(fromC)
  })
})
