import { describe, expect, it } from 'vitest'
import { aligned } from './arrange'

const card = (id: string, x: number, y: number, width = 100, height = 60) => ({
  id,
  rect: { x, y, width, height },
})

describe('aligned', () => {
  it('lines up left and top edges on the outermost card', () => {
    const cards = [card('a', 40, 0), card('b', 200, 96), card('c', 120, 300)]
    expect(aligned(cards, 'left')).toEqual({
      a: { x: 40, y: 0 },
      b: { x: 40, y: 96 },
      c: { x: 40, y: 300 },
    })
    expect(aligned(cards, 'top')).toEqual({
      a: { x: 40, y: 0 },
      b: { x: 200, y: 0 },
      c: { x: 120, y: 0 },
    })
  })

  it('shares the room between the outermost cards in their order', () => {
    const cards = [card('a', 0, 0), card('c', 640, 0), card('b', 160, 0)]
    // 740 wide in all, 300 of cards: two gaps of 220.
    expect(aligned(cards, 'spread-x')).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 320, y: 0 },
      c: { x: 640, y: 0 },
    })
  })

  it('keeps a least gap when the cards are packed tight', () => {
    const next = aligned([card('a', 0, 0), card('b', 0, 20)], 'spread-y')
    expect(next.b!.y).toBeGreaterThanOrEqual(60 + 32)
  })

  it('leaves a single card alone', () => {
    expect(aligned([card('a', 0, 0)], 'left')).toEqual({})
  })
})
