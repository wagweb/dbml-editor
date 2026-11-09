import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import { parseDbml } from '@/dbml/parse'
import { crossesAny } from './avoid'
import { computeEdges, refreshRoutes } from './edges'
import { routeSignature, type StoredRoute } from './elk'
import {
  approximateMeasure,
  computeTableBox,
  portOffsetY,
  refColumnsByTable,
  type TableBox,
} from './geometry'

function setup(source: string) {
  const model = parseDbml(source).model!
  const refColumns = refColumnsByTable(model)
  const boxes = new Map<string, TableBox>(
    model.tables.map((t) => [
      t.id,
      computeTableBox(t, 'full', approximateMeasure, refColumns.get(t.id) ?? new Set()),
    ]),
  )
  return { model, boxes }
}

const SOURCE = `
Table users { id int [pk] }
Table orders { id int [pk]
  user_id int [ref: > users.id] }
`

describe('computeEdges', () => {
  const { model, boxes } = setup(SOURCE)
  const ref = model.refs[0]!
  const positions = { users: { x: 0, y: 0 }, orders: { x: 400, y: 100 } }
  const usersRight = boxes.get('users')!.width
  const start = { x: usersRight, y: portOffsetY(boxes.get('users')!, 'id') }
  const end = { x: 400, y: 100 + portOffsetY(boxes.get('orders')!, 'user_id') }

  it('connects the two column rows with an orthogonal fallback route', () => {
    const [edge] = computeEdges(model, boxes, positions, {})
    expect(edge!.points[0]).toEqual(start)
    expect(edge!.points.at(-1)).toEqual(end)
    expect(edge!.startsAtChild).toBe(false)
    expect(edge!.path.startsWith(`M${start.x} ${start.y}`)).toBe(true)
  })

  it('marks the referenced end with a bar and the referencing end with a crow foot', () => {
    const [edge] = computeEdges(model, boxes, positions, {})
    expect(edge!.start).toMatchObject({ tableId: 'users', cardinality: 'one', direction: 1 })
    expect(edge!.end).toMatchObject({ tableId: 'orders', cardinality: 'many', direction: -1 })
    // One bar (a single segment) plus a two-stroke crow foot.
    expect(edge!.markers.match(/M/g)).toHaveLength(3)
  })

  it('uses the layout engine route while both tables stay in place', () => {
    const points = [start, { x: 300, y: start.y }, { x: 300, y: end.y }, end]
    const stored: StoredRoute = {
      points,
      startTableId: 'users',
      startSide: 'E',
      endSide: 'W',
      signature: routeSignature(start, end),
    }
    const [edge] = computeEdges(model, boxes, positions, { [ref.id]: stored })
    expect(edge!.points).toBe(points)

    const moved = { ...positions, orders: { x: 408, y: 100 } }
    const [rerouted] = computeEdges(model, boxes, moved, { [ref.id]: stored })
    expect(rerouted!.points).not.toBe(points)
    expect(rerouted!.points.at(-1)).toEqual({ x: 408, y: end.y })
  })

  it('follows a stored route that starts at the referencing table', () => {
    const flipped = { users: { x: 400, y: 0 }, orders: { x: 0, y: 0 } }
    const from = {
      x: boxes.get('orders')!.width,
      y: portOffsetY(boxes.get('orders')!, 'user_id'),
    }
    const to = { x: 400, y: portOffsetY(boxes.get('users')!, 'id') }
    const stored: StoredRoute = {
      points: [from, { x: 300, y: from.y }, { x: 300, y: to.y }, to],
      startTableId: 'orders',
      startSide: 'E',
      endSide: 'W',
      signature: routeSignature(from, to),
    }
    const [edge] = computeEdges(model, boxes, flipped, { [ref.id]: stored })
    expect(edge!.startsAtChild).toBe(true)
    expect(edge!.start.cardinality).toBe('many')
  })

  it('accepts bracket routes whose ends both sit on the right side', () => {
    const stacked = { users: { x: 0, y: 0 }, orders: { x: 0, y: 300 } }
    const from = { x: usersRight, y: portOffsetY(boxes.get('users')!, 'id') }
    const to = {
      x: boxes.get('orders')!.width,
      y: 300 + portOffsetY(boxes.get('orders')!, 'user_id'),
    }
    const stored: StoredRoute = {
      points: [from, { x: 260, y: from.y }, { x: 260, y: to.y }, to],
      startTableId: 'users',
      startSide: 'E',
      endSide: 'E',
      signature: routeSignature(from, to),
    }
    const [edge] = computeEdges(model, boxes, stacked, { [ref.id]: stored })
    expect(edge!.points).toBe(stored.points)
    expect(edge!.end.direction).toBe(1)
  })

  it('skips relations whose tables have no position yet', () => {
    expect(computeEdges(model, boxes, { users: { x: 0, y: 0 } }, {})).toEqual([])
  })

  it('draws a loop for a table that references itself', () => {
    const self = setup(`Table nodes { id int [pk]
      parent_id int [ref: > nodes.id] }`)
    const [edge] = computeEdges(self.model, self.boxes, { nodes: { x: 0, y: 0 } }, {})
    const right = self.boxes.get('nodes')!.width
    expect(edge!.startsAtChild).toBe(true)
    expect(edge!.points[0]!.x).toBe(right)
    expect(edge!.points.at(-1)!.x).toBe(right)
    expect(Math.max(...edge!.points.map((p) => p.x))).toBeGreaterThan(right)
  })
})

