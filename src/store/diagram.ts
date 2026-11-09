import { create } from 'zustand'
import { EMPTY_MODEL, type SchemaModel } from '@/dbml/model'
import { parseDbml, type Diagnostic } from '@/dbml/parse'
import { runLayout, type LayoutResult, type StoredRoute } from '@/layout/elk'
import { getLayoutEngine } from '@/layout/engine'
import {
  computeTableBox,
  portOffsetY,
  refColumnsByTable,
  type DetailLevel,
  type TableBox,
} from '@/layout/geometry'
import { contentBounds } from '@/layout/groups'
import { placeNewTables } from '@/layout/incremental'
import { fontsReady, measureText } from '@/layout/measure'
import type { Point } from '@/layout/router'
import { prefersReducedMotion } from '@/lib/platform'
import { getOwn } from '@/lib/record'
import { useDocuments, type DiagramDocument } from './documents'
import { fitRect, insetsFor, useViewport } from './viewport'

export type Hover =
  | { kind: 'table'; tableId: string }
  | { kind: 'column'; tableId: string; column: string }
  | { kind: 'ref'; refId: string }

export interface Emphasis {
  /** Relations drawn in the accent colour. */
  refIds: ReadonlySet<string>
  /** Highlighted column names per table, newline separated so selectors compare cheaply. */
  columns: ReadonlyMap<string, string>
  /** Tables that stay fully visible while one is selected. Null when nothing is dimmed. */
  focus: ReadonlySet<string> | null
}

const NO_EMPHASIS: Emphasis = { refIds: new Set(), columns: new Map(), focus: null }

interface DiagramState {
  /** Last model that parsed without errors. */
  model: SchemaModel
  diagnostics: Diagnostic[]
  /** The source currently has errors, so the diagram shows the last valid version. */
  stale: boolean
  detail: DetailLevel
  auto: boolean
  boxes: ReadonlyMap<string, TableBox>
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  signature: string | null
  ready: boolean
  animating: boolean
  freshIds: ReadonlySet<string>
  selectedTableId: string | null
  cursorTableId: string | null
  hover: Hover | null
  emphasis: Emphasis
  canUndoArrange: boolean
}

export const useDiagram = create<DiagramState>()(() => ({
  model: EMPTY_MODEL,
  diagnostics: [],
  stale: false,
  detail: 'full',
  auto: true,
  boxes: new Map(),
  positions: {},
  routes: {},
  signature: null,
  ready: false,
  animating: false,
  freshIds: new Set(),
  selectedTableId: null,
  cursorTableId: null,
  hover: null,
  emphasis: NO_EMPHASIS,
  canUndoArrange: false,
}))

const { getState: get, setState: set } = useDiagram

const PARSE_DELAY = 140
const ANIMATION_MS = 360
/** A layout worker that never answers must not leave the canvas empty forever. */
const LAYOUT_TIMEOUT_MS = 20_000

interface LayoutSnapshot {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  signature: string | null
  auto: boolean
}

/** Bumped by every request that replaces the layout; stale async results are dropped. */
let generation = 0
/** Bumped by every parse, valid or not. Tells a finished layout whether its text is current. */
let sourceVersion = 0
/**
 * Newest valid model that is still waiting for its layout. Commands that start their own
 * layout (tidy up, detail level) continue with it instead of the model on screen.
 */
let pendingModel: SchemaModel | null = null
let parseTimer: ReturnType<typeof setTimeout> | undefined
let animationTimer: ReturnType<typeof setTimeout> | undefined
let undoSnapshot: LayoutSnapshot | null = null

// ---------------------------------------------------------------- derived data

function computeBoxes(model: SchemaModel, detail: DetailLevel): Map<string, TableBox> {
  const refColumns = refColumnsByTable(model)
  return new Map(
    model.tables.map((table) => [
      table.id,
      computeTableBox(table, detail, measureText, refColumns.get(table.id) ?? new Set()),
    ]),
  )
}

/** Changes whenever something moves a table or a connection point. */
function structureSignature(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  detail: DetailLevel,
): string {
  const parts: string[] = [detail]
  for (const table of model.tables) {
    const box = boxes.get(table.id)
    parts.push(`${table.id}:${box?.width}x${box?.height}:${table.groupId ?? ''}`)
  }
  for (const ref of model.refs) {
    const child = boxes.get(ref.child.tableId)
    const parent = boxes.get(ref.parent.tableId)
    parts.push(
      `${ref.id}:${child ? portOffsetY(child, ref.child.columns[0]) : ''}:${parent ? portOffsetY(parent, ref.parent.columns[0]) : ''}`,
    )
  }
  return parts.join(';')
}

