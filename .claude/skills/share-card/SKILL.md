---
name: share-card
description: Rules for the Rewind share cards drawn with next/og (Satori) and the routes that serve them. Use when adding or changing a card component, the card frame, fonts or typesetting, the card cache or version, or a card route, so the card stays Satori-safe, prints only share-safe data, and keeps the owner and link renders identical.
paths:
  - "lib/rewind/cards/**"
  - "app/api/rewind/card/**"
---

# Share cards

Every card is public, so a card is drawn from the share-safe projection and
nothing else, by a Satori-safe component, and the owner sees exactly what a
stranger with the link would see.

Design: `.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/rewind-2026-design.md`
6.1 (the projection), 6.4 (the renderer) and 6.7 (the OG card); colours and
type follow `rewind-design-system`.

## Data: `toShareSafe` only (design 6.1)

- Both routes call `projectCard` in `lib/rewind/cards/serve.ts`, which runs
  `toShareSafe` (`lib/wrapped/data/share-safe.ts`) and builds a `CardInput`
  with `cardInput`. A card component receives that `CardInput` and its
  fetched art (`CardAssets` from `lib/rewind/cards/parts.tsx`), never the
  stored Rewind, the session or the database.
- The projection is an allow-list (`ShareSafeRewindV3` in
  `lib/wrapped/data/share-safe-schema.ts`, strict): a page publishes only the
  facts its registry entry lists in `share.facts`, as display strings.
- No name unless the card is signed: read `ShareSafeRewindV3.ownerName`,
  which the projection sets only when `signed` is on. The server name comes from `brand`, which is
  null when the admin turned it off. Art appears only when the share includes
  it and the admin allows it.
- Which cards exist: `CARD_PAGE_TYPES` and `eligibleCards` in
  `lib/rewind/cards/eligible.ts`; renderers by page in
  `lib/rewind/cards/index.ts` (`renderCard`, `hasCard`). Setup and Next year
  have no card. A new card needs both lists and its eligibility rule.

## Satori rules (design 6.4, P5.10)

- `display: flex` on every element with children; no grid, CSS variables,
  `calc()`, pseudo-elements, `box-shadow`, `filter`, blend modes,
  `clip-path` or text stroke. ESLint enforces them in `lib/rewind/cards/**`
  (`rewindCards` in `eslint/restricted-syntax.mjs`), and
  `lib/rewind/cards/__tests__/cards-tree.test.tsx` checks the tree.
- Graphics are SVG data URIs with no `<text>` (`Graphic` in
  `lib/rewind/cards/type.tsx`), built from the shared geometry in
  `lib/rewind/viz/`; labels are HTML placed from the builder's anchors.
- Colours come from `rewindInks` in `lib/design/tokens.ts` through `cardInk`
  (`lib/rewind/cards/frame.tsx`); never hex in a card.
- No `font-feature-settings`: Satori ignores them, so card numerals are
  fitted with proportional figures.
- An `<img>`'s width and height include its border.

## Fonts and typesetting

- Static instances only: `loadCardFonts` in `lib/rewind/cards/fonts.ts`
  reads the TTFs in `lib/rewind/cards/fonts/` once per process
  (`archivoFamily`, `NEWSREADER`); non-Latin text falls back to the Noto
  subsets in `lib/rewind/cards/noto.ts`.
- Every fitted line is chosen before render with `fitCard`,
  `fitNameplate` and `safeFit` (`lib/rewind/cards/type.tsx`), which call
  `fitLines` with `cardMetrics` on the `CARD_MEASURE` measure minus
  `CARD_SLACK`, and is set `nowrap`, so Satori never re-wraps it. Card roles
  are design 6.4's list, not the page's.
- Rebuilding the fonts or metrics is `scripts/build-rewind-fonts.py`.

## Sizes, version, cache and limits

- Sizes: `CARD_SIZES` in `lib/rewind/cards/frame.tsx`, story 1080x1920 (the
  content inside the 1080x1340 safe zone) and OG 1200x630 (`OgCard` in
  `lib/rewind/cards/og.tsx`). The routes refuse `square` until FR-27.
- `CARD_VERSION` (`lib/rewind/cards/version.ts`, generated into
  `lib/rewind/cards/card-version.generated.ts`) names the renderer, `next/og`,
  Satori and font versions. When a card's pixels change for any other reason,
  bump `CARD_RENDERER_VERSION` and run `npm run rewind:card-version`;
  `lib/rewind/cards/__tests__/card-version.test.ts` fails on a stale value.
- Cache: `cardCacheKey` (`lib/rewind/cards/cache.ts`) hashes the whole
  `CardInput` with `CARD_VERSION`. Authorisation runs before the cache lookup,
  and a cache hit is served before the limiter.
- Rate limits (`lib/security/rate-limit-config.ts`): `rw:card:session`, 60
  renders a minute per owner, and `rw:card:share`, 30 a minute per share.
- Routes: the owner's `app/api/rewind/card/[rewindId]/[page]/route.ts`
  (session, ownership and entitlement; options validated by Zod and clamped by
  the admin flags), the link's `app/api/rewind/card/s/[assetKey]/[page]/route.ts`
  (options from the stored share; the page must be published) and the admin
  dry run's `app/api/rewind/card/preview/[previewId]/[page]/route.ts`.
  Anything unauthorised or unpublished is a 404, with `X-Robots-Tag: noindex`.

## Tests

- `lib/rewind/cards/__tests__/cards.render.test.tsx` and
  `lib/rewind/cards/__tests__/og.render.test.tsx` render the cards;
  `lib/rewind/cards/__tests__/eligible-cards.test.ts` covers the list.
- The owner-versus-link pixel test,
  `lib/rewind/cards/__tests__/owner-vs-link.render.test.tsx`, renders the same
  page through both routes (in a child process, `scripts/rewind-render-cards.tsx`)
  and requires byte-identical PNGs. Keep it passing: anything the owner route
  adds to a card must come through the projection.
- Card baselines: `e2e/visual/rewind-cards.spec.ts`, on
  `--project=rewind-visual-phone-chromium` (see `visual-qa`).
- Timings: `npm run rewind:measure-cards` writes `lib/rewind/cards/measurements.json`.
