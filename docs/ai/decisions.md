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
11. **2026-11-09: Detail levels and semantic zoom.** (revised by #21) Three levels (all columns, keys,
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
21. **2026-11-09: Semantic zoom has three levels.** Near (50% and up): rows. Far (24% to
    50%): the table name, sized to read as about 11.5 px on screen but never larger than
    fits the card, with a break after an underscore for long names. Overview (below 24%):
    grouped tables are plain blocks and the group name is set large across its region;
    tables without a group keep their fitted name. Before this, names kept growing while
    zooming out and spilled over neighbouring tables.
22. **2026-11-09: App icon on a tile.** (revised by #23) The mark sits on a rounded ultramarine square and
    is reduced to one colour: two solid tables and their relation in white. The earlier
    version (solid and outlined table, accent line, no background) is gone.
23. **2026-11-09: App icon, final form.** Chosen by Niklas from eight drafts: two
    overlapping table frames with a solid overlap, on a tile that is black in the light
    theme and white in the dark one. No brand colour in the icon.
24. **2026-11-09: One parsed model, one shown model.** The parser's result stays untouched
    as `fullModel`; `shownModel` derives what the canvas draws (view, enum cards, note
    cards, suggested groups). Enum and note cards reuse `TableModel` with a `kind`, so
    layout, canvas, minimap and export need no second code path. Counting and editing
    filter with `isTable`.
25. **2026-11-09: Paths and focus depth.** Shift-click on a second table asks for the
    shortest chain of relations (BFS over real relations, enum links excluded). Both ends
    get the selection ring, the chain stays sharp. Focus shows direct neighbours or two
    steps; enum cards come along but never lead further. Escape clears the path before it
    closes the details.
26. **2026-11-09: Views keep their own arrangement.** Each `DiagramView` has its own
    positions, routes and auto or manual state under `layout.views[name]`; the open view
    is remembered per document. A view brings only the enums its tables use, and no
    sticky notes.
27. **2026-11-09: Suggested groups are proposals.** Louvain over the relation graph, only
    for schemas with at least eight tables and no `TableGroup`, named after the best
    connected table. Drawn dashed with a tag; a chip offers to write them into the code
    or to stop suggesting. Nothing changes in the code until asked.
28. **2026-11-09: Lines go around tables in manual mode.** An A* router on a sparse grid
    (`avoid.ts`) replaces the plain elbow as the fallback and reroutes stored routes that a
    table was dropped onto. Engine routes of untouched relations survive. Measured against
    40 random arrangements in the unit tests.
29. **2026-11-09: Edits from the diagram go through the editor.** Rename and new relation
    compute text edits, are validated by a second parse, and are applied as one CodeMirror
    transaction. Undo is the editor's undo. Table renames use the parser's `renameTable`;
    column renames are our own text edits and refuse columns from partials, clashes and
    unusable names.
30. **2026-11-09: Relation by dragging, with two alternatives.** A handle on the row edge
    (hover only, not in the tab order) starts a drag; a click on it, or a button in the
    details panel, opens a column picker (WCAG 2.5.7). From a key to a plain column the
    direction is turned round, so the plain column references the key.
31. **2026-11-09: Files through the File System Access API.** Open and save `.dbml` with
    handles kept in IndexedDB; a file input and downloads where the API is missing. The
    document remembers the file's hash: a dot after the name marks unsaved changes, and a
    changed file on disk is reloaded when the diagram has no edits of its own, otherwise
    offered. Layouts stay in the browser.
32. **2026-11-09: Schema hints are advice.** Missing primary key, foreign key without a
    covering index, type mismatch across a relation, names that break the prevailing
    style. Shown as info diagnostics (dotted underline, "Hint") only while the code has no
    errors or warnings, listed from the status bar, switchable off. They never block
    anything.
33. **2026-11-09: Pointer capture only once a drag starts.** Capturing on pointerdown made
    Chromium retarget clicks and double-clicks to the card, so inline renaming never saw
    them. The capture now starts after the first few pixels of movement.
34. **2026-11-09: A click does not move the camera while most of the table is on screen.**
    Keyboard and search still bring the table fully into view; a pointer click only pans
    when less than half of the table is visible, so a double-click lands where it started.
35. **2026-11-09: Hosted on AWS Amplify.** The static build (`dist/`) is deployed by AWS
    Amplify from the GitHub repository `wagweb/dbml-editor`, branch `main`. `amplify.yml`
    installs Node 22 and pnpm 12 (the build image ships neither pnpm nor a new enough
    Node), caches the pnpm store, and publishes `dist/`. `package.json` names the Node range for the same reason; the
    pnpm version is pinned in `amplify.yml` only, because a `packageManager` field makes
    pnpm 12 list its own binaries for every platform in the lockfile.
36. **2026-11-09: Third UI round, from a two-part review.** A design review (Nielsen 26/40)
    and a measured audit (contrast, focus order, target sizes, overlap, motion) ran
    separately; their findings shaped decisions 37 to 45.
37. **2026-11-09: No examples in the app; a start screen instead.** Chosen by Niklas. With no
    diagram the app shows a start screen: the product in one picture (DBML on the left,
    the cards it becomes on the right, the relation draws itself once), and three ways in
    (new diagram, open a .dbml file, import SQL) in the style of the search palette. DBML
    or SQL can also be pasted or dropped anywhere. Deleting the last diagram returns here.
    The example schemas live on as test fixtures in `src/test/schemas.ts`; tests open them
    through share links.
38. **2026-11-09: Pasted and dropped text is sorted by its keywords.** `Table`, `Ref` and the
    other DBML keywords open a diagram directly, named after its `Project`. `CREATE TABLE`
    opens the SQL import with the statements filled in and the database guessed from the
    quoting (backticks: MySQL, brackets: SQL Server, otherwise PostgreSQL). Files are
    handled the same way; a dropped .dbml file stays linked for saving where the browser
    hands out a handle.
39. **2026-11-09: Relayouts follow the arrangement on screen.** An automatic layout after an
    edit or a detail change feeds ELK the tables in their order on screen and reuses the
    earlier decision which groups to stack (`stacked`, stored per view). Measured on the
    test schemas: after adding a relation, tables move 8 to 81 px on average instead of up
    to 500 px. Tidy up still starts from scratch.
40. **2026-11-09: The camera respects reading range.** A diagram that does not fit at 50%
    opens at 50% from its top left instead of shrinking to name-only blocks. After a change
    the camera only moves when the diagram no longer fits. Selecting a table pans just
    enough to show it and its neighbours beside the details panel, and only after the
    double-click window, so renaming by double-click lands on the table.
41. **2026-11-09: The toolbar tells the truth about columns.** Below 50% zoom the detail
    switch is replaced by "Show columns", which zooms to 75%. The detail labels are short
    (All, Keys, Names) and no longer wrap; the view menu no longer repeats them.
42. **2026-11-09: Menu buttons show that their menu is open.** Every button that opens a
    menu or popover keeps its hover fill while open (`data-[state=open]`), reported by
    Niklas for the view menu.
43. **2026-11-09: Canvas editing is findable and hittable.** Relation handles keep their
    screen size at every zoom (24 px target, 10 px dot) and show as small grey points on
    every row of the selected table. While a relation is drawn, the other lines stop
    pulsing and the preview sits above the cards, naming its target next to the pointer.
44. **2026-11-09: Lists are ranked.** Search matches every word as a substring, names first,
    so "cust" no longer finds "products"; without a query it lists the six best connected
    tables. The relation picker lists keys first, same type first, and leaves out the
    source table. Hints are grouped by kind; foreign keys without an index get an
    "Add index" fix, one at a time or all at once.
45. **2026-11-09: Keyboard paths are visible.** A "Skip to diagram" link is the first stop.
    While the editor has keyboard focus the status bar says how to leave it. Shortcut
    keycaps in tooltips reach 4.5:1, and "+" renders as a key.
46. **2026-11-09: A click never zooms.** Reported by Niklas as the workspace flickering on
    click. Cause: below 50% zoom a click zoomed in to 50%; during the move every label was
    resized frame by frame, and at the end the whole canvas switched from names to rows at
    once. Now only jumps from search and from schema hints may zoom; clicks on cards and on
    relations in the details panel pan at most. Crossing a level of detail is a 160 ms
    crossfade, and the greying of a selection fades in, so no change of the picture is a
    hard cut.
47. **2026-11-09: Switching tables changes the picture once.** Reported by Niklas as
    flicker at 70% zoom. Measured with GPU rendering, render counters and frame analysis:
    hovering the next table lit its relations into the greyed-out picture before the click
    switched everything, rows re-rendered because of unstable callbacks (798 renders,
    117 ms frames on 80 tables), and lit lines were moved to the end of the SVG, which
    cancelled their fades. Now hover adds nothing while a table is selected (a hovered line
    still shows), a hover that changes nothing keeps the emphasis object, row callbacks are
    stable, lines keep their order, and only the card header and outline fade. Hover
    counts after the pointer rests for 90 ms, and a click moves the camera only when the
    clicked table would be covered.
48. **2026-11-09: No opacity animations inside the canvas.** Found in a screen recording by
    Niklas: one frame about 180 ms after a click showed no page content, only Chrome's
    background (#1c2c34). Measured with the DevTools layer tree: every click started
    opacity animations (the relation pulse, the greying of lines, the handles fading in),
    Chrome gave each animated element a GPU layer and, by overlap, everything painted above
    it too. Layers jumped from 26 to 76 and their area from 12 to 27 Mpx, then fell back;
    in that churn a frame went out without content. Lines now fade with `stroke-opacity`,
    handles and levels of detail switch by `visibility`, and the lines hide during a glide
    by `visibility`. A click now keeps the layer count at 12 to 13. An end-to-end test
    checks that a selection change does not raise the count.
49. **2026-11-09: Only real pointer movement counts as mouse use.** Chrome reports a move
    when content changes under a resting pointer; that switched the keyboard ring off in
    menus. The input modality now ignores moves without a change of position.