function computeEmphasis(
  model: SchemaModel,
  selectedTableId: string | null,
  hover: Hover | null,
): Emphasis {
  if (!selectedTableId && !hover) return NO_EMPHASIS

  const refIds = new Set<string>()
  const columns = new Map<string, Set<string>>()
  const focus = selectedTableId ? new Set([selectedTableId]) : null
  const addColumns = (tableId: string, names: string[]) => {
    const set = columns.get(tableId) ?? new Set<string>()
    for (const name of names) set.add(name)
    columns.set(tableId, set)
  }

  for (const ref of model.refs) {
    const touchesSelection =
      selectedTableId !== null &&
      (ref.child.tableId === selectedTableId || ref.parent.tableId === selectedTableId)
    let hovered = false
    if (hover?.kind === 'ref') hovered = hover.refId === ref.id
    else if (hover?.kind === 'table') {
      hovered = ref.child.tableId === hover.tableId || ref.parent.tableId === hover.tableId
    } else if (hover?.kind === 'column') {
      hovered = [ref.child, ref.parent].some(
        (end) => end.tableId === hover.tableId && end.columns.includes(hover.column),
      )
    }
    if (!touchesSelection && !hovered) continue

    refIds.add(ref.id)
    addColumns(ref.child.tableId, ref.child.columns)
    addColumns(ref.parent.tableId, ref.parent.columns)
    if (touchesSelection && focus) {
      focus.add(ref.child.tableId)
      focus.add(ref.parent.tableId)
    }
  }

  return {
    refIds,
    columns: new Map([...columns].map(([id, names]) => [id, [...names].join('\n')])),
    focus,
  }
}

// ---------------------------------------------------------------- layout

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Layout timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

async function layoutAll(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
): Promise<LayoutResult> {
  const engine = getLayoutEngine()
  const viewport = canvasArea()
  try {
    return await withTimeout(runLayout(engine, { model, boxes, viewport }), LAYOUT_TIMEOUT_MS)
  } catch (error) {
    console.error('Layout failed, retrying without groups', error)
  }
  try {
    const flat: SchemaModel = {
      ...model,
      groups: [],
      tables: model.tables.map(({ groupId: _groupId, ...table }) => table),
    }
    return await withTimeout(
      runLayout(
        engine,
        { model: flat, boxes, viewport },
        { 'elk.layered.considerModelOrder.strategy': 'NONE' },
      ),
      LAYOUT_TIMEOUT_MS,
    )
  } catch (error) {
    console.error('Layout failed, falling back to simple placement', error)
  }
  return { positions: placeMissing(model, boxes, {}), routes: {} }
}

/** Canvas area that stays free of floating controls. */
function canvasArea(): { width: number; height: number } {
  const { width, height } = useViewport.getState()
  if (width < 200 || height < 200) return { width: 1100, height: 700 }
  const insets = insetsFor(false)
  return {
    width: width - insets.left - insets.right,
    height: height - insets.top - insets.bottom,
  }
}

function placeMissing(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Record<string, Point>,
): Record<string, Point> {
  const present = new Set(model.tables.map((t) => t.id))
  const newIds = model.tables.filter((t) => !getOwn(positions, t.id)).map((t) => t.id)
  if (newIds.length === 0) return positions

  const neighbors = new Map<string, string[]>()
  for (const ref of model.refs) {
    neighbors.set(ref.child.tableId, [
      ...(neighbors.get(ref.child.tableId) ?? []),
      ref.parent.tableId,
    ])
    neighbors.set(ref.parent.tableId, [
      ...(neighbors.get(ref.parent.tableId) ?? []),
      ref.child.tableId,
    ])
  }
  // Positions remembered for tables that are currently gone must not block free space.
  const occupied = Object.fromEntries(Object.entries(positions).filter(([id]) => present.has(id)))
  const placed = placeNewTables({
    sizes: boxes,
    positions: occupied,
    newIds,
    neighbors: (id) => neighbors.get(id) ?? [],
  })
  return { ...positions, ...placed }
}

/**
 * Keeps hand-placed tables where they are and finds room for the ones that are new.
 * Positions of tables that disappeared are kept as well: cutting a table to paste it
 * elsewhere, or commenting it out for a moment, must not lose its place. A tidy up
 * drops them.
 */
