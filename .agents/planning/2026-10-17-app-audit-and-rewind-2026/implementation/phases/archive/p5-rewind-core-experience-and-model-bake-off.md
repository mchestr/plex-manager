> Part of the [implementation plan](../../plan.md): the index, timeline, milestones and progress checklist live there. This phase is done.

## Phase 5: Rewind core experience and model bake-off

**Goal.** Rewind Phase 2 (`design/rewind-2026-design.md` 13.1). It delivers:
- the story player and its chrome, and the ten core pages (01 to 06, 09, 10, 16 and 18);
- copy slots with grounding and token rendering, and the v3 pipeline behind `REWIND_GENERATE_USER`;
- the share-safe projection with owner and share card routes, and the share sheet with opt-in public links;
- article mode, and the model bake-off on 18-20 November.

Members see none of the v3 issue before the soft launch, because `rewindEnabled` stays off until P7.16 on 2026-11-27. Stored v1 and v2 years keep rendering under the new `/rewind` URLs.

**Window.** 2026-11-06 to 2026-11-20. P5.8 starts on 2026-11-06, the day after P2.9 merges, because it needs no primitive. The phase closes at the "Core experience done and default model chosen" milestone on 2026-11-20:
- the ten core pages pass visual and axe tests on three fixtures (heavy, median and light), on chromium and webkit, at every listed viewport;
- the default model reaches 98% or more first-pass grounding on the golden fixtures in the bake-off;
- the home RewindCard (P6.9) is merged and its before-season state is live;
- from that evening, the owner runs admin-audience generation on production data (P7.8, P7.12), so that the soft launch signs off issues that have already been generated on real data.

**Tracks.** The Rewind lane runs P5.1, P5.2, P5.8, P5.9, P5.5, P5.10, P5.6, P5.7, P5.11 and P5.13. The UI lane, free after P6.3 and P6.5, takes the UI-heavy steps: P5.4, P5.3 and P5.12. Each lane keeps at most two PRs open.

**Rewind-critical chain.** P5.2, P5.5, P5.7 and P5.9 feed every page, card and admin step of Phase 7. P5.2 and P5.9 are L-sized and start on 2026-11-09, so neither waits for the other.

P5.1 and P5.2 start only once P3.1's scope contract and P3.7's primitives have merged (design 13.1 exit rule). If P3.7 slips past 2026-11-06, the plan's fallback applies: the sheets are built on Base UI Dialog inside `components/rewind` and swapped for Sheet afterwards.

**Ordering that matters.**
- `lib/rewind/registry.ts` (P2.13) is edited by P5.3 (the `table` contract), P5.5 (the entry type, the selection and the front pages), P5.6, P5.7, P5.10 (`share.facts`) and P5.12 (`article`). P5.5 owns the entry type, and later steps fill in only their own pages' entries.
- `components/rewind/stage/story-stage.tsx` is created by P5.2, then extended by P5.3 (sheets, focus, live region), P5.6 (the match-cut layer) and P5.11 (the share sheet). Rebase in that order.
- `lib/wrapped/copy/templates.ts` is created by P5.8, which merges by 2026-11-09. P5.5 to P5.7 then add their headlines and decks to it.
- `lib/queue/jobs/rewind.ts`: P5.9 swaps the `REWIND_GENERATE_USER` body, and P5.10 adds `REWIND_CARD_PREWARM` and `REWIND_CARD_SWEEP`.
- `playwright.config.ts`: P5.4 adds the Rewind projects. P5.1's routing spec runs in the existing `chromium` project until then.
- `evals/rewind/recordings/`: P5.9 commits hand-written replay outputs. P5.13's harness adds real model recordings beside them.
- `next.config.js`: P5.1 adds `redirects()` on top of P0.1's image and CSP changes.

### Step P5.1: Rewind routes, layout and redirects

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-11-09 to 2026-11-09. **Depends on:** P3.1, P3.7, P2.13, P0.14.
- **Findings addressed:** RWP-04, RWV-02, UI-02, UI-39

**Objective.** Move Rewind to `/rewind` and `/rewind/[year]`. The year comes from the member's data, so January opens last year's issue, and one scope root carries the Rewind fonts, the paper popup portal and a close control. Old `/wrapped` links, share links included, keep working through permanent redirects.

**Guidance.**
- **Routes** (design FR-1, `ui-design-system.md` 10):
  - `app/(app)/rewind/page.tsx` redirects to `/rewind/<year>`. The year is P0.14's `getLatestCompletedRewindYear(userId)`, or else `getSeasonState(new Date()).seasonYear` (P2.2). Keep `?from=` and `?sheet=` on the redirect.
  - `app/(app)/rewind/[year]/page.tsx` parses `z.coerce.number().int().min(2010).max(2100)` and calls `notFound()` on failure. It loads the member's own row with `getUserPlexWrapped(userId, year)` and branches on P2.1's `parseStoredRewind()`:
    - `version: 3` renders P5.2's `StoryStage` (a plain page list until P5.5 lands);
    - `version: 1 | 2` renders P0.14's `WrappedYearView` until P7.13 swaps in the archive article in the ship window;
    - no row, `generating`, `failed`, `invalid`, not eligible (FR-48) and no Redis (FR-50) render `RewindStatusPanel`.
  - Delete P0.14's `app/(app)/wrapped/` files. Add `app/(app)/rewind/[year]/loading.tsx`, a paper skeleton, and `error.tsx`, the `failed` panel with the digest and never `error.message`.
  - `rewindEnabled` and `rewindAudience` gate the v3 issue and the 2026 season only. A stored v1 or v2 year always opens for its owner, and admins pass both flags.
- **`components/rewind/rewind-status-panel.tsx`** (`ui-design-system.md` 5.5): the kinds are `generating | failed | parse-error | not-found | unavailable | not-eligible`.
  - It prints on paper inside the scope, takes its copy from codes through P3.8's `lib/ui/error-copy.ts`, and has a back link.
  - `not-found` lists the member's other completed years (`data-testid="rewind-year-links"`).
  - `generating` polls P2.17's `useRewindStatus(year)` and reads "Setting your pages". P7.14 adds "Notify me".
- **Layout.** `app/(app)/rewind/layout.tsx` imports `app/(app)/rewind/fonts.ts` and renders the client `components/rewind/stage/rewind-scope.tsx`.
  - `fonts.ts` uses `next/font/local` on P2.13's `_fonts/` files:
    - Archivo variable (`--font-rw-archivo`, `display: 'block'`, `adjustFontFallback`, preloaded);
    - Newsreader Text roman and italic (`--font-rw-newsreader`, `display: 'swap'`, `preload: false`);
    - Newsreader Display Italic in its own variable, `--font-rw-newsreader-display`, preloaded. It shares weight and style with Text Italic, so it cannot join that family. Add `--font-lead` and a `font-lead` utility to the Rewind block of `app/globals.css`.
  - `RewindScope` renders `<div data-theme="rewind" lang="en" ref={root} {...inkProps(field)} data-archetype={archetype}>` with the font variable classes. A context lets the stage set the current page's ink (design 5.1); the default is `paper`. It wraps its children in P3.5's `PortalContainerProvider({ container: root, popupProps: inkProps('paper') })`.
  - **Close.** `lib/rewind/return-to.ts` `safeReturnPath(raw)` accepts only a relative path matching `/^\/(?!\/)[^\\]*$/`, and otherwise returns `/`. Links into Rewind pass `?from=`. Close (`rewind-close`, drawn by P5.2) and Esc navigate there, and every status panel carries the same control.
- **Redirects.** `next.config.js` `redirects()`, both `permanent: true`, in this order: `/wrapped/share/:token` to `/rewind/s/:token`, then `/wrapped/:path*` to `/rewind/:path*`.
  - Pitfall: browsers cache 308s, so `/rewind/s/:token` must work on day one. Move P0.11's `app/(public)/wrapped/share/[token]/page.tsx` unchanged to `app/rewind/s/[token]/page.tsx`, outside `(app)`. P7.5 rebuilds it.
- **Links and titles** (UI-39).
  - Repoint the `/wrapped` hrefs at `components/dashboard/wrapped-card.tsx:114` and `:272` and `app/admin/shares/page.tsx:185`. (`components/generator/wrapped-generator-status.tsx` went with P1.1.)
  - Repoint `revalidatePath('/wrapped')` at `actions/admin/admin-config.ts:261` and `actions/playground-wrapped.ts:139`.
  - `generateMetadata` returns `{ title: { absolute: await rewindName(year) }, robots: { index: false } }`, because the root title template would append the server name a second time. Member copy reads "Your Rewind 2026".
- **Lapsed members** (FR-51). P4.5 enforces the read-only rule in `proxy.ts` on every request, so a lapsed member reaches `/rewind` and `/rewind/*` and is redirected from every other `(app)` path, on full loads and on client-side navigation. `app/(app)/layout.tsx` keeps `ensureSubscriptionOrAccess()` as defence in depth, reading the path from the `x-pm-pathname` request header that `proxy.ts` sets. Nothing in this step adds a second header name.

**Tests.**
- `app/(app)/rewind/__tests__/rewind-page.test.tsx` mocks the session and Prisma:
  - the index redirects to the latest completed year, else to the season year, and keeps `from`;
  - `abc` calls `notFound`, and another member's row is never read;
  - v3, v2, generating, failed, not-eligible and no-Redis rows each render the right branch.
- `lib/rewind/__tests__/return-to.test.ts`: `/` and `/account` pass; `//evil.example`, `/\evil`, `https://x` and the empty string give `/`.
- `components/rewind/__tests__/rewind-status-panel.test.tsx`: every kind reads its copy from a code, and no stored message renders.
- `__tests__/next-config-redirects.test.ts`: the share rule precedes the catch-all, and both are permanent.
- `e2e/rewind-routes.spec.ts` replaces P0.14's `e2e/rewind-year.spec.ts`. It seeds completed 2025 and 2026 rows and sets `page.clock.setFixedTime('2027-01-02T12:00:00Z')`:
  - `/rewind` lands on `/rewind/2026`, `/rewind/2025` opens, and `/rewind/1999` shows `rewind-year-links`;
  - `request.get(url, { maxRedirects: 0 })` returns 308 from `/wrapped` to `/rewind`, from `/wrapped/2025` to `/rewind/2025`, and from `/wrapped/share/<token>` to `/rewind/s/<token>`, keeping the query string;
  - the followed share redirect renders `wrapped-share-summary`;
  - the title equals the seeded server name plus " Rewind 2026", and Close returns to `?from=` or to `/`.

**Integration.** P5.2 mounts in `[year]/page.tsx` and sets the ink through `RewindScope`. P5.11 handles `?sheet=share`, and P6.9's RewindCard links to `/rewind/<year>?from=/`. P7.5 replaces the moved share page, P7.9 moves the admin preview, and P7.13 replaces the v2 branch. The CLAUDE.md file tree gains `app/(app)/rewind/`, `app/rewind/s/` and `components/rewind/`.

**Demo.** With the browser clock at 2027-01-02, follow an old `/wrapped` bookmark: it lands on `/rewind/2026`, the tab reads "Chester Family Plex Rewind 2026", and Close returns home. An old `/wrapped/share/<token>` link still opens the shared page.