describe('refreshRoutes', () => {
  const { model, boxes } = setup(`
Table users { id int [pk] }
Table orders { id int [pk]
  user_id int [ref: > users.id] }
Table wall { id int [pk]
  a int
  b int
  c int }
`)
  const ref = model.refs[0]!
  const users = boxes.get('users')!
  const orders = boxes.get('orders')!

  it('keeps a stored route while it still fits and nothing sits on it', () => {
    const positions = { users: { x: 0, y: 0 }, orders: { x: 400, y: 0 }, wall: { x: 0, y: 400 } }
    const start = { x: users.width, y: portOffsetY(users, 'id') }
    const end = { x: 400, y: portOffsetY(orders, 'user_id') }
    const stored: StoredRoute = {
      points: [start, { x: 200, y: start.y }, { x: 200, y: end.y }, end],
      startTableId: 'users',
      startSide: 'E',
      endSide: 'W',
      signature: routeSignature(start, end),
    }
    const routes = refreshRoutes(model, boxes, positions, { [ref.id]: stored })
    expect(routes[ref.id]).toBe(stored)
  })

  it('finds a way round a table that was dropped onto the line', () => {
    // The wall sits right between the two tables, across the straight line.
    const positions = { users: { x: 0, y: 0 }, orders: { x: 600, y: 0 }, wall: { x: 250, y: -60 } }
    const start = { x: users.width, y: portOffsetY(users, 'id') }
    const end = { x: 600, y: portOffsetY(orders, 'user_id') }
    const straight: StoredRoute = {
      points: [start, { x: 300, y: start.y }, { x: 300, y: end.y }, end],
      startTableId: 'users',
      startSide: 'E',
      endSide: 'W',
      signature: routeSignature(start, end),
    }
    const routes = refreshRoutes(model, boxes, positions, { [ref.id]: straight })
    const route = routes[ref.id]!
    expect(route).not.toBe(straight)
    const wall = {
      x: 250,
      y: -60,
      width: boxes.get('wall')!.width,
      height: boxes.get('wall')!.height,
    }
    expect(crossesAny(route.points, [wall])).toBe(false)
    expect(routeSignature(route.points[0]!, route.points.at(-1)!)).toBe(route.signature)
    // The edge layer draws exactly this route afterwards.
    const [edge] = computeEdges(model, boxes, positions, routes)
    expect(edge!.points).toEqual(route.points)
  })

  it('forgets routes of relations that are gone and skips unplaced tables', () => {
    const routes = refreshRoutes(
      model,
      boxes,
      { users: { x: 0, y: 0 } },
      {
        stale: {
          points: [],
          startTableId: 'x',
          startSide: 'E',
          endSide: 'W',
          signature: '',
        },
      },
    )
    expect(routes).toEqual({})
  })
})

describe('enum links', () => {
  it('carry no cardinality markers', () => {
    const { model, boxes } = setup(`
Table users { id int [pk]
  status user_status }
Enum user_status { active }
`)
    const shown = shownModel(model, { view: null, enums: true, suggestGroups: false })
    const refColumns = refColumnsByTable(shown)
    const allBoxes = new Map(
      shown.tables.map((t) => [
        t.id,
        boxes.get(t.id) ??
          computeTableBox(t, 'full', approximateMeasure, refColumns.get(t.id) ?? new Set()),
      ]),
    )
    const positions = { users: { x: 0, y: 0 }, 'enum:user_status': { x: 400, y: 0 } }
    const [edge] = computeEdges(shown, allBoxes, positions, {})
    expect(edge!.markers).toBe('')
    expect(edge!.points.length).toBeGreaterThan(1)
  })
})
