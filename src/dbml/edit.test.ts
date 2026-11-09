import { describe, expect, it } from 'vitest'
import { suggestGroups } from './communities'
import {
  addGroups,
  addIndex,
  addRelation,
  applyEdits,
  diffEdit,
  renameColumn,
  renameTable,
} from './edit'
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
