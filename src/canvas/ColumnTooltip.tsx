import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tableTitle } from '@/layout/geometry'
import { useDiagram } from '@/store/diagram'
import { FAR_ZOOM, useViewport } from '@/store/viewport'
import { useLinkDrag } from './linkDrag'

/** Long enough that sweeping across rows shows nothing; short enough to feel like an answer. */
const SHOW_AFTER_MS = 450

/**
 * What a column is, without opening the details: its type and constraints, its default,
 * what it points at, and its note. Shown beside the card after the pointer rests on a row.
 */
export function ColumnTooltip() {
  const model = useDiagram((s) => s.model)
  const hovered = useDiagram((s) => (s.hover?.kind === 'column' ? s.hover : null))
  const linking = useLinkDrag((s) => s.from !== null)
  const readable = useViewport((s) => s.k >= FAR_ZOOM)
  const key = hovered ? `${hovered.tableId}\u0000${hovered.column}` : null
  const [shown, setShown] = useState<string | null>(null)
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!key || linking || !readable) return
    const timer = setTimeout(() => setShown(key), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [key, linking, readable])

  const visible = shown !== null && shown === key && !linking && readable
  const facts = useMemo(() => {
    if (!visible || !hovered) return null
    const table = model.tables.find((t) => t.id === hovered.tableId)
    const column = table?.columns.find((c) => c.name === hovered.column)
    if (!table || !column || table.kind === 'enum' || table.kind === 'note') return null
    const title = (id: string) => {
      const other = model.tables.find((t) => t.id === id)
      return other ? tableTitle(other) : id
    }
    const target = model.refs.find(
      (r) =>
        r.kind !== 'enum' && r.child.tableId === table.id && r.child.columns.includes(column.name),
    )
    const constraints = [
      column.pk && 'primary key',
      column.unique && 'unique',
      column.increment && 'auto increment',
      column.pk || column.notNull ? 'not null' : 'may be null',
      column.defaultValue !== undefined && `default ${column.defaultValue}`,
    ].filter(Boolean)
    return {
      column,
      constraints: constraints.join(', '),
      target: target ? `${title(target.parent.tableId)}.${target.parent.columns.join(', ')}` : null,
    }
  }, [visible, hovered, model])

  // Beside the card, level with the row; on the left when there is no room on the right.
  useLayoutEffect(() => {
    const tip = element.current
    if (!tip || !hovered || !facts) return
    const row = document.querySelector<HTMLElement>(
      `article[data-table-id="${CSS.escape(hovered.tableId)}"] [data-column="${CSS.escape(hovered.column)}"]`,
    )
    const card = row?.closest('article')
    const parent = tip.offsetParent
    if (!row || !card || !parent) return
    const bounds = parent.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    const right = cardBox.right - bounds.left + 10
    const x =
      right + tip.offsetWidth + 8 <= bounds.width
        ? right
        : cardBox.left - bounds.left - tip.offsetWidth - 10
    const y = Math.min(rowBox.top - bounds.top - 4, bounds.height - tip.offsetHeight - 8)
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
    tip.style.visibility = 'visible'
  }, [hovered, facts])

  if (!facts) return null
  return (
    <div
      ref={element}
      role="tooltip"
      className="pointer-events-none invisible absolute top-0 left-0 z-20 max-w-72 rounded-md bg-ink px-2.5 py-1.5 text-xs text-canvas shadow-lg"
    >
      <p className="flex items-baseline gap-3 font-mono leading-5">
        <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
          {facts.column.name}
        </span>
        <span className="shrink-0 text-canvas/70">{facts.column.type}</span>
      </p>
      <p className="leading-4 text-canvas/70">{facts.constraints}</p>
      {facts.target && (
        <p className="mt-0.5 font-mono leading-4">
          <span className="font-sans text-canvas/70">references </span>
          {facts.target}
        </p>
      )}
      {facts.column.note && (
        <p className="mt-1 leading-4 whitespace-pre-wrap">{facts.column.note}</p>
      )}
    </div>
  )
}
