import { describe, expect, it } from 'vitest'
import { suggestGroups } from './communities'
import {
  addColumn,
  addGroupFromTables,
  addGroups,
  addIndex,
  addRelation,
  addView,
  applyEdits,
  diffEdit,
  renameColumn,
  renameTable,
  type TextEdit,
} from './edit'
import type { SchemaModel } from './model'
import { parseDbml } from './parse'
import { SAMPLES } from '@/test/schemas'

const SOURCE = `Table users as U {
  id int [pk]
  team_id int [ref: > teams.id]
  email varchar
  indexes {
    (team_id, email) [unique, name: 'team_id_email']
    email
    \`lower(email)\`
  }
}

Table teams {
  id int [pk]
  owner_id int
}

Table core.audits {
  id int [pk]
  user_id int
  team_id int
}

Ref: teams.owner_id > U.id
Ref: core.audits.(user_id, team_id) > users.(id, team_id)

TableGroup people {
  users
  teams
}

Records users(id, team_id, email) {
  1, 1, 'a@b.c'
}
`

const model = parseDbml(SOURCE).model!

function edited(edits: ReturnType<typeof renameColumn>): string {
  expect(edits).not.toBeNull()
  return applyEdits(SOURCE, edits!)
}

describe('diffEdit and applyEdits', () => {
  it('finds the changed stretch', () => {
    expect(diffEdit('Table users {', 'Table people {')).toEqual({
      from: 6,
      to: 11,
      insert: 'people',
    })
    expect(diffEdit('same', 'same')).toBeNull()
  })

  it('applies several edits given in positions of the old text', () => {
    expect(
      applyEdits('a b c', [
        { from: 0, to: 1, insert: 'xx' },
        { from: 4, to: 5, insert: 'yy' },
      ]),
    ).toBe('xx b yy')
  })
})

