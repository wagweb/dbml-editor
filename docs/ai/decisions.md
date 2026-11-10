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
50. **2026-11-09: One switch component with a sliding thumb.** Asked for by Niklas: the
    segment switches looked like a framed hole in dark mode, and the toolbar changed width
    when "Show columns" replaced the detail switch below 50% zoom. The switch now has a
    raised thumb that slides (a transform, placed from the measured box of the chosen
    option, so uneven widths and two rows on a phone work too) and options of equal width.
    The toolbar stacks the switch and "Show columns" in one cell. Two details came from
    Niklas while testing: a hover fill touched the thumb (now a 2 px gap) and an inner
    highlight doubled the thumb's top edge (removed).
51. **2026-11-09: Menus align by their visible edge.** Reported by Niklas on the view
    menu: the menu box was aligned with its button, but the 1 px ring of `--shadow-pop`
    sits outside the box and stuck out. Menus and the hints popover are offset by that
    ring, so the visible edge lines up with the button.
52. **2026-11-10: Nested corners are concentric.** Reported by Niklas on the view menu:
    a 6 px hover fill inside a 12 px menu with 4 px padding did not follow the menu's
    corner. Rows in menus are now 8 px; toasts are 12 px, the stale banner 10 px, and the
    headers of the details panel and the hints popover keep their buttons 6 px from the
    edge. The rule is in `design-language.md`.
53. **2026-11-10: A path ends in a query.** The path section offers "Copy SQL query": one
    join per relation step, the joined table named first in each condition, aliases from
    initials that avoid keywords, and other relations between the same two tables named
    in a comment. Plain ANSI quoting; a dialect setting was not worth it.
54. **2026-11-10: Documentation exports.** Markdown (a data dictionary with the diagram
    as Mermaid, grouped by TableGroup) and Mermaid alone, copied with its fence because
    it goes into Markdown on GitHub. Mermaid entity and attribute names are sanitised and
    names Mermaid reads as keywords get a leading underscore.
55. **2026-11-10: The code cursor points into the diagram.** The cursor's column row is
    tinted and all relations of that column are drawn in the accent, so `customers.id`
    shows who points at it. Only a cursor jump moves the camera, never typing.
56. **2026-11-10: Formatting and indentation.** Asked for by Niklas: a formatter with
    spaces or tabs and a width, and the indentation of pasted or opened code detected
    automatically. Each diagram keeps its own indentation; the view menu sets it for the
    open diagram and as the default for new ones, and offers to format right away. The
    formatter indents by brackets, aligns column names and types inside Table and
    TablePartial bodies (the settings column only over lines that have settings), always
    pads with spaces so alignment survives any tab width, leaves multi-line strings,
    comments and backtick expressions alone, and refuses when the result would parse to a
    different schema. Detection counts steps from unindented lines too and needs a 75%
    majority of tabs or spaces.
57. **2026-11-10: Hints come with fixes.** Add index, use `id` as key or add an `id`
    column in the type the other keys use, take over the referenced type, rename into the
    schema's naming style. Offered in the code tooltip, the lint panel and the hints list.
58. **2026-11-10: Block templates.** At the top level, Table, Enum, Ref, TableGroup and
    Note complete to templates with placeholders. Tab accepts a suggestion, as in most
    editors.
59. **2026-11-10: Tips for hidden gestures.** Shift-click, double-click and the row's dot
    are not findable by looking. One tip per visit, each once, shown after a table click.
    End-to-end tests start with all tips seen (`skipTips`).
60. **2026-11-10: Presentation mode.** P on the diagram, the view menu or the palette.
    Stops are the written groups, else the suggested ones, else the twelve best connected
    tables with their neighbours. Arrow keys step, Escape or leaving full screen ends it.
61. **2026-11-10: View-only links.** For docs and tickets: the link opens the diagram
    without code, editing is off, nothing is stored in the visitor's browser until "Open
    in editor".
62. **2026-11-10: The editor wraps.** Reported by Niklas: code scrolled sideways under the
    transparent line numbers, and the trackpad's rubber band moved them. Lines now wrap
    with a hanging indent (switchable), the gutter is opaque, sideways overscroll is off,
    and indentation guides and block folding were added.
63. **2026-11-10: The details panel is rebuilt.** Asked for by Niklas, who also found
    "Show Direct / 2 steps" hard to understand. Columns are scannable one-liners that
    open for their details and actions; long names wrap instead of truncating; nullable is
    marked instead of "not null" on nearly every row. The reach of the highlight moved to
    the Relations tab, with counts and the list of the tables it adds, so the setting
    explains itself by what it shows. Moving and the path question moved to a footer.
64. **2026-11-10: The panel header echoes the card.** Niklas found the group pill out of
    place. The header now takes the card header's group tint and puts the group name
    above the table name in the group's colour, the way the canvas labels a region. No
    chips; the alias is written as DBML writes it.
65. **2026-11-10: Image exports take in every line, and ask how big.** Reported by Niklas:
    content was cut off at the edges and the resolution was too low. The page size only
    covered cards and group regions, so routes around tables and loops of self relations
    could leave it; it now covers every line point plus the markers. PNG and SVG go
    through a dialog: resolution 1x to 4x (3x by default), colours like the app, light or
    dark, solid or transparent. The SVG is given the target pixel size before it is drawn,
    because some browsers rasterise it at its own size first and blur it when scaling up.
    Very large diagrams get the highest scale a browser canvas allows, and the dialog says
    so.
66. **2026-11-10: Several tables at once.** Shift + drag on empty canvas draws a selection
    rectangle (Shift + click stays the path question), Cmd or Ctrl + click adds or takes
    out a table, Cmd or Ctrl + A selects all. Two or more tables have no details and no
    focus; a bar at the top arranges them (align left or top edges, space out) and writes
    them into the code as a TableGroup (taking them out of other groups) or a DiagramView.
    They drag and nudge together.
67. **2026-11-10: Small helpers.** Alt + Left and Right walk back and forward through the
    tables chosen, with a back button in the details. A column the pointer rests on for
    450 ms explains itself in a tooltip beside the card. The status bar shows the share of
    tables and columns with a note and opens the code at the next one without. Hint rules
    can switch kinds off, fix the naming style, and require columns in every table.
68. **2026-11-10: Layout options, with left to right staying the default.** The view menu
    offers direction (left to right, top to bottom), spacing (compact, normal, airy:
    factors 0.7, 1, 1.4) and enum cards next to their first user (on by default). A
    change lays the diagram out afresh, like "Tidy up". Top to bottom is measured weaker
    over the samples: about 1.4 times the crossings, twice the bends and 1.7 times the
    line length, because relations attach to rows on the side edges and every line has to
    turn twice across a vertical flow. Small schemas read well; for a first-class
    top-down mode the referenced end should leave from the card's bottom edge instead.
    Enum placement weighs link length, bends, crossings and the side the user table's
    other relations take, and never covers a card, a group or a line.
69. **2026-11-10: A motion system.** Asked for by Niklas: polish and good animations.
    Overlays used to animate in and vanish in one frame; now everything leaves the way it
    came, faster than it arrived, and the canvas has a single signature motion, the
    relations drawing themselves in on open and after "Tidy up". The rules are in the
    Motion section of `design-language.md`. The old entrance of new tables faded opacity
    inside the canvas, against decision 48; it now settles by scale with an accent halo.
    Two test timings came up on the way: CodeMirror accepts a completion only 75 ms after
    its list changed, and Radix moves menu focus a task after the key, so tests that press
    keys back to back now wait for each step.
