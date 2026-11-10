# Architecture

Single page app: React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, Radix UI primitives,
CodeMirror 6. No backend.

## Modules

| Path                        | Responsibility                                                                                                                                                                                                                                                                                                                                                        | Depends on                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `src/dbml/`                 | Parse DBML into the app model (`model.ts`, `parse.ts`), derive what is shown (`derive.ts`), graph questions (`graph.ts`), community detection (`communities.ts`), schema hints (`hints.ts`) and their fixes (`fixes.ts`), text edits (`edit.ts`), formatting and indentation detection (`format.ts`), join queries (`joinQuery.ts`), the starter, lazy SQL conversion | `@dbml/parse`, `@dbml/core` (lazy) |
| `src/layout/`               | Pure geometry and layout: card metrics, orientation, ELK graph, routes, avoiding router (`avoid.ts`)                                                                                                                                                                                                                                                                  | `dbml/model`                       |
| `src/store/`                | Zustand stores: `documents` (persisted), `diagram` (runtime pipeline), `viewport` (camera), `ui`                                                                                                                                                                                                                                                                      | `dbml`, `layout`                   |
| `src/editor/`               | CodeMirror setup, DBML highlighting, completion and block templates, folding, indent guides and wrapping (`blocks.ts`), `bridge.ts`                                                                                                                                                                                                                                   | `store`, `dbml`                    |
| `src/canvas/`               | Diagram rendering and pointer or keyboard input, inline renaming, relation dragging (`linkDrag.ts`)                                                                                                                                                                                                                                                                   | `store`, `layout`                  |
| `src/app/`                  | Header, menus, palette, dialogs, app-level actions, edits from the diagram (`editActions.ts`), code actions (`codeActions.ts`), files (`fileActions.ts`), presentation (`present.ts`), one-time tips (`tips.ts`), the trail of chosen tables (`navigation.ts`), arranging a selection (`arrange.ts`), note coverage (`coverage.ts`)                                   | everything above                   |
| `src/ui/`                   | Small styled wrappers around Radix primitives, `InlineEdit`                                                                                                                                                                                                                                                                                                           | none                               |
| `src/lib/`                  | Platform helpers, storage adapter, File System Access wrapper (`files.ts`)                                                                                                                                                                                                                                                                                            | none                               |
| `src/export/`, `src/share/` | SVG and PNG export, Markdown and Mermaid export, share link encoding (with a view-only flag)                                                                                                                                                                                                                                                                          | `layout`, `store`                  |

`src/layout/` and `src/dbml/` hold no React and no DOM access (except `measure.ts` and
`engine.ts`), which is why they are unit tested in Node.

## From source text to pixels

1. The editor reports every change to `documents.setSource` (persisted, debounced) and to
   `diagram.sourceChanged`.
2. After 140 ms without typing, `parseDbml` runs. With errors, only `diagnostics` and
   `stale` change and the last valid model stays on screen.
3. The parsed schema is the `fullModel`. What the canvas draws is derived from it by
   `shownModel` (`derive.ts`): restricted to the open DiagramView, with enums as cards
   linked to the columns that use them, with sticky notes as cards, and with suggested
   groups when the schema declares none. Enum and note cards are `TableModel`s with a
   `kind`; the link from a column to its enum is a `RefModel` of kind `enum`. Code that
   counts or edits real tables filters with `isTable`.
4. The shown model gets table boxes (`computeTableBox`, text measured on a canvas) and a
   structure signature. An unchanged signature means only labels changed: no layout run.
5. Auto mode: `runLayout` (ELK in a web worker) returns positions and routes, tables glide
   to their new place. Manual mode: existing positions stay, new tables are placed next to
   a related table by `placeNewTables`, and `refreshRoutes` reroutes every line that no
   longer fits or that a table was dropped onto.
6. Layout results are written back to the document, so a reload does not need a new run.
   Each DiagramView has its own arrangement (`layout.views[name]`); the whole diagram uses
   `layout` itself. The open view is stored as `layout.view`.

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
- `diagram`: `fullModel`, shown `model`, boxes, positions, routes, open `view`,
  selection, path target, hover, emphasis (highlighted relations, focus set, path), schema
  `hints`, search spotlight. Not persisted itself; it writes the layout into the active
  document. It subscribes to the `ui` view options (enum cards, suggested groups, focus
  depth) and re-derives the shown model when they change.
- `viewport`: camera and canvas size. Applied to the DOM imperatively in `Canvas.tsx`, so
  panning does not re-render React.
- `ui`: theme, panel sizes, view options (enum cards, suggested groups, hints, focus
  depth), default indentation and line wrapping, open dialog, palette mode, toast.
  Preferences persisted under `keyline:ui`. Not persisted: `viewer` (a diagram from a
  view-only link) and `presenting` with its current stop.
