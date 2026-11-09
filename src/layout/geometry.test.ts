import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import { parseDbml } from '@/dbml/parse'
import {
  approximateMeasure,
  computeTableBox,
  GEOMETRY,
  NOTE,
  portOffsetY,
  refColumnsByTable,
  wrapText,
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

describe('enum and note cards', () => {
  const shown = shownModel(
    parseDbml(`
Table users {
  id int [pk]
  status user_status
}
Enum user_status {
  active
  blocked
  deleted_but_with_a_rather_long_value_name
}
Note reminder {
  'Money is stored in cents as integers. Timestamps are UTC and never local time.'
}
`).model!,
    { view: null, enums: true, suggestGroups: false },
  )
  const card = (id: string, detail: Parameters<typeof computeTableBox>[1]) =>
    computeTableBox(
      shown.tables.find((t) => t.id === id)!,
      detail,
      approximateMeasure,
      new Set(),
    )

  it('lists enum values like rows and folds them into a count when zoomed to keys', () => {
    const full = card('enum:user_status', 'full')
    expect(full.rows.map((r) => r.name)).toEqual([
      'active',
      'blocked',
      'deleted_but_with_a_rather_long_value_name',
    ])
    expect(full.height).toBe(GEOMETRY.headerHeight + 2 * GEOMETRY.bodyPadY + 3 * GEOMETRY.rowHeight)
    expect(full.width % GEOMETRY.widthStep).toBe(0)

    const keys = card('enum:user_status', 'keys')
    expect(keys.rows).toEqual([])
    expect(keys.hiddenCount).toBe(3)
    expect(keys.height).toBe(GEOMETRY.headerHeight + 2 * GEOMETRY.bodyPadY + GEOMETRY.footerHeight)

    expect(card('enum:user_status', 'names').height).toBe(GEOMETRY.headerHeight)
  })

  it('wraps note text into measured lines and sizes the card to them', () => {
    const note = card('note:reminder', 'full')
    expect(note.width).toBe(NOTE.width)
    expect(note.lines!.length).toBeGreaterThan(1)
    expect(note.lines!.join(' ')).toBe(
      'Money is stored in cents as integers. Timestamps are UTC and never local time.',
    )
    for (const line of note.lines!) {
      expect(approximateMeasure(line, 'text')).toBeLessThanOrEqual(NOTE.width - 2 * GEOMETRY.padX)
    }
    expect(note.height).toBe(
      2 * NOTE.padY + NOTE.captionHeight + 4 + note.lines!.length * NOTE.lineHeight,
    )
    // The detail level does not apply to notes.
    expect(card('note:reminder', 'names')).toEqual(note)
  })
})

describe('wrapText', () => {
  it('keeps paragraphs, drops trailing blank lines and caps the number of lines', () => {
    const lines = wrapText('one two\n\nthree\n', 1000, approximateMeasure, 10)
    expect(lines).toEqual(['one two', '', 'three'])
    expect(wrapText('', 100, approximateMeasure, 3)).toEqual([])
    const capped = wrapText('a b c d e f g h', 20, approximateMeasure, 3)
    expect(capped).toHaveLength(3)
    expect(capped[2]!.endsWith('…')).toBe(true)
  })

  it('lets a single word exceed the width instead of breaking it', () => {
    expect(wrapText('supercalifragilistic', 20, approximateMeasure, 3)).toEqual([
      'supercalifragilistic',
    ])
  })
})
