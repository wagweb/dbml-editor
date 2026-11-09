import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { trackInputModality } from './lib/inputModality.ts'
import { decodeShare } from './share/encode.ts'
import { useDocuments } from './store/documents.ts'
import { useUi } from './store/ui.ts'

/** A share link carries a whole diagram in its fragment; open it as a new document. */
function importSharedDiagram(): void {
  const shared = decodeShare(window.location.hash)
  if (!shared) return
  if (shared.viewOnly) {
    // Stays in the address, so a reload shows it again. Nothing is stored.
    useUi.getState().setViewer({ name: shared.name, source: shared.source })
    return
  }
  useUi.getState().setViewer(null)
  const { documents, create, open } = useDocuments.getState()
  const existing = Object.values(documents).find(
    (doc) => doc.name === shared.name && doc.source === shared.source,
  )
  if (existing) open(existing.id)
  else create({ name: shared.name, source: shared.source })
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

importSharedDiagram()
// A share link pasted into the address bar of an open tab only changes the fragment.
window.addEventListener('hashchange', importSharedDiagram)
trackInputModality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
