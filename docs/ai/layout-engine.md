# Layout engine

Everything under `src/layout/`. The engine has one job: make relations easy to follow.

## Principles

1. Reading direction is always left to right. The referenced table (the "one" side) sits
   left of the table that references it.
2. A relation attaches to the row of its column, on the left or right edge of the card.
3. Lines are orthogonal, get their own lane, and do not run behind tables.
4. Tables of a `TableGroup` stay together inside one tinted region.
5. The order in the DBML source breaks ties, so the diagram stays predictable while typing.
6. The diagram should fill the screen. A layout that is one long row is a bad layout.

## Steps of `runLayout` (`elk.ts`)

1. **Orientation** (`orient.ts`). Each relation gets a left and a right table. Cycles are
   broken with a greedy feedback arc set, flipping as few relations as possible. Groups are
   ordered first ("blocks"), and relations between two groups all point the same way.
   Without this, two groups that reference each other make lines loop around the diagram.
2. **Graph**. Tables become ELK nodes with fixed-position ports, one per connected row and
   side. Groups become compound nodes. ELK runs `layered`, direction `RIGHT`, orthogonal
   routing, `INCLUDE_CHILDREN`.
3. **Wrapping** (`relax.ts`). A chain of groups would end up in one row. For the block
   pairs that are cheapest to bend, the relation is drawn as a bracket: both ends leave on
   the right side and meet in an invisible junction node. The two blocks no longer need to
   sit in consecutive columns and can stack. The choice is made on an estimate, so both
   variants are laid out and the wrapped one is used only if it can be shown at least 10%
   larger in the current viewport. At most a third of the relations between blocks may be
   bent.
4. **Result**. Positions are rounded to whole pixels. Route ends are re-attached to the
   rounded ports (`snapEnds`).

## Stored routes and the fallback router

An ELK route is stored with a signature of its two end points. `computeEdges` (`edges.ts`)
uses the stored route only while both ends still sit there. After a drag, or when a column
is added, the signature no longer matches and `routeBetween` (`router.ts`) draws a simple
elbow instead. This is why hand-moved tables may have lines that pass behind other tables,
while an automatic layout never does.

## Auto and manual mode

- Auto (default): every structural change triggers a new layout, tables animate.
- Dragging a table switches to manual: positions are kept, new tables are placed by
  `incremental.ts`, a single removed plus a single added table counts as a rename.
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

Spacing lives in `SHARED_OPTIONS` in `elk.ts`. To judge a change, render the samples:

```sh
PREVIEW_DIR=/tmp/preview pnpm vitest run src/layout/preview.test.ts
```

`PREVIEW_VARIANTS` takes a JSON object of ELK option overrides to compare side by side,
`PREVIEW_W` and `PREVIEW_H` set the viewport the wrapping aims for.
