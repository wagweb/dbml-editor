import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import type { SchemaModel } from '@/dbml/model'
import { parseDbml } from '@/dbml/parse'
import { crossesAny } from './avoid'
import { computeEdges } from './edges'
import { routeSignature, type StoredRoute } from './elk'
import { placeEnumsNearUsers, type EnumPlacement } from './enums'
import {
  approximateMeasure,
  computeTableBox,
  GEOMETRY,
  portOffsetY,
  refColumnsByTable,
  type TableBox,
} from './geometry'
import { groupRegions } from './groups'
import { inflate, intersects, type Point, type Rect } from './router'

const GAP = 64
const CLEARANCE = 28

function setup(source: string) {
  const model = shownModel(parseDbml(source).model!, {
    view: null,
    enums: true,
    suggestGroups: false,
  })
  const refColumns = refColumnsByTable(model)
  const boxes = new Map<string, TableBox>(
    model.tables.map((t) => [
      t.id,
      computeTableBox(t, 'full', approximateMeasure, refColumns.get(t.id) ?? new Set()),
    ]),
  )
  return { model, boxes }
}

function place(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Record<string, Point>,
  routes: Record<string, StoredRoute> = {},
): EnumPlacement {
  return placeEnumsNearUsers({ model, boxes, positions, routes, gap: GAP, clearance: CLEARANCE })
}

function rectAt(result: EnumPlacement, boxes: ReadonlyMap<string, TableBox>, id: string): Rect {
  const point = result.positions[id]!
  const box = boxes.get(id)!
  return { x: point.x, y: point.y, width: box.width, height: box.height }
}

/** Route between two rows, leaving `from` on the right and entering `to` on the left. */
function routeBetween(
  boxes: ReadonlyMap<string, TableBox>,
  positions: Record<string, Point>,
  from: [string, string],
  to: [string, string],
): StoredRoute {
  const start = {
    x: positions[from[0]]!.x + boxes.get(from[0])!.width,
    y: positions[from[0]]!.y + portOffsetY(boxes.get(from[0])!, from[1]),
  }
  const end = {
    x: positions[to[0]]!.x,
    y: positions[to[0]]!.y + portOffsetY(boxes.get(to[0])!, to[1]),
  }
  const middle = (start.x + end.x) / 2
  return {
    points: [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end],
    startTableId: from[0],
    startSide: 'E',
    endSide: 'W',
    signature: routeSignature(start, end),
  }
}

function expectClearOfCards(
  result: EnumPlacement,
  boxes: ReadonlyMap<string, TableBox>,
  enumId: string,
) {
  const card = rectAt(result, boxes, enumId)
  for (const id of Object.keys(result.positions)) {
    if (id === enumId) continue
    expect(intersects(inflate(card, CLEARANCE - 1), rectAt(result, boxes, id)), id).toBe(false)
  }
}

function expectOnGrid(point: Point) {
  expect(Math.abs(point.x % GEOMETRY.grid)).toBe(0)
  expect(Math.abs(point.y % GEOMETRY.grid)).toBe(0)
}

const MOOD = `
Enum mood { happy
  sad }
Table people { id int [pk]
  name varchar
  mood mood }
`