describe('renameTable', () => {
  it('renames the table and everything that refers to it', () => {
    const result = edited(renameTable(SOURCE, model, 'teams', 'squads'))
    expect(result).toContain('Table squads {')
    expect(result).toContain('[ref: > squads.id]')
    expect(result).toContain('Ref: squads.owner_id > U.id')
    expect(result).toMatch(/TableGroup people \{\s+users\s+squads/)
    expect(parseDbml(result).model!.tables.map((t) => t.id)).toContain('squads')
  })

  it('quotes names that need it', () => {
    expect(edited(renameTable(SOURCE, model, 'teams', 'my teams'))).toContain('Table "my teams" {')
  })

  it('refuses names that are empty, unchanged or already taken', () => {
    expect(renameTable(SOURCE, model, 'teams', '  ')).toBeNull()
    expect(renameTable(SOURCE, model, 'teams', 'teams')).toBeNull()
    expect(renameTable(SOURCE, model, 'teams', 'users')).toBeNull()
    expect(renameTable(SOURCE, model, 'missing', 'x')).toBeNull()
  })
})

describe('renameColumn', () => {
  it('renames the declaration and the relations that point at the column', () => {
    const result = edited(renameColumn(SOURCE, model, 'users', 'id', 'user_key'))
    expect(result).toContain('  user_key int [pk]')
    expect(result).toContain('Ref: teams.owner_id > U.user_key')
    expect(result).toContain('> users.(user_key, team_id)')
    // Columns called "id" in other tables stay as they are.
    expect(result).toContain('[ref: > teams.id]')
    expect(result).toMatch(/Table teams \{\s+id int \[pk\]/)
  })

  it('follows the column into composite relations, indexes and records', () => {
    const result = edited(renameColumn(SOURCE, model, 'users', 'team_id', 'squad_id'))
    expect(result).toContain('  squad_id int [ref: > teams.id]')
    expect(result).toContain('> users.(id, squad_id)')
    expect(result).toContain("(squad_id, email) [unique, name: 'team_id_email']")
    expect(result).toContain('Records users(id, squad_id, email)')
    // The equally named column of another table is not touched.
    expect(result).toContain('core.audits.(user_id, team_id)')
    expect(result).toMatch(/Table core\.audits \{[^}]*team_id int/)
  })

  it('leaves index expressions and settings alone', () => {
    const result = edited(renameColumn(SOURCE, model, 'users', 'email', 'mail'))
    expect(result).toContain('(team_id, mail) [unique')
    expect(result).toContain('`lower(email)`')
    expect(result).toMatch(/\n {4}mail\n/)
  })

  it('keeps the schema valid', () => {
    const result = edited(renameColumn(SOURCE, model, 'core.audits', 'user_id', 'actor id'))
    const after = parseDbml(result)
    expect(after.diagnostics).toEqual([])
    expect(after.model!.refs).toHaveLength(model.refs.length)
    expect(result).toContain('core.audits.("actor id", team_id)')
  })

  it('refuses clashes and unknown columns', () => {
    expect(renameColumn(SOURCE, model, 'users', 'id', 'email')).toBeNull()
    expect(renameColumn(SOURCE, model, 'users', 'nope', 'x')).toBeNull()
    expect(renameColumn(SOURCE, model, 'users', 'id', 'id')).toBeNull()
  })

  it('refuses columns that come from a partial', () => {
    const source = `TablePartial stamps { created_at timestamp }\nTable a { id int\n  ~stamps }\n`
    const withPartial = parseDbml(source).model!
    expect(renameColumn(source, withPartial, 'a', 'created_at', 'made_at')).toBeNull()
  })
})

describe('addRelation', () => {
  it('appends a reference from the first column to the second', () => {
    const result = edited(
      addRelation(
        SOURCE,
        model,
        { tableId: 'core.audits', column: 'user_id' },
        { tableId: 'users', column: 'id' },
      ),
    )
    expect(result.endsWith('\nRef: core.audits.user_id > users.id\n')).toBe(true)
    expect(parseDbml(result).model!.refs).toHaveLength(model.refs.length + 1)
  })

  it('refuses a relation from a column to itself', () => {
    const same = { tableId: 'users', column: 'id' }
    expect(addRelation(SOURCE, model, same, same)).toBeNull()
  })
})

describe('addGroups', () => {
  it('writes suggested groups as TableGroups that parse', () => {
    const flat = SAMPLES.find((s) => s.id === 'saas')!.source.replace(
      /TableGroup[^{]*\{[^}]*\}/g,
      '',
    )
    const parsed = parseDbml(flat).model!
    const groups = suggestGroups(parsed)
    const edits = addGroups(flat, parsed, groups)
    expect(edits).not.toBeNull()
    const after = parseDbml(applyEdits(flat, edits!))
    expect(after.diagnostics).toEqual([])
    expect(after.model!.groups).toHaveLength(groups.length)
  })
})

describe('addIndex', () => {
  it('adds a block to a table without indexes', () => {
    const result = edited(addIndex(SOURCE, model, 'teams', ['owner_id']))
    expect(result).toMatch(
      /Table teams \{\n {2}id int \[pk\]\n {2}owner_id int\n\n? {2}indexes \{\n {4}owner_id\n {2}\}\n\}/,
    )
    const table = parseDbml(result).model!.tables.find((t) => t.id === 'teams')!
    expect(table.indexes.map((i) => i.columns)).toEqual([['owner_id']])
  })

  it('extends an existing block and handles composite indexes', () => {
    const result = edited(addIndex(SOURCE, model, 'users', ['id', 'email']))
    const table = parseDbml(result).model!.tables.find((t) => t.id === 'users')!
    expect(table.indexes.map((i) => i.columns)).toContainEqual(['id', 'email'])
    expect(table.indexes).toHaveLength(4)
  })

  it('refuses unknown tables', () => {
    expect(addIndex(SOURCE, model, 'nope', ['id'])).toBeNull()
  })
})

/** Applies edits to any source and checks the result parses without complaints. */
function applyClean(
  source: string,
  edits: TextEdit[] | null,
): { text: string; after: SchemaModel } {
  expect(edits).not.toBeNull()
  const text = applyEdits(source, edits!)
  const parsed = parseDbml(text)
  expect(parsed.diagnostics).toEqual([])
  return { text, after: parsed.model! }
}

const columnsOf = (after: SchemaModel, id: string) =>
  after.tables.find((t) => t.id === id)!.columns.map((c) => c.name)

describe('addColumn', () => {
  it('goes below the last column, before the indexes block', () => {
    const { text, after } = applyClean(
      SOURCE,
      addColumn(SOURCE, model, 'users', 'created_at', 'timestamp'),
    )
    expect(text).toContain('  email varchar\n  created_at timestamp\n  indexes {')
    expect(columnsOf(after, 'users')).toEqual(['id', 'team_id', 'email', 'created_at'])
  })

  it('copies the indentation and keeps a trailing comment on its line', () => {
    const source = 'Table a {\n    id int [pk]\n    name text // who\n\n    Note: "x"\n}\n'
    const { text } = applyClean(
      source,
      addColumn(source, parseDbml(source).model!, 'a', 'unit price', 'character varying'),
    )
    expect(text).toBe(
      'Table a {\n    id int [pk]\n    name text // who\n    "unit price" "character varying"\n\n    Note: "x"\n}\n',
    )
  })

  it('moves a closing brace on the same line down', () => {
    const source = 'Table a { id int [pk] }\n'
    const { text, after } = applyClean(
      source,
      addColumn(source, parseDbml(source).model!, 'a', 'name', 'text'),
    )
    expect(text).toBe('Table a { id int [pk]\n  name text }\n')
    expect(columnsOf(after, 'a')).toEqual(['id', 'name'])
  })

  it('skips columns from partials and refuses tables without own columns', () => {
    const source = [
      'TablePartial stamps {',
      '  created_at timestamp',
      '}',
      'Table a {',
      '  id int [pk]',
      '  ~stamps',
      '}',
      'Table b {',
      '  ~stamps',
      '}',
      '',
    ].join('\n')
    const parsed = parseDbml(source).model!
    const { text, after } = applyClean(source, addColumn(source, parsed, 'a', 'note', 'text'))
    expect(text).toContain('  id int [pk]\n  note text\n  ~stamps')
    expect(columnsOf(after, 'a')).toEqual(expect.arrayContaining(['id', 'note', 'created_at']))
    expect(addColumn(source, parsed, 'b', 'note', 'text')).toBeNull()
    // The partial already brings it.
    expect(addColumn(source, parsed, 'a', 'created_at', 'timestamp')).toBeNull()
  })

  it('refuses taken names, unknown tables and unusable input', () => {
    expect(addColumn(SOURCE, model, 'users', 'email', 'text')).toBeNull()
    expect(addColumn(SOURCE, model, 'nope', 'x', 'text')).toBeNull()
    expect(addColumn(SOURCE, model, 'users', '  ', 'text')).toBeNull()
    expect(addColumn(SOURCE, model, 'users', 'x', ' ')).toBeNull()
    expect(addColumn(SOURCE, model, 'users', 'x', 'my"type')).toBeNull()
  })
})

describe('addGroupFromTables', () => {
  const groupsOf = (after: SchemaModel) =>
    Object.fromEntries(after.groups.map((g) => [g.name, g.tableIds]))

  it('appends a group of tables that were in none', () => {
    const { text, after } = applyClean(
      SOURCE,
      addGroupFromTables(SOURCE, model, 'audit', ['core.audits']),
    )
    expect(text.endsWith("  1, 1, 'a@b.c'\n}\n\nTableGroup audit {\n  core.audits\n}\n")).toBe(true)
    expect(groupsOf(after)).toEqual({ people: ['users', 'teams'], audit: ['core.audits'] })
  })

  it('takes tables out of the group they were in', () => {
    const { text, after } = applyClean(
      SOURCE,
      addGroupFromTables(SOURCE, model, 'staff', ['teams', 'core.audits', 'teams']),
    )
    expect(text).toContain('TableGroup people {\n  users\n}')
    expect(groupsOf(after)).toEqual({ people: ['users'], staff: ['teams', 'core.audits'] })
  })

  it('removes a group it leaves empty, without leaving a gap', () => {
    const { text, after } = applyClean(
      SOURCE,
      addGroupFromTables(SOURCE, model, 'everyone', ['users', 'teams']),
    )
    expect(text).not.toContain('people')
    expect(text).not.toContain('\n\n\n')
    expect(text).toContain('Ref: core.audits.(user_id, team_id) > users.(id, team_id)\n\nRecords')
    expect(groupsOf(after)).toEqual({ everyone: ['users', 'teams'] })
  })

  it('removes an emptied group at the very end and the start', () => {
    const atEnd = 'Table a { id int }\n\nTableGroup g {\n  a\n}\n'
    const end = applyClean(atEnd, addGroupFromTables(atEnd, parseDbml(atEnd).model!, 'h', ['a']))
    expect(end.text).toBe('Table a { id int }\n\nTableGroup h {\n  a\n}\n')

    const atStart = 'TableGroup g { a }\n\nTable a { id int }\n'
    const start = applyClean(
      atStart,
      addGroupFromTables(atStart, parseDbml(atStart).model!, 'h', ['a']),
    )
    expect(start.text).toBe('Table a { id int }\n\nTableGroup h {\n  a\n}\n')
  })

  it('finds members by alias, with schema, beside braces and among notes and comments', () => {
    const source = [
      'Table users as U { id int }',
      'Table public.teams { id int }',
      'Table s.logs { id int }',
      'Table tags { id int }',
      'Table "line items" { id int }',
      'TableGroup "a {group}" [note: \'users {\'] { U // main',
      "  Note: 'users'",
      '  public.teams',
      '  "line items"',
      '  s . logs',
      '  tags }',
      '',
    ].join('\n')
    const parsed = parseDbml(source).model!
    const everyOther = ['users', 's.logs', 'tags']
    const { text, after } = applyClean(
      source,
      addGroupFromTables(source, parsed, 'picked', everyOther),
    )
    expect(text).toContain(
      'TableGroup "a {group}" [note: \'users {\'] {\n  Note: \'users\'\n  public.teams\n  "line items"\n}',
    )
    expect(groupsOf(after)).toEqual({
      'a {group}': ['teams', 'line items'],
      picked: ['users', 's.logs', 'tags'],
    })
  })

  it('quotes names that need it', () => {
    const source = 'Table "line items" { id int }\nTable core.audits { id int }\n'
    const { text, after } = applyClean(
      source,
      addGroupFromTables(source, parseDbml(source).model!, ' my group ', [
        'line items',
        'core.audits',
      ]),
    )
    expect(text).toContain('TableGroup "my group" {\n  "line items"\n  core.audits\n}\n')
    expect(groupsOf(after)).toEqual({ 'my group': ['line items', 'core.audits'] })
  })

  it('ignores suggested groups', () => {
    const suggested = {
      id: 'suggested:x',
      name: 'x',
      tableIds: ['users', 'core.audits'],
      suggested: true,
      range: { from: 0, to: 5 },
    }
    const withSuggested = { ...model, groups: [...model.groups, suggested] }
    const { after } = applyClean(
      SOURCE,
      addGroupFromTables(SOURCE, withSuggested, 'x', ['core.audits']),
    )
    expect(groupsOf(after)).toEqual({ people: ['users', 'teams'], x: ['core.audits'] })
  })

  it('refuses empty lists, unknown tables, blank or taken names', () => {
    expect(addGroupFromTables(SOURCE, model, 'g', [])).toBeNull()
    expect(addGroupFromTables(SOURCE, model, 'g', ['nope'])).toBeNull()
    expect(addGroupFromTables(SOURCE, model, '  ', ['users'])).toBeNull()
    expect(addGroupFromTables(SOURCE, model, 'say "hi"', ['users'])).toBeNull()
    expect(addGroupFromTables(SOURCE, model, 'people', ['core.audits'])).toBeNull()
  })

  it('refuses when a member cannot be found in its group', () => {
    const broken = {
      ...model,
      groups: model.groups.map((g) => ({ ...g, tableIds: [...g.tableIds, 'core.audits'] })),
    }
    expect(addGroupFromTables(SOURCE, broken, 'audit', ['core.audits'])).toBeNull()
  })
})

describe('addView', () => {
  it('appends a view that lists the tables', () => {
    const { text, after } = applyClean(
      SOURCE,
      addView(SOURCE, model, 'Audit trail', ['users', 'core.audits']),
    )
    expect(
      text.endsWith(
        '}\n\nDiagramView "Audit trail" {\n  Tables {\n    users\n    core.audits\n  }\n}\n',
      ),
    ).toBe(true)
    expect(after.views).toEqual([
      expect.objectContaining({ name: 'Audit trail', tableIds: ['users', 'core.audits'] }),
    ])
  })

  it('refuses empty lists, blank or taken names', () => {
    const { text, after } = applyClean(SOURCE, addView(SOURCE, model, 'teams', ['teams']))
    expect(addView(text, after, 'teams', ['users'])).toBeNull()
    expect(addView(SOURCE, model, 'v', [])).toBeNull()
    expect(addView(SOURCE, model, 'v', ['nope'])).toBeNull()
    expect(addView(SOURCE, model, ' ', ['users'])).toBeNull()
  })
})
