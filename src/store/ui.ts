import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type DialogId = 'export-sql' | 'import-sql' | 'shortcuts'
export type MobileView = 'code' | 'diagram'

export const EDITOR_MIN_WIDTH = 280
export const EDITOR_MAX_WIDTH = 720
export const EDITOR_DEFAULT_WIDTH = 400

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
  mobileView: MobileView
  commandOpen: boolean
  dialog: DialogId | null
  toast: ToastMessage | null

  setTheme: (theme: ThemePreference) => void
  setEditorWidth: (width: number) => void
  toggleEditor: () => void
  toggleMinimap: () => void
  setMobileView: (view: MobileView) => void
  setCommandOpen: (open: boolean) => void
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
      mobileView: 'diagram',
      commandOpen: false,
      dialog: null,
      toast: null,

      setTheme: (theme) => set({ theme }),
      setEditorWidth: (width) =>
        set({ editorWidth: Math.min(Math.max(width, EDITOR_MIN_WIDTH), EDITOR_MAX_WIDTH) }),
      toggleEditor: () => set({ editorOpen: !get().editorOpen }),
      toggleMinimap: () => set({ minimapOpen: !get().minimapOpen }),
      setMobileView: (mobileView) => set({ mobileView }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
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
      }),
    },
  ),
)

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
