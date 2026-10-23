---
name: rewind-design-system
description: The Rewind 2026 visual system as this repository implements it. Use when building or changing anything inside the Rewind scope (story pages, the stage chrome, sheets, the share page, cards) to get the ink and field model, the Archivo and Newsreader roles, the typesetter, the motion and reduced-motion rules, and the poster rules right. Points at the source files and design sections that own each value.
paths:
  - "components/rewind/**"
  - "lib/rewind/**"
  - "app/(app)/rewind/**"
  - "app/rewind/**"
---

# Rewind design system

Rewind is the one place where the app becomes a printed publication. The
values live in code and in the design; this skill tells you where, so read the
source rather than copying numbers from here.

Design: `.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/rewind-2026-design.md`
(section 5) and the scope contract in
`.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/ui-design-system.md` (4.4).

## The scope contract (ui-design-system 4.4, design 5.1)

- Every Rewind surface renders inside `RewindScope`
  (`components/rewind/stage/rewind-scope.tsx`): the member layout
  `app/(app)/rewind/layout.tsx`, the share page `app/rewind/s/[token]/page.tsx`
  (and its `error.tsx` and `not-found.tsx`), and the admin preview
  `app/admin/users/[userId]/rewind/[year]/page.tsx`. The root carries
  `data-theme="rewind"`, the font variables and the portal container
  (`PortalContainerProvider`), so sheets, popovers and toasts print on paper
  inside the scope. A portal to `body` leaves the scope and renders graphite.
- An element that prints in an ink spreads `inkProps(ink, opts)` from
  `lib/design/tokens.ts`: it sets `data-field`, the `.light` or `.dark` class,
  and `data-spot="arch"` or `data-ink="arch-deep"` where design 5.3 needs
  them. No Rewind component writes a colour, a hex value or a palette class.
- The twelve inks: `InkName` and `rewindInks` in `lib/design/tokens.ts` (hex,
  for Satori and charts) mirror the OKLCH values in the Rewind block of
  `app/globals.css` (between the `rewind-scope:start` and `rewind-scope:end`
  markers). `lib/design/__tests__/tokens.test.ts` keeps them in sync and
  checks every contrast pair.
- `.light` and `.dark`: the four dark inks (ultramarine, forest, oxblood,
  petrol) carry `.dark`, the eight light inks `.light`. The app's `dark:`
  variant is bounded, so it never fires under a `.light` element. Never nest a
  `.dark` element inside a `.light` one.
- Two-ink discipline (design 5.2 and 5.3): one field and one ink per page,
  plus at most one spot colour. Text is the ink on the field, or the deep ink
  on paper, never the spot. Marks that differ are told apart by solid versus
  hatched or outlined, never by colour alone. No gradients, no status colours
  (the tones collapse to the ink), no glows, no blur.
- Archetype colourways: `archetypeInks` in `lib/design/tokens.ts`; the page's
  field, `PageMeta.altField` and spot rule: `pageMeta` in `lib/rewind/page-meta.ts`;
  the stage reports the current ink through `components/rewind/stage/stage-ink.tsx`.
  `lib/rewind/__tests__/registry-tokens.test.ts` checks every page against
  every archetype.
- Shared primitives render in ink with no copies. Use `components/ui/*`; the
  Rewind-only Button variants (`ink`, `ink-outline`) and sizes (`pill`,
  `icon-pill`) exist only here.

## Type (design 5.4)

- Fonts: `lib/rewind/fonts.ts` loads Archivo (variable width and weight) and
  Newsreader (static Text, Text Italic and Display Italic) with
  `next/font/local`; `rewindFontVariables` goes on the scope. Inside the
  scope use the `font-display` (Archivo: headlines, numerals, labels, chrome)
  and `font-text` (Newsreader: decks, notes, captions) utilities. IBM Plex
  never renders inside Rewind.
- Roles and sizes are design 5.4's table. Sizes are artboard units: `u()`,
  `ut()` (never under 12 px rendered) and `MEASURE` in
  `components/rewind/pages/units.ts`.
- Headlines and numerals are fitted before render by `fitLines` in
  `lib/rewind/typeset/fit-lines.ts`, with `pageMetrics` from
  `lib/rewind/typeset/metrics.ts`. That module is `server-only`: fit in a
  Server Component or a server-side builder and pass the `FitResult` down
  (`FittedLines`, `SentenceHeadline` in `components/rewind/pages/`). Never
  let the browser wrap a fitted line.
- Numbers, durations, hours, dates and plurals come from `lib/rewind/format.ts`
  (`formatHero`, `formatCount`, `formatRewindDuration`, `formatHour`,
  `formatDayMonth`): it puts U+00A0 between a number and its unit, so "10 PM"
  never breaks, and nothing reads "1 films".

## Motion (design 5.6)

- Page choreography is CSS in the Rewind block of `app/globals.css`: the
  `--rw-dur-*` durations and the `--rw-ease-stretch`, `--rw-ease-ink`,
  `--rw-ease-data` and `--rw-ease-ui` easings, applied through the `rw-*`
  classes on `.rw-page[data-current]`. Sheets and toggles keep the app's
  `--ease-out-quiet`.
- JavaScript motion uses `motion/react`; the stage wraps the story in
  `<MotionConfig reducedMotion="user">` (`components/rewind/stage/story-stage.tsx`).
- Only `transform`, `opacity`, `clip-path` and one font axis animate, nothing
  loops, and everything settles within 1.4 s of the page turn.
  `npm run design:rewind-motion` (`scripts/design-system/rewind-motion.mjs`)
  enforces it in CI.
- Reduced motion: the app's base clamp skips the scope; the Rewind rule under
  `prefers-reduced-motion: reduce` in `app/globals.css` keeps only short
  opacity crossfades. Check both modes.
- Low-end mode (P7.15): `isLowEnd` in `lib/rewind/stage/low-end.ts` sets
  `data-low-end` on the scope root (also from the Save-Data header); the CSS
  swaps the nameplate stretch for a transform and drops the paper grain.
  Components read it with `useLowEnd` (`components/rewind/stage/low-end.tsx`).

## Imagery (design 5.8)

- Posters render only through `RewindPoster` (`components/rewind/media/poster.tsx`),
  a wrapper over `components/ui/poster.tsx` and the poster proxy
  `app/api/rewind/poster/[ratingKey]/route.ts`. It sizes the box in artboard
  units, asks for full colour or the page's duotone (`pageTone` in
  `lib/rewind/media/tone.ts`), draws the 1.5 px ink keyline, and falls back to
  `TitleCard` (`components/rewind/media/title-card.tsx`) at the same size.
- Full colour only for the No. 1 slots, quiz tiles and the Short list hero;
  everything else is duotone. No generated art, no people imagery (People is
  a billing block of names), no studio art in mockups.

## Guardrails

- `npm run design:check` (`scripts/design-system/rules.mjs`): the
  `rewind-only` rule keeps the `--rw-*`, `--field`, `--ink`, `--spot`,
  `--deep` and `--arch-*` tokens, the `font-display` and `font-text`
  utilities and the ink Button entries inside the Rewind folders; the copy
  rule bans arrows, middots, "Wrapped" and "Plex Rewind" in JSX copy.
- ESLint `rewindOnlyProps` (`eslint/restricted-syntax.mjs`) makes the ink
  Button variants errors outside `components/rewind/**`.
- Product names come from `lib/brand.ts` (`rewindName`), never a literal.
