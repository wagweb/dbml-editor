import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export interface SharedDiagram {
  name: string
  source: string
}

const PARAM = 'd'
const MAX_NAME_LENGTH = 120

/** Packs a diagram into a URL fragment. Nothing leaves the browser; the link is the data. */
export function encodeShare(diagram: SharedDiagram): string {
  const payload = JSON.stringify({ n: diagram.name, s: diagram.source })
  return `${PARAM}=${compressToEncodedURIComponent(payload)}`
}

/** Reads a diagram from a URL fragment, or returns null if it holds none. */
export function decodeShare(hash: string): SharedDiagram | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const packed = params.get(PARAM)
  if (!packed) return null
  try {
    // URLSearchParams turns "+" into a space; the lz-string alphabet uses "+".
    const json = decompressFromEncodedURIComponent(packed.replaceAll(' ', '+'))
    if (!json) return null
    const data: unknown = JSON.parse(json)
    if (typeof data !== 'object' || data === null) return null
    const { n, s } = data as { n?: unknown; s?: unknown }
    if (typeof s !== 'string') return null
    const name =
      typeof n === 'string' && n.trim() ? n.trim().slice(0, MAX_NAME_LENGTH) : 'Shared diagram'
    return { name, source: s }
  } catch {
    return null
  }
}

export function shareUrl(diagram: SharedDiagram, base: string): string {
  return `${base.replace(/#.*$/, '')}#${encodeShare(diagram)}`
}
