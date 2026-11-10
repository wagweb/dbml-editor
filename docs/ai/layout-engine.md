# Layout engine

Everything under `src/layout/`. The engine has one job: make relations easy to follow.

## Principles

1. Reading direction is left to right by default. The referenced table (the "one" side)
   sits left of the table that references it (above it with `direction: 'down'`).
2. A relation attaches to the row of its column, on the left or right edge of the card.
3. Lines are orthogonal and do not run behind tables. Lines from different rows get lanes
   of their own; the lines of one row share theirs as a bundle.
4. Tables of a `TableGroup` stay together inside one tinted region.
5. The order in the DBML source breaks ties, so the diagram stays predictable while typing.
6. The diagram should fill the screen. A layout that is one long row is a bad layout.

## Steps of `runLayout` (`elk.ts`)

1. **Orientation** (`orient.ts`). Each relation gets a left and a right table. Cycles are
   broken with a greedy feedback arc set, flipping as few relations as possible. Groups are
   ordered first ("blocks"), and relations between two groups all point the same way.
   Without this, two groups that reference each other make lines loop around the diagram.
2. **Graph**. Tables become ELK nodes with fixed-position ports, one per connected row and
   side. Groups become compound nodes. ELK runs `layered`, direction `RIGHT` (or `DOWN`,
   see layout options), orthogonal routing, `INCLUDE_CHILDREN`.
3. **Wrapping** (`relax.ts`). A chain of groups would end up in one row. For the block
   pairs that are cheapest to bend, the relation is drawn as a bracket: both ends leave on
   the right side and meet in an invisible junction node. The two blocks no longer need to
   sit in consecutive columns and can stack. The choice is made on an estimate, so both
   variants are laid out and the wrapped one is used only if it can be shown at least 10%
   larger in the current viewport. At most a third of the relations between blocks may be
   bent.
4. **Result**. Positions are rounded to whole pixels. Route ends are re-attached to the
   rounded ports (`snapEnds`).

## Stored routes and the avoiding router

An ELK route is stored with a signature of its two end points. `computeEdges` (`edges.ts`)
uses the stored route only while both ends still sit there. Without a usable stored route
(while a table is being dragged, or after the engine failed) `routeAvoiding` (`avoid.ts`)
draws the line: A* on a sparse grid spanned by the edges of the nearby tables, inflated by
14 px, trying all four ways to leave and enter (left or right on each end) and charging a
bend as 36 px of detour. If every way is blocked it falls back to the plain elbow of
`routeBetween` (`router.ts`).

In manual mode `refreshRoutes` (`edges.ts`) runs after every drop, after new tables were
placed, when the detail level changes and when a hand-arranged document opens. It keeps
every stored route whose ends still match and that crosses no table, and replaces the
rest with avoiding routes, stored with their own signature. Engine lanes survive for
untouched relations; moved tables and lines a table was dropped onto get new ones.

## Bundles

ELK routes the relations of one port, that is one row on one side of a card, as a
hyperedge: they leave together and share their lanes for as long as they head the same
way. `bundleEdges` (`bundles.ts`) finds those shared stretches in the finished routes:
the relations of a row are walked from the row outwards, and two run together while they
head the same way (points within 0.5 px count as the same place). Every stretch shared by
two or more relations becomes a piece with its count, every place where some of them
part becomes a junction, and a line that turns at a junction turns square there. The
canvas and the SVG export draw both, see "Bundled relations" in `design-language.md`.
Enum links and loops are left out.

The avoiding router bundles too. `refreshRoutes` keeps the routes that still fit first,
then routes the others in model order, each with the routes of relations that share one
of its rows as partners (`routeAvoiding(…, bundleWith)`). Their segments become grid
lines, and a step along one costs 0.4 of its length, so a new route runs with its
partners, even round the longer side of a card, instead of in a lane of its own.

Enum cards and sticky notes are ordinary nodes for the layout. The link from a column to
its enum card is an edge like any other, drawn dashed and without cardinality markers;
`refColumnsByTable` ignores it, so the keys view does not show enum columns and the link
then attaches to the header. With `enumsNearUsers` (the default) enum cards are moved
after the layout, see below.

