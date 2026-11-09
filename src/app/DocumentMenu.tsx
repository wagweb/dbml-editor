import {
  ChevronsUpDown,
  Copy,
  FileInput,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Save,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SAMPLES } from '@/dbml/samples'
import { supportsFileHandles } from '@/lib/files'
import { timeAgo } from '@/lib/time'
import { sortedDocuments, useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/ui/Menu'
import { newDiagram, openSample } from './actions'
import { hasUnsavedChanges, openFile, saveFile, unlinkFile } from './fileActions'

function deleteWithUndo(id: string): void {
  const { documents, remove, restore } = useDocuments.getState()
  const doc = documents[id]
  if (!doc) return
  remove(id)
  useUi.getState().showToast({
    text: `Deleted "${doc.name}"`,
    action: { label: 'Undo', run: () => restore(doc) },
  })
}

/** Name of the open diagram; opens the list of saved diagrams. */
export function DocumentMenu() {
  const activeId = useDocuments((s) => s.activeId)
  const activeName = useDocuments((s) => s.documents[s.activeId]?.name)
  const file = useDocuments((s) => s.documents[s.activeId]?.file)
  const unsaved = useDocuments((s) => {
    const doc = s.documents[s.activeId]
    return doc ? hasUnsavedChanges(doc) : false
  })
  const [renaming, setRenaming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  // Leaving the rename field removes the focused element; hand focus back to the name.
  useEffect(() => {
    if (!renaming && refocus.current) {
      refocus.current = false
      trigger.current?.focus()
    }
  }, [renaming])

  if (activeName === undefined) return null

  if (renaming) {
    return (
      <RenameField
        initial={activeName}
        onDone={(name) => {
          if (name !== null) useDocuments.getState().rename(activeId, name)
          refocus.current = true
          setRenaming(false)
        }}
      />
    )
  }

  const { duplicate } = useDocuments.getState()

  return (
    <Menu>
      <MenuTrigger
        ref={trigger}
        className="flex h-8 max-w-[38vw] min-w-0 items-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-ink hover:bg-fill data-[state=open]:bg-fill"
        onDoubleClick={() => setRenaming(true)}
      >
        <span className="truncate">{activeName}</span>
        {/* A dot after the name: the file on disk is behind the text in the editor. */}
        {unsaved && (
          <span className="shrink-0 text-ink-2">
            <span aria-hidden>•</span>
            <span className="sr-only">, unsaved changes</span>
          </span>
        )}
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <MenuLabel>Diagrams</MenuLabel>
        <DocumentList />
        <MenuSeparator />
        <MenuItem icon={<Plus />} onSelect={newDiagram}>
          New diagram
        </MenuItem>
        <MenuItem icon={<FolderOpen />} shortcut="mod+O" onSelect={() => void openFile()}>
          Open DBML file
        </MenuItem>
        <MenuItem icon={<FileInput />} onSelect={() => useUi.getState().openDialog('import-sql')}>
          Import from SQL
        </MenuItem>
        <MenuSeparator />
        {file && (
          <MenuLabel className="truncate">
            {unsaved ? 'Unsaved changes in' : 'Saved in'} {file.name}
          </MenuLabel>
        )}
        <MenuItem icon={<Save />} shortcut="mod+S" onSelect={() => void saveFile()}>
          {file ? 'Save' : supportsFileHandles() ? 'Save to file' : 'Download as file'}
        </MenuItem>
        {file && supportsFileHandles() && (
          <MenuItem shortcut="shift+mod+S" onSelect={() => void saveFile({ as: true })}>
            Save as
          </MenuItem>
        )}
        {file && (
          <MenuItem icon={<Unlink />} onSelect={unlinkFile}>
            Detach from file
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
          Rename
        </MenuItem>
        <MenuItem icon={<Copy />} onSelect={() => duplicate(activeId)}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<Trash2 />} danger onSelect={() => deleteWithUndo(activeId)}>
          Delete
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Examples</MenuLabel>
        {SAMPLES.map((sample) => (
          <MenuItem key={sample.id} icon={<FileText />} onSelect={() => openSample(sample)}>
            {sample.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

/** Rendered inside the open menu only, so edits to a diagram do not re-render the header. */
function DocumentList() {
  const documents = useDocuments((s) => s.documents)
  const activeId = useDocuments((s) => s.activeId)
  const { open } = useDocuments.getState()

  return (
    <MenuRadioGroup value={activeId} onValueChange={open}>
      {sortedDocuments(documents).map((doc) => (
        // The time tells apart diagrams that share a name.
        <MenuRadioItem key={doc.id} value={doc.id} hint={timeAgo(doc.updatedAt)}>
          {doc.name}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  )
}

function RenameField({
  initial,
  onDone,
}: {
  initial: string
  onDone: (name: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const finish = (name: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(name)
  }

  return (
    <input
      ref={input}
      aria-label="Diagram name"
      defaultValue={initial}
      maxLength={80}
      className="h-8 w-56 max-w-[38vw] rounded-control bg-surface px-2 text-[13px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--accent)]"
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(event.currentTarget.value)
        if (event.key === 'Escape') finish(null)
      }}
    />
  )
}
