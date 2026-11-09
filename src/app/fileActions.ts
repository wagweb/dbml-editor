import { fileSlug, downloadText } from '@/export/download'
import { editorText, replaceEditorText, undoEditor } from '@/editor/bridge'
import {
  canReadQuietly,
  ensureWritable,
  loadHandles,
  pickFile,
  pickSaveTarget,
  readFile,
  storeHandle,
  supportsFileHandles,
  textHash,
  writeFile,
} from '@/lib/files'
import { useDocuments, type DiagramDocument } from '@/store/documents'
import { useUi } from '@/store/ui'

/** File handles cannot be put in localStorage; they live here and in IndexedDB. */
const handles = new Map<string, FileSystemFileHandle>()
/** Modification time last seen per document, so focus checks only read changed files. */
const lastSeen = new Map<string, number>()
let restored: Promise<void> | null = null

function restoreHandles(): Promise<void> {
  restored ??= loadHandles()
    .then((stored) => {
      for (const [id, handle] of stored) if (!handles.has(id)) handles.set(id, handle)
    })
    .catch(() => undefined)
  return restored
}

function activeDocument(): DiagramDocument | undefined {
  const { documents, activeId } = useDocuments.getState()
  return documents[activeId]
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function link(id: string, name: string, text: string, handle: FileSystemFileHandle | null): void {
  useDocuments.getState().setFile(id, { name, savedHash: textHash(text) })
  if (handle) {
    handles.set(id, handle)
    void storeHandle(id, handle)
  }
}

function toast(text: string, tone: 'neutral' | 'error' = 'neutral'): void {
  useUi.getState().showToast({ text, tone })
}

/** Unsaved means the text differs from what was last read from or written to the file. */
export function hasUnsavedChanges(doc: DiagramDocument): boolean {
  return doc.file !== undefined && textHash(doc.source) !== doc.file.savedHash
}

export async function openFile(): Promise<void> {
  let picked
  try {
    picked = await pickFile()
  } catch (error) {
    console.error(error)
    toast('The file could not be read', 'error')
    return
  }
  if (!picked) return
  const documents = useDocuments.getState()

  // The same file opened twice should land in the same diagram, with its layout.
  if (picked.handle) {
    await restoreHandles()
    for (const [id, handle] of handles) {
      if (!documents.documents[id]) continue
      if (await handle.isSameEntry(picked.handle)) {
        documents.replaceSource(id, picked.text)
        link(id, picked.name, picked.text, picked.handle)
        lastSeen.set(id, picked.lastModified)
        documents.open(id)
        return
      }
    }
  }

  const id = documents.create({ name: baseName(picked.name), source: picked.text })
  link(id, picked.name, picked.text, picked.handle)
  lastSeen.set(id, picked.lastModified)
}

/**
 * Writes the open diagram to its file, asking for one the first time. Without the File
 * System Access API the text is downloaded instead and the download counts as the file.
 */
export async function saveFile(options: { as?: boolean } = {}): Promise<void> {
  const doc = activeDocument()
  if (!doc) return
  const text = editorText() ?? doc.source
  await restoreHandles()
  let handle = options.as ? undefined : handles.get(doc.id)

  if (!handle) {
    const suggested = doc.file?.name ?? `${fileSlug(doc.name)}.dbml`
    if (!supportsFileHandles()) {
      downloadText(suggested, text)
      link(doc.id, suggested, text, null)
      return
    }
    try {
      handle = (await pickSaveTarget(suggested)) ?? undefined
    } catch (error) {
      console.error(error)
      toast('The file could not be saved', 'error')
      return
    }
    if (!handle) return
  }

  try {
    if (!(await ensureWritable(handle))) {
      toast('Saving needs permission to write the file', 'error')
      return
    }
    await writeFile(handle, text)
  } catch (error) {
    console.error(error)
    toast(`${handle.name} could not be written`, 'error')
    return
  }
  link(doc.id, handle.name, text, handle)
  lastSeen.set(doc.id, Date.now())
  toast(`Saved ${handle.name}`)
}

/** Drops the link to the file; the diagram stays in the browser. */
export function unlinkFile(): void {
  const doc = activeDocument()
  if (!doc?.file) return
  useDocuments.getState().setFile(doc.id, null)
  handles.delete(doc.id)
  lastSeen.delete(doc.id)
  void storeHandle(doc.id, null)
}

/**
 * Called when the window regains focus: a pull or a checkout may have changed the file.
 * A diagram without edits of its own follows the file; otherwise the user decides.
 */
export async function checkFileOnDisk(): Promise<void> {
  const doc = activeDocument()
  if (!doc?.file) return
  await restoreHandles()
  const handle = handles.get(doc.id)
  if (!handle || !(await canReadQuietly(handle))) return

  let file
  try {
    file = await handle.getFile()
  } catch {
    return
  }
  if (lastSeen.get(doc.id) === file.lastModified) return
  lastSeen.set(doc.id, file.lastModified)

  const { text } = await readFile(handle)
  const onDisk = textHash(text)
  if (onDisk === doc.file.savedHash) return

  const reload = () => {
    if (!replaceEditorText(text)) useDocuments.getState().replaceSource(doc.id, text)
    useDocuments.getState().setFile(doc.id, { name: handle.name, savedHash: onDisk })
  }
  if (hasUnsavedChanges(doc)) {
    useUi.getState().showToast({
      text: `${handle.name} changed on disk. Your unsaved edits differ from it.`,
      action: { label: 'Load file', run: reload },
    })
    return
  }
  reload()
  useUi.getState().showToast({
    text: `Reloaded ${handle.name} from disk`,
    action: { label: 'Undo', run: undoEditor },
  })
}
