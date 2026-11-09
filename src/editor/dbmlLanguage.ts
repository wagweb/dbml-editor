import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
  type StringStream,
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const TOP_LEVEL = new Set([
  'table',
  'ref',
  'enum',
  'tablegroup',
  'tablepartial',
  'project',
  'note',
  'records',
  'diagramview',
  'metadata',
  'dep',
])

/** Keywords that open a named element, so the following identifier is a definition. */
const NAMED = new Set(['table', 'enum', 'tablegroup', 'tablepartial', 'project', 'note'])

const BODY_KEYWORDS = new Set(['indexes', 'note', 'checks', 'records'])

const SETTINGS = new Set([
  'pk',
  'primary',
  'key',
  'not',
  'null',
  'unique',
  'increment',
  'default',
  'note',
  'ref',
  'dep',
  'check',
  'headercolor',
  'color',
  'delete',
  'update',
  'name',
  'type',
  'inactive',
  'cascade',
  'restrict',
  'set',
  'no',
  'action',
  'btree',
  'hash',
])

const LITERALS = new Set(['true', 'false', 'null'])

interface DbmlState {
  blocks: string[]
  /** Block keyword seen at the current level, applied when its brace opens. */
  pendingBlock: string | null
  settingsDepth: number
  expectName: boolean
  expectType: boolean
  firstWordOfLine: boolean
  inBlockComment: boolean
  inTripleQuote: boolean
}

function currentBlock(state: DbmlState): string | undefined {
  return state.blocks.at(-1)
}

function readQuoted(stream: StringStream, quote: string): void {
  let escaped = false
  for (let ch = stream.next(); ch !== undefined && ch !== null; ch = stream.next()) {
    if (ch === quote && !escaped) return
    escaped = !escaped && ch === '\\'
  }
}

function word(stream: StringStream, state: DbmlState): string | null {
  const text = stream.current()
  const lower = text.toLowerCase()
  const block = currentBlock(state)
  const first = state.firstWordOfLine
  state.firstWordOfLine = false

  if (state.settingsDepth > 0) {
    if (LITERALS.has(lower)) return 'atom'
    return SETTINGS.has(lower) ? 'attributeName' : null
  }

  if (state.expectName) {
    if (lower === 'as') return 'keyword'
    return 'variableName.definition'
  }

  if (block === undefined) {
    if (TOP_LEVEL.has(lower)) {
      state.pendingBlock = lower
      state.expectName = NAMED.has(lower)
      return 'keyword'
    }
    return lower === 'as' ? 'keyword' : null
  }

  if (block === 'table' || block === 'tablepartial') {
    if (first && BODY_KEYWORDS.has(lower) && /^\s*[:{]/.test(stream.string.slice(stream.pos))) {
      state.pendingBlock = lower
      return 'keyword'
    }
    if (first) {
      state.expectType = true
      return null
    }
    if (state.expectType) {
      state.expectType = false
      // Swallow length and precision arguments such as varchar(255).
      stream.match(/^\([^)\n]*\)/)
      stream.match(/^(\[\])+/)
      return 'typeName'
    }
    return null
  }

  if (first && /^\s*:/.test(stream.string.slice(stream.pos))) return 'attributeName'
  return null
}

const dbmlStream = StreamLanguage.define<DbmlState>({
  name: 'dbml',

  startState: () => ({
    blocks: [],
    pendingBlock: null,
    settingsDepth: 0,
    expectName: false,
    expectType: false,
    firstWordOfLine: true,
    inBlockComment: false,
    inTripleQuote: false,
  }),

  token(stream, state) {
    if (stream.sol()) {
      state.firstWordOfLine = true
      state.expectType = false
    }

    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/')
        state.inBlockComment = false
      } else stream.skipToEnd()
      return 'comment'
    }
    if (state.inTripleQuote) {
      if (stream.skipTo("'''")) {
        stream.match("'''")
        state.inTripleQuote = false
      } else stream.skipToEnd()
      return 'string'
    }

    if (stream.eatSpace()) return null

    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match('/*')) {
      state.inBlockComment = true
      return 'comment'
    }
    if (stream.match("'''")) {
      state.inTripleQuote = true
      return 'string'
    }

    const ch = stream.next()
    if (!ch) return null

    if (ch === "'" || ch === '`') {
      readQuoted(stream, ch)
      state.firstWordOfLine = false
      return 'string'
    }
    if (ch === '"') {
      // Double quotes wrap identifiers, not strings.
      readQuoted(stream, ch)
      return word(stream, state)
    }
    if (ch === '#' && stream.match(/^[0-9a-fA-F]{3,8}\b/)) return 'color'
    if (/\d/.test(ch)) {
      stream.match(/^[\d.]*/)
      state.firstWordOfLine = false
      return 'number'
    }
    if (/[A-Za-z_]/.test(ch)) {
      stream.match(/^[\w$]*/)
      return word(stream, state)
    }

    if (ch === '{') {
      state.blocks.push(state.pendingBlock ?? 'body')
      state.pendingBlock = null
      state.expectName = false
      return 'bracket'
    }
    if (ch === '}') {
      state.blocks.pop()
      state.pendingBlock = null
      return 'bracket'
    }
    if (ch === '[') {
      state.settingsDepth += 1
      state.expectName = false
      state.expectType = false
      return 'bracket'
    }
    if (ch === ']') {
      state.settingsDepth = Math.max(0, state.settingsDepth - 1)
      return 'bracket'
    }
    if (ch === ':') {
      state.expectName = false
      return 'punctuation'
    }
    if (ch === '<' || ch === '>') {
      stream.eat('>')
      return 'operator'
    }
    if (
      ch === '-' &&
      /\s/.test(stream.string[stream.pos - 2] ?? ' ') &&
      /\s/.test(stream.peek() ?? ' ')
    ) {
      return 'operator'
    }
    if (ch === '.' || ch === ',' || ch === '(' || ch === ')' || ch === '~') return 'punctuation'
    return null
  },

  indent(state, textAfter, context) {
    if (state.inBlockComment || state.inTripleQuote) return null
    const closing = /^\s*\}/.test(textAfter) ? 1 : 0
    return Math.max(0, state.blocks.length - closing) * context.unit
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] },
    indentOnInput: /^\s*\}$/,
  },
})

/** Colours come from CSS variables, so one style serves both themes. */
const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syntax-keyword)', fontWeight: '500' },
  { tag: t.operator, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: t.definition(t.variableName), color: 'var(--ink)', fontWeight: '600' },
  { tag: t.typeName, color: 'var(--syntax-type)' },
  { tag: t.attributeName, color: 'var(--syntax-setting)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: [t.number, t.atom, t.color], color: 'var(--syntax-literal)' },
  { tag: t.comment, color: 'var(--syntax-comment)' },
  { tag: [t.punctuation, t.bracket], color: 'var(--ink-3)' },
])

export function dbml(): LanguageSupport {
  return new LanguageSupport(dbmlStream, [syntaxHighlighting(highlightStyle)])
}