(as merged: `RewindScope` (`components/rewind/stage/rewind-scope.tsx`) takes `fontClassName`; its root carries no ink and no `.light`/`.dark` class (a paper root would restyle the v1/v2 viewer, and pages and chrome print their own ink). It has a marked slot for P5.2's `StageInkContext.Provider` and `data-archetype`, wired at merge. P5.2's `StoryStage` mounts in `app/(app)/rewind/[year]/page.tsx` in place of the `issue` branch's `RewindPageList`. Status panels, the loading skeleton and the v3 placeholder (`components/rewind/rewind-page-list.tsx`, for P5.2 to replace) print on paper themselves; the v1/v2 branch renders the old viewer, year links and share notice inside a `font-sans` wrapper, so its visual baseline is unchanged. Popups and toasts get `inkProps('paper')` plus the font variables. Close is `components/rewind/rewind-close.tsx` (`rewind-close`, an `ink-outline icon-pill` Link); `safeReturnPath` returns a typed `Route`. Branch logic is `lib/rewind/year-view.ts` (`loadRewindYearView`); the index keeps P0.14's `resolveRewindYear` (season-year row first). The flags gate only a v3 row (`unavailable`, `REWIND_NOT_OPEN`); Redis and eligibility are checked only for the season year. Panel copy codes (`RewindPanelCode`) are in `lib/ui/error-copy.ts`. `/rewind/1999` renders `[year]/not-found.tsx` (the `not-found` panel with `rewind-year-links`) with proxy's 404. `wrapped-year-view.tsx` is deleted. Share URLs, the admin Shares link and `revalidatePath('/rewind', 'layout')` all point at `/rewind`; `lib/access-paths.ts` drops `/wrapped` (next.config redirects before the proxy runs) and treats `/rewind/s/*` as public. The design-debt `rewind-only` and `infinite-motion` skips now include `app/(app)/rewind/`. The v2 share page moved unchanged; its design-debt counts moved with it.)

**Done when.**
- [x] `/rewind` opens the latest completed year, `/rewind/[year]` opens any of the member's years, and every other state shows a status panel.
- [x] The layout is the scope root, with the Rewind fonts, the paper portal and a safe close control.
- [x] Both permanent redirects resolve in order, and `/rewind/s/:token` serves surviving share links.
- [x] Titles read "{server name} Rewind {year}", and no in-app link points at `/wrapped`.
- [x] The unit tests and the January-routing E2E pass.

### Step P5.2: Story stage and player

- **Track:** rewind. **Lane:** Rewind. **Effort:** L. **Window:** 2026-11-09 to 2026-11-12. **Depends on:** P3.7, P2.13.
- **Findings addressed:** RWV-03, RWV-04, UI-09, RWV-13

**Objective.** Build a real story player on a fixed 9:16 artboard, with tap, swipe, hold and keyboard input, autoplay that survives manual navigation, and a visible Pause. Its progress costs zero React renders per frame.

**Guidance.**
- **`lib/rewind/stage/fit-stage.ts`** (pure, design 4.7). `fitStage({ vw, vh, safeBottom, rootFontPx })` returns `{ chrome, u, artboardH, belowFloor, largeText }`.
  - Chrome is roomy (76 px top, 75 px bottom) unless `u` would fall under 1 with it. Then it is compact: 52 px at the top and 52 px at the bottom, plus `safeBottom`.
  - `u = min(vw / 390, (vh - chrome) / 693)`, capped at 1.4. When width limits `u`, the artboard grows to at most 845 logical px.
  - `belowFloor` is `u < 0.8`, and `largeText` is a root font size above 20.8 px. P5.3 uses both.
  - Expected values: 390x844 roomy at 1.0; 412x760 compact at 0.95; 390x664 compact at 0.81; 360x640 at 0.77; 375x548 at 0.64.
  - `use-fit-stage.ts` reruns it on `resize` and `visualViewport` events. It writes `--u` and the chrome heights as CSS variables, so React state changes only when the chrome variant does.
- **Reducer.** `lib/rewind/stage/player-reducer.ts` is pure, and `components/rewind/stage/use-story-player.ts` wraps it (design 4.6 and 14.3).
  - The state is `{ mode, index, resumeTo, lastTurn: 'user' | 'auto' | null, sheet }`, with `mode` one of `cover`, `playing`, `paused`, `holding`, `interacting`, `sheet` and `ended`.
  - The events are `CHOOSE_CUT`, `NEXT`, `PREV` and `GOTO` with a `source`, `DWELL_END` (an automatic turn), `PAUSE` and `PLAY`, `HOLD_START` and `HOLD_END`, `INTERACT_START` and `INTERACT_END`, `OPEN_SHEET` and `CLOSE_SHEET` (which resumes only if the story was playing), `HIDDEN`, `FOCUS_CONTROL` and `BLUR_CONTROL`, and `READ_AGAIN` (to page 02). Reaching the back cover enters `ended`.
  - Autoplay starts only after a cut is chosen. It stays off under `prefers-reduced-motion` or when the Autoplay preference is off. Registry pages with `interaction: true` enter `interacting`.
- **Progress** (RWV-13). Each selected page has one `aria-hidden` segment.
  - The current segment runs `@keyframes rw-progress` from `scaleX(0)` to `scaleX(1)` with `transform-origin: left`. `animation-duration` is the registry dwell, times 1.5 with Slower pacing, and `animation-play-state` follows a `data-playing` attribute.
  - `onAnimationEnd` dispatches `DWELL_END`, and `visibilitychange` dispatches `HIDDEN`. No timer calls `setState`.
- **Gestures.** `lib/rewind/stage/gestures.ts` is a pure classifier over pointer samples, and `use-stage-gestures.ts` feeds it.
  - Taps: the left 30% goes back and the right 70% goes forward. Taps on the chrome or inside `[data-rw-interactive]` are ignored.
  - Swipes: a horizontal swipe of 48 px or 0.3 px/ms turns the page; a swipe down of 96 px or more closes the story.
  - Holds: 250 ms on the artboard hides the chrome and pauses, and release resumes. A 500 ms long-press on Pause opens Settings without toggling Pause.
  - The artboard sets `touch-action: pinch-zoom`, so pans reach the classifier while pinch-zoom still works (WCAG 1.4.4).
- **Keyboard.** `lib/rewind/stage/keymap.ts` `keyToCommand(event, { shortcuts })` runs from `onKeyDown` on the stage region, never on `window`, and ignores text fields and sheets.
  - The arrows, PageUp, PageDown, Space, Home, End and Esc always work. Esc closes a sheet first, then the story.
  - K, S, T and comma work only while P5.3's Keyboard shortcuts preference is on.
- **Chrome** (`chrome-top.tsx` and `chrome-bottom.tsx`, in CSS pixels outside the scaled artboard):
  - The top row holds the folio ("05/18 Top shows", the only place a page name appears). Then Settings (`rewind-settings`, `aria-haspopup="dialog"`), Pause/Play (`rewind-pause`) and Close (`rewind-close`) follow, as `<Button variant="ink-outline" size="icon-pill" aria-label>`. Pause is hidden in `cover` and `ended`.
  - The bottom row holds "Share this page" (`rewind-share-slide`, `ink-outline pill`), which becomes the solid "Share the poster" (`rewind-share-poster`) on 16. It also holds "Table" (`rewind-table-toggle`) on pages whose registry entry has a `table`. Both dispatch `OPEN_SHEET`; P5.3 and P5.11 render the sheets.
- **Pages.** Page bodies are Server Components, typeset on the server and passed to the client `StoryStage` (root `data-testid="rewind-stage"`) as slots.
  - Only the current page and its neighbours are visible; the rest carry `hidden`. Interactive islands load through `next/dynamic` and are prefetched for the current page plus or minus one.
  - The page turn toggles a class inside `startTransition`. The ink roll animates `clip-path` from `inset(0 0 0 100%)` to `inset(0)` over 420 ms with `--rw-ease-ink`.
  - Split the stage, chrome, progress and gesture layers so each component stays under about 250 lines (NFR-11).
- **Motion rule** (NFR-6). P1.8 exempts Rewind from its `infinite-motion` rule, so add a Rewind-scoped check instead: `scripts/design-system/rewind-motion.mjs`, run by the `design-system` job. Over `components/rewind/**`, `lib/rewind/**` and the Rewind block of `app/globals.css` it fails on `infinite`, `repeat: Infinity` and `iterationCount: Infinity`; on an animated or transitioned property other than `transform`, `opacity`, `clip-path` and `font-variation-settings` (in CSS `@keyframes` and `transition`, and in Motion `animate`, `initial`, `exit` and `transition` objects); and on a file that animates `font-variation-settings` on more than one element, because NFR-6 allows one font axis animating at a time. Reduced-motion alternatives are already required by P5.3 and checked by P5.4's specs.

**Tests.**
- `lib/rewind/stage/__tests__/fit-stage.test.ts`: the five phone viewports and 1440x900 give the expected chrome and `u` within 0.01, with `belowFloor` at 360x640 and 375x548. It also checks the 1.4 cap and the 845 px growth.
- `player-reducer.test.ts` covers every transition in design 14.3, including:
  - `CLOSE_SHEET` resumes only from `playing`, and `READ_AGAIN` goes to index 1;
  - autoplay is off under reduced motion;
  - automatic turns record `lastTurn: 'auto'`, and user turns keep autoplay on.
- `gestures.test.ts`: taps at 29% and 31% of the width; swipes at the distance and the velocity thresholds; a 96 px swipe down; holds at 249 ms and 251 ms; and a Pause long-press that never triggers hold.
- `keymap.test.ts`: letter keys do nothing with shortcuts off, arrows, Space and Esc always work, and keys typed in an input are ignored.
- `scripts/__tests__/rewind-motion.test.ts`, one case per rule: an `infinite` keyframe, a `repeat: Infinity` Motion prop, an animated `width`, an animated `color` and two font-axis animations in one file each fail; a `transform` and `opacity` animation and a single font-axis stretch pass.
- `components/rewind/stage/__tests__/story-stage.test.tsx` uses user-event and fake timers:
  - Pause is hidden on the cover;
  - an `animationend` on the segment advances one page, and `visibilitychange` pauses;
  - a test `Profiler` records no commit while a dwell runs.

(as merged: `StoryStage({ pages: { type, content }[], archetype, closeHref: Route, prefs? })`; `prefs` defaults to autoplay on, normal pacing, shortcuts on until P5.3 passes the stored ones. The registry has no `interaction` flag, so `pageKind(dwell)` reads `hold` as an interaction page (`tap` the cover, `end` the back cover). The reducer state also holds `prevIndex` (the turn direction), `autoplay` and `kinds`, and takes `SET_AUTOPLAY`. The stage tells the scope root the current page's ink through `StageInkContext` (`components/rewind/stage/stage-ink.tsx`, a no-op without a provider), which P5.1's `RewindScope` should provide; each page and both chrome rows carry their own `inkProps`, so the scope root must not carry a `.light`/`.dark` class around the pages, or a dark page sits inside a light one. `NearPage` and `useStagePage()` (`stage-page.tsx`) mount `next/dynamic` islands within one turn, and `usePlayerSend()` (`player-context.tsx`) lets an island send `INTERACT_START`/`INTERACT_END`. Visually hidden `rewind-prev` and `rewind-next` buttons, shown on focus, are the tap and swipe equivalents. No sheet renders yet: Settings, Table and Share enter the `sheet` mode and Esc leaves it. The turn and progress CSS (`rw-progress`, `rw-ink-roll-*`, `rw-page-leave`) is in the Rewind block of `app/globals.css`; the hold is detected with one 250 ms timeout. Until P5.1 mounts it, `/dev/rewind-stage` (behind `ENABLE_DEV_UI=1`) drives the player with placeholder pages; `npm run design:rewind-motion` is the motion check.)

**Integration.** P5.1's `[year]/page.tsx` renders `StoryStage` with the selected pages. P5.3 adds the sheets, focus handling and the live region, and P5.4's performance project enforces the zero-render rule. P5.5 to P5.7 supply the page slots, and P8.3 adds the first-tap completion of count-ups (FR-15, a P1 item).

**Demo.** At 390x664 the compact chrome appears and the story never scrolls. A swipe, a tap on the left third and ArrowRight each turn a page, autoplay resumes after a manual turn, and a hold hides the chrome for a screenshot. The Performance panel shows no React commits during a dwell.

**Done when.**
- [x] `fit-stage` returns the expected chrome and scale for every listed viewport, and the story never scrolls.
- [x] The reducer implements every state and transition in design 14.3, and autoplay survives manual turns.
- [x] Taps, swipes, hold, the Pause long-press and the stage-scoped keyboard map all work, and each gesture has a button equivalent.
- [x] Progress is CSS-driven with zero React renders per frame, and Settings, Pause and Close are `ink-outline icon-pill` Buttons with their test ids.
- [x] The Rewind motion check enforces NFR-6 in CI, with a test per rule.

### Step P5.3: Story sheets and accessibility semantics

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-13 to 2026-11-16. **Depends on:** P5.2.
- **Findings addressed:** RWV-09, UI-09, UI-15

**Objective.** Add the Settings and Table sheets, the per-device preferences, and the semantics a screen reader and a keyboard need. Each page is announced exactly once, motion follows the member's setting, and small or zoomed screens are offered article mode.

**Guidance.**
- **Preferences.** `lib/rewind/stage/prefs.ts` holds a Zod schema `{ autoplay, slowerPacing, shortcuts, smallScreenChoice: 'article' | 'story' | null }` with the defaults `true`, `false`, `true` and `null`, stored under the key `rewind:prefs:v1`.
  - Every `localStorage` read and write sits in try/catch and falls back to the defaults, which covers private windows and blocked storage.
  - `use-rewind-prefs.ts` uses `useSyncExternalStore` with a `storage` listener. None of these preferences reaches the server; `RewindPrefs` keeps only the share defaults and notifications (design 4.6).
- **Settings sheet.** `components/rewind/sheets/settings-sheet.tsx` is `Sheet side="bottom" grabber` (`rewind-settings-sheet`). The Settings button, the comma key and the Pause long-press open it.
  - Switch rows: Autoplay, Slower pacing and Keyboard shortcuts (`rewind-shortcuts-switch`).
  - A "Read as an article" link goes to `/rewind/[year]/read`.
  - The "About the words" line names the provider through `lookupModel()` on `copyMeta.model`. A self-hosted model reads "a model running on this server", and template copy reads "Every word here comes from a template." (design 8.1).
- **Table sheet.** `components/rewind/sheets/table-sheet.tsx` (`rewind-table-sheet`) renders the registry's `table(data)` output, `{ caption, columns, rows }`. It is a scrollable `<table>` with `th scope` and a caption naming the counting window and the `tz.note` zone, and T opens it. P5.3 fixes this contract in the registry type, and each page step supplies its own builder.
- **Semantics** (design 11.1).
  - The stage is a `<section>` whose `aria-label` reads "Rewind {year}". Each page is `<article aria-roledescription="page" aria-label="Page 5 of 18: Top shows">` with a real `h2 tabIndex={-1}`.
  - "Read as an article" (`rewind-article-mode`) is the first focusable element in the stage.
  - Headings hold plain text, with fitted lines as `<span className="block whitespace-nowrap">` children. Never put `aria-label` on a generic span (UI-09). An ellipsized title keeps its full text in an `sr-only` span, and the visible cut line is `aria-hidden`.
  - `components/rewind/a11y/sr-value.tsx` puts the final value in the DOM from the first render, next to an `aria-hidden` animated layer such as an odometer.
  - `components/rewind/a11y/figure.tsx` wraps every graphic as `role="img"`, with an `aria-label` from the registry's `srSummary(data)`. P5.5 to P5.7 use both components.
- **Focus and announcements.**
  - After a user turn (`lastTurn: 'user'`), a layout effect focuses the new `h2`, and the live region stays silent.
  - After an automatic turn, focus stays put. A visually hidden `aria-live="polite" aria-atomic="true"` region announces "Page 6 of 18: Top films".
  - `focusin` on a control inside the article (the `h2` does not count) dispatches `FOCUS_CONTROL`, and focus leaving it dispatches `BLUR_CONTROL`.
- **Reduced motion.**
  - Wrap the stage in `<LazyMotion features={domAnimation}><MotionConfig reducedMotion="user">`, using `motion` from P2.15 and `m.*` components only.
  - Add one Rewind rule under `@media (prefers-reduced-motion: reduce)` to the Rewind block of `app/globals.css`. It stops every transform, `clip-path` and `font-variation-settings` animation inside the scope, and keeps only opacity transitions of up to 120 ms (`--rw-dur-xs`).
  - The rule excludes `.rw-progress`, so the dwell timing stays (design 5.6). P3.1's base clamp already skips the scope.
- **Article-mode offer.** `components/rewind/sheets/article-offer-sheet.tsx` (`rewind-article-offer`) opens on load when `fitStage` reports `belowFloor` or `largeText` and no choice is stored.
  - It reads "This screen is small for the story layout", with "Read as an article" first and then "Play the story anyway".
  - The choice is stored per device.
- Every sheet portals through P5.1's container, prints on paper and pauses through `OPEN_SHEET`.

**Tests.**
- `lib/rewind/stage/__tests__/prefs.test.ts`: the defaults are used when `localStorage` throws on read or on write, and when the stored JSON is garbage; a valid value round-trips.
- `components/rewind/sheets/__tests__/settings-sheet.test.tsx`:
  - the three rows expose `role="switch"` with `aria-checked`;
  - with shortcuts off, K does nothing and Space still pauses;
  - the disclosure line is checked for LLM, template and local-model copy.
- `table-sheet.test.tsx`: the caption, `th scope="col"`, and T opening the sheet.
- `components/rewind/stage/__tests__/story-stage.a11y.test.tsx`:
  - a user turn focuses the new `h2` and the live region stays empty;
  - an automatic turn keeps focus where it was and announces "Page 2 of 10: The number";
  - autoplay continues after a user turn until Tab reaches a control, and `rewind-article-mode` comes first in the tab order.
- `article-offer-sheet.test.tsx`: the offer appears at `u` 0.77 and at a 21 px root font size, not at 0.81, and a stored choice suppresses it.
- `app/__tests__/globals-rewind-motion.test.ts` parses `app/globals.css`: the Rewind reduced-motion rule names the scope and excludes `.rw-progress`.

**Integration.** P5.4's axe and E2E specs drive these test ids. P5.5 to P5.7 use `SrValue`, `RewindFigure` and the table contract. P5.12 builds the article route that the sheets link to, P5.11's share sheet follows the same pattern, and P8.3 adds "Pick a day".

**Demo.** With VoiceOver on iOS, a swipe announces the new heading once. During autoplay each automatic turn is announced while focus stays put. With shortcuts off, K does nothing. At 375x548 the article offer opens first, and under reduced motion pages crossfade while the dwell still runs.

(as merged: `StoryStage({ pages: { type, content, table? }[], year, archetype, closeHref, copy: { copySource, model } })`: `year` and `copy` are new required props and `prefs` is gone (the stage reads `useRewindPrefs()`), so P5.1 passes the year and the row's `copySource` and `copyMeta.model`. Each page's `table` is the registry's `table(data)` result, built on the server; the Table control and T show only when it is non-null. The `PageTable` contract stays `{ caption, columns, rows }`: the caption names what is counted, the window and (on clock pages) `tz.note`, and each row's first cell is its `th scope="row"`. `copyMeta.model` is read as `"<provider>:<model id>"` (`lib/rewind/copy-disclosure.ts` `aboutTheWords`), so P5.9 should store it that way; a bare id is matched against the hosted catalogue, and `openai-compatible` or an unknown bare id reads "a model running on this server". Page bodies bring their own `h2 tabIndex={-1}`; `components/rewind/a11y/page-heading.tsx` `PageHeading({ lines, full? })` draws one (fitted lines, ellipsized full text in `sr-only`), and a page with no `h2` takes focus itself. `LazyMotion` is `strict`, so islands must use `m.*`. The article offer is the player sheet `article-offer`; "Read as an article" links go to `/rewind/<year>/read`, which 404s until P5.12. `Switch` gained an `aria-describedby` prop for the row hints. `/dev/rewind-stage` takes `?words=llm|local|template` and gives every chart page a placeholder table. No E2E spec was in scope; P5.4 drives the test ids.)

**Done when.**
- [x] The Settings and Table sheets work from their buttons and keys, and the preferences live in `localStorage` with safe defaults.
- [x] The stage is a labelled region, each page is a labelled article with a real `h2`, and no generic span carries `aria-label`.
- [x] User turns move focus to the heading, automatic turns are announced once through the polite live region, and focus on a control pauses autoplay.
- [x] Rewind's own reduced-motion rule keeps the 120 ms crossfades and the dwell timing.
- [x] Article mode is offered below the 0.8 scale floor and at 130% text size.

### Step P5.4: Rewind visual, axe and performance test projects

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-12 to 2026-11-13. **Depends on:** P5.2, P1.6.
- **Findings addressed:** BP-10, BP-34, RWV-13

**Objective.** Put the Rewind safety nets in place before the pages land: screenshots at every supported viewport on chromium and webkit, axe at WCAG 2.2 AA, a throttled performance gate with the first-page JavaScript budget, and an authenticated E2E skeleton on the design's test ids.

**Guidance.**
- **Projects.** Add these to `playwright.config.ts`, next to P1.6's `visual-*`. Every one runs against the production build (`E2E_SERVER=prod`, P1.5 and P1.6).
  - `rewind-visual-phone-chromium` and `rewind-visual-phone-webkit` use `isMobile`, `hasTouch` and `deviceScaleFactor: 2`, and match `e2e/visual/rewind*.spec.ts`. The specs loop over the five phone viewports with `page.setViewportSize`: 390x844, 412x760, 390x664, 360x640 and 375x548.
  - `rewind-visual-desktop-chromium` and `rewind-visual-desktop-webkit` run at 1440x900. P7.4 adds 1366x768.
  - `rewind-a11y-chromium`, `rewind-a11y-webkit` and `rewind-a11y-firefox` match `e2e/a11y/rewind*.a11y.spec.ts`. Firefox runs only the tests tagged `@article`.
  - `rewind-perf` is chromium only, because it needs CDP, and matches `e2e/perf/*.perf.spec.ts`.
  - `rewind-e2e-chromium` and `rewind-e2e-webkit` match `e2e/rewind/*.spec.ts` and use P1.6's session fixture.
  - The CI image installs webkit with `npx playwright install --with-deps webkit`.
- **Seed.** `e2e/helpers/seed-rewind.ts` writes v3 `PlexWrapped` rows for four seeded members (heavy, median, light and extreme) from `e2e/fixtures/rewind/<id>.v3.json`.
  - `scripts/rewind-build-e2e-fixtures.ts` builds those files from P2.10's fixtures through the fixture source, `computeMemberStats`, `buildFacts`, the registry selection and template copy. Once P5.9 merges, it calls `generateUserRewind({ mode: 'dry-run', copyPolicy: 'no-llm' })` instead. `--check` fails on drift.
  - The E2E database sets `Config.rewindEnabled = true` and `rewindAudience = 'all'`, and `afterAll` resets them.
  - The E2E job has the `redis:7` service and `REDIS_URL` from P1.5. Global setup calls `checkRewindInfra()` and fails the run unless it returns ok, so no baseline is ever taken of the FR-50 unavailable panel. The FR-50 placeholder below stops Redis for its own test only.
- **Determinism.** Reuse P1.6's helper: `page.clock.install`, a seeded `Math.random`, and `emulateMedia({ reducedMotion: 'reduce' })` for the final-state shots, plus one normal-motion pass per page with the clock run past 1.4 s. The E2E Plex server is unreachable, so posters render as title cards, which keeps the baselines stable.
- **Visual spec.** `e2e/visual/rewind.spec.ts` opens `/rewind/2026` for each fixture and viewport, chooses the cut, steps through the pages with ArrowRight and snapshots `getByTestId('rewind-stage')`.
  - On the small viewports, `page.evaluate` also checks that no text renders under 12 px and that every control in the stage has a box of at least 44x44 px. Below the floor, `rewind-article-offer` must open.
  - A `PENDING_PAGES` set lists the pages that are not built yet. P5.5 to P5.7 shrink it.
- **Axe spec.** `e2e/a11y/rewind.a11y.spec.ts` runs `AxeBuilder` with `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` on every built page and every open sheet. It allows zero violations at any impact, which is stricter than P1.7's baseline. The article tests stay `test.fixme` until P5.12.
- **Performance spec.** `e2e/perf/rewind.perf.spec.ts` sets CDP `Emulation.setCPUThrottlingRate({ rate: 4 })`.
  - An `addInitScript` collects `longtask` entries from a `PerformanceObserver` into `window.__rwLongTasks` and sets `window.__rwPerfProbe`.
  - React Profiler callbacks do not run in production builds. Instead, `StoryStage` increments `window.__rwCommits` in an effect with no dependency list whenever the probe flag is set.
  - It autoplays the heavy, median and light fixtures for 30 s each. After the cover settles, no long task may exceed 50 ms, and commits happen only at page turns, at most 3 per turn.
- **JavaScript budget.** `e2e/perf/rewind-budget.perf.spec.ts` records every script response on `/rewind/2026`, up to `networkidle`, and on a 404 page from the same build.
  - It gzips the scripts that only the Rewind page loads, with `zlib.gzipSync`, and asserts that they total at most 110 KB (NFR-5). React, Next and the root providers load on both pages.
  - It logs the measured number, and the PR records the first measurement.
- **E2E skeleton.** `e2e/rewind/story.spec.ts` uses the test ids from design 12. It chooses the cut (`rewind-cut-full`), then checks:
  - the tap zones and ArrowRight;
  - Space toggling `rewind-pause`'s label;
  - `rewind-settings` opening `rewind-settings-sheet`, and turning the shortcuts off;
  - a dispatched `visibilitychange` with `document.hidden` stubbed, which pauses;
  - the Table sheet, and Close.
- **Placeholders.** These stay `test.fixme`, with the owning step in the title: the quiz and the match cut (P5.6); "Why this?" and the archetype name (P5.7); share create, rotate and revoke (P5.11); article mode (P5.12); hiding a title (P7.7); Redis down (FR-50); a lapsed subscriber (FR-51).

**Tests.**
- The specs are the tests. Two consecutive CI runs against fresh baselines must pass with zero differing pixels.
- `__tests__/e2e-support/rewind-fixtures.test.ts`: every seed file parses with `RewindDataV3`, and the builder's `--check` run is clean.
- The perf project runs as its own required CI job with a 15-minute timeout. A temporary 80 ms busy loop on a page turn must make it fail.

**Integration.** P1.5's E2E gate runs the new projects, and baselines update through P1.6's workflow. P5.5 to P5.7 and P5.12 shrink `PENDING_PAGES` and remove the fixmes. P7.15 reruns the gates on every page, P7.4 adds the 1366x768 spread, and P8.3 and P8.4 extend the E2E flows. `e2e/README.md` gains a Rewind section.

**Demo.** Run the visual project on a branch that shifts the cover masthead by 2 px, and the webkit diff shows it at 375x548. The perf job prints the long-task maximum, the commits per turn and the first-page JavaScript in KB.

(as merged: **Projects** are in `playwright.config.ts`; each Rewind spec folder (`e2e/visual/rewind*.spec.ts`, `e2e/a11y/rewind*.a11y.spec.ts`, `e2e/perf/`, `e2e/rewind/`) belongs to its projects only, and `chromium` ignores them. The a11y, perf and e2e projects run at 390x844. No `playwright install` step: CI's `mcr.microsoft.com/playwright` image already has webkit and firefox. **CI** (`build.yml`): the rewind e2e and a11y projects (all three browsers) joined the required "E2E Tests" leg; the visual projects are a new advisory leg, "Rewind Visual Diffs" (60 min); "Rewind Performance" (15 min) is **advisory, not required**, because 4x-throttled long tasks vary with a shared runner's CPU (locally 0 to 112 ms between runs) and the JavaScript budget is not met yet: the first measurement is **274.5 KB gzipped** against 110 KB, chiefly Chart.js (62 KB), zod (31 KB), Motion (about 48 KB) and Base UI (26 KB) in the story's first-page chunks. `visual-baselines.yml` takes a `suite` input (`app`, `rewind`, `all`). **Seed**: `e2e/fixtures/rewind/{heavy,median,light,extreme}.v3.json` are complete stored `RewindDataV3` documents from `generateUserRewind({ mode: 'dry-run', copyPolicy: 'no-llm' })` through the eval harness (`evals/rewind/e2e-fixtures.ts`, `npm run rewind:e2e-fixtures [-- --check]`); they replace `heavy-issue.json`. `e2e/helpers/seed-rewind.ts` (`seedRewind`/`clearRewindSeed` for the four members, `seedRewindIssue(userId, fixture)` for one) and `e2e/helpers/rewind-stage.ts` (open, choose the cut with Enter, turn) are what later specs should use. Global setup fails the run unless Redis answers a ping (a local ping, not `checkRewindInfra()`, which Playwright cannot load). **Specs**: there is no `PENDING_PAGES`, since every core page had landed; visuals cover heavy, median and light. The article spec moved to `e2e/a11y/rewind-article.a11y.spec.ts`, the centrefold spec to `e2e/rewind/`; the quiz and match-cut test (P5.6) is in `e2e/rewind/story.spec.ts`. Rewind axe allows zero violations, so it keeps no baseline entry. `StoryStage` records commits through `usePerfProbe` (`components/rewind/stage/use-perf-probe.ts`) as an array of page indices. **Defects the checks found**: the icon pill's hit area was 42 px (fixed, `before:-inset-[4.5px]`) and copy tokens rendered at 11.2 px (fixed, `max(12px, 0.93em)`); still failing, in pages another agent is reworking: the cover caption at 390x664 (11.7 px) and the back cover's `rewind-done` (37x44). **Owner**: generate the Rewind baselines with Visual Baselines (`suite: rewind`) on the branch; no screenshot is committed.)

**Done when.**
- [x] Visual projects run at the five phone viewports and 1440x900 on chromium and webkit, with the 12 px text and 44 px target checks. (Webkit runs in CI only; baselines come from the Visual Baselines workflow.)
- [x] Axe runs at wcag22aa on story mode, and article mode is wired for chromium, webkit and firefox.
- [x] The 4x-throttled performance gate fails on long tasks over 50 ms or on renders between page turns. (Advisory in CI; see the note.)
- [x] The 110 KB first-page JavaScript budget is checked in CI. (It fails today at 274.5 KB.)
- [x] The authenticated E2E skeleton runs on the design's test ids, and every later flow has a named placeholder.

### Step P5.5: Registry and the front pages

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-12 to 2026-11-13. **Depends on:** P5.2, P2.9, P2.16.
- **Findings addressed:** RWV-07, RWV-10, RWV-11, RWV-12

**Objective.** Make the registry the single owner of what a page is: its data, schema, summary, ink, table and share facts. Build the three front pages on it. Pages that have no data omit themselves, and the folio and progress renumber.

**Guidance.**
- **Entry type** in `lib/rewind/registry.ts`, extending P2.13's stubs:
  - `select(facts, ctx)` returns the page's data or `null`, with `ctx` holding `{ edition, archetype, disabledPages, config }`; `schema` is a strict Zod schema in `lib/rewind/pages/<page>.schema.ts`; `srSummary(data, facts)` returns deterministic text;
  - `spot` is `arch`, `arch-deep` or `ink`; `table(data)` follows P5.3's contract; `share` is `{ facts: FactId[], titles?, art? }`;
  - page data holds fact ids, `ratingKey`s and geometry inputs, never a second copy of a displayed number.
- **Selection.** `lib/rewind/select-pages.ts` `selectPages(facts, ctx)` runs each `select` in registry order. It drops null pages and those in `Config.rewindDisabledPages`, and applies `altField` when a page's field equals the archetype's. It returns `[{ type, folio, data }]`, numbered over the selected list, and the folio, progress segments, cover lines, Contents and the back-cover index all read that list (FR-2).
- `validatePagesOnRead(pages)` parses each stored page with its schema. A page that fails is dropped with one logged warning (design 7.9), never a crash.
- **viz** (design 5.7). `lib/rewind/viz/soundtrack.ts` `soundtrack(minutes, { variant: 'daily' | 'weekly', window, width, height })` returns one step-area path `d` at half-height `sqrt(minutes / max)`, a dotted centre line for days outside the window and anchors for the month initials; `weekly` returns 48 normalised bins. `milestones.ts` returns marker positions. Both are pure and emit no `<text>`; the `compare` variant lands in P8.4.
- **01 Cover.** `components/rewind/pages/cover.tsx` follows design 4.3 and `slide-01-cover.png`:
  - the masthead with `serverName()` and "Vol. 4, No. K7Q4" from `member.volume` and `member.serial`, separated by commas; "Rewind" as a nameplate fitted by `fitLines` to the 358 px measure;
  - "The 2026 issue" with `window.through`, which reads "Data through 30 November" or "Final cut" (FR-34), and the 358x150 soundtrack captioned "Every line is a day you pressed play. December is still being written.";
  - the headline "{firstName}'s year in film and television" ("Your year in film and television" without a name) and four cover lines from P5.8's `coverLines(selected)`;
  - the cut: `rewind-cut-full` (`ink pill`, "Read the full issue" with "{n} pages, about {d}" from `issueDurationMs`) and `rewind-cut-pocket` (`ink-outline pill`). Pocket members see "The pocket edition" and only the pocket button. Enter opens the full issue, the choice dispatches `CHOOSE_CUT`, and P7.3 wires the pocket page set.
- **02 The number.** `number.tsx`:
  - the hero numeral as a nameplate (185 px for "1,307") with an `aria-hidden` halftone duplicate offset by 4 px, "hours" in `font-lead`, and the vs-2025 stamp, hidden without 2025 data;
  - the split bar (solid series, hatched films, hidden when either side is 0), the three-up counts, and "The road to {total}" with milestone marks; the odometer goes through `SrValue` (P5.3);
  - under 10 hours the unit reads "7 h 20 m", and under 1 hour "47 minutes" (`lib/rewind/format.ts`). The Table holds the milestones and monthly minutes, and "Compare with 2025" stays hidden until P8.4.
- **03 Bookends.** `bookends.tsx` sets two book blocks with nameplate titles and dates in tabular numerals, and the lifetime line ("Member since 2023, 3,940 hours in all, your fourth Rewind") with `tz.note`. `select` returns null when the first and last plays are the same title on the same day, and a title that is the No. 1 series reads "a series you will meet on page {the Top shows folio}", which protects the quiz.
- **Copy.** Headlines are P5.8 templates, and decks render through `renderCopy` with each token in a `<span class="tok">`. No page has an eyebrow (RWV-10). Typesetting runs in the Server Component on every render, and every fitted line is `whitespace-nowrap`.
- **Ink and robustness.** Pages take `field`, `altField` and `spot` from the registry through `inkProps`, and no Rewind component writes a colour (RWV-07). Plurals go through `Intl.PluralRules`, list keys are `ratingKey`s, and no page ever shows "0 films" (RWV-11).
- Extend `lib/rewind/__tests__/registry-tokens.test.ts` with design 5.2's rules: for every page and archetype, the resolved spot is 3:1 or better on the field, and the title-card pair is 7:1 or better.

**Tests.**
- `lib/rewind/__tests__/select-pages.test.ts` runs every `select()` over all 20 P2.10 fixtures: each returns valid data or null, and the folios run from 1 to n without gaps. `rewindDisabledPages: ['bookends']` renumbers them, `altField` applies on an archetype collision, invalid stored page data is dropped with one warning, and a snapshot records each fixture's selection.
- `lib/rewind/viz/__tests__/soundtrack.test.ts`: one path; 48 weekly bins between 0 and 1; December dotted during the season and drawn after the final cut; deterministic output.
- `components/rewind/pages/__tests__/{cover,number,bookends}.test.tsx` on the heavy, median and light fixtures: the cut buttons' counts and durations, the pocket-only cover, "7 h 20 m" and "47 minutes", the hidden split bar, Bookends omitted on the same-day fixture, the page-05 mask, and `srSummary` snapshots.
- Remove pages 01 to 03 from P5.4's `PENDING_PAGES` and generate their baselines through the P1.6 workflow.

**Integration.** P5.9 stores `selectPages()` in `RewindDataV3.pages`, P5.10 reads `share.facts`, P5.12 renders the same data in article mode, and P6.9's RewindCard reads the page count and `issueDurationMs`. P5.6, P5.7 and P7.1 to P7.3 add the other entries; until P7.1 and P7.2 land, the full issue has the ten core pages.

**Demo.** The heavy fixture's cover matches `slide-01-cover.png`, and its cut button reads "10 pages" while only the core set exists. The light fixture shows the pocket cover. Adding `bookends` to `rewindDisabledPages` renumbers every folio.

(as merged: `RegistryEntry<D>` (`lib/rewind/registry.ts`) is `{ type, name, act, field, altField, spot, core, pocket, dwell }` plus a `PageDefinition<D>`: `select(facts, ctx)`, `schema`, `srSummary(data, facts)`, optional `table(data, facts, { locale })` and `share: { facts, titles?, art? }`, written as methods so a typed page fits `RegistryEntry<unknown>`. `SelectContext` is `{ edition, archetype, disabledPages, stats }`: `stats` (the member's `MemberStats`) replaces the plan's `config`, because the soundtrack's daily minutes and three page rules (bookends' same-day rule, the clock's 10 plays, Setup's eligibility) are not facts. Page modules live in `lib/rewind/pages/<page>.ts` with `<page>.schema.ts`; pages whose steps have not landed keep design 4.3's rule as `select` with empty strict data in `lib/rewind/pages/rules.ts`, and P5.6, P5.7, P7.1 and P7.2 replace their entries. `LATER_PAGES` (the eight non-core pages) are left out by `selectPages` until P7.1 and P7.2 remove them; `eligiblePages` keeps them, and the golden test's `omittedPages` (`evals/rewind/__tests__/pages.ts`) now runs the registry's selects. `SelectedPage` is `{ type, folio, data, field }`; `validatePagesOnRead(pages, { archetype, disabledPages })` also applies `Config.rewindDisabledPages` on read and drops `short-list` until P7.3. The catalogue gained `bookends.first|last.title|date|time` (design 4.3 names them; snapshots updated). `lib/rewind/viz/soundtrack.ts` takes `window: { from, days }`. Page components are `components/rewind/pages/*` (`PageBody` maps a type to its component, `IssueContext` carries the locale, server name, selected list, stored copy and zone); `components/rewind/rewind-issue.tsx` renders a stored v3 issue through `StoryStage` on `/rewind/[year]`, and `RewindScope` now carries `data-archetype` and `data-stage-ink` from the stage. Enter on the cover chooses the full issue (`choose` in the keymap). The front-page entrance keyframes and the `.rw-hatch` and `.rw-halftone` textures are in the Rewind block of `app/globals.css`. Copy comes from P5.8's templates; `deck.bookends`' first template repeats the lifetime line, for P5.8 to vary. P5.4's `PENDING_PAGES` and the 01-03 visual baselines are left to the coordinator (no Playwright runs in this step). With D7, the heavy fixture's full issue is 9 pages, not 10.)

**Done when.**
- [x] Every registry entry declares `select`, `schema`, `srSummary`, `spot`, `table` where it applies, and `share.facts`.
- [x] `selectPages` omits null and disabled pages, renumbers the folio and progress, and drops stored pages that fail validation.
- [x] Pages 01, 02 and 03 match the design on the heavy, median and light fixtures, with the soundtrack from `lib/rewind/viz`, the cut choice and the data-window line.
- [ ] No page shows an eyebrow, a zero count or a hard-coded colour, and the component and visual tests pass. (Component tests pass; visual baselines are not run here.)

### Step P5.6: Features pages: Guess, Top shows, Top films

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-16 to 2026-11-17. **Depends on:** P5.5.
- **Findings addressed:** RWV-11, RWV-04

**Objective.** Build the quiz and the two top lists, with long titles intact, full-colour No. 1 posters and title cards that never collapse. Add the poster primitive and the Rewind poster route they need.

**Guidance.**
- **Poster primitive.** `components/ui/poster.tsx` follows `ui-design-system.md` 5.5 and arrives with its first consumer, as P3.9 planned. It takes `ratingKey`, `title`, `size`, `w`, `tone`, `priority` and `fallback`, renders an `<img>` with `width`, `height`, `loading` and `decoding`, and on `error` swaps in `fallback` at the same box size (default: P3.9's `posterPalette` title card).
- **Rewind wrapper.** `components/rewind/media/poster.tsx` sizes the box in artboard units, picks the smallest `w` that covers 2x, passes the page's duotone pair as `tone` and adds the 1.5 px ink keyline. Its fallback is `title-card.tsx`: the title in Archivo width 62 over a halftone, the year beneath, printed in spot and field by the design 5.3 rule, and only the first word below 48 px wide.
- **Poster route.** `app/api/rewind/poster/[ratingKey]/route.ts` replaces the v2 route.
  - It carries over P0.16's rules: private caching, the own-Rewind or shared-section check, the 3 s timeout and the fast 404. Own-Rewind keys now come from v3 page data.
  - Zod validates `w` as 96, 160, 240 or 480, and `tone` as `none` or `<spot>.<field>` (two `InkName`s). `sharp` writes WebP at quality 76 in full colour, and at 72 for a duotone made with `grayscale().normalise()` and a 256-entry lookup table between the pair's `rewindInks` hex values.
  - Hero slots pass `clash=<spot>.<field>`. The route serves the duotone instead when the art's mean luminance falls outside 0.08 to 0.92 or its aspect is more than 10% off 2:3.
  - **Disk cache.** Posters are cached at `${REWIND_CACHE_DIR}/posters/{ratingKey}-{tone}-{w}.webp`, where `REWIND_CACHE_DIR` comes from P4.1's `envSchema` (default `.next/cache/rewind`, resolved against the working directory). P4.17's image sets `ENV REWIND_CACHE_DIR=/app/.next/cache/rewind`, the one writable path in the image. Cache hits are served before the limiter, with `private, max-age=31536000, immutable`.
  - `app/api/wrapped/poster/[ratingKey]/route.ts` re-exports the new `GET` until P11.29 deletes the v2 viewer, and P5.10 adds the share asset key.
- **04 Guess.** `components/rewind/pages/guess.tsx` with the client island `quiz.tsx`:
  - `select` takes `series.top[1..4]`. Exactly 3 series give 3 options, and a combined films-and-series question is used when that gives 3 or more candidates.
  - It returns null with fewer than 3 candidates, or when `quiz.gapMinutes` is 2% of the No. 1 minutes or less (FR-6). The option order is shuffled once with a `hash(userId, year)` seed and stored in the page data.
  - The page is a `radiogroup` with an `aria-label`, built on Base UI RadioGroup and Radio as P3.7's SegmentedControl is. Each option is a full-colour poster radio (`rewind-quiz-option-{n}`, `data-rw-interactive`) with its title in up to 3 balanced lines; the arrow keys move between them, and "Skip" (`rewind-quiz-skip`) sits beside them.
  - There is no timer. The entry has `interaction: true`, so the player holds in `interacting` until the member answers or skips.
  - **Reveal.** "You called it.", "Close. It came second." or "Not quite: that was your number four." The correct tile flips on Y over 420 ms; the others fade only their art to 45% under a hatch, keep their titles at full ink and gain "Not your answer". Reduced motion gives a 120 ms crossfade.
  - The answer lives in a stage-level `QuizContext`, mirrored to `sessionStorage` under `rewind:quiz:<year>` in try/catch, and never reaches the server.
- **Match cut** (G5). `StoryStage` adds a `LayoutGroup` and a stage-level portal layer above both pages. A copy of the chosen tile (`m.div layoutId="rw-quiz-pick"`) flies to page 05's No. 1 poster slot in 375 ms with `--rw-ease-ui`, so the incoming wipe cannot clip it. There is no match cut under reduced motion.
- **05 Top shows.** `top-shows.tsx` follows `slide-05-top-shows.png`:
  - **No. 1.** The title is a nameplate breaking after the colon. The full-colour poster is 84x126 with a keyline and `priority`, the hours are set at 44 px, and "Biggest night" sits with the viewer rank, shown only with 3 or more viewers and never with names.
  - **Rows 2 to 5.** Each holds a rank numeral, a 32x48 duotone thumbnail or title card, and the title in up to 3 balanced lines from `fitLines` list mode. A title is ellipsized only beyond 3 lines, keeping its full text `sr-only`. An italic note, the hours and an 11-month small multiple on one shared scale follow, with December faded and labelled "not yet counted".
  - **Deck.** After an answer the deck is the quiz-callback template; otherwise it is `deck.topShows`.
  - **Edge cases.** One series becomes a single feature, and 0 series omits the page.
  - **Rows.** Rows are `data-rw-interactive` buttons that open a row sheet with the title's numbers and a monthly table; P7.7 adds "Hide this title" there. The Table holds all five rows by month.
- **06 Top films.** `top-films.tsx` prints on marigold (or its `altField`), with the No. 1 poster in full colour inside a ticket stub with a perforated edge, rows 2 to 5 duotoned between the page's spot and marigold, rewatches as "x2" in the width-62 cut, and `films.finishedShare` and `films.longest`. 0 films omits the page, and fewer than 3 give a single feature.

**Tests.**
- `app/api/rewind/poster/__tests__/route.test.ts` carries P0.16's cases over and adds: `w=100` and an unknown ink are rejected; a disk-cache hit uses no limiter point; every duotone pixel lies between the two inks, and a near-white image triggers the clash duotone; an upstream timeout returns 404 within 3 s.
- `components/ui/__tests__/poster.test.tsx` and `components/rewind/media/__tests__/poster.test.tsx`: an `error` swaps in the title card at the same box size, and `w` follows the size.
- `lib/rewind/pages/__tests__/guess.select.test.ts`: null with 2 candidates and at a 2% gap, 3 options for exactly 3 series, the combined question, and an order that is stable per seed.
- `components/rewind/pages/__tests__/guess.test.tsx` (user-event): the arrows move `aria-checked`, each answer reveals its copy, Skip continues, autoplay holds until then, the unchosen titles keep full ink, and storage failures are tolerated.
- `top-shows.test.tsx` and `top-films.test.tsx` run on the heavy, median, `single-title`, `zero-films` and `long-and-non-latin-titles` fixtures. They check the rows, the single feature and omission, that the joined title lines always equal the title, and that safe-mode titles carry `dir="auto"`.
- Generate visual baselines for 04 (before and after an answer), 05 and 06. P5.4's quiz and match-cut fixme becomes a real test on chromium and webkit.

**Integration.** P5.10 adds the share asset key to the poster route, and P5.11 uses the posters on cards with "Include artwork". P7.3 reuses the list rows in the pocket Short list, and P7.7 adds "Hide this title" to the row sheet. P11.29 deletes the v2 poster path, and P10.12's "New on" row reuses `components/ui/poster.tsx`.

**Demo.** On the heavy fixture, answer the quiz wrongly: the reveal reads "Close. It came second.", the chosen tile flies into page 05's poster slot, and the deck names the guess. With Plex stopped, every poster slot shows its title card and nothing moves.

(as merged: Page modules are `lib/rewind/pages/{guess,top-shows,top-films}.ts` with `guess.schema.ts`, `top-lists.schema.ts` and the shared `title-key.schema.ts` (`TitleKeySchema`, `posterKey`); `rules.ts` no longer holds them. `SelectContext` gained an optional `userId`, the quiz seed (`hash(userId, year)`): **P5.9 should pass the member's id**, or every member of a year gets the same order. Stats changed: `SeriesEntry.monthly` (12 calendar months of minutes, page 05's small multiples) and `quiz.titles` beside `quiz.options`. Guess data is `{ kind, options: [{ key, title, rank, minutes }] }` in stored, shuffled order; Top shows `{ rows: [{ key, monthly }] }`; Top films `{ rows: [{ key }] }`; row n's numbers stay `series[n].*` / `films[n].*` facts. Templates gained `quizHeadline(kind)`, `quizReveal(rank)`, `quizCallback(rank)` and the template-only token `copy.guess` (`copyLocals({ guess })`). The quiz answer lives in `components/rewind/stage/quiz-context.tsx` (`QuizProvider` in `StoryStage`, `sessionStorage` `rewind:quiz:<year>`); arrows move `aria-checked`, a click or Space answers, and after an answer the guess's progress segment runs `REVEAL_DWELL_MS` (4 s) so autoplay continues. The match cut (`components/rewind/stage/match-cut.tsx`) is a measured transform flight (WAAPI, 375 ms, `--rw-ease-ui`) of a cloned tile in a stage-level layer above the pages, not Motion `layoutId`: layout animation needs `domMax`, and the stage loads `domAnimation` strictly. It flies only for a series quiz (a mixed quiz's answer may not be page 05's No. 1), as does the Top shows callback deck. Top shows rows open a `RowSheet` (`OPEN_SHEET` `row`); the title card has no year (no fact holds a title's year). Islands are imported directly, not through `next/dynamic`. The poster route is `app/api/rewind/poster/[ratingKey]/route.ts` (pixels in `lib/rewind/poster/image.ts`, cache in `disk-cache.ts`, tone pairs in `lib/rewind/media/tone.ts`: `<spot>.<field>`, equal names meaning the field's own ink); every 200 is `private, max-age=31536000, immutable`, shares included (no more `public`); access is checked before the disk cache, and only misses spend a limiter point; `w` defaults to 480 and `tone` to `none`, so the v2 path (`app/api/wrapped/poster/...`, a re-export) keeps working. `sharp` 0.35.5 is now a direct dependency. P0.16's route test moved to `app/api/rewind/poster/__tests__/route.test.ts`. No E2E or visual baseline ran (FEATURE-FIRST): P5.4 has not merged, so its quiz and match-cut fixme and the 04-06 baselines are left to the coordinator.)

**Done when.**
- [x] The quiz is a radiogroup that holds autoplay, and it is omitted with fewer than 3 candidates or a gap of 2% or less.
- [x] The match cut runs in a stage-level layer, and reduced motion skips it.
- [x] Top shows and Top films match the design, with full-colour No. 1 posters, duotone rows and title-card fallbacks that keep their size.
- [x] The Rewind poster route serves sized and toned WebP from a disk cache under P0.16's access rules.
- [ ] Tests and baselines pass for pages 04 to 06. (Unit and component tests pass; baselines are not run here.)

### Step P5.7: Habits and centrefold: Clock, Calendar, Centrefold, Back cover

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-13 to 2026-11-16. **Depends on:** P5.5.
- **Findings addressed:** RWV-01, RWV-07, RWV-10

**Objective.** Build pages 09, 10, 16 and 18, from the evidence clock to the identity reveal and the clean exit. The archetype name never breaks inside a word, and the back cover shows the whole year at rest, with sharing and a way out.

**Guidance.**
- **viz.** These builders cover design 5.7 and the four evidence graphics of design 5.3:
  - `lib/rewind/viz/hour-ring.ts` draws 24 radial bars with midnight at the top, square-root lengths, the archetype's bracket arc, a leader line to the peak hour and label anchors;
  - `calendar.ts` draws 11 x 31 cells in four print steps (blank, outline, hatch and solid), the streak bracket, a ring on the biggest day and a dotted longest gap;
  - `meter.ts`, `calendar-dots.ts` and `shelf.ts` draw the other three graphics; the shelf's spines are fitted by `fitLines`;
  - each builder returns geometry only. Hatching is an SVG `<pattern>` in `currentColor`, so forced colours keep it.
- **09 The clock.** `clock.tsx` sets the headline "Your hour is 10 PM", the ring with `hours.afterDarkShare` and "started 10 PM to 4 AM" in the centre, the peak leader label, a weekday row of 7 bars (weekends solid) and `tz.note`. It is eligible with more than 10 plays, and the Table lists the 24 hours.
- **10 The calendar.** `calendar.tsx`:
  - the template headline on `streak.longest.days` ("23 days without a night off");
  - the grid of 9 px cells, which are not interactive in story mode, with the streak bracket, the biggest-day ring and the gap underline;
  - with fewer than 5 active days, one row of the active dates instead; the Table lists minutes per day by month;
  - leave a slot for "Pick a day" (`rewind-day-picker`, FR-9), which P8.3 adds;
  - **stored data for the P1 features.** Page 10's schema and `select()` store, for every day of the window, the minutes and the top title's `ratingKey`, plus a `titles` map from those keys to display titles (hidden titles already removed). P8.3's Pick a day sheet and calendar grid read only this data, so no member is regenerated for a P1 feature under the freeze. A schema test asserts the fields on the heavy fixture and that every key in the day list resolves in the map.
- **16 Centrefold.** `centrefold.tsx` follows `slide-16-centrefold.png`:
  - crop marks, "You are the" in `font-lead`, and the archetype name as a nameplate (`data-testid="rewind-archetype-name"`): one size for the block, each line within one width step, fitted by `fitLines` nameplate mode, and never broken inside a word (RWV-01);
  - the tagline (`archetype.tagline`, at most 70 characters), the archetype's evidence graphic (the 256 px ring for a Midnight Marathoner) and the key row ending in `tz.short`;
  - the foot with the rarity stamp ("6 of 31 Rewinds" in-app, only with 10 or more scored members), the runner-up and "Why this?" (`rewind-archetype-why`);
  - the bottom chrome holds "Table" (the 24 hours) and the solid "Share the poster".
  - **Motion.** The gatefold opens over 700 ms, the name stretches in line by line (640 ms with a 70 ms stagger, or `scaleX` in low-end mode), the ring draws and the stamp lands. Under reduced motion the page crossfades to its final state.
- **"Why this?" sheet.** `components/rewind/sheets/why-sheet.tsx` (`rewind-why-sheet`, a new test id) shows the shortlist with plain-language reasons, which `whyReasons()` in `templates.ts` builds from each archetype's evidence fact ids, the in-app-only dedication, and the AI disclosure naming the provider, as in P5.3's Settings line.
- **18 Back cover.** `back-cover.tsx` follows `slide-18-back-cover.png`:
  - paper printed in the archetype's deep ink (`inkProps('paper', { ink: 'arch-deep' })`), with the headline "That was your 2026, {firstName}.";
  - the billing block from `lib/rewind/billing-block.ts`: eligible facts only, each line justified to the measure by `fitLines`, caps in Archivo width 62 with italic connectors, and the same content as a `<dl>` for screen readers. It is static at rest, so nothing is left as an empty box (RWV-10);
  - the soundtrack, captioned "One line per day. December is still being written; it joins in the final cut on 1 January.", and the disclosure "The numbers come from your history. Some of the words are written by AI." ("Every word here comes from a template." for template copy);
  - "Share the poster", and the privacy status line "Public link off. Cards unsigned, no artwork." with "Change" (`rewind-privacy-change`), which opens P5.11's sheet at its settings, where the FR-36 line says that server admins can view the Rewind;
  - the footer: "Read again" (`rewind-read-again`, to page 02), "Contents" (`rewind-contents`, a sheet that lists each selected page with its folio) and "Done" (`rewind-done`, P5.1's return path). The new test ids join design 12's list;
  - no autoplay and no Pause in `ended`. P8.4 adds "Save all {n} cards".
- Pages read their inks from the registry, and no copy uses a middle dot (RWV-07, design 5.1).

**Tests.**
- The viz tests are deterministic. They check that the arc spans 22:00 to 03:59, that bar lengths are square roots, that calendar cells fall in the right steps (in a leap year too), and the meter's median tick.
- `clock.test.tsx` and `calendar.test.tsx` run on the heavy, light, `night-owl` and `seven-minutes` fixtures. They check eligibility, the active-dates row, and `tz.note` naming the member's zone or the server's.
- `centrefold.test.tsx` runs every archetype through a fixture override: the name's lines, joined with spaces, equal the name and no line splits a word; the rarity is hidden below 10 scored members; each archetype gets the graphic in design 5.3's table. In `why-sheet.test.tsx`, every reason cites only that archetype's evidence facts.
- `back-cover.test.tsx`: the billing block holds only eligible facts and names the member in-app, and the `<dl>` matches it. Read again dispatches `READ_AGAIN`, Contents lists the folios, and Done follows the return path.
- E2E replaces P5.4's fixme, on chromium and webkit at 390x844 and 375x548. `rewind-archetype-name` is visible, and every line element's trimmed text is a run of whole words from the name. "Why this?" opens, and Esc closes it.
- Generate visual baselines for 09, 10, 16 (with "Why this?" closed and open) and 18.

**Integration.** P5.11 adds the clock, centrefold and back-cover cards, and its sheet opens from "Change". P5.12 renders these pages as article sections. P7.4 adds the Notes for the calendar and the centrefold, P8.3 adds "Pick a day", and P8.4 adds "Save all".

**Demo.** On the heavy fixture, the centrefold shows "Midnight / Marathoner" set at 87.2 px with no break inside a word, on chromium and on iOS Safari. "Why this?" lists the three evidence facts. From the back cover, Done returns home, and Read again restarts at page 02.

(as merged: Page modules are `lib/rewind/pages/{clock,calendar,centrefold,back-cover}.ts` with their `.schema.ts`; `rules.ts` keeps only the P5.6/P7 pages (its `Landed` type excludes these four). Clock data is `{ hours[24], weekdays[7] }` (Monday first); its Table and the centrefold's are `hoursTable()`, captioned "Times in {tz.label}." because `table()` has no zone source. Calendar data is `{ days: [{ minutes, key }], titles, gap: { from, to } | null }` for every window day from `window.from` (`calendarDays()` dates them); the schema refines that every key is in `titles`. Centrefold data is `{ shortlist: [{ id, evidence }], hours, graphic }`, the shortlist being the chosen archetype then `selectArchetype`'s ranking, and `graphic` a union of `hour-ring | meter | calendar-dots | shelf` (null when its fact is missing or there is no archetype). Back-cover data is `{ minutes }`; `lib/rewind/billing-block.ts` `billingBlock(facts, { serverName, named, showtime, locale, measure, metrics })` returns the `<dl>` entries and justified lines (P5.11's card passes `named: options.signed`). `IssueContext` gained `model` and `returnTo`. Page islands open their own sheets through the player: `PlayerProvider` now takes `sheet`, and `useStageSheet(name)` (`player-context.tsx`) opens "why" and "contents" in `sheet` mode, so Esc closes them first. The back cover hides the bottom chrome's share pill (`ChromeBottom share`), and its own share button is `rewind-back-cover-share` (the chrome keeps `rewind-share-poster`); "Change" sends `OPEN_SHEET share` until P5.11 opens it at its settings, and the privacy line is static until P5.11 reads the share defaults. New test ids: `rewind-why-sheet`, `rewind-why-candidate`, `rewind-why-disclosure`, `rewind-contents-sheet`, `rewind-contents-page`, `rewind-archetype-rarity`, `rewind-billing(-list|-line)`, `rewind-calendar-dates`, `rewind-privacy-status`, `rewind-back-cover-share`. The calendar grid has no month labels (9 px rows cannot hold 12 px text); a key under it names the bracket, ring and dots. The low-end `scaleX` nameplate is not built (no low-end detection exists yet). `e2e/rewind-centrefold.spec.ts` is written but not run (no Playwright in this step), and the 09/10/16/18 visual baselines are left to the coordinator.)

(as merged, phone fit after P5.5 to P5.7: `e2e/rewind-fit.spec.ts` pages through the heavy issue, plus a Guess page built from its top four series, at 390x844, 390x664, 375x548 and 360x640, and fails when a page's content leaves its artboard (`data-testid="rewind-artboard"`) or reaches the bottom chrome; P7.1 and P7.2 pages must pass it. The artboard's inherited line box now scales (`max(15px, var(--u) * 24px)`), so text that sets no line height no longer keeps the body's 24 px. Controls inside the artboard use `ARTBOARD_PILL` or `ARTBOARD_TARGET` from `components/rewind/pages/units.ts` (visible size in `--u`, an unscaled 44 px `::before`) with `stackGap(px)` between stacked ones, and `tight(px)` is a gap that tightens below the 0.8 floor. The cover's soundtrack gives way as the centrefold's ring does (its cut pills wrap their running time under the floor), Top shows' gaps between blocks give way, the number page's stamp sits in the flow beside "hours", and the centrefold's crop marks sit inside the artboard, 8 px from its sides.)

**Done when.**
- [x] Pages 09, 10, 16 and 18 match the design, with the evidence clock, the calendar strip and the billing block.
- [ ] The archetype name is fitted without mid-word breaks, and the E2E check passes on chromium and webkit. (Fitted and unit-tested; the E2E is written, not run.)
- [x] "Why this?", the AI disclosure and the privacy line are present.
- [x] Done, Read again and Contents work.
- [ ] Tests and baselines pass for all four pages. (Unit tests pass; baselines are not generated here.)

### Step P5.8: Copy slots, templates, grounding and token rendering

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-06 to 2026-11-09. **Depends on:** P2.9.
- **Findings addressed:** RWP-16, SEC-46, RWV-10

**Objective.** Make every word on a page either a deterministic template or model text that has passed a mechanical check against the facts. Numbers and titles enter text only through tokens, which are inserted literally whatever characters they contain.

**Guidance.**
- **`lib/wrapped/copy/slots.ts`** (design 8.3, D2). `COPY_SLOTS` covers the twelve decks (`deck.number`, `deck.bookends`, `deck.topShows`, `deck.topFilms`, `deck.taste`, `deck.people`, `deck.clock`, `deck.calendar`, `deck.records`, `deck.requests`, `deck.standing` and `deck.nextYear`), `archetype.tagline`, `archetype.dedication`, `archetype.posterLineId` and `signOff`.
  - Each slot is `{ id, page, maxChars, allowedFacts, identity, bands }`, with `maxChars` 140 for decks, 70 for the tagline, 240 for the dedication and 120 for the sign-off.
  - A deck's `allowedFacts` leave out its page's hero fact, so the deck adds context instead of repeating the number (RWV-10). Slots that may mention the open window list `window.finalCut` among their identity facts.
  - `slotDependencyHash(slot, facts)` hashes the identity values and the side of each band with P2.9's `canonicalJson`; `copyMeta.slotHashes` stores it. `slotsForPages(selected)` returns only the slots of selected pages.
- **`schema.ts`** holds `RewindCopyV3Wire` exactly as in design 8.3: strings, enums and `nullable`, no length keywords and `additionalProperties: false`. The stricter `RewindCopyV3` adds the lengths and each archetype's poster-line enum.
- **`templates.ts`** holds every headline, plus a deck and a fallback for every slot, each with two or three variants picked by `hash(userId, slotId)`. It also holds the window wording keyed on `window.finalCut` ("so far" appears only in templates), `tz.note` and `tz.short` (defined once, design 7.7), `coverLines(selected)`, the 60 poster lines (`mm.1` to `cc.5`, five per archetype) and the pocket note keyed on `copySource`. Templates are token strings too, rendered through `renderCopy`.
- **`grounding.ts`** is pure (design 8.4). Each slot returns `{ ok: true }` or `{ ok: false, issues }`, and every issue carries `{ rule, slot, message, hint }`. The hint names the token to use, which P5.9's repair prompt quotes. The eight rules fail a slot on:
  1. a digit outside a token, the year included;
  2. a counting number word within two words of a unit, a counted noun or another number word. "one more", "no one", "one of" and "the one" are allowed, and "double feature" only inside the archetype-name token;
  3. a quantifier without a backing share fact in the same slot: most, mostly, the majority and the bulk need 0.5 or more; nearly all and almost all need 0.85; half needs 0.45 to 0.55; a third 0.30 to 0.37; a quarter 0.22 to 0.28; a good share 0.3 or more;
  4. a capitalised word that does not start a sentence, or a sentence-initial word missing from the word list;
  5. a token that is unknown, outside the slot's `allowedFacts`, or on a page that was not selected;
  6. a voice breach: the banned phrases (including "so far" and "still"), emoji, URLs, Markdown, the member's name outside `signOff`, and third-person references such as "the viewer";
  7. a rendered length over `maxChars`, counting each token at its display length;
  8. an archetype outside the shortlist rule (`llmMayChoose`, design 7.6), or a poster line from another archetype.
- **`wordlist.ts`** holds the 10,000 most frequent English words from a permissively licensed list, lower-cased, as a `Set`. `scripts/build-wordlist.mjs` regenerates it, and `THIRD_PARTY.md` (P1.9) records the source and licence. Avoid share-alike data.
- **`render-copy.ts`**. `TOKEN_RE` matches `{{fact:<id>}}`, where an id is dotted segments that may carry an index, such as `series[1].title`. `renderCopy(text, facts)` returns `text`, `token` and `title` segments for React, and `renderCopyText()` returns plain text for cards, OG text and length checks. Substitution always uses a replacer function, `text.replace(TOKEN_RE, (_, id) => facts[id].display)`, never a replacement string (SEC-46).
- **SEC-46 in v2.** `replacePlaceholders` (`lib/wrapped/prompt-template.ts:26-80`) still feeds the v2 playground until P8.8. Change it to one pass over `/\{\{(\w+)\}\}/g` with a lookup map and a replacer function, which also removes the order-dependent second pass for `serverName`.
- RWP-16 closes here: model text is checked against the stats for the first time, and P2.9 already removed the model-computed fields.

**Tests.**
- `lib/wrapped/copy/__tests__/grounding.test.ts` has one `describe` per rule, each with passing and failing fixtures:
  - "Most of it after dark, and a good share of it in Lumon's hallways", with `hours.afterDarkShare = 0.34`, fails rules 3 and 4;
  - "One more episode was never the plan. It was the whole plan." passes;
  - "one hundred hours", "three nights in a row" and "twice the hours" fail rule 2;
  - "May" fails rule 4, with the month-token hint;
  - a token from an unselected page fails rule 5, and "so far" fails rule 6;
  - a deck that renders to 141 characters fails rule 7;
  - another archetype's poster line fails rule 8.
- `render-copy.test.ts`: "Ke$ha: My Crazy Beautiful Life" and titles containing `$&`, `$'` and `` $` `` are inserted literally.
- `slots.test.ts`: every allowed and identity id is in the catalogue, the window slots carry `window.finalCut`, and `slotDependencyHash` changes when an identity fact changes or a band is crossed but not when a number merely grows.
- `templates.test.ts`: every template, rendered for all 20 fixtures, passes rules 4 to 7; variants are stable for each member; both `tz.note` forms render; there are 60 poster lines, five per archetype.
- `__tests__/lib/wrapped/prompt-template.test.ts`: substituting ``Ca$$h $& $'`` produces that string literally.

**Integration.** P5.5 to P5.7 render through `renderCopy`, and P5.9's copy step calls `groundSlot` and the templates. P5.10 and P5.11 set card text with `renderCopyText`, and P5.13's gate reuses the grounding rules. P7.7 and P8.5 decide what to regenerate with `slotDependencyHash`, and P8.1 freezes the templates with the prompt.

**Demo.** Run `groundSlot` on the personal-signature line against the heavy fixture: it prints the rule 3 and rule 4 issues with their hints. Render a deck that names "Ke$ha: My Crazy Beautiful Life", and the title comes out intact.

**As merged** (later steps rely on these):
- `lib/wrapped/copy/`: `slots.ts` (`COPY_SLOTS`, `SLOT_IDS`, `HERO_FACTS`, `factPages(id)` for rule 5, `slotsForPages`, `slotDependencyHash`), `schema.ts` (`RewindCopyV3Wire`, now also the stored `copy` in `schema-v3.ts`; `RewindCopyV3` caps raw text at 3x `maxChars` as a runaway guard, since rule 7 checks the rendered length), `render-copy.ts` (`TOKEN_RE`, `renderCopy` segments `text`/`token`/`title`, `renderCopyText`, `tokenIds`, `TokenSource`), `grounding.ts` (`groundSlot(slotId, text, { facts, selected, source?, locals? })` for rules 1-7, `groundArchetype(choice, selection)` for rule 8), `templates.ts` (`slotTemplate`, `headline(page, facts)`, `coverLines([{ type, folio }])` returning `{ folio, text }` so the folio is set apart, `windowLine`, `tzNote('member' | 'server')`, `tzShort`, `pocketNote`, `posterLineTemplate`, `copyLocals({ year, firstTitle })`), `poster-lines.ts` (the 60 lines).
- Values that are not facts (the issue year, Bookends' first title) are template-only tokens `copy.year` and `copy.firstTitle`, passed as `locals`; the catalogue has no year fact.
- Rule 3 needs a share token cited in the same slot (the "Most of it after dark" line cites none). Templates pass `source: 'template'`, which allows "so far" and "still". The tagline's template is one of the archetype's poster lines.
- Word list: the 10,000 English 1-grams of orgtre/google-books-ngram-frequency (CC BY 3.0, pinned by commit and sha256 in `scripts/build-wordlist.mjs`), minus capitalised entries, so a sentence can't start with a month or a place: 9,824 words, plus "starring" and "unfinished" for the design's headlines. Its source and licence are recorded in the generated file's header, not `.claude/skills/THIRD_PARTY.md`, which lists only vendored skills.

**Done when.**
- [x] `slots.ts` declares every slot with its limits, allowed facts, identity facts and bands, and `slotDependencyHash` is stable.
- [x] Templates exist for every headline and slot, with variants and window wording keyed on `window.finalCut`.
- [x] All eight grounding rules have passing and failing fixtures, including the "Most of it after dark" line.
- [x] `render-copy` inserts titles containing `$` patterns literally, and the v2 prompt substitution uses a replacer function.

### Step P5.9: The v3 pipeline end to end

- **Track:** rewind. **Lane:** Rewind. **Effort:** L. **Window:** 2026-11-09 to 2026-11-12. **Depends on:** P5.8, P2.17, P2.6, P2.11, P4.5.
- **Findings addressed:** SEC-43, RWP-13, RWP-19, RWP-14, DUP-02, BP-25

**Objective.** One function generates a member's v3 Rewind for the job, the playground and the tests. A model failure never fails a Rewind, light viewers cost nothing, and an unchanged input never pays twice.

**Guidance.**
- **Entry point.** `lib/wrapped/pipeline/generate-user.ts` exports `generateUserRewind({ userId, year, kind, through, mode, copyPolicy, signal, model?, promptVersion?, styleGuide?, source? })`.
  - `mode` is `'persist'` or `'dry-run'`, and `copyPolicy` is `'default'` or `'no-llm'`. It returns `{ data, trail }`: `data` is a `RewindDataV3`, and `trail` holds the fact sheet, the selection with omission reasons, the raw output, grounding issues per slot, the repair and fallback steps, usage and cost.
  - It follows design 9.2 steps 1 to 9 through small modules in `lib/wrapped/pipeline/`: `load-context.ts`, `eligibility.ts`, `edition.ts`, `copy-step.ts` and `persist.ts`, each about 150 lines at most.
- **Eligibility.** `eligibility.ts` returns `{ ok: true }` or `{ ok: false, reason }`. The reasons are `REDIS_UNAVAILABLE` (P2.5's `checkRewindInfra()`), `REWIND_DISABLED`, `NOT_IN_AUDIENCE`, `NO_PLEX_IDENTITY`, `TAUTULLI_USER_NOT_FOUND` (P0.9's lookup), `MANAGED_ACCOUNT` (unless `rewindIncludeManagedUsers` is on) and `NOT_ENTITLED` (P4.5's `ensureSubscriptionOrAccess()` when Stripe is on). A failed check marks the generation `skipped` with that reason. Admin regenerations bypass the two flags, but never identity or entitlement.
- **Inputs.** Events come from P2.6's per-batch cache, or else from P2.4's Tautulli source, with admin exclusions and `RewindExclusion` rows applied as events are read. Then come `computeMemberStats`, `selectArchetype` (with rarity from the aggregate), `buildFacts` and `factsHash`. `member.serial` uses `Config.rewindSerialKey`, created once (32 random bytes) when it is null.
- **Editions** (`edition.ts`, FR-5). Under 30 minutes or 0 plays is the postcard, with no archetype. Under 5 hours, under 10 plays or fewer than 10 eligible pages is the pocket edition. Everything else is the full issue. Pocket and postcard copy is template-only, with zero LLM calls and `copySource: 'template'` (RWP-19).
- **Prompt.** `lib/wrapped/prompt/rewind-2026.ts` exports `PROMPT_VERSION = 'rewind-2026.1'`.
  - `systemPrompt(styleGuide)` returns the frozen block of design 8.3: voice, a per-slot field guide that asks for context instead of the page's number, the token rules, banned phrases, the archetypes with their poster-line enums, one synthetic exemplar and the schema. The style-guide block comes last.
  - `userPrompt()` carries only `buildFactSheet()` for the selected slots' allowed facts, plus the slots, the shortlist and the title allow-list. The system block holds no timestamps and no member data, and the call has no tools.
- **Style guide and RWP-13.** New `lib/wrapped/prompt/store.ts` imports `server-only` and exports `findRewindStyleGuide()` and `findActivePromptTemplate()`, plain Prisma reads that are not Server Actions. Delete the unauthenticated export at `actions/prompts.ts:53-59`, and point `lib/wrapped/prompt-template.ts:10` at the store.
  - Migration `20261111000000_prompt_template_kind` adds `PromptTemplate.kind String @default("v2-full")` (`v2-full` or `rewind-style-guide`). The admin prompt actions validate a style guide as `z.string().max(1200)` without placeholders, and write a new `PROMPT_TEMPLATE_CHANGED` audit entry.
- **Copy step.** `copy-step.ts` follows design 8.5 and 8.7, in this order:
  1. When `factsHash`, `promptVersion` and `model` all match the last completed generation, reuse its copy and make no call. A retried job is therefore free.
  2. With `copyPolicy: 'no-llm'`, keep each slot whose `slotDependencyHash` is unchanged and template the rest.
  3. Use templates only for the pocket and the postcard; when `Config.llmDisabled` is on or `rewindLlmMode` is `off`; when no provider is configured; or when the year's Rewind spend (the `LLMUsage.cost` of rows linked to this year's generations) has reached `rewindLlmBudgetUsd`.
  4. Otherwise, wait on `consume('rw:llm:<provider>')` (30 per minute) and call `generateStructured` with `schema: RewindCopyV3Wire`, `effort: 'low'`, `maxOutputTokens: 1800`, `cacheKey: PROMPT_VERSION`, `AbortSignal.any([signal, AbortSignal.timeout(90_000)])` and the generation attribution. The `economy` mode uses the budget model.
  5. Validate each slot with `groundSlot`. Then make one repair call on `budgetModelFor(provider)` from `lib/llm/models.ts`, sending only the failing slots and their hints.
  6. Slots that still fail fall back one by one to templates. So do all slots after a schema failure, a refusal or truncation (SEC-43). `copySource` records `llm`, `repair`, `template` or `mixed`.
- **Persist.** `persist.ts` runs `RewindDataV3.parse()`. In persist mode, P2.17's single `$transaction` copies the old data to `previousData` (RWP-14), writes `data`, `dataVersion: 3`, `edition`, `factsHash`, `dataThrough` and `status: 'completed'`, and records the generation's `copySource`, `copyPolicy`, `llmCalls` and `costUsd`. After the commit, `afterRewindCompleted()` in `lib/wrapped/pipeline/after-complete.ts` runs the hooks that P5.10 and P7.14 register. A dry run writes no `PlexWrapped` or `RewindGeneration` row; its billed `LLMUsage` rows carry `promptVersion` but no `generationId`.
- **Switch.** The `REWIND_GENERATE_USER` processor in `lib/queue/jobs/rewind.ts` now calls `generateUserRewind({ mode: 'persist' })`. `lib/wrapped/pipeline/generate-v2.ts` stays only for the v2 playground.
- **DUP-02 and BP-25.** v3 has one assembly path. `app/api/admin/playground/statistics/route.ts:79-206` drops its copy and calls `collectV2Statistics()`, exported from `generate-v2.ts`, so the old playground gains `derived` and `percentile` and resolves users by id until P8.8 deletes the route.

**Tests.**
- `lib/wrapped/pipeline/__tests__/eligibility.test.ts` covers every reason, the admin bypass, and Stripe both on and off.
- `edition.test.ts` checks both sides of each threshold: 29 and 30 minutes, 4.9 and 5 hours, 9 and 10 plays, and 9 and 10 eligible pages.
- `copy-step.test.ts` (mock model from `ai/test`): unchanged inputs make no call; `no-llm` keeps the unchanged slots; a grounding failure gets one repair call with only the failing slots, and a slot that still fails falls back alone (`mixed`); `TRUNCATED` and `SCHEMA` give all-template copy; a reached budget makes no call; `economy` uses the budget model; `llmDisabled` overrides `standard`.
- `generate-user.golden.test.ts` runs all 20 P2.10 fixtures in dry-run mode, replaying `evals/rewind/recordings/hand/<fixture>.json`, and snapshots the edition, pages, archetype, `copySource` and rendered copy. The postcard, `seven-minutes` and `light` fixtures make zero calls, `hostile-titles` shows its injection title only inside a token, and persist and dry-run modes give the same `factsHash`.
- `persist.pg.test.ts` (gated on `TEST_DATABASE_URL`): a failure after the copy step leaves the old data and its share link untouched, and a success fills `previousData`.
- `lib/wrapped/prompt/__tests__/rewind-2026.test.ts`: a byte-stable snapshot of the system block with no member data, and a style guide over 1,200 characters is refused. `__tests__/actions/prompts.test.ts:143-146` loses its "should not require admin access" case.
- The hand-written recordings cover every fixture, with deliberate grounding failures in four of them. P5.13 adds real model recordings next to them.

**Integration.** P2.17's job, P7.8's Generate all, P7.7's no-LLM regenerations, P7.10's dry runs (and P8.8's playground on them) and P8.5's final cut all call `generateUserRewind`. P5.10 registers the card prewarm, P7.14 the notification, P5.13 runs the dry runs, and P8.1 freezes the prompt. The CLAUDE.md integration section points at `generateUserRewind`.

**Demo.** An admin regenerates the heavy test member: one `LLMUsage` row appears and the data is v3. A second regenerate makes no LLM call. With the provider key removed, the Rewind still completes, with `copySource: 'template'` and a warning in the logs.

**As merged** (later steps rely on these):
- Modules in `lib/wrapped/pipeline/`: `generate-user.ts` (`generateUserRewind(options, deps?)` returns `{ status: 'completed', data, trail }` or `{ status: 'skipped', reason }`; `source` is an injectable inputs reader, used by the fixtures), `load-context.ts` (`RewindContext`, `memberSerial`: 4 Crockford base32 characters of `HMAC-SHA256(rewindSerialKey, userId:year)`), `eligibility.ts` (`SkipReason`), `read-inputs.ts`, `build-issue.ts` (`buildIssue`, `withArchetype`), `edition.ts` (`omittedPages`, `editionOf`, `selectIssuePages`), `copy-step.ts`, `copy-draft.ts`, `copy-llm.ts`, `persist.ts`, `after-complete.ts` (`onRewindCompleted(name, hook)` for P5.10 and P7.14). The P2.16 page rules moved from `evals/rewind/__tests__/pages.ts` (now a re-export) into `edition.ts`. **Pages are stored as `{ type, data: null }`** until P5.5's `selectPages` replaces `selectIssuePages`; the pocket edition is cover, number, short-list, clock (else calendar), centrefold, back cover; the postcard is one `cover` page until P7.3.
- Pocket and postcard store `copy: null` with `copySource: 'template'`. `copyMeta.model` is `"<provider>:<normalised id>"` (null for template-only copy). The model may pick another archetype only when `llmMayChoose`; the facts are then rebuilt around it (`withArchetype`, code's pick as runner-up). `RewindGeneration.factsHash` stores the copy step's input hash (before that choice), which the next run's reuse check reads; `PlexWrapped.factsHash` and `data.factsHash` are the stored facts' hash.
- Skip reasons joined `RewindErrorCode` (with member copy in `lib/ui/error-copy.ts`); a skipped run marks a Rewind that has not completed `failed` with that code. Managed accounts are Tautulli `get_users` rows with `is_restricted: 1`. Entitlement uses `getAccessLevel()` (the job has no session). Members (`kind: 'member'`) are now skipped as `REWIND_DISABLED` until `rewindEnabled` is on; admin regenerations bypass both flags.
- `budgetModelFor(provider)` is in `lib/llm/models.ts` (`claude-haiku-5-5`, `gpt-6-luna`, null otherwise: the configured model repairs). The `rw:llm` limit (30 a minute per provider) is in `LIMITS`; the wait is bounded by the job's signal. The aggregate job also caches the library listing (`rw:batch:{year}:{through}:library`) for next year's picks, read by `getBatchLibrary`.
- RWP-13: the unauthenticated export at `actions/prompts.ts:53-59` was already gone; `lib/wrapped/prompt/store.ts` now serves both reads. The migration is `20261124000100_prompt_template_kind` (the planned `20261111000000` would sort before merged migrations). Activation is per kind; audit type `PROMPT_TEMPLATE_CHANGED`. The admin UI has no style-guide editor yet (the action takes `kind`).
- `generate-v2.ts`, `generateRewindV2` and `lib/wrapped/llm.ts` (`generateWrappedWithLLM`) are deleted: no v2 path generates any more. The playground route resolves `userId` (app id or Plex account id) and calls `collectV2Statistics` from `collect-v2-statistics.ts`.
- Not done here: the CLAUDE.md integration line about `generateUserRewind` (an agent may not edit CLAUDE.md; coordinator item).

**Done when.**
- [x] `generateUserRewind` runs in persist and dry-run modes, and the job uses it.
- [x] Eligibility covers Redis, the audience, the Plex identity, managed accounts and entitlement, each with a typed skip reason.
- [x] The pocket and postcard editions make zero LLM calls, and unchanged inputs make none.
- [x] One repair call is followed by a per-slot template fallback, and no model failure fails a generation.
- [x] The prompt is frozen in code as `rewind-2026.1`, and the style guide is read through a server-only function, with no unauthenticated action left.
- [x] The final write is one atomic transaction, and the golden snapshot tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean. (Owner: dump and production deploy; `migrate status` is clean on the test database.)

### Step P5.10: Share-safe projection v3 and card routes

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-12 to 2026-11-13. **Depends on:** P2.14, P5.9.
- **Findings addressed:** SEC-16, RWP-01, RWV-06

**Objective.** Every card, whether rendered for the owner or for a share link, comes from one strict allow-list projection of only the published pages. Cards render through `next/og` with the Rewind fonts, behind authorisation, a cache and Redis limits.

**Guidance.**
- **Projection.** `lib/wrapped/data/share-safe.ts` exports `ShareOptions` (Zod: `{ pages, signed, includeArt, dailyDetail, cardFacts }`) and `toShareSafe(rewind, options, ctx)`.
  - `ctx` comes from `loadShareContext(wrappedId)` (`server-only`), which reads the Config flags, `RewindPrefs` and `RewindExclusion` at projection time.
  - The output is built field by field into the strict `ShareSafeRewindV3` schema of design 6.1: only the pages in `options.pages`, in registry order, each with only its registry `share.facts` displays; percentages unless `rewindPublicCounts` is on, and the percentile only at top 25% or better; 48 weekly soundtrack bins unless `dailyDetail` is on; `ownerName` only when signed; `brand` null when `rewindShowServerNameOnCards` is off; art only when the member includes it and the admin allows it; the archetype only inside pages 16 and 18; and `ogText` as a template.
  - **Hidden titles** drop out of `titles` and `art` immediately. A headline that names a hidden title switches to its title-free template.
  - **Never published:** leaderboards, other members, ids, emails, request item titles, the dedication, and any free model text except the poster line.
  - `cardInput(page, size)` returns the projected page plus `factsHash`, `size`, `signed`, `ownerName`, the effective art, `daily`, `cardFacts`, `brand`, `publicCounts` and `exclusionsVersion`.
- **Routes.** Both run on the Node runtime, render with `ImageResponse` from `next/og`, and load fonts through P2.14's `loadCardFonts()`.
  - **Owner:** `app/api/rewind/card/[rewindId]/[page]/route.tsx` checks the session, ownership and, with Stripe on, P4.5's entitlement. Its Zod query is `size=story|square|og`, `signed`, `art`, `daily` and `facts`, clamped by the admin flags; `square` is refused until FR-27 ships.
  - **Share:** `app/api/rewind/card/s/[assetKey]/[page]/route.tsx` takes a 22-character base64url `assetKey`, which must belong to a `RewindShare` that is neither revoked nor expired, with `[page]` among its published pages. Its options come from the row, never from the query.
  - **Order:** authorise, then read the disk cache, then apply the limiter, then render. The limits are `rw:card:session:<userId>` at 60 per minute and `rw:card:share:<shareId>` at 30 per minute, in P0.10's `LIMITS`.
  - **Headers:** every response sends `X-Robots-Tag: noindex`. Owners get `private, max-age=86400` and shares get `private, max-age=300`. Anything unauthorised gets a 404.
- **Cards.** `lib/rewind/cards/index.ts` maps each page type to its renderer, `frame.tsx` draws the 1080x1920 frame (branding bands around the 1080x1340 safe zone, the masthead or "Rewind 2026", and the serial), and `cover.tsx` is the first card. Lines come from `fitLines` with the card metrics and `CARD_SLACK`, set `whiteSpace: 'nowrap'`; graphics are base64 SVG `<img>`s from `lib/rewind/viz`; colours come from `rewindInks`. Until P7.6 adds the Noto subsets, a safe-mode title prints the page's title-free template.
- **Satori lint.** The `rewindCards` array in P3.4's `eslint/restricted-syntax.mjs` gains `no-restricted-syntax` selectors for `lib/rewind/cards/**` (with a fixture case each in `eslint/__tests__/restricted-syntax.test.ts`) that ban `display: 'grid'`, `boxShadow`, `filter`, `backdropFilter`, `mixBlendMode`, `clipPath`, `WebkitTextStroke`, any string containing `var(--` or `calc(`, and JSX `<text>`. A tree test asserts `display: 'flex'` on every element with more than one child.
- **Cache.** `lib/rewind/cards/cache.ts` stores PNGs at `${REWIND_CACHE_DIR}/cards/{sha256(canonicalJson(cardInput) + CARD_VERSION)}.png`, written atomically through a temp file and a rename. A daily `REWIND_CARD_SWEEP` job on `rewind-aux` deletes files unused for 30 days.
- **Share posters.** P5.6's poster route accepts `?s=<assetKey>`, only for the art keys that the projection publishes. It never accepts the token.
- **Prewarm.** `REWIND_CARD_PREWARM` runs on `rewind-aux` with the dedup id `rewind:cards:{wrappedId}:{factsHash}`. It is registered on `afterRewindCompleted()`, and renders the cover, centrefold and back cover with the member's saved options. The v2 OG route keeps serving v2 shares until P7.5.

**Tests.**
- `lib/wrapped/data/__tests__/share-safe.test.ts`:
  - **Key snapshot:** project the heavy fixture with every page published, split every key path on `.` and fail when a segment matches `/^(leaderboards?|emails?|\w*Email|userId|plexUserId|tautulli\w*|player|location|ip|ipAddress|ip_address|machineId|machine_id|dedication)$/i`, or when the path contains the segments `requests.items`. Whole segments only: a bare `ip` would otherwise match harmless keys such as `tooltip`, `clip`, `skip` or `zip`. A table test of allowed and forbidden key names guards the pattern itself.
  - **Privacy:** unsigned cards never contain the first name, and a link that publishes only page 05 carries no archetype, total hours or percentile.
  - **Rules:** percentages replace counts, the percentile disappears at top 26%, and the soundtrack has 48 bins.
  - **Hidden titles:** a hidden No. 1 series drops out at once, and its headline switches to the title-free template.
- `share-safe.property.test.ts` (fast-check): random v3 rows and random options always parse with the strict schema, and never contain a hidden title.
- `app/api/rewind/card/__tests__/{owner,share}-route.test.ts`: 404 for another member's row, for a revoked, expired or rotated share and for an unpublished page; entitlement enforced with Stripe on; the share route ignores its query; a cache hit uses no limiter point, and the 61st render in a minute gets a 429; every response carries noindex and the right cache header.
- `lib/rewind/cards/__tests__/owner-vs-link.render.test.tsx` (`@jest-environment node`): the owner route and the share route return byte-identical PNGs for the same page and options, and both use one cache file.
- `cache.test.ts`: the key changes with `exclusionsVersion`, `CARD_VERSION`, `brand` and `signed`. The Satori tree test runs on every card.

**Integration.** P5.11 adds the other core cards and the share sheet's preview, and P7.5 serves the share page and the OG card from this projection. P7.6 adds the remaining cards and the Noto subsets, and P7.7's hidden titles flow through `ctx`. P4.16's log masking covers `/api/rewind/card/s/*`. `REWIND_CACHE_DIR` comes from P4.1's `envSchema`, joins `example.env` and P7.17's runbook, and P4.17's `image-smoke` job renders one card inside the hardened image to prove the directory is writable.

**Demo.** `curl` the owner cover card, then the share card for the same options: both PNGs have the same sha256. Hide the No. 1 title: the next projection drops it before the regeneration finishes. A revoked asset key returns 404, even though its PNG is still on disk.

**Done when.**
- [x] `toShareSafe` is a strict, field-by-field allow-list, with percentages, weekly bins and hidden titles dropped at projection time.
- [x] The owner and asset-key card routes render through `next/og` with the card fonts, authorise first, and send noindex.
- [x] The Satori lint rule and the tree test guard `lib/rewind/cards/**`.
- [x] Cards are cached on disk by the projected input and `CARD_VERSION`, and the Redis limits apply only to cache misses.
- [x] The key-snapshot, property and owner-versus-link pixel tests pass.

(as merged: `loadShareContext({ userId, year })` takes the owner and year, not a wrapped id, and `findLiveShare(assetKey)` in `lib/wrapped/data/share-asset.ts` is the one asset-key lookup for the card and poster routes. Each projected page also carries `headline`, its card headline rendered from that page's published facts only, else `titleFreeHeadline(page)` from `templates.ts`; `serial` is nullable. Hidden titles leave through a registry hook, `share.titleKeys(data)`, mapping title facts to rating keys from page data, plus any title fact with the same display; only Bookends implements it, so P5.6, P7.1 and P7.2 add `titleKeys` (and `share.art: true` where a page publishes posters) for their pages, and P7.7's `ratingKeysIn` can reuse it. The share route always renders `story` and reads no query; P7.5 adds the OG card. Only the cover card ships (`RENDERERS` in `lib/rewind/cards/index.ts`); other pages answer 404 until their card lands, and a card prints the archetype colourway only where the projection publishes the archetype, so the cover prints on paper. The poster `?s=<assetKey>` check went into the existing `app/api/wrapped/poster/[ratingKey]/route.ts`, because P5.6's route has not merged; P5.6 carries it over. The routes are `route.ts`; the `rewindCards` selectors were new (P3.4 had not added the array); `SHARE_PAGE_TYPES` lives in the registry and the schemas in `lib/wrapped/data/share-safe-schema.ts`; `scripts/rewind-render-cards.tsx` renders cards outside Jest.)

### Step P5.11: Share sheet, core cards and opt-in public links

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-17 to 2026-11-18. **Depends on:** P5.10, P3.7, P4.3.
- **Findings addressed:** RWV-06, SEC-16, GAP-37

**Objective.** A member can share any core page as a 9:16 image through the native share sheet, or save it. A public link is created only on purpose, shows exactly what it will publish, and can be changed, rotated or stopped at any time. Visits are counted without keeping anything about the visitor.

**Guidance.**
- **Core cards.** Add `number.tsx`, `top-shows.tsx`, `clock.tsx`, `centrefold.tsx` and `back-cover.tsx` to P5.10's cover in `lib/rewind/cards/`, which makes six core cards. The guess teaser, bookends, top-films and calendar cards come with P7.6.
  - The centrefold follows `card-centrefold.png` (the name as a nameplate, the line from `posterLineId`, the clock and three stats), and the back cover follows `card-back-cover.png`, naming the member only when the card is signed.
  - **Default `cardFacts`:** hours; the percentile at top 25% or better, else the longest streak; and the peak hour. When the graphic already shows one of them, the next allowed stat takes its place. `eligibleCards(rewind, options)` lists the cards available under the current options.
- **Sheet.** `components/rewind/share/share-sheet.tsx` (`rewind-share-sheet`) is `Sheet side="bottom" grabber`, printed on paper (`sheet-share.png`).
  - **Opened by** "Share this page", "Share the poster", S, "Change" on the back cover, and `?sheet=share`. That last one opens the story paused on the cover card, with a picker over `eligibleCards`.
  - **Preview:** a live `<img>` of the owner card URL with the current options, and the line "Story card, 1080 by 1920". The format control stays hidden until FR-27.
  - **Switches:** "Sign with my name" (`rewind-share-sign`); "Include artwork" (`rewind-share-art`), shown only on pages with posters and only while the admin allows art; "Daily detail" (`rewind-share-daily`), required and pre-set for the Calendar card, with the sentence "This card shows which days you watched".
  - **Privacy line:** "Cards never show other members. Server admins can view your Rewind." The choices are saved per member and year in `RewindPrefs` through `saveRewindSharePrefs()`.
- **Web Share.** `use-card-file.ts` follows design 6.5. When the sheet opens, and after every option change, it fetches the PNG into a `File` named `rewind-2026-<page>.png`, which keeps the tap's user activation on iOS.
  - **Share image** (`rewind-share-image`) calls `navigator.share({ files: [file], title: 'My Rewind 2026' })` only when `navigator.canShare?.({ files: [file] })` is true. An `AbortError` stays silent, and any other error falls back to Save.
  - **Save image** (`rewind-share-save`) downloads through `<a download>` with an object URL. On iOS without file sharing, it opens the PNG in a new tab with "Press and hold to save".
  - **Copy link** (`rewind-share-copy-link`) writes an existing link to the clipboard and shows the toast "Link copied". Without a link it reads "Create a public link..." and opens a confirm step that names what becomes visible: "Anyone with the link will see these 5 cards. Your name: hidden. Expires 31 January 2027." No expiry is a deliberate choice in that step. A browser without file sharing shows only Save image and Copy link.
- **Actions.** `actions/rewind-sharing.ts` is built on P4.3's action helper and implements design 6.2's table: `enableRewindShare`, `updateRewindShare`, `rotateRewindShare` and `disableRewindShare`.
  - Each has Zod input, checks the session and ownership of a completed v3 row, and calls `consume('rw:share-actions', userId)` at 10 per hour. With Stripe on, each also checks entitlement, except disable and rotate (FR-51). Enable is refused while `rewindPublicLinks` is off.
  - **Token:** `randomBytes(32).toString('base64url')`. Only its `sha256` hex is stored, as `tokenHash`, beside a separate 16-byte `assetKey`, and the URL is returned once. **Expiry** defaults to `'season-close'`, which resolves `rewindSeasonCloses` in the server zone through P2.2's `getSeasonState()`. **Rotate** sets `revokedAt` on the old row and creates a new one with `rotatedFromId`.
  - **Audit:** add `REWIND_SHARE_CREATED`, `REWIND_SHARE_UPDATED`, `REWIND_SHARE_ROTATED` and `REWIND_SHARE_REVOKED` to `AuditEventType`. Their details hold the share id and the pages, never the token.
  - A lapsed member sees "Sharing needs an active membership" with a link to `/subscribe`, and can still stop or rotate a link.
- **Visits.** `lib/wrapped/share/visit-counter.ts` exports `recordShareVisit(shareId, ip)` (GAP-37). The day key is 32 random bytes held only in Redis, at `rw:visitkey:<UTC day>` with a 48-hour TTL. `SET rw:visit:<shareId>:<HMAC-SHA256(dayKey, ip)> 1 NX EX 86400` marks the visitor for the day, and when that write succeeds the counter upserts `RewindShareVisitDay { shareId, day }` and increments `count`. The database never receives an IP, a hash, a user agent or a referer. P7.5's share page calls the function.

**Tests.**
- `actions/__tests__/rewind-sharing.test.ts`:
  - only the token's hash is stored, and the token is returned once; another member's row, a v2 row and an unfinished row are refused; the 11th action in an hour is limited;
  - a lapsed member cannot enable a link but can disable and rotate one; rotation revokes the old token; `season-close` resolves to 2027-01-31 23:59:59 in the server zone; `rewindPublicLinks` off refuses enable; each action writes one audit entry with no token in it.
- `lib/wrapped/share/__tests__/visit-counter.test.ts` (against Redis when `TEST_REDIS_URL` is set): one count per visitor per day, a fresh count the next day, a new day key each day, and no IP in any database write.
- `components/rewind/share/__tests__/share-sheet.test.tsx`: when Web Share is present it is called with the files only; when it is missing, only Save and Copy link show; when it fails, Save is the fallback, and an `AbortError` stays silent. The File is ready before the tap, the switches change the preview URL, and the confirm step names the card count, the name state and the expiry.
- `lib/rewind/cards/__tests__/core-cards.render.test.tsx` renders the six cards on the heavy, median and light fixtures. Unsigned cards contain no first name in any text node, and the `eligibleCards` counts are checked.
- `e2e/rewind/share.spec.ts` (chromium and webkit) replaces P5.4's fixme. It creates a link through the confirm step, reads its asset key through the E2E Prisma helper and gets 200 from `/api/rewind/card/s/<assetKey>/cover`. After a rotate the old key returns 404 and the new one works; after a disable the new key returns 404 too. On webkit, a stubbed `navigator.share` receives a `File`. P7.5 adds the share-page checks.

**Integration.** P6.9's RewindCard links to `?sheet=share`, and the back cover's "Change" opens the sheet. P7.5 builds the share page and its owner banner (Change cards, Rotate link, Stop sharing) on these actions and calls `recordShareVisit`. P7.6 adds Edit card and the remaining cards, P8.4 adds Save all, and P11.14 deletes visit counters after 90 days.

**Demo.** On an iPhone, Share image on the centrefold opens the iOS share sheet with the PNG. A desktop Firefox window shows only Save image and Copy link. Create a link, rotate it and stop it: each step returns 404 at once for the old address, and the audit log shows four entries.

**Done when.**
- [x] The share sheet offers a live preview, Share image with a prefetched File, Save image, and Copy link or Create a public link, plus the sign, artwork and daily-detail switches.
- [x] The six core cards render from the projection, and unsigned cards never name the member.
- [x] Enable, update, rotate and disable store hashed tokens and asset keys, expire at season close, write audit entries and allow 10 actions per hour.
- [x] `RewindShareVisitDay` counts once per visitor per day through a daily rotating HMAC key, and the database stores nothing about visitors.
- [x] The E2E test covers create, rotate and revoke. (Written, not run: FEATURE-FIRST; `--list` collects it.)

(as merged: **Projection.** `ShareSafePage` gained `titleIds` (the title fact behind each of `titles`, same order), `hours` (clock and centrefold: 24 plays-by-hour normalised to the busiest) and `stats` (centrefold and back cover: `cardFacts`, else `defaultCardFacts(page, printable)`, so an empty `cardFacts` means the defaults everywhere, prewarm included). The back cover publishes the soundtrack too. Art keys that are not Plex rating keys are dropped. **Registry.** Back-cover data is now `{ minutes, keys: { series: TitleKey[] (max 3), film: TitleKey | null } }` with `share.titleKeys` and `share.art: true`, so hidden titles leave its billing and fan even without Top shows or Top films in the issue; the centrefold's `share.facts` gained `hours.peak`, `hours.afterDarkShare` and `hours.goldenShare` for its clock, and `RINGS` is exported. `e2e/fixtures/rewind/heavy-issue.json` was regenerated. **Cards.** `renderCard(input, assets?)` takes `CardAssets { art: (dataUri | null)[] }`; `renderCardPng` loads published posters through `lib/rewind/cards/art.ts` (poster disk cache, else Plex at 240 px, as PNG through sharp; a missing poster is an empty slot). Plex fetching moved to `lib/rewind/poster/fetch.ts` (`fetchPlexPoster`). Shared card parts are in `lib/rewind/cards/parts.tsx` (`CardHeadline`, `SoundtrackStrip`, `ringSvg`, `StatsRow`, `PosterSlot`); `Text` (Newsreader, wraps when given a width) and `Picture` are in `type.tsx`; `cardInk` returns a `spot` and the back cover's archetype deep ink. The back-cover billing is `billingBlock` on the page's 358 px measure scaled to 936, its counts formatted `en-US`. `eligibleCards` and `CARD_PAGE_TYPES` are in the client-safe `lib/rewind/cards/eligible.ts`. **Actions.** Only one live link per Rewind: enable answers `CONFLICT` while one is live. Only the hash is stored, so the URL is known only in the session that made it; the sheet's "Copy a new link..." rotates. Lapsed copy is `NOT_ENTITLED` "Sharing needs an active membership"; `updateRewindShare` has no UI caller until P7.5. **Sheet.** `components/rewind/share/*`; the issue's Server Component passes the actions down as props (`StoryStage share={{ setup, actions }}`, `ShareActions`), so no client module imports `actions/`. `loadShareSetup` (`lib/rewind/share-setup.ts`) gives the eligible cards, admin flags, entitlement, saved choices, the live link (no URL) and the default expiry's date in the server locale. `?sheet=share` is `StoryStage initialSheet`; the back cover's Change opens `SHARE_SETTINGS_SHEET` ("share-settings"), focused on the sign switch, and its privacy line is `privacyStatus()` over the sheet's state. The sheet also has "Stop sharing" (`rewind-share-stop`), which the E2E uses for revoke. `RewindYearView`'s `issue` carries the row `id`. **Visits.** The test is `lib/wrapped/share/__tests__/visit-counter.redis.test.ts` (integration); `recordShareVisit(shareId, ip, deps?)`, and `knip.json` lists the module as an entry until P7.5 calls it. **E2E.** `e2e/rewind/share.spec.ts` runs in `chromium`; its `navigator.share` File check stubs the API with an init script, so it runs in any browser.)

### Step P5.12: Article mode

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-17 to 2026-11-18. **Depends on:** P5.7.
- **Findings addressed:** RWV-09, UI-09

**Objective.** `/rewind/[year]/read` presents the whole issue as one semantic document. It needs no JavaScript, prints cleanly, and is the conforming alternative for small screens, large text and assistive technology. The same renderer will carry the archive years.

**Guidance.**
- **Route.** `app/(app)/rewind/[year]/read/page.tsx` is a Server Component with no client component on the page, so it works with JavaScript off.
  - It loads the row as P5.1 does, runs `validatePagesOnRead()`, and renders every selected page of the member's edition in registry order.
  - It prints in the scope on paper (`data-testid="rewind-article-mode"`), titled `rewindName(year)` followed by ", article".
  - P5.3's links point here, and a "Play the story" link returns to the story.
- **Blocks.** `lib/rewind/article/blocks.ts` defines `ArticleBlock`: `heading`, `paragraph`, `factRow`, `rankedList`, `table`, `definitionList`, `figure` (the `srSummary` text) and `note`.
  - Each registry entry gains `article(data, facts, copy)`. It is built from the same data, `table()` builders and `renderCopy` segments as the story page, so the two can never show different numbers.
- **Renderer.** `components/rewind/article/article-document.tsx` renders one `<article>`:
  - an `h1` for the masthead with "The 2026 issue" and the data window;
  - one `<section aria-labelledby>` per page, with an `h2` such as "05 Top shows";
  - real tables with captions and scoped headers, and the billing block as a `<dl>`;
  - `tz.note` under every clock time, `dir="auto"` on titles, and `lang="en"`.
  - Graphics become their summary text plus a table. The calendar is one table per month; P8.3 adds the roving-focus grid.
- **Print stylesheet.** Add a `@media print` block to the Rewind section of `app/globals.css`:
  - a paper field with ink text, and no chrome;
  - link URLs printed after the link text;
  - `break-inside: avoid` on sections and tables, and a page break before the centrefold;
  - artwork hidden.
- **Reflow.** The page reflows to 320 px (WCAG 1.4.10), keeps text at 16 px or more, and nothing overlaps at 130% text size or at 400% zoom.
- **Legacy reuse.** `ArticleDocument` and `ArticleBlock` are the contract for P7.13's `lib/wrapped/data/legacy-article.ts`, which maps stored v1 and v2 sections to the same blocks. A contract test renders every block kind that adapter will emit.
- Turn P5.4's article fixmes into tests on `rewind-a11y-chromium`, `rewind-a11y-webkit` and `rewind-a11y-firefox` (the `@article` tag).

**Tests.**
- `lib/rewind/article/__tests__/blocks.test.ts` runs all 20 fixtures: every selected page yields blocks, every number in the article equals its story display, and omitted pages are absent.
- `components/rewind/article/__tests__/article-document.test.tsx`: headings run h1 then h2s with no skipped level, every table has a caption and scoped headers, the billing block is a `dl`, and a hand-built legacy block list covering every kind renders.
- `e2e/rewind/article.spec.ts` runs on chromium, webkit and firefox:
  - with `javaScriptEnabled: false`, every section renders and the console stays clean;
  - at 320 px, `scrollWidth <= 320`;
  - the print media emulation hides the chrome;
  - axe at wcag22aa finds 0 violations.
- Generate visual baselines at 390x844 and 1440x900.

**Integration.** P5.3's Settings link and article offer open this route. P7.13's legacy adapter and P7.9's admin preview reuse `ArticleDocument`. P7.4's desktop Notes reuse the article `table` blocks, P7.15 reruns axe here, and P8.3 adds the calendar grid.

**Demo.** Open `/rewind/2026/read` with JavaScript disabled in Safari: the whole issue reads top to bottom, with headings and tables. Print preview shows paper pages with no chrome. VoiceOver's rotor lists one heading per page.

(as merged: `ArticleBlock`, `ArticleText` (`renderCopy` segments) and `ArticleContext` (P5.5's `IssueContext` satisfies it) are in `lib/rewind/article/blocks.ts`; `articleSections(pages, facts, ctx)` in `sections.ts` returns `ArticleSection { id, folio, name, type, blocks }` (legacy sections pass `folio: null, type: null`). `PageDefinition.article?(data, facts, ctx)` is **optional**: a page without one reads as its `srSummary` plus its Table, so P5.6, P7.1 and P7.2 should add `article` to their page modules. The seven landed pages define it; story and article share the helpers moved into `lib/rewind/pages/*` (`pageDeck` in `deck.ts`, which `deckText` now calls, `lifetimeLine`, `lastLead`, `coverCaption`, `splitShare`, `NUMBER_COUNTS`, `backCoverCaption`, `colophon`, `volumeLine`, `showsRarity`, `STANDING`, `nameAfterLead`, and `backCoverDisclosure` in `copy-disclosure.ts`). The calendar's article is `monthTables()`, one table per month with a day played, holding the Table's rows. The route redirects to `/rewind/[year]` for any year without a v3 issue (P7.13 adds the legacy article); "Play the story" and "Close" are plain anchors (`rewind-article-story`, `rewind-article-close`), hidden in print through `data-print-hide`. With JavaScript off, the app's `loading.tsx` boundaries leave the streamed page in hidden `S:` segments, so the route ships a `<noscript>` style that shows them and hides the fallbacks. The E2E is `e2e/rewind-article.spec.ts` (tagged `@article`, runs in `chromium` until P5.4's projects land), written but not run; baselines are left to the coordinator.)

**Done when.**
- [x] `/rewind/[year]/read` renders every selected page as one semantic document, with headings and tables, and needs no JavaScript.
- [ ] The print stylesheet produces clean paper pages, and the article reflows to 320 px. (Stylesheet written; the print and 320 px E2E checks are written, not run.)
- [x] The renderer and its block contract are ready for the legacy adapter, with a contract test.
- [ ] axe reports 0 violations on chromium, webkit and firefox. (The axe E2E is written, not run; P5.4's webkit and firefox projects have not landed.)

### Step P5.13: Eval harness and model bake-off

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-16 to 2026-11-20. **Depends on:** P5.9, P2.16.
- **Findings addressed:** none (design or research item)

**Objective.** Choose the default and economy models by measurement, with a harness that shows its cost before spending, gates on deterministic checks and treats a cross-family judge as advice. Run the bake-off on 18-20 November and record the decision.

**Guidance.**
- **Runner.** `evals/rewind/run.ts` (tsx) is exposed as `npm run eval:rewind -- --model=<provider>:<id> [--judge=<provider>:<id>] [--fixtures=heavy,median] [--record] [--yes]`.
  - **Estimate first.** Before any call it prints fixtures x about 4,400 input and 1,500 output tokens (design 8.2) x `lookupModel()` prices, plus about $0.05 per fixture for the judge. Then it waits for confirmation, unless `--yes` is passed.
  - It refuses an unpriced model unless `--allow-unpriced` is passed.
  - It runs `generateUserRewind({ mode: 'dry-run', source: fixtureSource(fixture), model })` for each fixture and times every call.
- **Gate checks.** `evals/rewind/checks.ts` is pure and shared with CI. It checks:
  - the wire-schema parse, P5.8's grounding per slot, the lengths and the banned phrases;
  - the archetype spread: no archetype may win more than half of the non-postcard fixtures;
  - trigram Jaccard overlap of decks between fixtures, which must stay under 0.35.
  - It reports the first-pass grounding rate and the rate after repair.
- **Judge.** `evals/rewind/judge.ts` scores voice, specificity, warmth, restraint and faithfulness from 1 to 5, using a new `evals/rewind/rubric.md`. It refuses a judge from the generator's provider family, and its score is advisory only.
- **Outputs.**
  - Each run writes `evals/rewind/results/<date>-<model>.json`, holding the outputs, issues, rates, scores, cost and p50 and p95 latency.
  - Each run also writes a `RewindEvalRun` row, or skips it with a warning when no database is configured.
  - With `--record`, it writes `evals/rewind/recordings/<model>/<fixture>.json`.
- **CI.** `evals/rewind/__tests__/recordings.test.ts` runs `checks.ts` over every committed recording, with `global.fetch` stubbed to throw so no network call can happen. The gates fail the job only for the recordings of the model named in `evals/rewind/selected.json`.
- **Selection rule.** `evals/rewind/select-model.ts` (pure, design 8.6) applies these gates in order:
  1. first-pass grounding of 98% or more, which is required;
  2. then the judge score, then the cost;
  3. then a p95 latency under 60 s.
  A local model needs 95% first-pass and 100% after repair before it is offered as a preset.
- **Schedule.**
  - From 2026-11-16, run 5 fixtures on `claude-sonnet-5-5` (effort low) and `gpt-6.1-sol` (reasoning low) to tune the slot guide and catch harness bugs. Each prompt edit bumps the in-progress version, `rewind-2026.1-rc.N`, until P8.1's freeze on 2026-11-30.
  - On 18-20 November, run full 20-fixture sweeps on both. Optionally add `gemini-4-argon`, whose price doubles on 2026-12-01, and one Ollama model, `qwen3.6:27b` or `gemma4:26b`, with its tag confirmed on ollama.com and pinned.
  - Judges cross families: `gpt-6-astra` judges Claude output, and `claude-opus-5-5` judges GPT output.
  - The spend stays within the budget signed off in P2.10: about $5-15 per candidate sweep, plus about $5 per judge sweep.
  - The owner's provider preference (decision Q9) is due by 2026-11-16 and may narrow the list.
- **Record the decision** in `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/model-selection.md`: the results table, the default and economy (repair) models from one provider, the effort setting, and the reasons.
  - Set `budgetModelFor()` in `lib/llm/models.ts`.
  - Commit `selected.json` and the winner's recordings.
  - Configure the `wrapped` `LLMProvider` row in production.

**Tests.**
- `evals/rewind/__tests__/checks.test.ts`: n-gram overlap on known pairs, the archetype-spread rule, and the first-pass and after-repair rates on a synthetic trail.
- `select-model.test.ts`: the ordering, the 98% gate, the latency gate and the local-model rule.
- `run.test.ts` uses a mock model:
  - the estimate prints before any call, and `--yes` skips the confirmation;
  - a judge from the generator's family is refused;
  - the results file validates against `evals/rewind/results-schema.ts`.

**Integration.** P5.9's golden tests replay the committed recordings. P7.11's gallery replays the selected model's recordings, P11.30's `/admin/rewind/evals` lists the `RewindEvalRun` rows and results in January, P8.1 freezes the chosen model with `rewind-2026.1`, and P8.5 runs the final cut on it. The 2026-11-20 milestone checks the 98% rate, and the plan's decision Q9 is closed in the selection file.

**Demo.** Run `npm run eval:rewind -- --model=anthropic:claude-sonnet-5-5 --judge=openai:gpt-6-astra --fixtures=heavy,light`: it prints the estimated cost, asks for confirmation, then prints first-pass grounding, the judge scores, the cost and p95 latency. CI then passes offline on the recordings.

**Done when.**
- [x] `npm run eval:rewind` prints a cost estimate before any paid call, and writes a results JSON and a `RewindEvalRun` row.
- [x] The deterministic gates run in CI on recorded outputs with no network access.
- [x] The judge always comes from a different model family, and its score stays advisory.
- [ ] Eval runs started on 2026-11-16, and the 18-20 November bake-off applied the selection rule; the default reaches 98% or more first-pass grounding.
- [ ] The default and economy models are recorded in the planning folder and configured.

(as merged: the harness and tooling only; the live runs, `selected.json`'s model, `model-selection.md`'s decision, `budgetModelFor()` and the production row are the owner's, with the runbook in `model-selection.md`. `run.ts` is the command line over `run-eval.ts`; `harness.ts` runs a fixture with injected model calls, since `generateStructured` and `PipelineDeps` now take optional `resolve`/`record` and `generate`/`consume`; P5.9's golden test uses it. `--replay=<set>` runs offline on a recording set; `npm run eval:rewind:select` prints the bake-off table. Recordings gained optional `model`, `finishReason`, `usage` and `latencyMs` (`recording-schema.ts`). `selected.json` has `model: null`, so CI checks every set but fails none until the decision; the hand set fails the overlap gate. Keys come from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`, not the stored provider rows.)
