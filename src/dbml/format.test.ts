import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyEdits } from './edit'
import {
  DEFAULT_INDENT,
  detectIndent,
  formatDbml,
  formatEdits,
  indentUnit,
  type IndentStyle,
} from './format'
import { SAMPLES } from '@/test/schemas'

// The real parser runs unless a test asks for the second parse (of the formatted text) to
// come back different, which is the only way to reach the meaning check deliberately.
const tamper = vi.hoisted(() => ({ mode: 'off' as 'off' | 'invalid' | 'renamed', calls: 0 }))
vi.mock('./parse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parse')>()
  return {
    ...actual,
    parseDbml: (source: string) => {
      const result = actual.parseDbml(source)
      tamper.calls += 1
      if (tamper.mode === 'off' || tamper.calls < 2 || !result.model) return result
      if (tamper.mode === 'invalid') return { model: null, diagnostics: result.diagnostics }
      const tables = result.model.tables.map((t) => ({ ...t, name: `${t.name}_changed` }))
      return { ...result, model: { ...result.model, tables } }
    },
  }
})

afterEach(() => {
  tamper.mode = 'off'
  tamper.calls = 0
})

const TABS: IndentStyle = { kind: 'tab', size: 4 }
const FOUR: IndentStyle = { kind: 'space', size: 4 }

/** Formats and checks the guarantees every result must keep. */
function formatted(source: string, indent: IndentStyle = DEFAULT_INDENT): string {
  const edits = formatEdits(source, indent)
  expect(edits).not.toBeNull()
  const text = applyEdits(source, edits!)
  expect(formatDbml(source, indent)).toBe(text)
  expect(formatEdits(text, indent)).toEqual([])
  return text
}

describe('indentation', () => {
  it('indents nested blocks by two spaces per level', () => {
    const source = `Table users {
id int [pk]
    email varchar
      indexes {
  email [unique]
          (id, email)
        }
    Note: 'People who sign in'
}
`
    expect(formatted(source)).toBe(`Table users {
  id    int [pk]
  email varchar
  indexes {
    email [unique]
    (id, email)
  }
  Note: 'People who sign in'
}
`)
  })

  it('dedents a line by every closer it starts with', () => {
    const source = `Table users {
  id int [
  pk,
        note: 'x'
      ]
  indexes {
  id
  }}
`
    expect(formatted(source)).toBe(`Table users {
  id int [
    pk,
    note: 'x'
  ]
  indexes {
    id
}}
`)
  })

  it('moves top level statements to the margin and empties whitespace only lines', () => {
    const source = `   Table a {\n  id int\n  }\n  \t \n    Ref: a.id > b.id\nTable b {\n  id int\n}\n`
    expect(formatted(source)).toBe(
      `Table a {\n  id int\n}\n\nRef: a.id > b.id\nTable b {\n  id int\n}\n`,
    )
  })

  it('finds the header of a brace that sits on its own line', () => {
    const source = `Table a\n{\n  id int [pk]\n  email text\n}\n`
    expect(formatted(source)).toBe(`Table a\n{\n  id    int [pk]\n  email text\n}\n`)
  })
})

