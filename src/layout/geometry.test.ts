import { describe, expect, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import {
  approximateMeasure,
  computeTableBox,
  GEOMETRY,
  portOffsetY,
  refColumnsByTable,
} from './geometry'

const model = parseDbml(`
Table users {
  id int [pk]
  email varchar(255)
  display_name varchar
  team_id int [ref: > teams.id]
  created_at timestamp
}
Table teams {
  id int [pk]
  name varchar
}
Table audit_log_entries_with_a_very_long_table_name_that_keeps_going_and_going {
  payload_with_an_extremely_long_column_name_for_testing_purposes varchar(4000)
}
Table notes { body text }
`).model!

const refColumns = refColumnsByTable(model)
const box = (id: string, detail: Parameters<typeof computeTableBox>[1]) =>
  computeTableBox(
    model.tables.find((t) => t.id === id)!,
    detail,
    approximateMeasure,
    refColumns.get(id) ?? new Set(),
  )

describe('refColumnsByTable', () => {
  it('collects the columns that take part in a relation', () => {
    expect([...refColumns.get('users')!]).toEqual(['team_id'])
    expect([...refColumns.get('teams')!]).toEqual(['id'])
    expect(refColumns.get('notes')).toBeUndefined()
  })
})

describe('computeTableBox', () => {
  it('shows every column at full detail', () => {
    const users = box('users', 'full')
    expect(users.rows.map((r) => r.name)).toEqual([
      'id',
      'email',
      'display_name',
      'team_id',
      'created_at',
    ])
    expect(users.hiddenCount).toBe(0)
    expect(users.height).toBe(
      GEOMETRY.headerHeight + 2 * GEOMETRY.bodyPadY + 5 * GEOMETRY.rowHeight,
    )
  })

  it('keeps only key columns at keys detail and reports the rest', () => {
    const users = box('users', 'keys')
    expect(users.rows.map((r) => r.name)).toEqual(['id', 'team_id'])
    expect(users.hiddenCount).toBe(3)
    expect(users.height).toBe(
      GEOMETRY.headerHeight +
        2 * GEOMETRY.bodyPadY +
        2 * GEOMETRY.rowHeight +
        GEOMETRY.footerHeight,
    )
  })

  it('collapses to the header at names detail', () => {
    const users = box('users', 'names')
    expect(users.rows).toEqual([])
    expect(users.height).toBe(GEOMETRY.headerHeight)
  })

  it('shows a table without keys as a header with a column count', () => {
    const notes = box('notes', 'keys')
    expect(notes.rows).toEqual([])
    expect(notes.hiddenCount).toBe(1)
    expect(notes.height).toBe(GEOMETRY.headerHeight + 2 * GEOMETRY.bodyPadY + GEOMETRY.footerHeight)
  })

  it('snaps widths to the grid and clamps them', () => {
    const teams = box('teams', 'full')
    const wide = box(
      'audit_log_entries_with_a_very_long_table_name_that_keeps_going_and_going',
      'full',
    )
    expect(teams.width).toBeGreaterThanOrEqual(GEOMETRY.minWidth)
    expect(teams.width % GEOMETRY.widthStep).toBe(0)
    expect(wide.width).toBe(GEOMETRY.maxWidth)
  })

  it('grows with its content', () => {
    expect(box('users', 'full').width).toBeGreaterThanOrEqual(box('teams', 'full').width)
  })
})

describe('portOffsetY', () => {
  it('points at the vertical centre of a visible row', () => {
    const users = box('users', 'full')
    expect(portOffsetY(users, 'id')).toBe(
      GEOMETRY.headerHeight + GEOMETRY.bodyPadY + GEOMETRY.rowHeight / 2,
    )
    expect(portOffsetY(users, 'team_id')).toBe(
      GEOMETRY.headerHeight + GEOMETRY.bodyPadY + 3.5 * GEOMETRY.rowHeight,
    )
  })

  it('follows the row order of the reduced view', () => {
    const users = box('users', 'keys')
    expect(portOffsetY(users, 'team_id')).toBe(
      GEOMETRY.headerHeight + GEOMETRY.bodyPadY + 1.5 * GEOMETRY.rowHeight,
    )
  })

  it('falls back to the header when the column is not shown', () => {
    expect(portOffsetY(box('users', 'names'), 'id')).toBe(GEOMETRY.headerHeight / 2)
    expect(portOffsetY(box('users', 'full'), 'unknown')).toBe(GEOMETRY.headerHeight / 2)
  })
})
