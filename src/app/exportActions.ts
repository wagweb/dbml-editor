import { copyText, downloadBlob, downloadText, fileSlug } from '@/export/download'
import { diagramPng, diagramSvg } from '@/export/image'
import { shareUrl } from '@/share/encode'
import { useDiagram } from '@/store/diagram'
import { useDocuments, type DiagramDocument } from '@/store/documents'
import { useUi } from '@/store/ui'

function activeDocument(): DiagramDocument | undefined {
  const { documents, activeId } = useDocuments.getState()
  return documents[activeId]
}

function hasDiagram(): boolean {
  if (useDiagram.getState().model.tables.length > 0) return true
  useUi.getState().showToast({ text: 'There is no diagram to export yet' })
  return false
}

function reportFailure(error: unknown): void {
  console.error(error)
  useUi.getState().showToast({ text: 'The export failed. Please try again.', tone: 'error' })
}

export async function exportPng(): Promise<void> {
  const doc = activeDocument()
  if (!doc || !hasDiagram()) return
  try {
    downloadBlob(`${fileSlug(doc.name)}.png`, await diagramPng())
  } catch (error) {
    reportFailure(error)
  }
}

export async function exportSvg(): Promise<void> {
  const doc = activeDocument()
  if (!doc || !hasDiagram()) return
  try {
    const { svg } = await diagramSvg()
    downloadText(`${fileSlug(doc.name)}.svg`, svg, 'image/svg+xml')
  } catch (error) {
    reportFailure(error)
  }
}

export function exportDbml(): void {
  const doc = activeDocument()
  if (doc) downloadText(`${fileSlug(doc.name)}.dbml`, doc.source)
}

export async function copyShareLink(): Promise<void> {
  const doc = activeDocument()
  if (!doc) return
  const copied = await copyText(
    shareUrl({ name: doc.name, source: doc.source }, window.location.href),
  )
  useUi
    .getState()
    .showToast(
      copied
        ? { text: 'Link copied. The diagram travels inside the link.' }
        : { text: 'The link could not be copied', tone: 'error' },
    )
}
