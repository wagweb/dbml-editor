import { describe, expect, it } from 'vitest'
import { roundedPath, routeBetween, routeSelf, type Anchor, type Point } from './router'

function anchor(x: number, y: number, portY: number, width = 200, height = 120): Anchor {
  return { rect: { x, y, width, height }, y: portY }
}

function isOrthogonal(points: Point[]): boolean {
  return points.every((p, i) => {
    const next = points[i + 1]
    return !next || p.x === next.x || p.y === next.y
  })
}

describe('routeBetween', () => {
  it('leaves on the right and enters on the left when the target sits to the right', () => {
    const points = routeBetween(anchor(0, 0, 50), anchor(400, 100, 160))
    expect(points[0]).toEqual({ x: 200, y: 50 })
    expect(points.at(-1)).toEqual({ x: 400, y: 160 })
    expect(isOrthogonal(points)).toBe(true)
    expect(points).toHaveLength(4)
  })

  it('mirrors when the target sits to the left', () => {
    const points = routeBetween(anchor(400, 0, 50), anchor(0, 100, 160))
    expect(points[0]).toEqual({ x: 400, y: 50 })
    expect(points.at(-1)).toEqual({ x: 200, y: 160 })
    expect(isOrthogonal(points)).toBe(true)
  })

  it('draws a straight line between level ports', () => {
    const points = routeBetween(anchor(0, 0, 50), anchor(400, 0, 50))
    expect(points).toEqual([
      { x: 200, y: 50 },
      { x: 400, y: 50 },
    ])
  })

  it('loops around the same side when the tables overlap horizontally', () => {
    const points = routeBetween(anchor(0, 0, 50), anchor(40, 300, 350))
    expect(isOrthogonal(points)).toBe(true)
    const first = points[0]!
    const last = points.at(-1)!
    // Both ends sit on the right edges and the lane runs outside both tables.
    expect(first.x).toBe(200)
    expect(last.x).toBe(240)
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(240)
  })

  it('picks the side that needs the shorter detour', () => {
    const points = routeBetween(anchor(100, 0, 50, 200), anchor(0, 300, 350, 220))
    // Left edges are 100 apart, right edges only 80, so the lane runs on the right.
    expect(points[0]!.x).toBe(300)
    expect(points.at(-1)!.x).toBe(220)
  })
})

describe('routeSelf', () => {
  it('loops out of the right side and back in', () => {
    const points = routeSelf(anchor(0, 0, 50), 106)
    expect(points[0]).toEqual({ x: 200, y: 50 })
    expect(points.at(-1)).toEqual({ x: 200, y: 106 })
    expect(isOrthogonal(points)).toBe(true)
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(200)
  })

  it('still draws a visible loop when both ends share a row', () => {
    const points = routeSelf(anchor(0, 0, 50), 50)
    const ys = new Set(points.map((p) => p.y))
    expect(ys.size).toBeGreaterThan(1)
  })
})

describe('roundedPath', () => {
  it('draws straight segments without corners', () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe('M0 0L100 0')
  })

  it('rounds each corner with a curve that stays inside the segments', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
      8,
    )
    expect(d).toBe('M0 0L42 0Q50 0 50 8L50 100')
  })

  it('shrinks the radius on short segments', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 6 },
        { x: 100, y: 6 },
      ],
      8,
    )
    expect(d).toBe('M0 0L47 0Q50 0 50 3Q50 6 53 6L100 6')
  })

  it('returns an empty path for fewer than two points', () => {
    expect(roundedPath([{ x: 1, y: 1 }])).toBe('')
  })
})
