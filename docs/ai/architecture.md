# Architecture

Single page app: React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, Radix UI primitives,
CodeMirror 6. No backend.

## Modules

| Path                        | Responsibility                                                                                   | Depends on                         |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `src/dbml/`                 | Parse DBML into the app model (`model.ts`, `parse.ts`), samples, lazy SQL conversion             | `@dbml/parse`, `@dbml/core` (lazy) |
| `src/layout/`               | Pure geometry and layout: card metrics, orientation, ELK graph, routes, fallback router          | `dbml/model`                       |
| `src/store/`                | Zustand stores: `documents` (persisted), `diagram` (runtime pipeline), `viewport` (camera), `ui` | `dbml`, `layout`                   |
| `src/editor/`               | CodeMirror setup, DBML highlighting, completion adapter, `bridge.ts`                             | `store`, `dbml`                    |
| `src/canvas/`               | Diagram rendering and pointer or keyboard input                                                  | `store`, `layout`                  |
| `src/app/`                  | Header, menus, palette, dialogs, app-level actions                                               | everything above                   |
| `src/ui/`                   | Small styled wrappers around Radix primitives                                                    | none                               |
| `src/export/`, `src/share/` | SVG and PNG export, share link encoding                                                          | `layout`, `store`                  |

`src/layout/` and `src/dbml/` hold no React and no DOM access (except `measure.ts` and
`engine.ts`), which is why they are unit tested in Node.

## From source text to pixels

1. The editor reports every change to `documents.setSource` (persisted, debounced) and to
   `diagram.sourceChanged`.
2. After 140 ms without typing, `parseDbml` runs. With errors, only `diagnostics` and
   `stale` change and the last valid model stays on screen.
3. A valid model gets table boxes (`computeTableBox`, text measured on a canvas) and a
   structure signature. An unchanged signature means only labels changed: no layout run.
4. Auto mode: `runLayout` (ELK in a web worker) returns positions and routes, tables glide
   to their new place. Manual mode: existing positions stay, new tables are placed next to
   a related table by `placeNewTables`.
5. Layout results are written back to the document, so a reload does not need a new run.

Every request that replaces the layout bumps a `generation` counter. Async results that
come back for an older generation are dropped. Two more guards keep concurrent work
honest: `sourceVersion` counts parses, so a layout that finishes after a newer (broken)
parse does not overwrite its diagnostics, and `pendingModel` holds the newest valid model
that still waits for its layout, so "Tidy up" or a detail change continues with it instead
of the older model on screen.

## State

- `documents`: all diagrams and the active id. Persisted to `localStorage` under
  `keyline:documents` through an adapter that debounces serialising and writing
  (`src/lib/storage.ts`). Other tabs are merged in on the `storage` event.
- `diagram`: model, boxes, positions, routes, selection, hover, emphasis. Not persisted
  itself; it writes the layout into the active document.
- `viewport`: camera and canvas size. Applied to the DOM imperatively in `Canvas.tsx`, so
  panning does not re-render React.
- `ui`: theme, panel sizes, open dialog, toast. Preferences persisted under `keyline:ui`.

High-frequency updates (drag, hover, pan) reach components through narrow selectors.
`TableNode` subscribes to its own position and to precomputed emphasis strings only.

## Editor and canvas talk through `bridge.ts`

The canvas calls `revealInEditor(range)` and menus call `replaceEditorText`. The editor
reports the cursor position, which marks the table under the cursor on the canvas.

## Testing

- Vitest covers `dbml`, `layout`, `share` and the SVG export. Thresholds: 80% statements,
  lines and functions, 70% branches.
- Playwright (`e2e/app.spec.ts`) covers the user flows on a desktop and a mobile project
  and runs axe in both themes.
- `src/layout/preview.test.ts` is a dev tool: with `PREVIEW_DIR` set it renders the samples
  to SVG so layout changes can be judged by eye.

## Bundle

`@dbml/core` (SQL import and export, about 15 MB unminified grammar code) and the ELK
worker (1.6 MB) are separate chunks that load on first use. The main bundle is about
380 kB gzipped.