describe('strings and comments', () => {
  it('leaves the inner lines of a triple quoted note exactly as written', () => {
    const source = `Table users {
    id int
      Note: '''
        Keep
    this    indentation
  '''
}
`
    expect(formatted(source)).toBe(`Table users {
  id int
  Note: '''
        Keep
    this    indentation
  '''
}
`)
  })

  it('keeps trailing spaces that belong to a string running on to the next line', () => {
    const source = `Table users {\n  id int\n  Note: '''first   \n  second'''\n}\n`
    expect(formatted(source)).toBe(source)
  })

  it('leaves the inner lines of block comments alone', () => {
    const source = `/* header
      keep   this
*/
Table a {
    /* inside
          too
    */
    id int
}
`
    expect(formatted(source)).toBe(`/* header
      keep   this
*/
Table a {
  /* inside
          too
    */
  id int
}
`)
  })

  it('does not count brackets inside strings, names, expressions and comments', () => {
    const source = `Table users {
id int [note: 'has { and [ and (', default: \`lower('}')\`] // a } here
"we{ird" text /* ] */
      // only a comment with {
name varchar
}
Ref: users.id > users.name // (
`
    expect(formatted(source)).toBe(`Table users {
  id int [note: 'has { and [ and (', default: \`lower('}')\`] // a } here
  "we{ird" text /* ] */
  // only a comment with {
  name varchar
}
Ref: users.id > users.name // (
`)
  })

  it('treats escaped quotes as part of the string', () => {
    const source = `Table a {\nid int [note: 'it\\'s { open']\n}\n`
    expect(formatted(source)).toBe(`Table a {\n  id int [note: 'it\\'s { open']\n}\n`)
  })

  it('leaves a line continued inside a single quoted string alone', () => {
    const source = `Table a {\n  id int [note: 'one \\\n      two']\n}\n`
    expect(formatted(source)).toBe(source)
  })
})

describe('column alignment', () => {
  it('aligns names and settings within a run and starts over after a blank line', () => {
    const source = `Table users {
  id int [pk]
  email varchar(255) [not null]

  created_at timestamp
  is_admin boolean
}
`
    expect(formatted(source)).toBe(`Table users {
  id    int          [pk]
  email varchar(255) [not null]

  created_at timestamp
  is_admin   boolean
}
`)
  })

  it('pads types only on lines that have settings', () => {
    const source = `Table a {\n  a int\n  bbb varchar [pk]\n  cc text\n}\n`
    expect(formatted(source)).toBe(`Table a {\n  a   int\n  bbb varchar [pk]\n  cc  text\n}\n`)
  })

  it('collapses extra spaces on a single column line', () => {
    expect(formatted(`Table a {\n  id    int     [pk]\n}\n`)).toBe(`Table a {\n  id int [pk]\n}\n`)
  })

  it('handles quoted names, quoted and qualified types and decimal(10, 2)', () => {
    const source = `Enum shop.status {
  active
}
Table "order lines" {
  "full name" "my type" [note: 'x']
  price decimal(10, 2) [not null]
  status shop.status
  tags int[]
}
`
    expect(formatted(source)).toBe(`Enum shop.status {
  active
}
Table "order lines" {
  "full name" "my type"      [note: 'x']
  price       decimal(10, 2) [not null]
  status      shop.status
  tags        int[]
}
`)
  })

  it('measures names in characters, not code units', () => {
    const source = `Table a {\n  "😀" int [pk]\n  ab int [not null]\n}\n`
    expect(formatted(source)).toBe(`Table a {\n  "😀" int [pk]\n  ab  int [not null]\n}\n`)
  })

  it('keeps comments one space after the column and lets comment lines end a run', () => {
    const source = `Table a {
  id int [pk]    // the key
  long_name text // free text
  // a section
  x int   // short
}
`
    expect(formatted(source)).toBe(`Table a {
  id        int [pk] // the key
  long_name text // free text
  // a section
  x int // short
}
`)
  })

  it('ends a run at any other line, like a note or an indexes block', () => {
    const source = `Table a {
  id int [pk]
  Note: 'between'
  longer_name text
  indexes {
    id [name:   'x']
    longer_name
  }
}
`
    expect(formatted(source)).toBe(`Table a {
  id int [pk]
  Note: 'between'
  longer_name text
  indexes {
    id [name:   'x']
    longer_name
  }
}
`)
  })

  it('aligns TablePartial bodies but never enums, refs or projects', () => {
    const source = `TablePartial stamps {
  created_at timestamp [not null]
  id int
}
Table a {
  ~stamps
  name text
}
Enum role {
  admin   [note: 'all']
  reader
}
Project p {
  database_type:   'PostgreSQL'
}
Ref r {
  a.name   > a.id
}
`
    expect(formatted(source)).toBe(`TablePartial stamps {
  created_at timestamp [not null]
  id         int
}
Table a {
  ~stamps
  name text
}
Enum role {
  admin   [note: 'all']
  reader
}
Project p {
  database_type:   'PostgreSQL'
}
Ref r {
  a.name   > a.id
}
`)
  })

  it('pads alignment with spaces even when indenting with tabs', () => {
    const source = `Table a {\n  id int [pk]\n  email varchar [not null]\n  indexes {\n    email\n  }\n}\n`
    expect(formatted(source, TABS)).toBe(
      `Table a {\n\tid    int     [pk]\n\temail varchar [not null]\n\tindexes {\n\t\temail\n\t}\n}\n`,
    )
  })

  it('indents with four spaces when asked', () => {
    const source = `Table a {\n\tid int [pk]\n\temail varchar [not null]\n\tindexes {\n\t\temail\n\t}\n}\n`
    expect(formatted(source, FOUR)).toBe(
      `Table a {\n    id    int     [pk]\n    email varchar [not null]\n    indexes {\n        email\n    }\n}\n`,
    )
  })
})

