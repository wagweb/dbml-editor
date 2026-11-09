import { create } from 'zustand'
import { shownModel } from '@/dbml/derive'
import { shortestPath, withinSteps } from '@/dbml/graph'
import { schemaHints, type Hint } from '@/dbml/hints'
import { EMPTY_MODEL, type RefModel, type SchemaModel } from '@/dbml/model'
import { parseDbml, type Diagnostic } from '@/dbml/parse'
import { refreshRoutes } from '@/layout/edges'
import { runLayout, type LayoutResult, type StoredRoute } from '@/layout/elk'
import { getLayoutEngine } from '@/layout/engine'
import {
  computeTableBox,
  portOffsetY,
  refColumnsByTable,
  type DetailLevel,
  type TableBox,
} from '@/layout/geometry'
import { contentBounds, tableRect } from '@/layout/groups'
import { placeNewTables } from '@/layout/incremental'
import { fontsReady, measureText } from '@/layout/measure'
import { bounds, type Point } from '@/layout/router'
import { prefersReducedMotion } from '@/lib/platform'
import { getOwn } from '@/lib/record'
import {
  activeDocument,
  EMPTY_VIEW_LAYOUT,
  useDocuments,
  type DiagramDocument,
  type ViewLayout,
} from './documents'
import { useUi, type FocusDepth } from './ui'
import { fitRect, frameOnOpen, frameRect, insetsFor, isInView, useViewport } from './viewport'

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
  /**
   * Tables along the way from the selected table to the path target, both included.
   * Null without a target; empty when the two are not connected.
   */
  path: readonly string[] | null
}

export interface Spotlight {
  tableId: string
  column: string
}

const NO_EMPHASIS: Emphasis = { refIds: new Set(), columns: new Map(), focus: null, path: null }

interface DiagramState {
  /** Everything the code declares. Views and view options narrow it down to `model`. */
  fullModel: SchemaModel
  /** What the canvas draws: the last model that parsed without errors, as shown. */
  model: SchemaModel
  diagnostics: Diagnostic[]
  /** Advice about the schema, never errors. */
  hints: Hint[]
  /** The source currently has errors, so the diagram shows the last valid version. */
  stale: boolean
  detail: DetailLevel
  auto: boolean
  /** Name of the open DiagramView, null for the whole diagram. */
  view: string | null
  boxes: ReadonlyMap<string, TableBox>
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  signature: string | null
  /** Group pairs the layout stacked; kept for the next automatic layout of this view. */
  stacked: string[]
  ready: boolean
  animating: boolean
  freshIds: ReadonlySet<string>
  selectedTableId: string | null
  /** Second table of a path question: how does the selected table reach this one? */
  pathTargetId: string | null
  cursorTableId: string | null
  hover: Hover | null
  emphasis: Emphasis
  /** A column that was just found by search; it flashes briefly. */
  spotlight: Spotlight | null
  canUndoArrange: boolean
}

export const useDiagram = create<DiagramState>()(() => ({
  fullModel: EMPTY_MODEL,
  model: EMPTY_MODEL,
  diagnostics: [],
  hints: [],
  stale: false,
  detail: 'full',
  auto: true,
  view: null,
  boxes: new Map(),
  positions: {},
  routes: {},
  signature: null,
  stacked: [],
  ready: false,
  animating: false,
  freshIds: new Set(),
  selectedTableId: null,
  pathTargetId: null,
  cursorTableId: null,
  hover: null,
  emphasis: NO_EMPHASIS,
  spotlight: null,
  canUndoArrange: false,
}))

const { getState: get, setState: set } = useDiagram

const PARSE_DELAY = 140
const ANIMATION_MS = 360
const SPOTLIGHT_MS = 1800
/** A layout worker that never answers must not leave the canvas empty forever. */
const LAYOUT_TIMEOUT_MS = 20_000

interface LayoutSnapshot {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  signature: string | null
  stacked: string[]
  auto: boolean
}

/** An automatic layout that is already on screen; the next one follows its order. */
interface LayoutSeed {
  previous: Record<string, Point>
  stacked: string[]
}

function seedOf(layout: {
  positions: Record<string, Point>
  stacked?: string[]
}): LayoutSeed | undefined {
  return Object.keys(layout.positions).length > 0
    ? { previous: layout.positions, stacked: layout.stacked ?? [] }
    : undefined
}

