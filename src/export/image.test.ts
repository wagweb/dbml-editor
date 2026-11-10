import { describe, expect, it } from 'vitest'
import { pngScale } from './image'

describe('pngScale', () => {
  it('gives a diagram the scale asked for when the browser allows it', () => {
    expect(pngScale(2000, 1200, 3)).toBe(3)
    expect(pngScale(2000, 1200, 4)).toBe(4)
  })

  it('stays under the largest canvas side a browser draws', () => {
    // 6000 px wide at 4x would be 24000 px.
    const scale = pngScale(6000, 1000, 4)
    expect(scale * 6000).toBeLessThanOrEqual(16_384)
    expect(scale).toBeGreaterThan(2.7)
  })

  it('stays under the largest canvas area', () => {
    const scale = pngScale(9000, 9000, 4)
    expect(9000 * scale * 9000 * scale).toBeLessThanOrEqual(250_000_000)
  })
})