describe('blank lines and the end of the text', () => {
  it('collapses blank lines and drops them at the edges and next to braces', () => {
    const source = `


Table a {


  id int



  name text


}



Table b {
  id int
}


`
    expect(formatted(source)).toBe(`Table a {
  id int

  name text
}

Table b {
  id int
}
`)
  })

  it('drops blank lines just inside the braces of a nested block', () => {
    const source = `Table a {\n  id int\n  indexes {\n\n    id\n\n  }\n}\n`
    expect(formatted(source)).toBe(`Table a {\n  id int\n  indexes {\n    id\n  }\n}\n`)
  })

  it('adds the missing final newline', () => {
    expect(formatted('Table a {\n  id int\n}')).toBe('Table a {\n  id int\n}\n')
  })

  it('keeps an empty text empty and empties a text of whitespace', () => {
    expect(formatEdits('')).toEqual([])
    expect(formatDbml('')).toBe('')
    expect(formatted('  \n\n\t\n')).toBe('')
  })

  it('removes trailing whitespace, also after comments', () => {
    expect(formatted('Table a {   \n  id int   \n}  // done   \n')).toBe(
      'Table a {\n  id int\n}  // done\n',
    )
  })
})

describe('formatEdits', () => {
  it('returns no edits for formatted text', () => {
    expect(formatEdits('Table a {\n  id int [pk]\n}\n')).toEqual([])
  })

  it('returns null for text that does not parse', () => {
    expect(formatEdits('Table a {\n  id int [pk]\n')).toBeNull()
    expect(formatDbml('Table a {\n  id int [pk]\n')).toBeNull()
  })

  it('returns null when the formatted text would not parse', () => {
    tamper.mode = 'invalid'
    expect(formatEdits('Table a {\nid int\n}\n')).toBeNull()
  })

  it('returns null when the formatted text would mean something else', () => {
    tamper.mode = 'renamed'
    expect(formatDbml('Table a {\nid int\n}\n')).toBeNull()
  })

  it('makes small edits that stay on their line and never overlap', () => {
    const source = 'Table a {\n    id int\n\n\n\n  name    text   \n}'
    const edits = formatEdits(source)!
    // Indentation of line 2, the surplus blank lines 4 and 5, the spacing of line 6 and
    // the final newline: positions are offsets in the original text.
    expect(edits).toEqual([
      { from: 12, to: 14, insert: '' },
      { from: 22, to: 24, insert: '' },
      { from: 31, to: 41, insert: 'text' },
      { from: 43, to: 43, insert: '\n' },
    ])
    for (let i = 1; i < edits.length; i += 1) {
      expect(edits[i]!.from).toBeGreaterThanOrEqual(edits[i - 1]!.to)
    }
    expect(applyEdits(source, edits)).toBe('Table a {\n  id int\n\n  name text\n}\n')
  })

  it('formats every sample schema without changing its meaning', () => {
    for (const sample of SAMPLES) {
      const text = formatted(sample.source)
      expect(text.endsWith('\n')).toBe(true)
      expect(formatted(sample.source, TABS)).toContain('\n\t')
    }
  })

  it('is idempotent on a messy document with every indent style', () => {
    const messy = `Table   users {
id int [pk]   // key
"display name"   varchar(80)

        indexes {
(id, "display name") [unique]
    }
}
Ref: users.id < users."display name"
`
    for (const indent of [DEFAULT_INDENT, TABS, FOUR]) {
      const once = formatted(messy, indent)
      expect(formatDbml(once, indent)).toBe(once)
    }
  })
})