function reconcile(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  previous: Record<string, Point>,
  previousTableIds: ReadonlySet<string> = new Set(),
): Record<string, Point> {
  const ids = new Set(model.tables.map((t) => t.id))
  const kept: Record<string, Point> = { ...previous }

  // A single table that vanished while a single new one appeared is a rename.
  const removed = [...previousTableIds].filter((id) => !ids.has(id))
  const added = model.tables.filter((t) => !previousTableIds.has(t.id) && !getOwn(previous, t.id))
  const from = removed.length === 1 ? getOwn(previous, removed[0]!) : undefined
  if (from && added.length === 1) {
    return placeMissing(model, boxes, { ...kept, ...Object.fromEntries([[added[0]!.id, from]]) })
  }
  return placeMissing(model, boxes, kept)
}

function persistLayout(): void {
  const { positions, routes, signature, auto, detail } = get()
  useDocuments.getState().saveLayout({ positions, routes, signature, auto, detail })
}

function startAnimation(): void {
  if (animationTimer) clearTimeout(animationTimer)
  if (prefersReducedMotion()) {
    set({ animating: false, freshIds: new Set() })
    return
  }
  set({ animating: true })
  animationTimer = setTimeout(() => set({ animating: false, freshIds: new Set() }), ANIMATION_MS)
}

export function fitContent(animate = true): void {
  const { model, boxes, positions, selectedTableId } = get()
  fitRect(contentBounds(model, boxes, positions), {
    animate,
    insets: insetsFor(selectedTableId !== null),
  })
}

function refitIfUntouched(): void {
  if (useViewport.getState().fitted) fitContent(true)
}

function forgetUndo(): void {
  undoSnapshot = null
  if (get().canUndoArrange) set({ canUndoArrange: false })
}

// ---------------------------------------------------------------- documents and source

export async function openDocument(doc: DiagramDocument): Promise<void> {
  generation += 1
  sourceVersion += 1
  const token = generation
  if (parseTimer) clearTimeout(parseTimer)
  undoSnapshot = null
  pendingModel = null

  const parsed = parseDbml(doc.source)
  const model = parsed.model ?? EMPTY_MODEL
  set({
    model,
    diagnostics: parsed.diagnostics,
    stale: parsed.model === null,
    detail: doc.layout.detail,
    auto: doc.layout.auto,
    boxes: new Map(),
    positions: {},
    routes: {},
    signature: null,
    ready: false,
    animating: false,
    freshIds: new Set(),
    selectedTableId: null,
    cursorTableId: null,
    hover: null,
    emphasis: NO_EMPHASIS,
    canUndoArrange: false,
  })

  await fontsReady
  if (token !== generation) return

  if (parsed.model === null) {
    // Nothing can be drawn, but the saved layout must survive until the text is fixed.
    set({
      positions: doc.layout.positions,
      routes: doc.layout.routes,
      signature: doc.layout.signature,
      ready: true,
    })
    return
  }

  const { detail } = doc.layout
  const boxes = computeBoxes(model, detail)
  const signature = structureSignature(model, boxes, detail)
  const saved = doc.layout.positions
  const complete = model.tables.every((t) => getOwn(saved, t.id))

  if (doc.layout.signature === signature && complete) {
    set({ boxes, positions: saved, routes: doc.layout.routes, signature, ready: true })
  } else if (doc.layout.auto || Object.keys(saved).length === 0) {
    const result = await layoutAll(model, boxes)
    if (token !== generation) return
    set({ boxes, ...result, signature, auto: true, ready: true })
    persistLayout()
  } else {
    set({
      boxes,
      positions: reconcile(model, boxes, saved),
      routes: doc.layout.routes,
      signature,
      ready: true,
    })
    persistLayout()
  }
  fitContent(false)
}

/** Called on every edit; parsing waits until typing pauses briefly. */
export function sourceChanged(source: string): void {
  if (parseTimer) clearTimeout(parseTimer)
  parseTimer = setTimeout(() => {
    sourceVersion += 1
    const parsed = parseDbml(source)
    if (!parsed.model) {
      set({ diagnostics: parsed.diagnostics, stale: true })
      return
    }
    void applyModel(parsed.model, parsed.diagnostics)
  }, PARSE_DELAY)
}

