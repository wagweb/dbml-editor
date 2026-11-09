import { describe, expect, it } from 'vitest'
import { fitLabel } from './label'

/** Width a line needs at the fitted size, using the same character estimate. */
function lineWidth(line: string, size: number): number {
  return line.length * 0.6 * size
}

/** A proportional face: narrow letters take less room than wide ones. */
const proportional = (text: string) =>
  [...text].reduce((sum, char) => sum + ('ilj_'.includes(char) ? 0.3 : 0.62), 0)

describe('fitLabel', () => {
  it('keeps a short name on one line', () => {
    expect(fitLabel('orders', 200, 160).lines).toEqual(['orders'])
  })

  it('never lets a line outgrow the box', () => {
    for (const name of ['customers', 'product_images', 'a_very_long_table_name_with_parts', 'x']) {
      for (const [width, height] of [
        [176, 38],
        [200, 160],
        [384, 400],
      ] as const) {
        const { lines, size } = fitLabel(name, width, height)
        for (const line of lines) expect(lineWidth(line, size)).toBeLessThanOrEqual(width)
        expect(lines.length * size * 1.15).toBeLessThanOrEqual(height)
      }
    }
  })

  it('breaks a long name after an underscore when that allows a larger font', () => {
    const fitted = fitLabel('product_images', 200, 160)
    expect(fitted.lines).toEqual(['product_', 'images'])
    expect(fitted.size).toBeGreaterThan(fitLabel('productximages', 200, 160).size)
  })

  it('picks the most balanced break', () => {
    expect(fitLabel('customer_status_history', 300, 200).lines).toEqual([
      'customer_',
      'status_history',
    ])
  })

  it('stays on one line when the box is too flat for two', () => {
    expect(fitLabel('order_items', 400, 38).lines).toEqual(['order_items'])
  })

  it('caps the size for tiny names in large boxes', () => {
    expect(fitLabel('a', 384, 600).size).toBe(72)
  })

  it('uses real text widths when it gets them', () => {
    const estimated = fitLabel('illiill', 120, 200)
    const measured = fitLabel('illiill', 120, 200, proportional)
    expect(measured.size).toBeGreaterThan(estimated.size)
    expect(proportional('illiill') * measured.size).toBeLessThanOrEqual(120)
  })

  it('shrinks with the box', () => {
    expect(fitLabel('customers', 176, 160).size).toBeLessThan(fitLabel('customers', 300, 160).size)
  })
})
