import { describe, expect, it } from 'vitest'
import { crossesAny, routeAvoiding } from './avoid'
import { intersects, type Anchor, type Point, type Rect } from './router'

const table = (x: number, y: number, width = 200, height = 120): Rect => ({ x, y, width, height })
const anchor = (rect: Rect, offset = 50): Anchor => ({ rect, y: rect.y + offset })

function isOrthogonal(points: Point[]): boolean {
  return points.every((p, i) => {
    const next = points[i + 1]
    return !next || p.x === next.x || p.y === next.y
  })
}

describe('routeAvoiding', () => {
  it('draws the plain elbow when nothing is in the way', () => {
    const a = table(0, 0)
    const b = table(500, 200)
    const route = routeAvoiding(anchor(a), anchor(b), [])
    expect(route.startSide).toBe('E')
    expect(route.endSide).toBe('W')
    expect(route.points[0]).toEqual({ x: 200, y: 50 })
    expect(route.points.at(-1)).toEqual({ x: 500, y: 250 })
    expect(route.points.length).toBeLessThanOrEqual(4)
    expect(isOrthogonal(route.points)).toBe(true)
  })

  it('joins a line that leaves the same row, even round the longer side of a table', () => {
    const users = table(0, 0)
    const orders = table(600, 0)
    const wall = table(350, -100, 100, 250)
    // Already there: users.id over the top of the wall to a table further up.
    const partner = [
      { x: 200, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: -114 },
      { x: 700, y: -114 },
      { x: 700, y: -300 },
      { x: 760, y: -300 },
    ]
    // Alone, the line takes the shorter way below the wall.
    const alone = routeAvoiding(anchor(users), anchor(orders), [wall])
    expect(Math.max(...alone.points.map((p) => p.y))).toBeGreaterThan(150)

    const bundled = routeAvoiding(anchor(users), anchor(orders), [wall], [partner])
    // Out of the row, up and along the top together; it leaves the partner past the wall.
    expect(bundled.points.slice(0, 3)).toEqual(partner.slice(0, 3))
    expect(bundled.points[3]).toMatchObject({ y: -114 })
    expect(crossesAny(bundled.points, [wall])).toBe(false)
  })

  it('goes around a table that sits between the two ends', () => {
    const a = table(0, 0)
    const b = table(700, 0)
    const wall = table(350, -100, 160, 400)
    const route = routeAvoiding(anchor(a), anchor(b), [wall])
    expect(isOrthogonal(route.points)).toBe(true)
    expect(crossesAny(route.points, [wall])).toBe(false)
    // The straight line would have cut through the table.
    expect(
      crossesAny(
        [
          { x: 200, y: 50 },
          { x: 700, y: 50 },
        ],
        [wall],
      ),
    ).toBe(true)
  })

  it('never cuts through its own tables', () => {
    const a = table(0, 0)
    const b = table(40, 300)
    const route = routeAvoiding(anchor(a), anchor(b), [])
    const inner = route.points.slice(1, -1)
    expect(crossesAny(inner, [a, b])).toBe(false)
    // Stacked tables are connected on the same side.
    expect(route.startSide).toBe(route.endSide)
  })

  it('enters from the left when the target is to the left', () => {
    const route = routeAvoiding(anchor(table(600, 0)), anchor(table(0, 0)), [])
    expect(route.startSide).toBe('W')
    expect(route.endSide).toBe('E')
  })

  it('still returns a route when a table is boxed in', () => {
    const a = table(0, 0)
    const b = table(600, 0)
    const cage = [table(214, -200, 20, 600), table(-34, -200, 20, 600)]
    const route = routeAvoiding(anchor(a), anchor(b), cage)
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    expect(isOrthogonal(route.points)).toBe(true)
  })

  it('keeps clear of every table in random arrangements', () => {
    let seed = 11
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

    for (let round = 0; round < 40; round += 1) {
      const rects: Rect[] = []
      for (let tries = 0; rects.length < 7 && tries < 200; tries += 1) {
        const candidate = table(
          Math.round(random() * 1400),
          Math.round(random() * 900),
          160 + Math.round(random() * 120),
          80 + Math.round(random() * 160),
        )
        // Tables are placed with room between them, as in a real diagram.
        const roomy = {
          x: candidate.x - 40,
          y: candidate.y - 40,
          width: candidate.width + 80,
          height: candidate.height + 80,
        }
        if (!rects.some((r) => intersects(r, roomy))) rects.push(candidate)
      }
      const [first, second, ...others] = rects
      if (!first || !second) continue
      const route = routeAvoiding(anchor(first, 30), anchor(second, 60), others)
      expect(isOrthogonal(route.points)).toBe(true)
      expect(crossesAny(route.points, others)).toBe(false)
      expect(crossesAny(route.points.slice(1, -1), [first, second])).toBe(false)
    }
  })
})

describe('crossesAny', () => {
  it('ignores lines that only touch an edge', () => {
    const rect = table(100, 100)
    expect(
      crossesAny(
        [
          { x: 0, y: 100 },
          { x: 400, y: 100 },
        ],
        [rect],
      ),
    ).toBe(false)
    expect(
      crossesAny(
        [
          { x: 0, y: 101 },
          { x: 400, y: 101 },
        ],
        [rect],
      ),
    ).toBe(true)
  })
})
