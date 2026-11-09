import { ArrowUpRight, KeyRound, StickyNote } from 'lucide-react'
import {
  memo,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { ColumnModel, TableModel } from '@/dbml/model'
import { cancelPendingReveal, clickTable, focusTable, nudgeTable, revealTable } from '@/app/actions'
import {
  addRelationFromDiagram,
  renameColumnFromDiagram,
  renameTableFromDiagram,
  type ColumnRef,
} from '@/app/editActions'
import { hiddenLabel } from '@/export/svg'
import { GEOMETRY, NOTE, tableTitle, type TableBox } from '@/layout/geometry'
import { fitLabel } from '@/layout/label'
import { measureLabelEm } from '@/layout/measure'
import { getOwn } from '@/lib/record'
import { setHover, useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { screenToWorld } from '@/store/viewport'
import { InlineEdit } from '@/ui/InlineEdit'
import { columnAt, endLinkDrag, moveLinkDrag, startLinkDrag, useLinkDrag } from './linkDrag'
import { useDrag } from './useDrag'

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const LINK_SLOP = 4

type Editing = 'title' | { column: string } | null

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
    const pathEnd = useDiagram((s) => s.pathTargetId === table.id)
    const underCursor = useDiagram((s) => s.cursorTableId === table.id)
    const cursorColumn = useDiagram((s) => (s.cursorTableId === table.id ? s.cursorColumn : null))
    const dimmed = useDiagram((s) => s.emphasis.focus !== null && !s.emphasis.focus.has(table.id))
    const activeColumns = useDiagram((s) => s.emphasis.columns.get(table.id) ?? '')
    const spotlight = useDiagram((s) =>
      s.spotlight?.tableId === table.id ? s.spotlight.column : null,
    )
    const fresh = useDiagram((s) => s.freshIds.has(table.id))
    const detail = useDiagram((s) => s.detail)
    const linkSource = useLinkDrag((s) => (s.from?.tableId === table.id ? s.from.column : null))
    const linkTarget = useLinkDrag((s) => (s.target?.tableId === table.id ? s.target.column : null))
    const [dragging, setDragging] = useState(false)
    const [editing, setEditing] = useState<Editing>(null)
    const card = useRef<HTMLElement>(null)

    // Stable across renders, so a card that only changes its dimming does not re-render
    // every row inside it.
    const tableId = table.id
    const editColumn = useCallback((column: string) => {
      cancelPendingReveal()
      setEditing({ column })
    }, [])
    const finishColumnEdit = useCallback(
      (column: string, value: string | null) => {
        setEditing(null)
        requestAnimationFrame(() => card.current?.focus())
        if (value !== null) renameColumnFromDiagram({ tableId, column }, value)
      },
      [tableId],
    )

    const kind = table.kind ?? 'table'
    // A view-only link has no code behind it to write to.
    const readOnly = useUi((s) => s.viewer !== null)
    const editable = kind === 'table' && !readOnly
    const drag = useDrag({
      ids: () => [table.id],
      onClick: (modifiers) => clickTable(table.id, modifiers),
      onDragChange: setDragging,
    })

    if (!position) return null

    const onPointerOver = (event: PointerEvent<HTMLElement>) => {
      // While a relation is drawn the hover highlight would compete with the new line.
      if (dragging || useLinkDrag.getState().from) return
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
      if (event.key === 'F2' && editable) {
        event.preventDefault()
        setEditing('title')
        return
      }
      // Space is the pan modifier of the canvas, so only Enter selects.
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault()
        focusTable(table.id, { focusPanel: true })
      }
    }

    /** Hands focus back to the card once an inline edit is over. */
    const finishEdit = () => {
      setEditing(null)
      requestAnimationFrame(() => card.current?.focus())
    }

    const label = fitLabel(table.name, box.width, box.height, measureLabelEm)
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
        ref={card}
        className="table-node"
        style={style}
        tabIndex={0}
        aria-label={describe(table, relationCount)}
        aria-current={selected ? 'true' : undefined}
        data-canvas-interactive
        data-table-id={table.id}
        data-kind={kind}
        data-detail={detail}
        data-grouped={table.groupId !== undefined}
        data-selected={selected}
        data-path-end={pathEnd}
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
        {kind === 'note' ? (
          <NoteBody table={table} lines={box.lines ?? []} />
        ) : (
          <header
            className="table-header flex items-center gap-2"
            style={{ height: GEOMETRY.headerHeight, paddingInline: GEOMETRY.padX }}
            onDoubleClick={
              editable
                ? () => {
                    cancelPendingReveal()
                    setEditing('title')
                  }
                : undefined
            }
          >
            {editing === 'title' ? (
              <InlineEdit
                label="Table name"
                initial={table.name}
                className="h-6 max-w-full text-[13px] font-semibold"
                onDone={(value) => {
                  finishEdit()
                  if (value !== null) renameTableFromDiagram(table.id, value)
                }}
              />
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-[13px] leading-none font-semibold tracking-normal text-ink">
                {table.schema && <span className="font-medium text-ink-2">{table.schema}.</span>}
                {table.name}
              </h2>
            )}
            {kind === 'enum' && (
              <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10.5px] leading-4 font-medium text-ink-2">
                enum
              </span>
            )}
            {table.note && (
              <StickyNote
                role="img"
                aria-label="Has a note"
                className="size-3.5 shrink-0 text-ink-3"
              />
            )}
          </header>
        )}

        {kind !== 'note' && detail !== 'names' && (
          <div className="table-body" style={{ paddingBlock: GEOMETRY.bodyPadY }}>
            <ul>
              {box.rows.map((column) => (
                <Row
                  key={column.name}
                  tableId={table.id}
                  column={column}
                  plain={kind === 'enum'}
                  linkable={editable}
                  active={active.has(column.name)}
                  spotlight={spotlight === column.name}
                  cursor={cursorColumn === column.name}
                  linkSource={linkSource === column.name}
                  linkTarget={linkTarget === column.name}
                  editing={typeof editing === 'object' && editing?.column === column.name}
                  onEdit={editable ? editColumn : undefined}
                  onEditDone={finishColumnEdit}
                />
              ))}
            </ul>
            {box.hiddenCount > 0 && (
              <p
                className="flex items-center text-[11.5px] tracking-normal text-ink-3"
                style={{ height: GEOMETRY.footerHeight, paddingInline: GEOMETRY.padX }}
              >
                {hiddenLabel(
                  box.hiddenCount,
                  box.rows.length,
                  kind === 'enum' ? 'value' : 'column',
                )}
              </p>
            )}
          </div>
        )}

        <div
          aria-hidden
          className="table-lod absolute inset-0 flex-col items-center justify-center overflow-hidden text-center leading-[1.15] font-semibold whitespace-nowrap text-ink"
          // As large as reads well on screen, but never larger than fits the card.
          style={{ fontSize: `calc(min(var(--lod-need, 13), ${label.size}) * 1px)` }}
        >
          {label.lines.map((line, index) => (
            <span key={index}>{line}</span>
          ))}
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