describe('placeEnumsNearUsers', () => {
  it('moves an enum card next to the table that uses it', () => {
    const { model, boxes } = setup(MOOD)
    const result = place(model, boxes, {
      people: { x: 400, y: 0 },
      'enum:mood': { x: 3000, y: 3000 },
    })

    const people = rectAt(result, boxes, 'people')
    const mood = rectAt(result, boxes, 'enum:mood')
    const besideRight = mood.x - (people.x + people.width)
    const besideLeft = people.x - (mood.x + mood.width)
    expect(Math.max(besideRight, besideLeft)).toBeGreaterThanOrEqual(GAP)
    expect(Math.max(besideRight, besideLeft)).toBeLessThan(GAP + GEOMETRY.grid)
    // The link runs almost straight: the enum header faces the row of the column.
    const row = people.y + portOffsetY(boxes.get('people')!, 'mood')
    const header = mood.y + portOffsetY(boxes.get('enum:mood')!, undefined)
    expect(Math.abs(header - row)).toBeLessThanOrEqual(GEOMETRY.grid / 2)
    expectOnGrid(result.positions['enum:mood']!)
    expect(result.positions.people).toEqual({ x: 400, y: 0 })
  })

  it('gives the moved link a route that the canvas accepts', () => {
    const { model, boxes } = setup(MOOD)
    const result = place(model, boxes, {
      people: { x: 400, y: 0 },
      'enum:mood': { x: 3000, y: 3000 },
    })
    const link = model.refs.find((ref) => ref.kind === 'enum')!
    const route = result.routes[link.id]!
    expect(route.startTableId).toBe('enum:mood')
    route.points.forEach((point, index) => {
      const next = route.points[index + 1]
      if (next) expect(point.x === next.x || point.y === next.y).toBe(true)
    })
    const [edge] = computeEdges(model, boxes, result.positions, result.routes)
    expect(edge!.points).toEqual(route.points)
  })

  it('goes to the side of the table where no relations attach', () => {
    const source = `${MOOD}
      Table posts { id int [pk]
        person_id int [ref: > people.id] }
      Table teams { id int [pk] }
      Table members { id int [pk]
        team_id int [ref: > teams.id] }
    `
    const { model, boxes } = setup(source)
    const relation = model.refs.find((ref) => ref.child.tableId === 'posts')!

    // Relations leave people on the right: the enum goes left.
    const right = {
      people: { x: 400, y: 0 },
      posts: { x: 900, y: 0 },
      teams: { x: 0, y: 900 },
      members: { x: 600, y: 900 },
      'enum:mood': { x: 3000, y: 3000 },
    }
    const towardsRight = place(model, boxes, right, {
      [relation.id]: routeBetween(boxes, right, ['people', 'id'], ['posts', 'person_id']),
    })
    expect(rectAt(towardsRight, boxes, 'enum:mood').x).toBeLessThan(400)

    // The same table with its relation arriving from the left: the enum goes right.
    const source2 = `${MOOD}
      Table groups { id int [pk] }
      Ref: people.name > groups.id
    `
    const mirrored = setup(source2)
    const link = mirrored.model.refs.find((ref) => ref.kind !== 'enum')!
    const left = {
      groups: { x: 0, y: 0 },
      people: { x: 500, y: 0 },
      'enum:mood': { x: 3000, y: 3000 },
    }
    const fromLeft = place(mirrored.model, mirrored.boxes, left, {
      [link.id]: routeBetween(mirrored.boxes, left, ['groups', 'id'], ['people', 'name']),
    })
    const people = rectAt(fromLeft, mirrored.boxes, 'people')
    expect(rectAt(fromLeft, mirrored.boxes, 'enum:mood').x).toBeGreaterThan(people.x + people.width)
  })

  it('follows the first table in model order that uses the enum', () => {
    const { model, boxes } = setup(`
      Enum mood { happy }
      Table later_in_alphabet { id int [pk]
        mood mood }
      Table aardvarks { id int [pk]
        mood mood }
    `)
    const result = place(model, boxes, {
      later_in_alphabet: { x: 2000, y: 0 },
      aardvarks: { x: 0, y: 0 },
      'enum:mood': { x: 1000, y: 1000 },
    })
    const first = rectAt(result, boxes, 'later_in_alphabet')
    const mood = rectAt(result, boxes, 'enum:mood')
    expect(Math.abs(mood.x - (first.x + first.width / 2))).toBeLessThan(600)
    // Both links get a fresh route.
    for (const ref of model.refs) {
      expect(result.routes[ref.id]!.startTableId).toBe('enum:mood')
    }
  })

  it('never lands on a card, even with the table surrounded closely', () => {
    const { model, boxes } = setup(`${MOOD}
      Table north { id int [pk] }
      Table south { id int [pk] }
      Table east { id int [pk] }
      Table west { id int [pk] }
    `)
    const result = place(model, boxes, {
      people: { x: 400, y: 200 },
      north: { x: 400, y: 0 },
      south: { x: 400, y: 400 },
      east: { x: 680, y: 200 },
      west: { x: 120, y: 200 },
      'enum:mood': { x: 400, y: 160 },
    })
    expectClearOfCards(result, boxes, 'enum:mood')
    expectOnGrid(result.positions['enum:mood']!)
  })

  it('stays out of group regions, also the region of its own table', () => {
    const { model, boxes } = setup(`${MOOD}
      Table friends { id int [pk]
        person_id int [ref: > people.id] }
      TableGroup social { people
        friends }
    `)
    const positions = {
      people: { x: 0, y: 0 },
      friends: { x: 400, y: 0 },
      'enum:mood': { x: 3000, y: 3000 },
    }
    const result = place(model, boxes, positions)
    const mood = rectAt(result, boxes, 'enum:mood')
    for (const region of groupRegions(model, boxes, result.positions)) {
      expect(intersects(inflate(mood, CLEARANCE - 1), region.rect)).toBe(false)
    }
    // Still close: within a few hundred pixels of its table.
    expect(Math.hypot(mood.x - 0, mood.y - 0)).toBeLessThan(600)
  })

  it('keeps off the lines of other relations', () => {
    const { model, boxes } = setup(`${MOOD}
      Table a { id int [pk] }
      Table b { id int [pk]
        a_id int [ref: > a.id] }
    `)
    const relation = model.refs.find((ref) => ref.kind !== 'enum')!
    // A line runs down just left and just right of people, through both side spots.
    const points = [
      { x: 0, y: 0 },
      { x: 330, y: 0 },
      { x: 330, y: 400 },
      { x: 860, y: 400 },
      { x: 860, y: -300 },
      { x: 1200, y: -300 },
    ]
    const route: StoredRoute = {
      points,
      startTableId: 'a',
      startSide: 'E',
      endSide: 'W',
      signature: 'unused',
    }
    const positions = {
      people: { x: 400, y: 100 },
      a: { x: -300, y: -40 },
      b: { x: 1200, y: -340 },
      'enum:mood': { x: 3000, y: 3000 },
    }
    // Without the line, the card would sit right on it.
    const unaware = place(model, boxes, positions)
    expect(crossesAny(points, [rectAt(unaware, boxes, 'enum:mood')])).toBe(true)

    const result = place(model, boxes, positions, { [relation.id]: route })
    expect(crossesAny(points, [inflate(rectAt(result, boxes, 'enum:mood'), GEOMETRY.grid)])).toBe(
      false,
    )
    expect(result.routes[relation.id]).toBe(route)
  })

  it('falls back to below the diagram when there is no room around the table', () => {
    const { model, boxes } = setup(`${MOOD}
      Table north { id int [pk] }
      Table south { id int [pk] }
      Table east { id int [pk] }
      Table west { id int [pk] }
    `)
    const huge = (id: string, width: number, height: number): [string, TableBox] => [
      id,
      { ...boxes.get(id)!, width, height },
    ]
    const walled = new Map([
      ...boxes,
      huge('north', 9000, 4000),
      huge('south', 9000, 4000),
      huge('east', 4000, 9000),
      huge('west', 4000, 9000),
    ])
    const people = boxes.get('people')!
    const result = place(model, walled, {
      people: { x: 0, y: 0 },
      north: { x: -4500, y: -4010 },
      south: { x: -4500, y: people.height + 10 },
      east: { x: people.width + 10, y: -4500 },
      west: { x: -4010, y: -4500 },
      'enum:mood': { x: 0, y: -3000 },
    })
    const mood = rectAt(result, walled, 'enum:mood')
    expect(mood.y).toBeGreaterThan(4500)
    expectClearOfCards(result, walled, 'enum:mood')
    expectOnGrid(result.positions['enum:mood']!)
  })

  it('places several enums of one table without overlapping each other', () => {
    const { model, boxes } = setup(`
      Enum mood { happy
        sad }
      Enum colour { red
        green
        blue }
      Enum size { small
        large }
      Table people { id int [pk]
        mood mood
        colour colour
        size size }
    `)
    const result = place(model, boxes, {
      people: { x: 0, y: 0 },
      'enum:mood': { x: 3000, y: 0 },
      'enum:colour': { x: 3000, y: 400 },
      'enum:size': { x: 3000, y: 800 },
    })
    for (const id of ['enum:mood', 'enum:colour', 'enum:size']) {
      expectClearOfCards(result, boxes, id)
      expect(Math.abs(result.positions[id]!.x)).toBeLessThan(800)
    }
    // Links placed first are lines the later cards keep clear of.
    for (const ref of model.refs) {
      const others = ['enum:mood', 'enum:colour', 'enum:size']
        .filter((id) => id !== ref.parent.tableId)
        .map((id) => rectAt(result, boxes, id))
      expect(crossesAny(result.routes[ref.id]!.points, others)).toBe(false)
    }
  })

  it('leaves enums without users, other cards and other routes alone', () => {
    const { model, boxes } = setup(`
      Enum unused { a }
      Table people { id int [pk] }
    `)
    const positions = { people: { x: 0, y: 0 }, 'enum:unused': { x: 900, y: 900 } }
    const result = place(model, boxes, positions)
    expect(result.positions).toEqual(positions)
    expect(result.routes).toEqual({})
  })

  it('ignores links whose table has no position', () => {
    const { model, boxes } = setup(MOOD)
    const result = place(model, boxes, { 'enum:mood': { x: 900, y: 900 } })
    expect(result.positions).toEqual({ 'enum:mood': { x: 900, y: 900 } })
  })

  it('handles tables named like built-in object keys', () => {
    const { model, boxes } = setup(`
      Enum mood { happy }
      Table "__proto__" { id int [pk]
        mood mood }
      Table constructor { id int [pk]
        proto_id int [ref: > "__proto__".id] }
    `)
    const positions = Object.fromEntries([
      ['__proto__', { x: 0, y: 0 }],
      ['constructor', { x: 600, y: 0 }],
      ['enum:mood', { x: 3000, y: 3000 }],
    ])
    const result = place(model, boxes, positions)
    expect(Object.hasOwn(result.positions, '__proto__')).toBe(true)
    expect(result.positions['enum:mood']!.x).toBeLessThan(1000)
    expectClearOfCards(result, boxes, 'enum:mood')
  })
})
