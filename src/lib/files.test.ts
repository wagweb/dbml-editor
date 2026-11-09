import { describe, expect, it } from 'vitest'
import { textHash } from './files'

describe('textHash', () => {
  it('is stable and tells texts apart', () => {
    expect(textHash('Table a { id int }')).toBe(textHash('Table a { id int }'))
    expect(textHash('Table a { id int }')).not.toBe(textHash('Table a { id int }\n'))
    expect(textHash('')).toMatch(/^[0-9a-z]+-0$/)
  })
})
