import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type DialogId = 'export-sql' | 'import-sql' | 'shortcuts'
export type MobileView = 'code' | 'diagram'
/** How many relation steps around the selected table stay in focus. */
export type FocusDepth = 1 | 2

/**
 * The search palette doubles as a picker: for the other end of a path, or for the column
 * a new relation should point at.
 */
export type PaletteMode =
  | { kind: 'all' }
  | { kind: 'path'; fromId: string }
  | { kind: 'relation'; from: { tableId: string; column: string } }

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
  mobileView: MobileView
  commandOpen: boolean
  paletteMode: PaletteMode
  dialog: DialogId | null
  toast: ToastMessage | null

  setTheme: (theme: ThemePreference) => void
  setEditorWidth: (width: number) => void
  toggleEditor: () => void
  toggleMinimap: () => void
  setShowEnums: (on: boolean) => void
  setSuggestGroups: (on: boolean) => void
  setShowHints: (on: boolean) => void
  setFocusDepth: (depth: FocusDepth) => void
  setMobileView: (view: MobileView) => void
  setCommandOpen: (open: boolean) => void
  openPalette: (mode?: PaletteMode) => void
  openDialog: (dialog: DialogId | null) => void
  showToast: (toast: Omit<ToastMessage, 'id' | 'tone'> & { tone?: ToastMessage['tone'] }) => void
  dismissToast: (id?: number) => void
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
      mobileView: 'diagram',
      commandOpen: false,
      paletteMode: ALL_COMMANDS,
      dialog: null,
      toast: null,

      setTheme: (theme) => set({ theme }),
      setEditorWidth: (width) =>
        set({ editorWidth: Math.min(Math.max(width, EDITOR_MIN_WIDTH), EDITOR_MAX_WIDTH) }),
      toggleEditor: () => set({ editorOpen: !get().editorOpen }),
      toggleMinimap: () => set({ minimapOpen: !get().minimapOpen }),
      setShowEnums: (showEnums) => set({ showEnums }),
      setSuggestGroups: (suggestGroups) => set({ suggestGroups }),
      setShowHints: (showHints) => set({ showHints }),
      setFocusDepth: (focusDepth) => set({ focusDepth }),
      setMobileView: (mobileView) => set({ mobileView }),
      // Closing always returns the palette to its plain form.
      setCommandOpen: (commandOpen) =>
        set(commandOpen ? { commandOpen } : { commandOpen, paletteMode: ALL_COMMANDS }),
      openPalette: (mode = ALL_COMMANDS) => set({ commandOpen: true, paletteMode: mode }),
      openDialog: (dialog) => set({ dialog }),
      showToast: (toast) => {
        toastId += 1
        set({ toast: { tone: 'neutral', ...toast, id: toastId } })
      },
      dismissToast: (id) => {
        if (id === undefined || get().toast?.id === id) set({ toast: null })
      },
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
      }),
    },
  ),
)

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