interface PendingModel {
  full: SchemaModel
  shown: SchemaModel
}

/** Bumped by every request that replaces the layout; stale async results are dropped. */
let generation = 0
/** Bumped by every parse, valid or not. Tells a finished layout whether its text is current. */
let sourceVersion = 0
/**
 * Newest valid model that is still waiting for its layout. Commands that start their own
 * layout (tidy up, detail level) continue with it instead of the model on screen.
 */
let pendingModel: PendingModel | null = null
/** A rename made from the diagram; the selection follows the table to its new id. */
let renameHint: { from: string; to: string } | null = null
let parseTimer: ReturnType<typeof setTimeout> | undefined
let animationTimer: ReturnType<typeof setTimeout> | undefined
let spotlightTimer: ReturnType<typeof setTimeout> | undefined
let undoSnapshot: LayoutSnapshot | null = null

// ---------------------------------------------------------------- derived data

function derive(full: SchemaModel, view: string | null): SchemaModel {
  const { showEnums, suggestGroups } = useUi.getState()
  return shownModel(full, { view, enums: showEnums, suggestGroups })
}

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

/** Relations that count as steps between tables. Enum links are decoration, not paths. */
function relationGraph(model: SchemaModel): SchemaModel {
  return { ...model, refs: model.refs.filter((r) => r.kind !== 'enum') }
}

function touches(ref: RefModel, tableId: string): boolean {
  return ref.child.tableId === tableId || ref.parent.tableId === tableId
}

function computeEmphasis(
  model: SchemaModel,
  selectedTableId: string | null,
  pathTargetId: string | null,
  depth: FocusDepth,
  hover: Hover | null,
): Emphasis {
  if (!selectedTableId && !hover) return NO_EMPHASIS

  const refIds = new Set<string>()
  const columns = new Map<string, Set<string>>()
  let focus: Set<string> | null = null
  let path: string[] | null = null
  const addRef = (ref: RefModel) => {
    refIds.add(ref.id)
    for (const end of [ref.child, ref.parent]) {
      const names = columns.get(end.tableId) ?? new Set<string>()
      for (const name of end.columns) names.add(name)
      columns.set(end.tableId, names)
    }
  }

  if (selectedTableId && pathTargetId && pathTargetId !== selectedTableId) {
    path = shortestPath(relationGraph(model), selectedTableId, pathTargetId) ?? []
    focus = new Set(path.length > 0 ? path : [selectedTableId, pathTargetId])
    for (let step = 0; step < path.length - 1; step += 1) {
      const a = path[step]!
      const b = path[step + 1]!
      for (const ref of model.refs) {
        if (ref.kind !== 'enum' && touches(ref, a) && touches(ref, b)) addRef(ref)
      }
    }
  } else if (selectedTableId) {
    const distance = withinSteps(relationGraph(model), selectedTableId, depth)
    focus = new Set(distance.keys())
    for (const ref of model.refs) {
      if (ref.kind === 'enum') {
        // Enum cards hang off the tables that use them; they never lead further.
        if (!touches(ref, selectedTableId)) continue
        addRef(ref)
        focus.add(ref.child.tableId)
        focus.add(ref.parent.tableId)
        continue
      }
      const near = Math.min(
        distance.get(ref.child.tableId) ?? Infinity,
        distance.get(ref.parent.tableId) ?? Infinity,
      )
      if (near < depth) addRef(ref)
    }
  }

  if (hover) {
    for (const ref of model.refs) {
      let hovered = false
      if (hover.kind === 'ref') hovered = hover.refId === ref.id
      else if (hover.kind === 'table') hovered = touches(ref, hover.tableId)
      else {
        hovered = [ref.child, ref.parent].some(
          (end) => end.tableId === hover.tableId && end.columns.includes(hover.column),
        )
      }
      if (hovered) addRef(ref)
    }
  }

  return {
    refIds,
    columns: new Map([...columns].map(([id, names]) => [id, [...names].join('\n')])),
    focus,
    path,
  }
}

function emphasisFor(
  model: SchemaModel,
  selectedTableId: string | null,
  pathTargetId: string | null,
  hover: Hover | null,
): Emphasis {
  return computeEmphasis(model, selectedTableId, pathTargetId, useUi.getState().focusDepth, hover)
}

