export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }))
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** File-system friendly version of a diagram name. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/[^\w\s-]/g, '')
    .trim()
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
  return slug || 'diagram'
}
