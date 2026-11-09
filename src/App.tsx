import { useEffect } from 'react'
import { arrangeWithUndo, closeDetails } from '@/app/actions'
import { CommandPalette } from '@/app/CommandPalette'
import { APP_NAME } from '@/app/constants'
import { Header } from '@/app/Header'
import { ShortcutsDialog } from '@/app/ShortcutsDialog'
import { Splitter } from '@/app/Splitter'
import { SqlExportDialog, SqlImportDialog } from '@/app/SqlDialogs'
import { StatusBar } from '@/app/StatusBar'
import { Canvas } from '@/canvas/Canvas'
import { CodeEditor } from '@/editor/CodeEditor'
import { isEditableTarget } from '@/lib/platform'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { openDocument } from '@/store/diagram'
import { useDocuments } from '@/store/documents'
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
        Tab indents. To leave the editor with the keyboard, press Escape and then Tab.
      </p>
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
      <StatusBar />
    </section>
  )
}

export default function App() {
  const activeId = useDocuments((s) => s.activeId)
  const externalRevision = useDocuments((s) => s.externalRevision)
  const name = useDocuments((s) => s.documents[s.activeId]?.name)
  const editorOpen = useUi((s) => s.editorOpen)
  const mobileView = useUi((s) => s.mobileView)
  const mobile = useMediaQuery('(max-width: 767px)')

  useTheme()
  useGlobalShortcuts()

  useEffect(() => {
    const doc = useDocuments.getState().documents[activeId]
    if (doc) void openDocument(doc)
    // Also reopens when another tab saved a newer version of the open diagram.
  }, [activeId, externalRevision])

  useEffect(() => {
    document.title = name ? `${name} | ${APP_NAME}` : APP_NAME
  }, [name])

  const showEditor = mobile ? mobileView === 'code' : editorOpen
  const showCanvas = !mobile || mobileView === 'diagram'

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      <div className="flex h-full flex-col">
        <Header mobile={mobile} />
        <main className="flex min-h-0 flex-1">
          <h1 className="sr-only">{name ? `${name}, database diagram` : APP_NAME}</h1>
          <EditorPane visible={showEditor} fullWidth={mobile} />
          {showEditor && !mobile && <Splitter />}
          <div hidden={!showCanvas} className="min-w-0 flex-1">
            <Canvas />
          </div>
        </main>
      </div>
      <CommandPalette />
      <SqlExportDialog />
      <SqlImportDialog />
      <ShortcutsDialog />
      <Toaster />
    </TooltipProvider>
  )
}
