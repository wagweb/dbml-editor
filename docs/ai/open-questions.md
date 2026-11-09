# Open questions

Answer here, then move the answer to `decisions.md`.

1. **Product name.** "Keyline" is a working title (`src/app/constants.ts`, `index.html`,
   storage keys `keyline:*`). Keep it or rename?
2. **ESLint or oxlint.** The company guideline lists ESLint and Prettier as base hygiene.
   The repo uses oxlint, the default of the current Vite template. Switch to ESLint?
3. **Hosting.** The guideline asks for an online dev and test environment. Nothing is
   deployed yet. The build is static (`dist/`); where should it run?
4. **Sentry and SonarQube.** Not set up, since there is no deployment. Needed once hosted?
5. **Sticky notes.** DBML `Note name { ... }` blocks parse fine but are not drawn.
6. **Enums on the canvas.** Enum values only show in the details panel. Draw enums as
   cards with a relation to the columns that use them?
7. **Other DBML features without a visual.** `Records`, `checks`, `Dep`, `DiagramView`
   and multi-file projects are accepted by the parser and ignored by the diagram.
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