/** Keeps a selection across a parse; a table renamed from the diagram keeps it too. */
function carryOver(id: string | null, model: SchemaModel): string | null {
  if (id === null) return null
  const next = renameHint && renameHint.from === id ? renameHint.to : id
  return model.tables.some((t) => t.id === next) ? next : null
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
  seed?: LayoutSeed,
): Promise<LayoutResult> {
  const engine = getLayoutEngine()
  const viewport = canvasArea()
  try {
    return await withTimeout(
      runLayout(engine, { model, boxes, viewport, ...seed }),
      LAYOUT_TIMEOUT_MS,
    )
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

/** The stored arrangement of one view of a document. */
function layoutSlot(doc: DiagramDocument, view: string | null): ViewLayout {
  if (view === null) return doc.layout
  return getOwn(doc.layout.views ?? {}, view) ?? EMPTY_VIEW_LAYOUT
}

function persistLayout(): void {
  const { positions, routes, signature, stacked, auto, detail, view } = get()
  const slot: ViewLayout = { positions, routes, signature, stacked, auto }
  const documents = useDocuments.getState()
  if (view === null) {
    documents.saveLayout({ ...slot, detail, view })
    return
  }
  const views = activeDocument()?.layout.views ?? {}
  documents.saveLayout({ detail, view, views: { ...views, [view]: slot } })
}

/**
 * Puts a model on screen with its saved arrangement when that still fits, otherwise with
 * a fresh layout (automatic mode) or with the saved positions plus room for new tables.
 * The patch is applied together with the result, so the canvas never shows a half state.
 */
async function restoreLayout(
  model: SchemaModel,
  detail: DetailLevel,
  saved: ViewLayout,
  token: number,
  patch: Partial<DiagramState>,
): Promise<boolean> {
  const boxes = computeBoxes(model, detail)
  const signature = structureSignature(model, boxes, detail)
  const complete = model.tables.every((t) => getOwn(saved.positions, t.id))

  if (saved.signature === signature && complete) {
    set({
      ...patch,
      model,
      boxes,
      positions: saved.positions,
      routes: saved.routes,
      signature,
      stacked: saved.stacked ?? [],
      auto: saved.auto,
      ready: true,
    })
    return true
  }
  if (saved.auto || Object.keys(saved.positions).length === 0) {
    // The code changed since the last visit; start from the arrangement that was saved.
    const result = await layoutAll(model, boxes, seedOf(saved))
    if (token !== generation) return false
    set({
      ...patch,
      model,
      boxes,
      ...result,
      stacked: result.stacked ?? [],
      signature,
      auto: true,
      ready: true,
    })
  } else {
    const positions = reconcile(model, boxes, saved.positions)
    set({
      ...patch,
      model,
      boxes,
      positions,
      routes: refreshRoutes(model, boxes, positions, saved.routes),
      signature,
      auto: false,
      ready: true,
    })
  }
  persistLayout()
  return true
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

/**
 * After a change the camera only moves when the diagram was framed as a whole and no longer
 * fits; a diagram that still fits stays put, so the eye keeps its place.
 */
function refitIfUntouched(): void {
  if (!useViewport.getState().fitted) return
  const { model, boxes, positions, selectedTableId } = get()
  const bounds = contentBounds(model, boxes, positions)
  if (bounds && !isInView(bounds, insetsFor(selectedTableId !== null))) fitContent(true)
}

/** Frames a document or view that was just opened. */
function frameOpened(): void {
  const { model, boxes, positions } = get()
  frameOnOpen(contentBounds(model, boxes, positions), insetsFor(false))
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
  renameHint = null

  const parsed = parseDbml(doc.source)
  const full = parsed.model ?? EMPTY_MODEL
  const view = doc.layout.view ?? null
  const model = derive(full, view)
  const saved = layoutSlot(doc, view)
  set({
    fullModel: full,
    model,
    diagnostics: parsed.diagnostics,
    hints: schemaHints(full),
    stale: parsed.model === null,
    detail: doc.layout.detail,
    auto: saved.auto,
    view,
    boxes: new Map(),
    positions: {},
    routes: {},
    signature: null,
    stacked: [],
    ready: false,
    animating: false,
    freshIds: new Set(),
    selectedTableId: null,
    pathTargetId: null,
    cursorTableId: null,
    hover: null,
    emphasis: NO_EMPHASIS,
    spotlight: null,
    canUndoArrange: false,
  })

  await fontsReady
  if (token !== generation) return

  if (parsed.model === null) {
    // Nothing can be drawn, but the saved layout must survive until the text is fixed.
    set({
      positions: saved.positions,
      routes: saved.routes,
      signature: saved.signature,
      stacked: saved.stacked ?? [],
      ready: true,
    })
    return
  }

  if (await restoreLayout(model, doc.layout.detail, saved, token, {})) frameOpened()
}

/** Back to the start screen: nothing is open, and nothing that was in flight may land. */
export function closeDocument(): void {
  generation += 1
  sourceVersion += 1
  if (parseTimer) clearTimeout(parseTimer)
  undoSnapshot = null
  pendingModel = null
  set({
    fullModel: EMPTY_MODEL,
    model: EMPTY_MODEL,
    diagnostics: [],
    hints: [],
    stale: false,
    view: null,
    boxes: new Map(),
    positions: {},
    routes: {},
    signature: null,
    stacked: [],
    ready: false,
    selectedTableId: null,
    pathTargetId: null,
    cursorTableId: null,
    hover: null,
    emphasis: NO_EMPHASIS,
    spotlight: null,
    canUndoArrange: false,
  })
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

async function applyModel(full: SchemaModel, diagnostics: Diagnostic[]): Promise<void> {
  generation += 1
  const token = generation
  const version = sourceVersion
  const state = get()
  // The text is valid again right now, whatever happens to the layout below.
  set({ diagnostics, stale: false, fullModel: full, hints: schemaHints(full) })

  const model = derive(full, state.view)
  const boxes = computeBoxes(model, state.detail)
  const signature = structureSignature(model, boxes, state.detail)
  const selectedTableId = carryOver(state.selectedTableId, model)
  const pathTargetId = selectedTableId ? carryOver(state.pathTargetId, model) : null
  renameHint = null
  const shared = {
    model,
    boxes,
    selectedTableId,
    pathTargetId,
    hover: null,
    emphasis: emphasisFor(model, selectedTableId, pathTargetId, null),
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
    pendingModel = { full, shown: model }
    // Small edits keep the arrangement: the engine follows the order already on screen.
    const result = await layoutAll(model, boxes, seedOf(state))
    if (token !== generation) return
    pendingModel = null
    set({
      ...shared,
      ...result,
      stacked: result.stacked ?? [],
      signature,
      freshIds,
      ready: true,
    })
    if (known.size > 0) startAnimation()
  } else {
    pendingModel = null
    const positions = reconcile(model, boxes, state.positions, known)
    set({
      ...shared,
      positions,
      routes: refreshRoutes(model, boxes, positions, state.routes),
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

/** The view options changed: show the same code under the new rules. */
function refreshShown(): void {
  const state = get()
  if (!state.ready) return
  const full = pendingModel?.full ?? state.fullModel
  // Reuse the parse path; a failed parse never gets here because the model is kept.
  void applyModel(full, state.diagnostics)
}

useUi.subscribe((ui, previous) => {
  if (ui.showEnums !== previous.showEnums || ui.suggestGroups !== previous.suggestGroups) {
    refreshShown()
  }
  if (ui.focusDepth !== previous.focusDepth) {
    const { model, selectedTableId, pathTargetId, hover } = get()
    set({ emphasis: emphasisFor(model, selectedTableId, pathTargetId, hover) })
  }
})

/** Announces a rename made from the diagram, so the selection follows the table. */
export function expectRename(from: string, to: string): void {
  renameHint = { from, to }
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

// ---------------------------------------------------------------- views

/** Switches to a DiagramView (or back to everything). Each view keeps its own arrangement. */
export async function setView(view: string | null): Promise<void> {
  const state = get()
  if (view === state.view || !state.ready) return
  generation += 1
  const token = generation
  const doc = activeDocument()
  const full = pendingModel?.full ?? state.fullModel
  pendingModel = null
  forgetUndo()

  const model = derive(full, view)
  const selectedTableId = carryOver(state.selectedTableId, model)
  const patch: Partial<DiagramState> = {
    view,
    selectedTableId,
    pathTargetId: null,
    hover: null,
    emphasis: emphasisFor(model, selectedTableId, null, null),
  }
  const saved = doc ? layoutSlot(doc, view) : EMPTY_VIEW_LAYOUT
  if (!(await restoreLayout(model, state.detail, saved, token, patch))) return
  startAnimation()
  frameOpened()
}

// ---------------------------------------------------------------- layout commands

/**
 * Lays out the newest valid model and switches to automatic mode. Tidy up starts from
 * scratch; a change of detail level follows the arrangement on screen, so the diagram
 * keeps its shape and only the cards change size.
 */
async function relayout(
  detail: DetailLevel,
  options: { remember: boolean; fresh: boolean },
): Promise<boolean> {
  const state = get()
  // While a document is still opening there is nothing to arrange yet.
  if (!state.ready) return false
  generation += 1
  const token = generation
  const model = pendingModel?.shown ?? state.model
  const boxes = computeBoxes(model, detail)
  const snapshot: LayoutSnapshot = {
    positions: state.positions,
    routes: state.routes,
    signature: state.signature,
    stacked: state.stacked,
    auto: state.auto,
  }

  const seed = !options.fresh && state.auto ? seedOf(state) : undefined
  const result = await layoutAll(model, boxes, seed)
  if (token !== generation) return false

  pendingModel = null
  const selectedTableId = carryOver(state.selectedTableId, model)
  const pathTargetId = selectedTableId ? carryOver(state.pathTargetId, model) : null
  // The snapshot only describes the model that was on screen when the command started.
  undoSnapshot =
    options.remember && model === state.model && detail === state.detail ? snapshot : null
  set({
    model,
    boxes,
    detail,
    ...result,
    stacked: result.stacked ?? [],
    signature: structureSignature(model, boxes, detail),
    auto: true,
    selectedTableId,
    pathTargetId,
    emphasis: emphasisFor(model, selectedTableId, pathTargetId, null),
    hover: null,
    canUndoArrange: undoSnapshot !== null,
  })
  startAnimation()
  persistLayout()
  if (options.fresh) fitContent(true)
  else refitIfUntouched()
  return true
}

export async function arrange(): Promise<void> {
  await relayout(get().detail, { remember: true, fresh: true })
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
    await relayout(detail, { remember: false, fresh: false })
    return
  }
  // Hand-placed tables keep their position; only their size changes.
  const boxes = computeBoxes(state.model, detail)
  forgetUndo()
  set({
    detail,
    boxes,
    routes: refreshRoutes(state.model, boxes, state.positions, state.routes),
    signature: structureSignature(state.model, boxes, detail),
  })
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
  const { model, boxes, positions, routes } = get()
  // Lines of moved tables, and lines a table was dropped onto, find a new way round.
  set({ auto: false, routes: refreshRoutes(model, boxes, positions, routes) })
  forgetUndo()
  persistLayout()
}

export function selectTable(tableId: string | null): void {
  const { model, hover, selectedTableId } = get()
  if (tableId === selectedTableId) return
  // A new starting point ends the previous path question.
  set({
    selectedTableId: tableId,
    pathTargetId: null,
    emphasis: emphasisFor(model, tableId, null, hover),
  })
}

/** Asks how the selected table reaches another one; the shortest chain lights up. */
export function setPathTarget(tableId: string | null): void {
  const { model, hover, selectedTableId, pathTargetId, boxes, positions } = get()
  if (!selectedTableId || tableId === pathTargetId) return
  const target = tableId === selectedTableId ? null : tableId
  const emphasis = emphasisFor(model, selectedTableId, target, hover)
  set({ pathTargetId: target, emphasis })
  if (!target) return
  // Bring the whole chain into view, or at least both ends when there is none.
  const ids = emphasis.path && emphasis.path.length > 0 ? emphasis.path : [selectedTableId, target]
  const area = bounds(
    ids.flatMap((id) => {
      const rect = tableRect({ id }, boxes, positions)
      return rect ? [rect] : []
    }),
  )
  if (area) frameRect(area, { insets: insetsFor(true) })
}

export function setHover(hover: Hover | null): void {
  const state = get()
  if (sameHover(state.hover, hover)) return
  set({
    hover,
    emphasis: emphasisFor(state.model, state.selectedTableId, state.pathTargetId, hover),
  })
}

/** Flashes a column found by search, on the card and in the details. */
export function spotlightColumn(spotlight: Spotlight | null): void {
  if (spotlightTimer) clearTimeout(spotlightTimer)
  set({ spotlight })
  if (spotlight) spotlightTimer = setTimeout(() => set({ spotlight: null }), SPOTLIGHT_MS)
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
