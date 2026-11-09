import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import { runLayout, routeSignature, type LayoutResult } from './elk'
import {
  approximateMeasure,
  computeTableBox,
  portOffsetY,
  refColumnsByTable,
  type TableBox,
} from './geometry'
import type { Rect } from './router'

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
