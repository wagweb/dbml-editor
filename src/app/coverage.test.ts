import { describe, expect, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import { nextUndocumented, noteCoverage } from './coverage'

const model = parseDbml(`
TablePartial stamps {
  created_at timestamp
}
Table users {
  id int [pk, note: 'Who signs in']
  email varchar
  ~stamps
  Note: 'People'
}
Table posts {
  id int [pk]
  title varchar [note: 'Shown as heading']
}
`).model!

describe('noteCoverage', () => {
  it('counts tables and their own columns with a note', () => {
    const coverage = noteCoverage(model)
    expect(coverage.tables).toBe(2)
    expect(coverage.notedTables).toBe(1)
    // The partial's column is declared outside both tables and not counted.
    expect(coverage.columns).toBe(4)
    expect(coverage.notedColumns).toBe(2)
    expect(coverage.percent).toBe(50)
    expect(coverage.missing.map((m) => m.column ?? m.tableId)).toEqual(['email', 'posts', 'id'])
  })

  it('walks to the next place without a note and wraps round', () => {
    const coverage = noteCoverage(model)
    const [email, posts] = coverage.missing
    expect(nextUndocumented(coverage, email!.range.from)).toBe(posts)
    expect(nextUndocumented(coverage, 10_000)).toBe(email)
  })

  it('calls an empty schema complete', () => {
    expect(noteCoverage(parseDbml('').model!).percent).toBe(100)
  })
})