describe('indentUnit', () => {
  it('writes a tab or the given number of spaces', () => {
    expect(indentUnit({ kind: 'tab', size: 8 })).toBe('\t')
    expect(indentUnit(FOUR)).toBe('    ')
    expect(indentUnit(DEFAULT_INDENT)).toBe('  ')
  })

  it('keeps the size between one and eight', () => {
    expect(indentUnit({ kind: 'space', size: 0 })).toBe(' ')
    expect(indentUnit({ kind: 'space', size: 20 })).toBe(' '.repeat(8))
    expect(indentUnit({ kind: 'space', size: Number.NaN })).toBe('  ')
  })
})

describe('detectIndent', () => {
  it('recognises two spaces', () => {
    expect(detectIndent(SAMPLES[0]!.source)).toEqual({ kind: 'space', size: 2 })
  })

  it('recognises four spaces, also from nested blocks', () => {
    const source = formatDbml(SAMPLES[0]!.source, FOUR)!
    expect(detectIndent(source)).toEqual({ kind: 'space', size: 4 })
  })

  it('falls back to the smallest indentation when no step is visible', () => {
    expect(detectIndent('    id int\n    name text\n')).toEqual({ kind: 'space', size: 4 })
    expect(detectIndent('     id int\n     name text\n')).toBeNull()
  })

  it('recognises tabs', () => {
    const source = `Table a {\n\tid int\n\tindexes {\n\t\tid\n\t}\n}\n`
    expect(detectIndent(source)).toEqual({ kind: 'tab', size: 2 })
  })

  it('gives up on mixed or missing indentation', () => {
    expect(detectIndent('')).toBeNull()
    expect(detectIndent('Table a {\nid int\n}\n')).toBeNull()
    expect(detectIndent('Table a {\n  id int\n}\n')).toBeNull()
    expect(
      detectIndent('Table a {\n  id int\n\tname text\n  email text\n\tage int\n}\n'),
    ).toBeNull()
  })

  it('ignores indentation inside a triple quoted string', () => {
    const source = `Table a {
  id int
  Note: '''
        deep
            deeper
                deepest
  '''
}
`
    expect(detectIndent(source)).toEqual({ kind: 'space', size: 2 })
  })
})

describe('whitespace noise', () => {
  /** A seeded generator, so the noise is the same on every run. */
  function random(seed: number): () => number {
    let state = seed
    return () => {
      state = (state * 48271) % 2147483647
      return state / 2147483647
    }
  }

  it('formats scrambled indentation and doubled blank lines back to the same text', () => {
    const next = random(7)
    const noise = () => [' ', '\t', '  '][Math.floor(next() * 3)]!.repeat(Math.floor(next() * 3))
    for (const sample of SAMPLES) {
      const scrambled = sample.source
        .split('\n')
        .map((line) => (line.trim() === '' ? '\n  ' : `${noise()}${line.trim()}${noise()}`))
        .join('\n')
      expect(scrambled).not.toBe(sample.source)
      expect(formatted(scrambled)).toBe(formatDbml(sample.source))
    }
  })
})