function describe(table: TableModel, relationCount: number): string {
  const title = tableTitle(table)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (table.kind === 'note') return `Note ${table.name}`
  if (table.kind === 'enum') {
    return `Enum ${title}, ${plural(table.columns.length, 'value')}, used by ${plural(relationCount, 'column')}`
  }
  return `Table ${title}, ${plural(table.columns.length, 'column')}, ${plural(relationCount, 'relation')}`
}

/** A sticky note: its name as a caption, then the text wrapped as the geometry decided. */
function NoteBody({ table, lines }: { table: TableModel; lines: string[] }) {
  return (
    <div className="table-body" style={{ padding: `${NOTE.padY}px ${GEOMETRY.padX}px` }}>
      <h2
        className="truncate text-[11px] font-medium tracking-normal text-ink-3"
        style={{ lineHeight: `${NOTE.captionHeight}px` }}
      >
        {table.name}
      </h2>
      {lines.length > 0 && (
        <p className="mt-1 text-[13px] text-ink-2" style={{ lineHeight: `${NOTE.lineHeight}px` }}>
          {lines.map((line, index) => (
            <span key={index} className="block truncate">
              {line || ' '}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

interface RowProps {
  tableId: string
  column: ColumnModel
  /** Enum values: just the name, no marker, no type, no relation handle. */
  plain: boolean
  /** Shows the handle that drags a new relation out of the row. */
  linkable: boolean
  active: boolean
  spotlight: boolean
  /** The code cursor is in this column's line. */
  cursor: boolean
  linkSource: boolean
  linkTarget: boolean
  editing: boolean
  onEdit: ((column: string) => void) | undefined
  onEditDone: (column: string, value: string | null) => void
}

const Row = memo(function Row({
  tableId,
  column,
  plain,
  linkable,
  active,
  spotlight,
  cursor,
  linkSource,
  linkTarget,
  editing,
  onEdit,
  onEditDone,
}: RowProps) {
  return (
    <li
      className="column-row group/row relative flex items-center font-mono text-xs tracking-normal hover:bg-fill"
      style={{ height: GEOMETRY.rowHeight, paddingInline: GEOMETRY.padX }}
      data-column={column.name}
      data-active={active}
      data-spotlight={spotlight}
      data-cursor={cursor}
      data-link-source={linkSource}
      data-link-target={linkTarget}
      onDoubleClick={onEdit ? () => onEdit(column.name) : undefined}
    >
      {!plain && (
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
      )}
      {editing ? (
        <InlineEdit
          label="Column name"
          initial={column.name}
          mono
          className="h-5 flex-1 text-xs"
          onDone={(value) => onEditDone(column.name, value)}
        />
      ) : (
        <span
          className={`column-name min-w-0 flex-1 truncate text-ink ${column.pk ? 'font-semibold' : ''}`}
        >
          {column.name}
        </span>
      )}
      {!plain && !editing && (
        <span className="ml-3 max-w-[58%] shrink-0 truncate text-ink-3">{column.type}</span>
      )}
      {!plain && linkable && <RelationHandle from={{ tableId, column: column.name }} />}
    </li>
  )
})

/**
 * Small handle on the edge of a row. Dragging it onto another column writes a relation
 * between the two into the code; a plain click opens a list to pick the column instead.
 * Not in the tab order: the details panel offers the same for the keyboard.
 */
function RelationHandle({ from }: { from: ColumnRef }) {
  const session = useRef<{ pointerId: number; x: number; y: number; dragging: boolean } | null>(
    null,
  )

  const worldPoint = (event: PointerEvent<HTMLElement>) => {
    const canvas = event.currentTarget.closest('.canvas-viewport')
    const bounds = canvas?.getBoundingClientRect()
    return screenToWorld({
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    })
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Add relation from ${from.column}`}
      className="relation-handle"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        session.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dragging: false,
        }
      }}
      onPointerMove={(event) => {
        const current = session.current
        if (!current || current.pointerId !== event.pointerId) return
        if (!current.dragging) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) <= LINK_SLOP) return
          current.dragging = true
          setHover(null, { immediate: true })
          startLinkDrag(from, worldPoint(event))
        }
        moveLinkDrag(worldPoint(event), columnAt(event.clientX, event.clientY))
      }}
      onPointerUp={(event) => {
        const current = session.current
        if (!current || current.pointerId !== event.pointerId) return
        session.current = null
        if (!current.dragging) {
          useUi.getState().openPalette({ kind: 'relation', from })
          return
        }
        const { target } = useLinkDrag.getState()
        endLinkDrag()
        if (target && (target.tableId !== from.tableId || target.column !== from.column)) {
          addRelationFromDiagram(from, target)
        }
      }}
      onPointerCancel={() => {
        session.current = null
        endLinkDrag()
      }}
    >
      <span aria-hidden className="relation-handle-dot" />
    </button>
  )
}
