import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_INDENT, type IndentStyle } from '@/dbml/format'
import type { ImportDialect } from '@/dbml/sql'
import type { SharedDiagram } from '@/share/encode'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type DialogId = 'export-sql' | 'import-sql' | 'shortcuts'
export type MobileView = 'code' | 'diagram'
/** How many relation steps around the selected table stay in focus. */
export type FocusDepth = 1 | 2
/** The open tab in the details of a table; it stays when another table is selected. */
export type DetailsTab = 'columns' | 'relations' | 'indexes' | 'data'

/**
 * The search palette doubles as a picker: for the other end of a path, or for the column
 * a new relation should point at.
 */
export type PaletteMode =
  | { kind: 'all' }
  | { kind: 'path'; fromId: string }
  | { kind: 'relation'; from: { tableId: string; column: string } }

/** SQL that arrived by paste or drop and waits in the import dialog. */
export interface ImportDraft {
  sql: string
  dialect: ImportDialect
  /** Name for the diagram, e.g. from the file that was dropped. */
  name?: string
}

export const EDITOR_MIN_WIDTH = 280
export const EDITOR_MAX_WIDTH = 720
export const EDITOR_DEFAULT_WIDTH = 400

const ALL_COMMANDS: PaletteMode = { kind: 'all' }

export interface ToastMessage {
  id: number
  text: string
  tone: 'neutral' | 'error'
  action?: { label: string; run: () => void }
}

interface UiState {
  theme: ThemePreference
  editorWidth: number
  editorOpen: boolean
  minimapOpen: boolean
  /** Draw enums as cards linked to the columns that use them. */
  showEnums: boolean
  /** Detect related tables when the schema declares no TableGroups. */
  suggestGroups: boolean
  /** Point out tables without a primary key, unindexed foreign keys and the like. */
  showHints: boolean
  focusDepth: FocusDepth
  /** Indentation for new diagrams; each diagram keeps its own, detected or chosen. */
  indent: IndentStyle
  /** Long lines in the code wrap under their indentation instead of scrolling sideways. */
  wrapLines: boolean
  mobileView: MobileView
  commandOpen: boolean
  paletteMode: PaletteMode
  dialog: DialogId | null
  importDraft: ImportDraft | null
  /** A file is being dragged over the window. */
  dropping: boolean
  /** The code editor has focus and got it from the keyboard; the status bar shows the way out. */
  editorKeyboardFocus: boolean
  toast: ToastMessage | null
  /** A diagram from a view-only link: drawn, never stored, nothing in it can be edited. */
  viewer: SharedDiagram | null
  /** Full-screen walk through the diagram, one group or table at a time. */
  presenting: boolean
  /** Index of the stop shown while presenting; 0 is the whole diagram. */
  presentStop: number
  detailsTab: DetailsTab

  setTheme: (theme: ThemePreference) => void
  setEditorWidth: (width: number) => void
  toggleEditor: () => void
  toggleMinimap: () => void
  setShowEnums: (on: boolean) => void
  setSuggestGroups: (on: boolean) => void
  setShowHints: (on: boolean) => void
  setFocusDepth: (depth: FocusDepth) => void
  setIndent: (indent: IndentStyle) => void
  setWrapLines: (on: boolean) => void
  setMobileView: (view: MobileView) => void
  setCommandOpen: (open: boolean) => void
  openPalette: (mode?: PaletteMode) => void
  openDialog: (dialog: DialogId | null) => void
  openImport: (draft?: ImportDraft) => void
  setDropping: (dropping: boolean) => void
  setEditorKeyboardFocus: (focused: boolean) => void
  showToast: (toast: Omit<ToastMessage, 'id' | 'tone'> & { tone?: ToastMessage['tone'] }) => void
  dismissToast: (id?: number) => void
  setViewer: (viewer: SharedDiagram | null) => void
  setPresenting: (presenting: boolean) => void
  setPresentStop: (stop: number) => void
  setDetailsTab: (tab: DetailsTab) => void
}

let toastId = 0

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      editorWidth: EDITOR_DEFAULT_WIDTH,
      editorOpen: true,
      minimapOpen: true,
      showEnums: true,
      suggestGroups: true,
      showHints: true,
      focusDepth: 1,
      indent: DEFAULT_INDENT,
      wrapLines: true,
      mobileView: 'diagram',
      commandOpen: false,
      paletteMode: ALL_COMMANDS,
      dialog: null,
      importDraft: null,
      dropping: false,
      editorKeyboardFocus: false,
      toast: null,
      viewer: null,
      presenting: false,
      presentStop: 0,
      detailsTab: 'columns',

      setTheme: (theme) => set({ theme }),
      setEditorWidth: (width) =>
        set({ editorWidth: Math.min(Math.max(width, EDITOR_MIN_WIDTH), EDITOR_MAX_WIDTH) }),
      toggleEditor: () => set({ editorOpen: !get().editorOpen }),
      toggleMinimap: () => set({ minimapOpen: !get().minimapOpen }),
      setShowEnums: (showEnums) => set({ showEnums }),
      setSuggestGroups: (suggestGroups) => set({ suggestGroups }),
      setShowHints: (showHints) => set({ showHints }),
      setFocusDepth: (focusDepth) => set({ focusDepth }),
      setIndent: (indent) => set({ indent }),
      setWrapLines: (wrapLines) => set({ wrapLines }),
      setMobileView: (mobileView) => set({ mobileView }),
      // Closing always returns the palette to its plain form.
      setCommandOpen: (commandOpen) =>
        set(commandOpen ? { commandOpen } : { commandOpen, paletteMode: ALL_COMMANDS }),
      openPalette: (mode = ALL_COMMANDS) => set({ commandOpen: true, paletteMode: mode }),
      openDialog: (dialog) => set(dialog === null ? { dialog, importDraft: null } : { dialog }),
      openImport: (draft) => set({ dialog: 'import-sql', importDraft: draft ?? null }),
      setDropping: (dropping) => {
        if (get().dropping !== dropping) set({ dropping })
      },
      setEditorKeyboardFocus: (editorKeyboardFocus) => {
        if (get().editorKeyboardFocus !== editorKeyboardFocus) set({ editorKeyboardFocus })
      },
      showToast: (toast) => {
        toastId += 1
        set({ toast: { tone: 'neutral', ...toast, id: toastId } })
      },
      dismissToast: (id) => {
        if (id === undefined || get().toast?.id === id) set({ toast: null })
      },
      setViewer: (viewer) => set({ viewer }),
      // Every presentation starts with the whole diagram.
      setPresenting: (presenting) => set({ presenting, presentStop: 0 }),
      setPresentStop: (presentStop) => set({ presentStop }),
      setDetailsTab: (detailsTab) => set({ detailsTab }),
    }),
    {
      name: 'keyline:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        editorWidth: state.editorWidth,
        editorOpen: state.editorOpen,
        minimapOpen: state.minimapOpen,
        showEnums: state.showEnums,
        suggestGroups: state.suggestGroups,
        showHints: state.showHints,
        focusDepth: state.focusDepth,
        indent: state.indent,
        wrapLines: state.wrapLines,
      }),
    },
  ),
)

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** True while a view-only link is open: the diagram can be explored but not changed. */
export function isReadOnly(): boolean {
  return useUi.getState().viewer !== null
}
