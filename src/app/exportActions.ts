import { copyText, downloadBlob, downloadText, fileSlug } from '@/export/download'
import { diagramPng, diagramSvg } from '@/export/image'
import { toMarkdown } from '@/export/markdown'
import { toMermaid } from '@/export/mermaid'
import { shareUrl } from '@/share/encode'
import { useDiagram } from '@/store/diagram'
import { shownDiagram } from '@/store/documents'
import { useUi } from '@/store/ui'

function hasDiagram(): boolean {
  if (useDiagram.getState().model.tables.length > 0) return true
  useUi.getState().showToast({ text: 'There is no diagram to export yet' })
  return false
}

function reportFailure(error: unknown): void {
  console.error(error)
  useUi.getState().showToast({ text: 'The export failed. Please try again.', tone: 'error' })
}

/** Downloads the diagram as PNG or SVG with the choices last made in the export dialog. */
export async function exportImage(format: 'png' | 'svg'): Promise<void> {
  const doc = shownDiagram()
  if (!doc || !hasDiagram()) return
  const options = useUi.getState().imageExport
  try {
    if (format === 'png') {
      downloadBlob(`${fileSlug(doc.name)}.png`, await diagramPng(options))
    } else {
      const { svg } = await diagramSvg(options)
      downloadText(`${fileSlug(doc.name)}.svg`, svg, 'image/svg+xml')
    }
  } catch (error) {
    reportFailure(error)
  }
}

export const exportPng = () => exportImage('png')
export const exportSvg = () => exportImage('svg')

export function exportDbml(): void {
  const doc = shownDiagram()
  if (doc) downloadText(`${fileSlug(doc.name)}.dbml`, doc.source)
}

/** A data dictionary with the diagram as Mermaid, for a README or a wiki. */
export function exportMarkdown(): void {
  const doc = shownDiagram()
  if (!doc || !hasDiagram()) return
  const markdown = toMarkdown(useDiagram.getState().fullModel, doc.name)
  downloadText(`${fileSlug(doc.name)}.md`, markdown, 'text/markdown')
}

/** Copied with its fence, because Markdown files on GitHub and in wikis are where it goes. */
export async function copyMermaid(): Promise<void> {
  if (!hasDiagram()) return
  const mermaid = toMermaid(useDiagram.getState().fullModel)
  const copied = await copyText(`\`\`\`mermaid\n${mermaid}\`\`\`\n`)
  useUi
    .getState()
    .showToast(
      copied
        ? { text: 'Mermaid diagram copied. Paste it into Markdown, for example on GitHub.' }
        : { text: 'The diagram could not be copied', tone: 'error' },
    )
}

/**
 * The link carries the whole diagram. A view-only link opens without the code and is not
 * saved in the recipient's browser, which suits docs and tickets.
 */
export async function copyShareLink(options: { viewOnly?: boolean } = {}): Promise<boolean> {
  const doc = shownDiagram()
  if (!doc) return false
  const copied = await copyText(
    shareUrl(
      { name: doc.name, source: doc.source, viewOnly: options.viewOnly },
      window.location.href,
    ),
  )
  const done = options.viewOnly
    ? 'View-only link copied. It opens without the code.'
    : 'Link copied. The diagram travels inside the link.'
  useUi
    .getState()
    .showToast(copied ? { text: done } : { text: 'The link could not be copied', tone: 'error' })
  return copied
}
