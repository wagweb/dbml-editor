# Decisions

Binding log. Entries are never rewritten; a reversal is a new entry that marks the old one
with `(revised by #N)`.

1. **2026-11-09: Stack.** React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, Radix UI
   primitives with own tokens, pnpm. These are the byteNative defaults.
2. **2026-11-09: No backend.** Diagrams live in `localStorage`. Sharing packs the diagram
   into the URL fragment (lz-string), so nothing is uploaded anywhere.
3. **2026-11-09: Official DBML parser.** `@dbml/parse` runs on every edit and stays in the
   main bundle. `@dbml/core` is only needed for SQL import and export and loads on demand,
   because its SQL grammars weigh several megabytes.
4. **2026-11-09: CodeMirror 6 instead of Monaco.** Smaller, themable through CSS variables,
   better on touch and with assistive technology. Completion still comes from the official
   DBML language service, reached through a two-method stand-in for Monaco's text model.
5. **2026-11-09: Own canvas instead of React Flow.** Tables are HTML, relations one SVG.
   Column-level anchors, own routing, semantic zoom and the export all need full control
   over geometry.
6. **2026-11-09: ELK `layered` as layout engine, left to right.** Runs in a web worker.
   Orientation, group ordering and wrapping are decided by our own code before ELK runs.
   Details in `layout-engine.md`.
7. **2026-11-09: Table groups are ELK compound nodes.** Groups stay contiguous regions.
   Relations between groups follow one direction per pair of groups.
8. **2026-11-09: Wrapping by bracket relations.** Weakly related groups may stack; their
   relation is drawn with both ends on the right side. Used only if the diagram can then be
   shown at least 10% larger. Both variants are laid out and measured.
9. **2026-11-09: Auto and manual layout mode.** Dragging switches to manual, "Tidy up"
   switches back. Engine routes are reused only while their end points are unchanged;
   otherwise a simple elbow router draws the line.
10. **2026-11-09: Scroll pans, Ctrl/Cmd + scroll zooms.** Same as Figma and Excalidraw.
11. **2026-11-09: Detail levels and semantic zoom.** Three levels (all columns, keys,
    names). Below 50% zoom tables show their name large instead of rows.
12. **2026-11-09: Focus mode greys instead of fading.** Opacity on text failed WCAG
    contrast, so tables outside the focus switch to `--ink-3` and lose their tint.
13. **2026-11-09: Visual direction.** Vercel/Geist base with a drafting sheet theme and
    ultramarine as the only accent. Working title "Keyline".
14. **2026-11-09: oxlint and Prettier.** The current Vite template ships oxlint. The
    company guideline names ESLint; see open question 2.
15. **2026-11-09: Tests.** Vitest for logic with coverage thresholds, Playwright with axe
    for flows. The layout preview is a dev tool, not a test.
16. **2026-11-09: ECC harness as workflow.** The work followed the ECC cycle (plan, tests,
    implementation, review by its `code-reviewer`, `react-reviewer` and `a11y-architect`
    definitions, verify). The plugin itself is not installed in this repo.
17. **2026-11-09: Review round.** Findings of the three ECC reviews were fixed in the same
    change. The rules that follow from them:
    - A document that does not parse keeps its saved layout untouched.
    - Positions of tables that disappear are remembered until the next tidy up.
    - Every layout command works on the newest valid model (`pendingModel`), never on the
      one that happens to be on screen.
    - Table names are untrusted keys: read records with `getOwn`, build them with
      `Object.fromEntries`.
    - Tabs merge each other's documents on the `storage` event, newest `updatedAt` wins.
18. **2026-11-09: Nothing is pointer-only.** A focused table moves with Shift + arrow keys
    and with the buttons in the details panel. Single-key shortcuts only act while focus is
    on the diagram. Messages with an undo stay 12 s, pause on hover and focus, and answer
    to Cmd/Ctrl + Z.
19. **2026-11-09: State is never shown by colour alone.** The selected segment is filled
    with ink, the active menu entry has an accent bar, "auto layout on" has a dot, errors
    and warnings differ by icon and underline shape. Relation lines reach 3:1.
20. **2026-11-09: Second UI round.** The accent bar on the active menu entry (decision 19)
    is replaced: one-sided coloured borders on rounded elements are out, see the rules in
    `design-language.md`. The theme setting is a three-way choice (system, light, dark),
    view options are real radio and checkbox menu items, and diagrams in the list show
    when they were last edited so equal names can be told apart.
