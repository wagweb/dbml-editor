# Open questions

Answer here, then move the answer to `decisions.md`.

1. **Product name.** "Keyline" is a working title (`src/app/constants.ts`, `index.html`,
   storage keys `keyline:*`). Keep it or rename?
2. **ESLint or oxlint.** The company guideline lists ESLint and Prettier as base hygiene.
   The repo uses oxlint, the default of the current Vite template. Switch to ESLint?
3. **Hosting.** Decided: AWS Amplify, see decision 35. Still open: a separate dev or test
   environment (a second Amplify branch?) and a custom domain.
4. **Sentry and SonarQube.** Not set up yet. Needed now that the app is hosted?
5. **DBML features still without a visual.** `checks`, `Dep` and multi-file projects are
   accepted by the parser and ignored by the diagram. Sticky notes, enums, `Records` and
   `DiagramView` are drawn since decision 24.
6. **Enum cards and the layout.** Enum cards are ordinary layout nodes, so a widely used
   enum can land far from its users with a long dashed link. Place enum cards next to
   their first user after the layout instead?
7. **Creating views and groups from the canvas.** Views come from `DiagramView` in the
   code and suggested groups can be written to it, but there is no "save the current
   focus as a view" yet. Wanted?
8. **Large schemas.** Measured once in headless Chromium with generated schemas: 40
   tables in 4 groups are on screen after about 0.5 s, 120 tables in 8 groups after about
   1.7 s; panning stays at 60 fps in both. Not measured on real schemas or slower machines.
   Is 100+ tables a target, and if so, is a progress hint during layout wanted?
9. **Wrapping inside a group.** Stacking works between groups and between ungrouped
   tables. A single group with a long chain of tables still becomes one row.
10. **ECC plugin.** The marketplace is registered on this machine but the plugin is not
    installed. Install it for this repo (`/plugin install ecc@ecc`) so its commands and
    hooks are available in future sessions?
11. **Card and group outlines.** Table cards and group regions use hairlines below 3:1
    (WCAG 1.4.11). They are kept light on purpose: a card is also recognisable by its
    header fill and text, a group by the header tint and the details panel. Relation lines
    and input borders were raised to 3:1. Should the outlines follow, at the cost of a
    heavier look?
12. **Deletions across tabs.** Tabs merge new and newer diagrams, but a diagram deleted in
    one tab comes back if another tab still has it open. Worth adding tombstones?
13. **Remaining pointer conveniences.** The splitter has keyboard support but no width
    presets, groups move only by drag (their tables can be moved one by one), and on touch
    devices panning is drag only (search and "fit" are the alternatives). Enough, or should
    these get explicit controls?
14. **Screen reader pass.** axe is clean and the audit was done from code. A manual run
    with NVDA and VoiceOver has not happened yet (the company standard asks for one).
15. **Files in Firefox and Safari.** Without the File System Access API "Save" downloads
    the file each time and the diagram cannot follow changes on disk. Good enough, or is
    a hint in the menu wanted?
16. **Column renames and partials.** Renaming a column that comes from a `TablePartial` is
    refused, because the change would affect every table that uses the partial. Offer to
    rename it in the partial instead?
17. **Details panel on narrow screens.** At 1180 px with the code open, the panel takes 320 of
    780 canvas pixels; a selected table's neighbours can then not all be shown beside it.
    Dock the panel as a third column, or close the code panel while details are open?
18. **Starting points.** The examples are gone (decision 37). Would a few templates for
    common schemas (users and teams, a shop) help on the start screen, or does "New
    diagram" with two tables cover it?
