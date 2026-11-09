import { describe, expect, it } from 'vitest'
import { placeNewTables, type Size } from './incremental'
import type { Point, Rect } from './router'

const size: Size = { width: 200, height: 120 }

function rectOf(point: Point, s: Size = size): Rect {
  return { ...point, ...s }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('placeNewTables', () => {
  it('places a related table next to its neighbour without overlapping anything', () => {
    const positions = { users: { x: 0, y: 0 }, orders: { x: 300, y: 0 } }
    const sizes = new Map([
      ['users', size],
      ['orders', size],
      ['payments', size],
    ])
    const placed = placeNewTables({
      sizes,
      positions,
      newIds: ['payments'],
      neighbors: (id) => (id === 'payments' ? ['orders'] : []),
    })

    const payments = rectOf(placed.payments!)
    expect(overlaps(payments, rectOf(positions.users))).toBe(false)
    expect(overlaps(payments, rectOf(positions.orders))).toBe(false)
    const distance = Math.hypot(placed.payments!.x - 300, placed.payments!.y)
    expect(distance).toBeLessThan(500)
  })

  it('never moves tables that already have a position', () => {
    const positions = { users: { x: 12, y: 34 } }
    const placed = placeNewTables({
      sizes: new Map([
        ['users', size],
        ['teams', size],
      ]),
      positions,
      newIds: ['teams'],
      neighbors: () => ['users'],
    })
    expect(placed.users).toBeUndefined()
    expect(Object.keys(placed)).toEqual(['teams'])
  })

  it('keeps several new tables apart from each other', () => {
    const sizes = new Map([
      ['users', size],
      ['a', size],
      ['b', size],
      ['c', size],
    ])
    const placed = placeNewTables({
      sizes,
      positions: { users: { x: 0, y: 0 } },
      newIds: ['a', 'b', 'c'],
      neighbors: () => ['users'],
    })
    const rects = [rectOf({ x: 0, y: 0 }), rectOf(placed.a!), rectOf(placed.b!), rectOf(placed.c!)]
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i]!, rects[j]!)).toBe(false)
      }
    }
  })

  it('parks unrelated tables below the existing diagram', () => {
    const placed = placeNewTables({
      sizes: new Map([
        ['users', size],
        ['lonely', size],
      ]),
      positions: { users: { x: 100, y: 50 } },
      newIds: ['lonely'],
      neighbors: () => [],
    })
    expect(placed.lonely!.y).toBeGreaterThanOrEqual(50 + size.height)
  })

  it('starts at the origin on an empty canvas', () => {
    const placed = placeNewTables({
      sizes: new Map([['first', size]]),
      positions: {},
      newIds: ['first'],
      neighbors: () => [],
    })
    expect(placed.first).toEqual({ x: 0, y: 0 })
  })

  it('lands on the grid', () => {
    const placed = placeNewTables({
      sizes: new Map([
        ['users', size],
        ['teams', size],
      ]),
      positions: { users: { x: 3, y: 7 } },
      newIds: ['teams'],
      neighbors: () => ['users'],
    })
    expect(placed.teams!.x % 8).toBe(0)
    expect(placed.teams!.y % 8).toBe(0)
  })

  it('treats a table named like a built-in object key as new', () => {
    const placed = placeNewTables({
      sizes: new Map([
        ['users', size],
        ['constructor', size],
        ['__proto__', size],
      ]),
      positions: { users: { x: 0, y: 0 } },
      newIds: ['constructor', '__proto__'],
      neighbors: () => ['users'],
    })
    expect(Object.keys(placed).sort()).toEqual(['__proto__', 'constructor'])
  })

  it('searches further out when every spot next to the neighbour is taken', () => {
    const positions = {
      hub: { x: 0, y: 0 },
      right: { x: 296, y: 0 },
      below: { x: 0, y: 160 },
      left: { x: -296, y: 0 },
      above: { x: 0, y: -160 },
    }
    const sizes = new Map([...Object.keys(positions), 'extra'].map((id) => [id, size]))
    const placed = placeNewTables({
      sizes,
      positions,
      newIds: ['extra'],
      neighbors: () => ['hub'],
    })
    const extra = rectOf(placed.extra!)
    for (const point of Object.values(positions)) {
      expect(overlaps(extra, rectOf(point))).toBe(false)
    }
  })
})
