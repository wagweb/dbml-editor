import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { trackInputModality } from './lib/inputModality.ts'
import { decodeShare } from './share/encode.ts'
import { useDocuments } from './store/documents.ts'

/** A share link carries a whole diagram in its fragment; open it as a new document. */
function importSharedDiagram(): void {
  const shared = decodeShare(window.location.hash)
  if (!shared) return
  const { documents, create, open } = useDocuments.getState()
  const existing = Object.values(documents).find(
    (doc) => doc.name === shared.name && doc.source === shared.source,
  )
  if (existing) open(existing.id)
  else create(shared)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

importSharedDiagram()
trackInputModality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