async function applyModel(model: SchemaModel, diagnostics: Diagnostic[]): Promise<void> {
  generation += 1
  const token = generation
  const version = sourceVersion
  const state = get()
  // The text is valid again right now, whatever happens to the layout below.
  set({ diagnostics, stale: false })

  const boxes = computeBoxes(model, state.detail)
  const signature = structureSignature(model, boxes, state.detail)
  const selectedTableId = model.tables.some((t) => t.id === state.selectedTableId)
    ? state.selectedTableId
    : null
  const shared = {
    model,
    boxes,
    selectedTableId,
    hover: null,
    emphasis: computeEmphasis(model, selectedTableId, null),
  }

  if (signature === state.signature) {
    pendingModel = null
    set(shared)
    return
  }

  // An arrangement from before this change no longer fits the tables on screen.
  forgetUndo()
  const known = new Set(state.model.tables.map((t) => t.id))
  const freshIds = new Set(model.tables.filter((t) => !known.has(t.id)).map((t) => t.id))

  if (state.auto) {
    pendingModel = model
    const result = await layoutAll(model, boxes)
    if (token !== generation) return
    pendingModel = null
    set({ ...shared, ...result, signature, freshIds, ready: true })
    if (known.size > 0) startAnimation()
  } else {
    pendingModel = null
    set({
      ...shared,
      positions: reconcile(model, boxes, state.positions, known),
      signature,
      freshIds,
      ready: true,
    })
    startAnimation()
  }
  // A newer parse may have reported errors while the layout ran; its verdict stands.
  if (version !== sourceVersion) return
  persistLayout()
  refitIfUntouched()
}

export function setCursorOffset(offset: number | null): void {
  const { model, cursorTableId } = get()
  const table =
    offset === null
      ? undefined
      : model.tables.find((t) => t.range.from <= offset && offset <= t.range.to)
  const next = table?.id ?? null
  if (next !== cursorTableId) set({ cursorTableId: next })
}

// ---------------------------------------------------------------- layout commands

/** Lays out the newest valid model from scratch and switches to automatic mode. */
async function relayout(detail: DetailLevel, remember: boolean): Promise<boolean> {
  const state = get()
  // While a document is still opening there is nothing to arrange yet.
  if (!state.ready) return false
  generation += 1
  const token = generation
  const model = pendingModel ?? state.model
  const boxes = computeBoxes(model, detail)
  const snapshot: LayoutSnapshot = {
    positions: state.positions,
    routes: state.routes,
    signature: state.signature,
    auto: state.auto,
  }

  const result = await layoutAll(model, boxes)
  if (token !== generation) return false

  pendingModel = null
  const selectedTableId = model.tables.some((t) => t.id === state.selectedTableId)
    ? state.selectedTableId
    : null
  // The snapshot only describes the model that was on screen when the command started.
  undoSnapshot = remember && model === state.model && detail === state.detail ? snapshot : null
  set({
    model,
    boxes,
    detail,
    ...result,
    signature: structureSignature(model, boxes, detail),
    auto: true,
    selectedTableId,
    emphasis: computeEmphasis(model, selectedTableId, null),
    hover: null,
    canUndoArrange: undoSnapshot !== null,
  })
  startAnimation()
  persistLayout()
  fitContent(true)
  return true
}

export async function arrange(): Promise<void> {
  await relayout(get().detail, true)
}

export function undoArrange(): void {
  if (!undoSnapshot) return
  generation += 1
  set({ ...undoSnapshot, canUndoArrange: false })
  undoSnapshot = null
  startAnimation()
  persistLayout()
  fitContent(true)
}

export async function setDetail(detail: DetailLevel): Promise<void> {
  const state = get()
  if (detail === state.detail || !state.ready) return
  if (state.auto) {
    await relayout(detail, false)
    return
  }
  // Hand-placed tables keep their position; only their size changes.
  const boxes = computeBoxes(state.model, detail)
  forgetUndo()
  set({ detail, boxes, signature: structureSignature(state.model, boxes, detail) })
  persistLayout()
}

// ---------------------------------------------------------------- direct manipulation

export function moveTables(next: Record<string, Point>): void {
  const { positions } = get()
  // Positions snap to a grid, so most pointer moves change nothing.
  const changed = Object.entries(next).some(([id, point]) => {
    const current = getOwn(positions, id)
    return !current || current.x !== point.x || current.y !== point.y
  })
  if (changed) set({ positions: { ...positions, ...next } })
}

/** Dragging hands control of the arrangement to the user. */
export function endDrag(): void {
  if (get().auto) set({ auto: false })
  forgetUndo()
  persistLayout()
}

export function selectTable(tableId: string | null): void {
  const { model, hover, selectedTableId } = get()
  if (tableId === selectedTableId) return
  set({ selectedTableId: tableId, emphasis: computeEmphasis(model, tableId, hover) })
}

export function setHover(hover: Hover | null): void {
  const state = get()
  if (sameHover(state.hover, hover)) return
  set({ hover, emphasis: computeEmphasis(state.model, state.selectedTableId, hover) })
}

function sameHover(a: Hover | null, b: Hover | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'ref' && b.kind === 'ref') return a.refId === b.refId
  if (a.kind === 'table' && b.kind === 'table') return a.tableId === b.tableId
  if (a.kind === 'column' && b.kind === 'column') {
    return a.tableId === b.tableId && a.column === b.column
  }
  return false
}
