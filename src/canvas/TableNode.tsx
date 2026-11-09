import { ArrowUpRight, KeyRound, StickyNote } from 'lucide-react'
import {
  Fragment,
  memo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { ColumnModel, TableModel } from '@/dbml/model'
import { focusTable, nudgeTable, revealTable } from '@/app/actions'
import { hiddenLabel } from '@/export/svg'
import { GEOMETRY, tableTitle, type TableBox } from '@/layout/geometry'
import { getOwn } from '@/lib/record'
import { setHover, useDiagram } from '@/store/diagram'
import { useDrag } from './useDrag'

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

interface TableNodeProps {
  table: TableModel
  box: TableBox
  /** Fingerprint of everything the card draws; equal keys mean an identical card. */
  contentKey: string
  tone: string | undefined
  /** Columns that have a relation; hovering one narrows the highlight to its relations. */
  refColumns: ReadonlySet<string> | undefined
  relationCount: number
}

export const TableNode = memo(
  function TableNode({ table, box, tone, refColumns, relationCount }: TableNodeProps) {
    const position = useDiagram((s) => getOwn(s.positions, table.id))
    const selected = useDiagram((s) => s.selectedTableId === table.id)
    const underCursor = useDiagram((s) => s.cursorTableId === table.id)
    const dimmed = useDiagram((s) => s.emphasis.focus !== null && !s.emphasis.focus.has(table.id))
    const activeColumns = useDiagram((s) => s.emphasis.columns.get(table.id) ?? '')
    const fresh = useDiagram((s) => s.freshIds.has(table.id))
    const detail = useDiagram((s) => s.detail)
    const [dragging, setDragging] = useState(false)

    const select = () => focusTable(table.id)
    const drag = useDrag({ ids: () => [table.id], onClick: select, onDragChange: setDragging })

    if (!position) return null

    const onPointerOver = (event: PointerEvent<HTMLElement>) => {
      if (dragging) return
      const row = event.target instanceof Element ? event.target.closest('[data-column]') : null
      const column = row?.getAttribute('data-column')
      setHover(
        column && refColumns?.has(column)
          ? { kind: 'column', tableId: table.id, column }
          : { kind: 'table', tableId: table.id },
      )
    }

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      const step = ARROW_STEPS[event.key]
      if (step && event.shiftKey) {
        // Shift + arrow moves the table; plain arrows keep panning the canvas.
        event.preventDefault()
        event.stopPropagation()
        nudgeTable(table.id, step[0], step[1])
        return
      }
      // Space is the pan modifier of the canvas, so only Enter selects.
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault()
        focusTable(table.id, { focusPanel: true })
      }
    }

    const title = tableTitle(table)
    const active = new Set(activeColumns ? activeColumns.split('\n') : [])
    const style = {
      transform: `translate(${position.x}px, ${position.y}px)`,
      width: box.width,
      height: box.height,
      '--tone': tone,
      '--tone-mix': tone ? '14%' : '0%',
    } as CSSProperties

    return (
      <article
        className="table-node"
        style={style}
        tabIndex={0}
        aria-label={`Table ${title}, ${table.columns.length} ${table.columns.length === 1 ? 'column' : 'columns'}, ${relationCount} ${relationCount === 1 ? 'relation' : 'relations'}`}
        aria-current={selected ? 'true' : undefined}
        data-canvas-interactive
        data-table-id={table.id}
        data-detail={detail}
        data-selected={selected}
        data-dimmed={dimmed}
        data-cursor={underCursor && !selected}
        data-dragging={dragging}
        data-new={fresh}
        // Assistive technology activates elements with a click that has no pointer behind it.
        onClick={(event) => {
          if (event.detail === 0) focusTable(table.id, { focusPanel: true })
        }}
        // A table reached with Tab may sit outside the visible part of the canvas.
        onFocus={(event) => {
          const self = event.target === event.currentTarget
          if (self && event.currentTarget.matches(':focus-visible')) revealTable(table.id)
        }}
        onPointerOver={onPointerOver}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        {...drag}
      >
        <header
          className="table-header flex items-center gap-2"
          style={{ height: GEOMETRY.headerHeight, paddingInline: GEOMETRY.padX }}
        >
          <h2 className="min-w-0 flex-1 truncate text-[13px] leading-none font-semibold tracking-normal text-ink">
            {table.schema && <span className="font-medium text-ink-2">{table.schema}.</span>}
            {table.name}
          </h2>
          {table.note && (
            <StickyNote
              role="img"
              aria-label="Has a note"
              className="size-3.5 shrink-0 text-ink-3"
            />
          )}
        </header>

        {detail !== 'names' && (
          <div className="table-body" style={{ paddingBlock: GEOMETRY.bodyPadY }}>
            <ul>
              {box.rows.map((column) => (
                <Row key={column.name} column={column} active={active.has(column.name)} />
              ))}
            </ul>
            {box.hiddenCount > 0 && (
              <p
                className="flex items-center text-[11.5px] tracking-normal text-ink-3"
                style={{ height: GEOMETRY.footerHeight, paddingInline: GEOMETRY.padX }}
              >
                {hiddenLabel(box.hiddenCount, box.rows.length)}
              </p>
            )}
          </div>
        )}

        <div
          aria-hidden
          className="table-lod absolute inset-0 items-center justify-center overflow-hidden px-2 text-center leading-tight font-semibold text-ink"
          style={{ fontSize: 'var(--lod-font, 13px)' }}
        >
          <span className="line-clamp-2 wrap-anywhere">
            {table.name.split('_').map((part, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <>
                    _<wbr />
                  </>
                )}
                {part}
              </Fragment>
            ))}
          </span>
        </div>
      </article>
    )
  },
  // Model objects are recreated on every parse, so identity says nothing about content.
  (previous, next) =>
    previous.contentKey === next.contentKey &&
    previous.tone === next.tone &&
    previous.relationCount === next.relationCount,
)

const Row = memo(function Row({ column, active }: { column: ColumnModel; active: boolean }) {
  return (
    <li
      className="column-row flex items-center font-mono text-xs tracking-normal hover:bg-fill"
      style={{ height: GEOMETRY.rowHeight, paddingInline: GEOMETRY.padX }}
      data-column={column.name}
      data-active={active}
    >
      <span className="flex shrink-0 items-center" style={{ width: GEOMETRY.iconSlot }}>
        {column.pk ? (
          <KeyRound
            role="img"
            aria-label="Primary key"
            className="size-3 text-ink"
            strokeWidth={2.25}
          />
        ) : column.fk ? (
          <ArrowUpRight
            role="img"
            aria-label="Foreign key"
            className="size-3.5 text-ink-3"
            strokeWidth={2}
          />
        ) : null}
      </span>
      <span
        className={`column-name min-w-0 flex-1 truncate text-ink ${column.pk ? 'font-semibold' : ''}`}
      >
        {column.name}
      </span>
      <span className="ml-3 max-w-[58%] shrink-0 truncate text-ink-3">{column.type}</span>
    </li>
  )
})