- Documents carry their own `indent`, detected from the text they were created from or
  chosen in the view menu. `shownDiagram()` returns the open document or the view-only
  diagram, whichever is on screen; exports read it.
- Tips that were shown are remembered under `keyline:tips`, outside the stores.

High-frequency updates (drag, hover, pan) reach components through narrow selectors.
`TableNode` subscribes to its own position and to precomputed emphasis strings only.

## Editor and canvas talk through `bridge.ts`

The canvas calls `revealInEditor(range)` and menus call `replaceEditorText`. The editor
reports the cursor position; `setCursorOffset` marks the table, the column and every
relation of that column (or the relation defined there). When the cursor jumps without a
text change, the camera brings the table into view after 250 ms if it is off screen.

Hint fixes (`fixes.ts`) are described cheaply for every hint (`describeFix`) and computed
only when clicked (`fixEdits`), on the text as it is then; both the code tooltip and the
status bar list use `editActions.applyHintFix`. Formatting goes through
`codeActions.formatCode`, which applies the formatter's line edits as one transaction.

## Selection

`diagram.selectedTableId` is the one table with details and focus. `multiSelection` holds
two or more tables chosen together; setting one clears the other (`selectTable`,
`setMultiSelection`, `toggleInSelection`). The selection rectangle lives in
`canvas/marquee.ts` in screen pixels and is drawn and resolved by `useCanvasGestures`.
Dragging or nudging a table of the selection moves all of it. `app/navigation.ts` keeps
the trail of selected tables by subscribing to the store.

## View-only links and presentation

A share link with `v=1` sets `ui.viewer` instead of creating a document. `App.tsx` then
opens a transient document (`id: 'view-only'`) through `openDocument`; layout saves are
no-ops because no document is active, and `editActions` refuses edits (`isReadOnly`).
"Open in editor" creates the document like an ordinary share link. Presenting hides the
header and the code, `present.ts` computes the stops (groups, else hub tables) and frames
them; full screen is requested and leaving it ends the presentation.

## Edits made in the diagram

Renaming a table or column and adding a relation never touch the model directly. They go
through `src/app/editActions.ts`: the current editor text is parsed afresh (the model on
screen may lag a few hundred milliseconds), `src/dbml/edit.ts` computes text edits, each
result is parsed once more and refused if it would not be valid, and the edits are applied
through `bridge.applyEditorEdits` as one CodeMirror transaction. So every diagram edit sits
in the editor's undo history, and the toast's Undo is `undoEditor`. Table renames use the
parser's own `renameTable`, which also updates relations, groups and views; column renames
are text edits over the declaration, the relations, the table's indexes and `Records`.
A rename made from the diagram announces itself with `expectRename`, so the selection
follows the table to its new id after the next parse.

## Start screen

`documents.activeId` is null until the first diagram exists and again after the last one
is deleted; `activeDocument()` is the one way to read the open diagram. `App.tsx` then
renders `StartScreen` instead of the editor and the canvas, and `closeDocument()` empties
the diagram store. Pasted text and dropped files go through `src/app/openText.ts`
(`detectKind`, `guessDialect`, `openText`) and `fileActions.openDropped`. A share link opens
on load and on `hashchange`, so pasting a link into an open tab works too.

## Files

`src/lib/files.ts` wraps the File System Access API (`showOpenFilePicker`,
`showSaveFilePicker`, handles in IndexedDB) and falls back to a file input and downloads
where the API is missing. A document linked to a file carries `file: { name, savedHash }`;
the dot after the diagram name means the text differs from the file. When the window
regains focus, the file is re-read if its modification time changed: a diagram without
edits of its own follows the file, otherwise a message offers to load it. Layouts are not
part of the file; they stay in the browser.

## Testing

- Vitest covers `dbml`, `layout`, `share` and the SVG export. Thresholds: 80% statements,
  lines and functions, 70% branches.
- Playwright (`e2e/app.spec.ts`, `e2e/features.spec.ts`) covers the user flows on a
  desktop and a mobile project and runs axe in both themes. The file flow runs against a
  stubbed File System Access API.
- `src/layout/preview.test.ts` is a dev tool: with `PREVIEW_DIR` set it renders the test
  schemas to SVG so layout changes can be judged by eye.
- The app ships no examples. Unit tests and the end-to-end suite share the schemas in
  `src/test/schemas.ts`; the end-to-end tests open them through a share link
  (`e2e/fixtures.ts`).

## Bundle

`@dbml/core` (SQL import and export, about 15 MB unminified grammar code) and the ELK
worker (1.6 MB) are separate chunks that load on first use. The main bundle is about
380 kB gzipped.
