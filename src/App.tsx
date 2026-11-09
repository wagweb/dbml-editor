import { FileDown } from 'lucide-react'
import { useEffect } from 'react'
import { arrangeWithUndo, closeDetails } from '@/app/actions'
import { CommandPalette } from '@/app/CommandPalette'
import { APP_NAME } from '@/app/constants'
import { Header } from '@/app/Header'
import { ShortcutsDialog } from '@/app/ShortcutsDialog'
import { Splitter } from '@/app/Splitter'
import { SqlExportDialog, SqlImportDialog } from '@/app/SqlDialogs'
import { StatusBar } from '@/app/StatusBar'
import { checkFileOnDisk, openDropped, openFile, saveFile } from '@/app/fileActions'
import { StartScreen } from '@/app/StartScreen'
import { Canvas } from '@/canvas/Canvas'
import { CodeEditor } from '@/editor/CodeEditor'
import { isEditableTarget } from '@/lib/platform'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { closeDocument, openDocument } from '@/store/diagram'
import { activeDocument, useDocuments } from '@/store/documents'
import { resolveTheme, useUi } from '@/store/ui'
import { Toaster } from '@/ui/Toast'
import { TooltipProvider } from '@/ui/Tooltip'

function useTheme(): void {
  const theme = useUi((s) => s.theme)
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme)
    }
    apply()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const ui = useUi.getState()
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (mod && event.key === '\\') {
        event.preventDefault()
        ui.toggleEditor()
        return
      }
      // The browser's own open and save dialogs are no use here.
      if (mod && event.key.toLowerCase() === 'o' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        void openFile()
        return
      }
      if (mod && event.key.toLowerCase() === 's' && !event.altKey) {
        event.preventDefault()
        void saveFile({ as: event.shiftKey })
        return
      }
      // Undo for the action a message offers (delete diagram, tidy up). The editor keeps
      // its own undo while it has focus.
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey && ui.toast?.action) {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        ui.toast.action.run()
        ui.dismissToast(ui.toast.id)
        return
      }
      // Single-key shortcuts must not fire while someone is typing, and not for keys an
      // open menu or popover already handled (Escape to close, typeahead letters).
      const inMenu = event.target instanceof Element && event.target.closest('[role="menu"]')
      if (event.defaultPrevented || inMenu) return
      if (mod || event.altKey || isEditableTarget(event.target) || ui.commandOpen || ui.dialog)
        return
      if (event.key === 'Escape') {
        // Works wherever focus is, e.g. after the details panel swapped its content.
        closeDetails()
        return
      }
      // Character keys only act while focus is on the diagram or on nothing at all, so
      // speech input and stray typing elsewhere cannot trigger them.
      const target = event.target instanceof Element ? event.target : null
      const onDiagram = target === document.body || target?.closest('.canvas-viewport') != null
      const onControl = target?.closest('button, a, [role="separator"]') != null
      if (!onDiagram || onControl) return
      if (event.key === '?') {
        event.preventDefault()
        ui.openDialog('shortcuts')
      } else if (event.key === 'A' && event.shiftKey) {
        event.preventDefault()
        void arrangeWithUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/**
 * Owns the width subscription, so dragging the splitter re-renders this pane only. The
 * editor stays mounted while hidden; undo history and scroll position survive.
 */
function EditorPane({ visible, fullWidth }: { visible: boolean; fullWidth: boolean }) {
  const editorWidth = useUi((s) => s.editorWidth)
  return (
    <section
      aria-label="Code"
      hidden={!visible}
      className="flex min-w-0 shrink-0 flex-col bg-panel"
      style={{ width: fullWidth ? '100%' : editorWidth }}
    >
      <p id="editor-help" className="sr-only">
        Tab indents. To leave the editor with the keyboard, press Escape and then Tab. The status
        bar shows the same hint while the editor has keyboard focus.
      </p>
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
      <StatusBar />
    </section>
  )
}

/**
 * Files dragged over the window open on drop: DBML as a diagram, SQL through the import.
 * Listening in the capture phase keeps the editor from pasting the file's text inline.
 */
function useFileDrop(): void {
  useEffect(() => {
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true
    const { setDropping } = useUi.getState()
    let depth = 0
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth += 1
      setDropping(true)
    }
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDropping(false)
    }
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event) || !event.dataTransfer) return
      event.preventDefault()
      event.stopPropagation()
      depth = 0
      setDropping(false)
      void openDropped(event.dataTransfer)
    }
    window.addEventListener('dragenter', onEnter, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('dragover', onOver, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragenter', onEnter, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('dragover', onOver, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [])
}

/** Shown while a file is dragged over the window. */
function DropOverlay() {
  const dropping = useUi((s) => s.dropping)
  if (!dropping) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 animate-fade-in bg-[color-mix(in_oklab,var(--canvas)_82%,transparent)] p-3">
      <div className="flex h-full items-center justify-center rounded-[16px] bg-accent-soft/40 shadow-[inset_0_0_0_2px_var(--accent)]">
        <p className="flex flex-col items-center gap-2 text-center text-[13px] text-ink">
          <FileDown aria-hidden className="size-6 text-accent" strokeWidth={1.75} />
          <span className="text-[15px] font-semibold">Drop to open</span>
          <span className="text-ink-2">
            A .dbml file opens as a diagram, a .sql file goes through the import
          </span>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const activeId = useDocuments((s) => s.activeId)
  const externalRevision = useDocuments((s) => s.externalRevision)
  const name = useDocuments((s) => (s.activeId ? s.documents[s.activeId]?.name : undefined))
  const editorOpen = useUi((s) => s.editorOpen)
  const mobileView = useUi((s) => s.mobileView)
  const mobile = useMediaQuery('(max-width: 767px)')

  useTheme()
  useGlobalShortcuts()
  useFileDrop()

  useEffect(() => {
    const doc = activeDocument()
    if (doc) void openDocument(doc)
    else closeDocument()
    // Also reopens when another tab saved a newer version of the open diagram.
  }, [activeId, externalRevision])

  useEffect(() => {
    document.title = name ? `${name} | ${APP_NAME}` : APP_NAME
  }, [name])

  // A file linked to the open diagram may have changed while the window was in the background.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void checkFileOnDisk()
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const hasDocument = activeId !== null
  const showEditor = mobile ? mobileView === 'code' : editorOpen
  const showCanvas = !mobile || mobileView === 'diagram'

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      <div className="flex h-full flex-col">
        {/* The first stop for keyboard users: past the header and the code, to the tables. */}
        {hasDocument && showCanvas && (
          <a
            href="#diagram"
            className="fixed top-2 left-2 z-50 -translate-y-16 rounded-control bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas focus:translate-y-0"
          >
            Skip to diagram
          </a>
        )}
        <Header mobile={mobile} hasDocument={hasDocument} />
        <main className="flex min-h-0 flex-1">
          {hasDocument ? (
            <>
              <h1 className="sr-only">{name ? `${name}, database diagram` : APP_NAME}</h1>
              <EditorPane visible={showEditor} fullWidth={mobile} />
              {showEditor && !mobile && <Splitter />}
              <div hidden={!showCanvas} className="min-w-0 flex-1">
                <Canvas />
              </div>
            </>
          ) : (
            <StartScreen />
          )}
        </main>
      </div>
      <DropOverlay />
      <CommandPalette />
      <SqlExportDialog />
      <SqlImportDialog />
      <ShortcutsDialog />
      <Toaster />
    </TooltipProvider>
  )
}
