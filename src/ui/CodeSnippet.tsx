import { cn } from '@/lib/cn'

/** Same colours as the editor, so a snippet reads as the code it stands for. */
const TOKENS: [RegExp, string][] = [
  [/^\/\/.*/, 'text-(--syntax-comment)'],
  [/^\b(Table|Enum|Ref|TableGroup|Project|Note|indexes)\b/, 'text-(--syntax-keyword)'],
  [/^\[[^\]\n]*\]/, 'text-(--syntax-setting)'],
  [/^'[^'\n]*'/, 'text-(--syntax-string)'],
  [/^[<>-](?=\s)/, 'text-(--syntax-keyword)'],
]

function highlight(source: string) {
  const parts: { text: string; className?: string }[] = []
  let rest = source
  let plain = ''
  while (rest.length > 0) {
    const match = TOKENS.map(([pattern, className]) => {
      const found = pattern.exec(rest)
      return found ? { text: found[0], className } : null
    }).find((candidate) => candidate !== null)
    // Keywords only count at the start of a word.
    const atWordStart = plain.length === 0 || !/[\w$]$/.test(plain)
    if (match && (atWordStart || !/^\w/.test(match.text))) {
      if (plain) parts.push({ text: plain })
      plain = ''
      parts.push(match)
      rest = rest.slice(match.text.length)
    } else {
      plain += rest[0]
      rest = rest.slice(1)
    }
  }
  if (plain) parts.push({ text: plain })
  return parts
}

/** A few lines of DBML, highlighted like the editor. For illustration, not for editing. */
export function CodeSnippet({ source, className }: { source: string; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-x-auto font-mono text-xs leading-[1.7] whitespace-pre text-ink',
        className,
      )}
    >
      <code>
        {highlight(source.trimEnd()).map((part, index) => (
          <span key={index} className={part.className}>
            {part.text}
          </span>
        ))}
      </code>
    </pre>
  )
}