## Layout options

`LayoutRequest.options` takes `LayoutPreferences`; without it `DEFAULT_LAYOUT_PREFERENCES`
apply (`right`, `normal`, enums near users). The defaults give exactly the layout from
before the options existed, apart from the enum cards.

- **Spacing** (`compact`, `normal`, `airy`) scales every ELK distance in `SPACING` by
  `SPACING_FACTORS` (0.7, 1, 1.4), rounded to half a grid cell (`scaleDistance`); `normal`
  keeps the tuned values exactly. Group padding only scales the part beyond the drawn
  region (`GROUP_INSET`), so tints never touch. The wrapping estimate uses the same gaps.
- **Direction `down`**: ELK `DOWN` with network simplex node placement. Relations still
  attach to the side edges of their rows, so ELK runs twice: the first pass places the
  cards, then `sidesTopDown` (`sides.ts`) decides per card which edge takes its keys and
  which its foreign keys (opposite edges, so lines going down never cross lines coming
  from above beside the card), picking whichever saves the most doubling back. The second
  pass routes with those edges. Wrapping works as left to right, on a turned estimate;
  bracket junctions sit below both blocks. Measured on the samples (6 schemas, two detail
  levels, two viewports) against left to right: about 1.4 times the crossings, twice the
  bends, 1.7 times the line length; no line runs through a card. Every relation needs a
  turn out of the side and one into the next side, which is the price of row anchors in
  a vertical flow. `orient.ts` needs no change: "left" simply means "above".
- **Enums near users** (`enums.ts`): after the layout, each enum card moves next to the
  first table in model order that uses it. Candidates on the grid around that table are
  ranked by link length, bends, a price per relation already attached on that edge (so
  the card goes to the quieter side), crossings and cards in the way. Spots that touch a
  card, a group region or another relation's line are skipped; if nothing is free within
  1920 px the card goes below the diagram. The moved card's links get avoiding routes,
  all other routes stay. Because the card snaps to the grid and the rows do not, a link
  can show a jog of up to 4 px.

## Relayouts that keep the picture

`runLayout` accepts `previous` (positions on screen) and `stacked` (block pairs stacked last
time). With them, the model order ELK follows is the order on screen, top to bottom, and
the stacking decision is reused while all its pairs still exist, so the groups do not swap
places. The store passes both for automatic layouts after edits, detail changes and
document opens; "Tidy up" passes neither. ELK's interactive layering was tried and dropped:
seeding layers from old x positions broke the stacked variants.

## Auto and manual mode

- Auto (default): every structural change triggers a new layout, tables animate.
- Dragging a table switches to manual: positions are kept, new tables are placed by
  `incremental.ts`, a single removed plus a single added table counts as a rename, and
  lines are rerouted around tables (`refreshRoutes`).
- Each DiagramView has its own arrangement and its own auto or manual state.
- "Tidy up" runs the layout again and switches back to auto. Tidying a hand-made
  arrangement can be undone.

## Known ELK pitfalls

- `elk.layered.considerModelOrder.strategy` must be set on the root only. On a group node
  it makes ELK throw.
- Layout options are not inherited. Spacing has to be repeated on every group node.
- A group is one node in the root layering. Group-level cycles therefore matter even if
  the table-level graph is acyclic.
- ELK has no edges between nodes of the same layer. Stacking needs the junction trick.

If ELK throws, `layoutAll` in `store/diagram.ts` retries without groups and finally falls
back to simple placement, so the canvas never stays empty.

## Tuning

Spacing lives in `SPACING` in `elk.ts`, the other engine options in `SHARED_OPTIONS`. To judge a change, render the test schemas:

```sh
PREVIEW_DIR=/tmp/preview pnpm vitest run src/layout/preview.test.ts
```

`PREVIEW_VARIANTS` takes a JSON object of ELK option overrides to compare side by side,
`PREVIEW_W` and `PREVIEW_H` set the viewport the wrapping aims for, and `PREVIEW_PREFS`
takes layout preferences as JSON, e.g. `{"direction":"down","spacing":"airy"}`. The
preview draws enum and note cards, as the app does.
