import { describe, expect, it } from 'vitest'
import { timeAgo } from './time'

const now = Date.UTC(2026, 10, 9, 12, 0, 0)
const minutes = (n: number) => now - n * 60_000

describe('timeAgo', () => {
  it.each([
    [0, 'just now'],
    [0.9, 'just now'],
    [1, '1 min ago'],
    [59, '59 min ago'],
    [60, '1 h ago'],
    [23 * 60, '23 h ago'],
    [24 * 60, 'yesterday'],
    [3 * 24 * 60, '3 days ago'],
  ])('describes %d minutes as %s', (elapsed, expected) => {
    expect(timeAgo(minutes(elapsed), now)).toBe(expected)
  })

  it('falls back to a date after a week', () => {
    expect(timeAgo(minutes(10 * 24 * 60), now)).toBe('Oct 30')
  })

  it('never reports the future', () => {
    expect(timeAgo(now + 5000, now)).toBe('just now')
  })
})
