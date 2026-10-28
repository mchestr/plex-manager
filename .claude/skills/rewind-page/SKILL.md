---
name: rewind-page
description: Checklist for adding or changing a page of the Rewind 2026 issue (a story page in the registry). Use when editing a page module, its schema, its component, or the registry, so the page ships with its registry entry, fact-only data, grounded copy, omission rule, test ids, article mode, desktop Notes, cut-list entry and tests.
paths:
  - "components/rewind/pages/**"
  - "lib/rewind/pages/**"
  - "lib/rewind/registry.ts"
  - "lib/rewind/page-meta.ts"
---

# Adding or changing a Rewind page

A page is a registry entry plus a component. The registry decides whether the
page prints, what data it holds and what every other surface (screen readers,
Table, article mode, Notes, cards) says about it; the component only draws
that data. Follow `rewind-design-system` for how it looks.

## 1. Metadata and the registry entry

- Page id: add it to `lib/wrapped/data/page-types.ts` in issue order.
- `pageMeta` in `lib/rewind/page-meta.ts`: `name` (the one name used on every
  surface), `act`, `field` (an ink, or `archetype`), `PageMeta.altField` (the field
  used when the archetype owns the page's colour; null on paper and archetype
  pages), `core`, `pocket` and `dwell`. The spot rule is derived there (`arch`
  on archetype pages, `arch-deep` on paper, `ink` elsewhere). The client stage
  reads this module alone, so keep it free of Zod and page modules.
- The page module `lib/rewind/pages/<page>.ts` exports a
  `PageDefinition` (`lib/rewind/registry.ts`), and the strict Zod schema of
  its data lives in `lib/rewind/pages/<page>.schema.ts`. Register it in
  `registry` in `lib/rewind/registry.ts`. Read `lib/rewind/pages/records.ts`
  as the reference.
  - `select(facts, ctx)` returns the page's data or null.
  - `schema`: stored pages are parsed with it on read (`validatePagesOnRead`
    in `lib/rewind/select-pages.ts`), so data holds fact ids, rating keys and
    geometry inputs, never a second copy of a number a fact displays.
  - `PageDefinition.srSummary(data, facts)`: the deterministic text for screen readers and the
    Notes fallback. Every number on the page appears in it.
  - `table(data, facts, settings)` on chart pages (the Table sheet), or none.
  - `share`: `facts` the card may print, `titles` (facts that name a title),
    `art`, `share.titleKeys` (so a hidden title leaves the projection at once) and
    `pick`. A page with no card is left out of `SHARE_PAGE_TYPES`.
- Page modules must not import `server-only` modules (for example
  `lib/rewind/typeset/metrics.ts`): `npm run build` fails when a client bundle
  reaches one. Fit text on the server and pass the result in.

## 2. Facts and copy

- Data and copy cite facts from the catalogue only: `FACTS` and `FactId` in
  `lib/wrapped/facts/catalogue.ts`. Read them with the helpers in
  `lib/rewind/pages/facts.ts` and print their `display` strings; never
  recompute a number in the page.
- Copy a model may write is a slot: `DECK_SLOT_IDS`, `COPY_SLOTS` and
  `HERO_FACTS` in `lib/wrapped/copy/slots.ts` (allowed facts, identity facts,
  bands, length caps), with deterministic fallbacks in `SLOT_TEMPLATES`
  (`lib/wrapped/copy/templates.ts`). Every slot passes `groundSlot`
  (`lib/wrapped/copy/grounding.ts`). The page reads its deck with `pageDeck`
  (`lib/rewind/pages/deck.ts`), the component with `deckText`
  (`components/rewind/pages/issue-context.ts`).
- Format every number, duration and plural through `lib/rewind/format.ts`.

## 3. Omission, the cut list and test ids

- The page omits itself (FR-2): `select` returns null when the page has
  nothing true to say; never print a zero count or an empty list. `selectPages` and `eligiblePages` in
  `lib/rewind/select-pages.ts` apply the rule and the edition.
- A non-core page joins the cut list, `REWIND_CUT_PAGES` in
  `lib/validations/rewind-settings.ts`, so the admin can switch it off
  through `Config.rewindDisabledPages`. The cover, the centrefold and the
  back cover always stay.
- Test ids: the page root is `rewind-page-<page>`, its
  parts `rewind-<page>-<part>` (for example `rewind-record-cell`). Every
  interactive element has one.

## 4. The component and the other modes

- `components/rewind/pages/<page>.tsx` takes `PageProps` (the data and the
  `IssueContext`) and is added to `PageBody` in
  `components/rewind/pages/page-body.tsx`. It prints in the stage's ink, with
  sizes in artboard units (`u()`, `ut()` from `components/rewind/pages/units.ts`)
  and posters through `RewindPoster`.
- Article mode (P5.12): `article(data, facts, ctx)` is required. It returns
  blocks built with the helpers in `lib/rewind/article/blocks.ts`, from the
  same data, table and copy as the story page, and states each fact once: the
  deck through `deckBlock`, at most one table of 12 rows or fewer with a short
  caption and no date range, and no summary that repeats another block.
- Desktop Notes (P7.4): `notes(data, facts, ctx)` adds what the page does not
  already say; otherwise `pageNotes` (`lib/rewind/notes/index.ts`) shows the
  summary. Notes render in `components/rewind/desktop/notes-column.tsx`.
- A card for the page follows the `share-card` skill.

## 5. Tests

- A component test in `components/rewind/pages/__tests__/<page>.test.tsx` on
  every fixture in `PAGE_FIXTURES` (heavy, median, light and
  long-and-non-latin-titles), using `loadIssues`, `pageData` and
  `hasCleanCounts` from `components/rewind/pages/__tests__/page-copy-rules.ts`,
  plus a snapshot of its summary. `components/rewind/pages/__tests__/records.test.tsx`
  is the pattern.
- `select` rules in `lib/rewind/pages/__tests__/<page>.select.test.ts`.
- Update the counts and lists in `lib/rewind/__tests__/registry.test.ts`;
  `lib/rewind/__tests__/registry-tokens.test.ts` checks the new field against
  every archetype.
- Rebuild the E2E issues with `npm run rewind:e2e-fixtures`. Golden fixture
  changes (`evals/rewind/fixtures/**`) need the owner's review.
- Visual baselines at the five phone sizes and 1440x900 come from the
  `rewind-visual-phone-chromium`, `rewind-visual-phone-webkit`,
  `rewind-visual-desktop-chromium` and `rewind-visual-desktop-webkit` projects
  (`e2e/visual/rewind.spec.ts`), refreshed through the Visual Baselines
  workflow, and axe runs in `e2e/a11y/rewind.a11y.spec.ts`. See `visual-qa`.
