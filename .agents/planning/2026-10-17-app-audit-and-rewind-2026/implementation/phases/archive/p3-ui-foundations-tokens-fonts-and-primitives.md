> Part of the [implementation plan](../../plan.md): the index, timeline, milestones and progress checklist live there. This phase is done.

## Phase 3: UI foundations: tokens, fonts and primitives

**Goal.** Design-system Phase 1 (`design/ui-design-system.md` 9.2): the semantic tokens and the Rewind scope contract, fonts and the root layout, Base UI primitives behind adapters, the primitives Rewind needs, and the shared `lib/ui` and format modules.

The token codemod and the spinner and icon sweeps (formerly P3.11 to P3.13) now run in January as P10.13 to P10.15. Their slices restyle pages that P10 rebuilds anyway, and none of them has a Rewind consumer. This departs from ui-design-system 9.2 Phase 1 item 6, in the same way as Appendix C decision 22 (see decision 28).

**Window.** 2026-10-26 to 2026-11-05. The phase passes the "UI foundations ready for Rewind" milestone on Friday 2026-11-06: tokens and the scope contract, Sheet, Toggle, Slider, SegmentedControl and the ink Button entries are merged, the token sync and contrast tests pass, and `lib/utils/format.ts` has replaced the old formatters.

**Tracks.** Every step runs in the UI lane, at most two PRs open at a time. The lane's order is P3.1, then P3.4 with P3.3, P3.8 and P3.10 beside it, then P3.6, P3.5, P3.7 and P3.9, with P3.2 last.

**Rewind-critical steps.** P3.1, P3.4, P3.6 and P3.7 are on the chain that ends at the story player (P5.2 starts on 2026-11-09), and P3.10 feeds P2.13's typesetting. P3.5 and P3.9 feed P6.5's DataTable, the season console's one hard UI dependency. These steps have priority over every other UI step. P3.7's fallback stands: if it slips past 2026-11-06, P5.2 builds its sheets on Base UI Dialog inside `components/rewind` and swaps them to Sheet afterwards. P3.2 and P3.8 have consumers later (P5.4's zoom checks, P4.15), so they may slip two days.

**Ordering that matters.**
- P3.1 adds `className="dark"` to `<html>` in the same PR. Without it, the new body canvas paints the light `:root` values. P3.2 then composes the class with the font variables.
- P3.4 creates `app/dev/ui/page.tsx`, a primitives sheet that P3.5 to P3.9 extend and P6.5 grows into the composites reference. It is the Playwright visual target, and it is the production importer that stops `knip --production` (P1.5) from failing on primitives that have no caller yet.
- P3.5 creates `components/ui/portal-container.tsx`, which P3.6 and P3.7 import. If P3.6 merges first, it creates the file and P3.5 rebases on it.
- Several steps touch the same files: `components/ui/button.tsx` (P3.4, P3.7), `eslint.config.mjs` (P3.4 to P3.7, P3.10), `app/layout.tsx` (P3.1, P3.2, P3.9, P3.10) and `lib/providers.tsx` (P3.6, P3.10, and P2.15's `MotionConfig`). Rebase onto whichever merged first; never resolve these files by hand without re-running their tests.
- `no-restricted-syntax` selectors live in one module, `eslint/restricted-syntax.mjs`, created by P3.4. It exports one array of selectors per glob (`components`, `actionsAndApi`, `rewindCards`, ...), and `eslint.config.mjs` builds one block per glob from those arrays. In flat config a later block's `no-restricted-syntax` replaces an earlier one for the same files, so P3.5 to P3.10, P4.3 (`actions/**` and `app/api/**`) and P5.10 (`lib/rewind/cards/**`) extend the arrays instead of adding blocks. Each rule gets a lint fixture test in `eslint/__tests__/restricted-syntax.test.ts` in the step that adds it.
- Every styling PR regenerates its visual baselines through the P1.6 workflow. In the same PR it lowers `design-debt.json` (P1.8, `npm run design:update`) and `e2e/a11y/axe-baseline.json` (P1.7, `UPDATE_AXE_BASELINE=1`) wherever counts fell.

### Step P3.1: Semantic tokens and the Rewind scope contract

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-10-26 to 2026-10-27. **Depends on:** P1.6, P1.7, P1.8.
- **Findings addressed:** UI-18, UI-16, UI-15, UI-12

**Objective.** Replace today's `app/globals.css`, which holds six animation tokens and six cinematic colours, with the token file of `design/ui-design-system.md` 4.1. It carries the light and dark sets, the unlayered Rewind ink contract (4.4, Rewind 5.2 and 5.3), the Tailwind mapping, the type steps, and a base layer with the reduced-motion clamp. The v2 viewer keeps rendering through temporary aliases, and every screenshot diff is reviewed.

**Guidance.**
- Write the file in the order of 4.1, with every theme block unlayered:
  1. `@import "tailwindcss"; @import "tw-animate-css";`, adding `tw-animate-css` as an exact dependency for the generated primitives (P3.4). Then the bounded `@custom-variant dark (&:where(.dark, .dark *):not(:where(.light, .light *)));`. `shadcn/typeset.css` waits for P3.8.
  2. `:root` holds every light value in 3.3, plus `--radius`, `--focus-width` and `--focus-offset` (2px), the 10% `-subtle` mixes, `--overlay`, the three `--elevation-*` values and the `--z-*` scale.
  3. `.dark` holds every dark value in 3.2, with `--primary-indicator: var(--primary)`, the 14% mixes and the dark elevations.
  4. The Rewind block sits between `/* rewind-scope:start */` and `/* rewind-scope:end */`, the markers that P1.8's guard reads. It contains:
     - `[data-theme="rewind"]` with the twelve `--rw-<ink>`, `--rw-on-<ink>` and `--rw-<ink>-deep` triples (Rewind 5.2), the font, `--rw-dur-*` and `--rw-ease-*` variables;
     - twelve `[data-theme="rewind"][data-archetype="<id>"]` rules from Rewind 5.3, using the ids of `ARCHETYPES` in `lib/wrapped/llm-output-schema.ts`. Premiere Chaser has no spot colour, so its `--arch-spot` is `var(--rw-on-coral)`;
     - the `[data-field]:where(...)` remap with the full closing set, the twelve `[data-field="<ink>"]` rules with their `color-scheme`, and the `data-spot="arch"` and `data-ink="arch-deep"` rules;
     - the dashed disabled-button rule, the `font-display` and `font-text` utilities, and the literal `::view-transition-group(rewind-field)` rule.
  5. `@theme inline` maps every `--color-*`, the radius scale, the three shadows, `--font-sans` and `--font-mono` (system fonts until P3.2 defines `--font-plex-*`), and the single-size `--text-*` steps. `@theme static` holds the motion tokens and `--animate-skeleton`. Then come the `text-display`, `text-h1` and `text-stat` `@utility` rules.
  6. `@layer base` exactly as in 4.1, including the `:focus-visible` outline and the reduced-motion block that skips `[data-slot="spinner"]` and the Rewind scope.
- Take values from the measured sheets, not by retyping: `node .agents/planning/2026-10-17-app-audit-and-rewind-2026/design/mockups/ui/source/tools/tokens.js --css <out>` prints both app themes, and `rwcheck.js` holds the ink triples. P3.3's sync test pins them afterwards.
- Delete:
  - `html, body { height: 100%; overflow-x: hidden }` and the `@supports (height: 100dvh)` block (UI-18);
  - the six cinematic `@theme` colours;
  - the `float`, `wiggle`, `twinkle`, `blink` and `gradient-shift` keyframes, with their `--animate-*` tokens (UI-15). Their call sites in `wrapped-card.tsx:227`, `:334`, `announcements-card.tsx:33` and `wrapped-generating-animation.tsx:85`, `:142` simply stop moving.
  - Keep the one-shot `fade-in`, and keep `grain` (`components/wrapped/cinematic/film-grain.tsx:11`) until P11.29.
- Temporary aliases go in their own `@theme inline` block, marked `/* temporary cinematic aliases: delete in P11.29 */`. They are `--color-stage: var(--background)`, `--color-stage-panel: var(--card)`, `--color-gold: var(--primary)`, `--color-gold-bright: var(--primary-hover)`, `--color-ivory: var(--foreground)` and `--color-taupe: var(--muted-foreground)` (9.2 phase 1, item 1). The 25 files that use `text-gold`, `bg-stage` and similar still compile. The v2 viewer turns amber on graphite, and the reviewed diff shows it.
- In `app/layout.tsx`, change only `<html lang="en">` to `<html lang="en" className="dark">`.
- In `lib/utils.ts`, build `cn()` on `extendTailwindMerge`. Register `text-display|h1|h2|h3|lead|body|ui|label|caption|stat` in the font-size group, `shadow-popover|dialog|poster` and `animate-skeleton`. Without this, tailwind-merge reads `text-h2` as a colour, and `cn('text-h2', 'text-foreground')` drops one of the two.
- Pitfalls to check in the diff review:
  - `body` gets `text-body` (15px), so every unsized text drops from 16px. The `* { border-border }` rule recolours every bare `border`.
  - `focus:outline-none` on today's controls suppresses the new ring until P3.4 and the codemod remove it.
  - Inline spinner SVGs have no `data-slot="spinner"`, so they freeze under reduced motion until P10.15.
  - Overlays that relied on `<body>` being the scroller (`fixed inset-0`, `h-full`) need a manual check at 390px.

**Tests.**
- New `app/__tests__/globals-css.test.ts`, in the node environment, reads the file as text:
  - the height rule and the five keyframes are gone, and the dark variant is the bounded form;
  - no `@layer` wraps `:root`, `.dark` or the Rewind block, and they come in that order;
  - the markers enclose every `--rw-`, `--field`, `--ink` and `--arch-` declaration;
  - the reduced-motion block names `[data-slot="spinner"]` and `[data-theme="rewind"]`;
  - the twelve `data-archetype` selectors equal the `ARCHETYPES` ids.
- New `lib/__tests__/cn.test.ts`: `cn('text-h2', 'text-foreground')` keeps both, and `cn('text-muted-foreground', 'text-foreground')` and `cn('shadow-popover', 'shadow-dialog')` keep the last.
- New `e2e/theme-contract.spec.ts` on signed-out `/`:
  - `<html>` carries `dark`, and `body` computes to `rgb(26, 28, 30)`;
  - `window.scrollTo(0, 400)` scrolls `document.scrollingElement`, which is `<html>`;
  - a fixture injected with `page.evaluate`, `<div data-theme="rewind"><section data-field="marigold" class="light"><span style="color: var(--foreground); background: var(--background)">`, computes to `#1f1306` on `#feb644`. With `ultramarine` and `class="dark"` it computes to `#f1eadc` on `#2238b8`.
- Regenerate every P1.6 baseline through the workflow. The PR lists each changed screen with a one-line reason.

**Integration.**
- P3.3 mirrors these values in `lib/design/tokens.ts`. P3.4 generates the primitives against these names, and P10.13 and P10.14 move call sites onto them in January.
- Lower the axe baseline wherever a solid canvas made "incomplete" contrast results measurable (UI-12). Run `npm run design:update` after the deletions.

**Demo.** Open `/` and `/admin/users` beside `main`. The canvas is graphite, native scrollbars and date pickers render dark, `window.scrollTo` works, and the v2 viewer renders in amber on graphite. Turn on reduced motion in DevTools: the remaining CSS loops stop, and a `data-slot="spinner"` element keeps turning.

(as merged: `tw-animate-css` is pinned at 1.4.0, and `knip.json` lists `app/globals.css` as a project file so knip's Tailwind compiler sees the CSS import. The archetype rules write `--arch-deep` as `var(--rw-<field>-deep)` for every archetype (the dark inks' deep is their field), with the Curator on `var(--rw-ultramarine-deep)`; `globals-css.test.ts` checks them against `ARCHETYPE_STYLE` in `lib/wrapped/archetypes/catalogue.ts`, where `ARCHETYPES` now lives, and checks that every field and `altField` in `lib/rewind/registry.ts` is one of the twelve inks. `--font-sans` and `--font-mono` are Tailwind's system stacks until P3.2. The one-shot `fade-in` and the v2 `grain` sit in their own `@theme` block. `theme-contract.spec.ts` compares colours within 1/255 per channel, because Chromium renders the marigold ink as `#1f1406`. `e2e/visual/screenshot.css` drops its height workaround. The 36 changed baselines were regenerated locally on a production build, not through the workflow; the axe baseline lost `color-contrast|serious` on `/wrapped`, `/wrapped/2026` and the v2 share page, and no design-debt count fell.)

**Done when.**
- [x] `app/globals.css` matches 4.1 and 4.4 section by section, with the Rewind block between the markers.
- [x] The height rule, the cinematic colours and the decorative loops are gone, and the aliases are marked for deletion in P11.29.
- [x] `globals-css.test.ts`, `cn.test.ts` and `theme-contract.spec.ts` pass.
- [x] The baselines are regenerated with every diff explained, and the axe and design-debt baselines are lowered where counts fell.

### Step P3.2: Fonts and root layout

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-04 to 2026-11-05. **Depends on:** P3.1, P4.1.
- **Findings addressed:** UI-11, UI-20, UI-10, BP-05, RWV-09, UI-07

**Objective.** Load IBM Plex through `next/font`, and make the root layout correct for every page: zoom allowed, a skip link to one `<main id="main">` per route, a token canvas, real titles, an announced toast region, and status codes in the URL turned into toasts. Enable `typedRoutes`.

**Guidance.**
- Write `app/fonts.ts` exactly as in `design/ui-design-system.md` 3.6: `IBM_Plex_Sans` with `axes: ['wdth']` and five subsets, and `IBM_Plex_Mono` at 400, 500 and 600, with the variables `--font-plex-sans` and `--font-plex-mono`. `next/font/google` downloads the files at build time. If the Docker build stage has no egress to Google Fonts, switch to `next/font/local` with the WOFF2 files from IBM's OFL release, keeping the same variables (UI-20, BP-05).
- `app/layout.tsx`:
  - `<html lang="en" className={cn('dark', plexSans.variable, plexMono.variable)} suppressHydrationWarning>`.
  - `viewport` is `{ width: 'device-width', initialScale: 1, themeColor: '#1a1c1e' }`, with `maximumScale` and `userScalable` removed (UI-11, BP-05, RWV-09).
  - `metadata` sets `metadataBase: new URL(env.NEXT_PUBLIC_APP_URL)` from P4.1's `lib/env.ts` and `title: { template: '%s - Plex Manager', default: 'Plex Manager' }`. Keep `icons` until P3.9 replaces them with file-based icons and turns this into `generateMetadata` on `serverName()`.
  - `<body className="min-h-dvh bg-background text-foreground">`, whose first child is the skip link: `<a href="#main" data-testid="skip-to-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-(--z-toast) ...">Skip to content</a>`.
  - Then `<Providers>{children}<Suspense fallback={null}><FlashFromQuery /></Suspense></Providers>`.
- One `<main id="main" tabIndex={-1} className="outline-none">` per route (UI-10). Following 4.1 and section 8 (2.4.1), the root layout holds the skip link and each segment layout holds the `main`, so the admin sidebar and the future member top bar stay outside it:
  - add the id to the existing mains in `app/auth/layout.tsx`, `app/invite/layout.tsx`, `components/admin/shared/admin-layout-shell.tsx:30`, `app/subscribe/page.tsx`, `app/subscribe/success/page.tsx`, `app/error.tsx` and `app/loading.tsx`;
  - add a `main` around the children of `app/(app)/layout.tsx` (after `SubscriptionBanners`), `app/onboarding/layout.tsx` and `app/setup/layout.tsx`;
  - turn the nested mains into `div`s in `app/(app)/page.tsx`, `components/dashboard/user-dashboard.tsx`, `app/(app)/wrapped/layout.tsx`, the `loading.tsx` and `error.tsx` files under `app/(app)/wrapped`, `app/auth/callback/plex`, `app/invite/[code]`, `app/setup` and `app/onboarding`, the immersive pages `app/admin/users/[userId]/wrapped/page.tsx` and `app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx`, and P1.1's `/discord/link` page.
- The toast slot: `ToastProvider` already renders its container after `{children}`, outside every `main`. Make it `<section aria-label="Notifications" data-testid="toast-viewport">` at `z-(--z-toast)`. Give each item `role="status"`, or `role="alert"` for errors, and `data-testid="toast"`, so today's 105 toast calls are announced (UI-10). P3.6 swaps the implementation behind the same slot.
- `FlashFromQuery` (UI-07):
  - `components/ui/flash-from-query.tsx`, a client component, reads `flash`, `status` and `error` from `useSearchParams()`. It looks each value up in `lib/ui/flash-codes.ts` and shows the mapped toast.
  - Codes: `discord_linked`, `discord_rate_limited`, `discord_unavailable` and `discord_failed`; the callback's legacy `status=linked`; and NextAuth's `CredentialsSignin`, `AccessDenied`, `Configuration`, `Verification` and `Default`.
  - It then calls `router.replace` with those params (and `error_description`) removed, keeping the others, with `{ scroll: false }`.
  - Unknown values are dropped and never rendered, because query text is attacker-controlled (SEC-20).
- Send codes from both Discord routes now, so the flash has something to show. `app/(app)/discord/connect/route.ts:25-31` sends `?flash=discord_rate_limited` and `:39-43` sends `discord_unavailable`. `app/api/discord/callback/route.ts:35-48` sends `discord_linked` or `discord_failed`. Both log the raw reason server-side. P6.11 builds the account and link pages on these codes.
- Set `typedRoutes: true` in `next.config.js`. Run `npx next typegen` before `tsc` in P1.5's `typecheck` script, so CI has `.next/types/routes.d.ts`. Template hrefs that match a dynamic segment type-check as written. External URLs render `<a>` (or `SafeLink` from P3.8), and the rest go through route builders, not casts.

**Tests.**
- New `app/__tests__/layout-metadata.test.ts`: `viewport` has no `maximumScale` or `userScalable` and its `themeColor` is `#1a1c1e`; `metadata.title.template` contains `%s`; the `metadataBase` origin equals `NEXT_PUBLIC_APP_URL`.
- New `components/ui/__tests__/flash-from-query.test.tsx`, with `next/navigation` mocked:
  - a known code shows its toast and calls `router.replace` without that param, keeping the others;
  - `?error=Your account is locked, call 555` shows nothing, the text is absent from the DOM, and the param is stripped;
  - `CredentialsSignin` maps to its sign-in copy.
- Route tests for `/discord/connect` and `/api/discord/callback`: the redirect carries a code and never an error message.
- New `e2e/landmarks.spec.ts` over P1.7's route table (`e2e/a11y/routes.ts`):
  - every route has exactly one `main#main`;
  - the first Tab focuses `skip-to-content`, and Enter moves focus to `main#main`;
  - the viewport meta is `width=device-width, initial-scale=1`;
  - `getComputedStyle(document.body).fontFamily` contains `IBM_Plex_Sans`;
  - `/?flash=discord_linked` shows `getByTestId('toast')` with "Discord linked", and the URL loses the param.
- Update the axe baseline (`meta-viewport`, `region`, `bypass` and landmark rules drop) and the visual baselines (the font changes every screen).

**Integration.**
- P3.6 keeps the toast slot, and P3.9 replaces the static title with `generateMetadata`.
- P6.1 and P6.3 move each `main` into `AdminShell` and `AppShell`, keeping the id. P10.27 adds NextAuth's `pages.error` screen.
- `typecheck` with `next typegen` becomes part of P1.5's required check.

**Demo.** On `/`, press Tab: "Skip to content" appears, and Enter lands in `main`. Pinch-zoom works in Android Chrome. Complete a Discord link: a "Discord linked" toast appears, and the URL is clean. `/?error=anything` shows nothing.

(as merged: the fonts load through `next/font/local`, not `next/font/google`, so a build never fetches a font and the source is pinned: `app/_fonts/` holds IBM's own unmodified WOFF2 releases (`@ibm/plex-sans-variable@0.2.0`, `@ibm/plex-mono@1.1.0`) with their OFL, and `scripts/plex-fonts.lock.json` pins each tarball and file by sha256 (`scripts/fetch-plex-fonts.mjs` re-copies them; `scripts/__tests__/plex-fonts.test.ts` checks them). IBM's variable Plex Sans has `wdth` 85 to 100 (Google's has 75 to 100), enough for the 85% and 92% the design uses. It ships split by script (Latin1, Latin2, Latin3 for Vietnamese, Pi, Greek, Cyrillic); `next/font/local` takes one `unicode-range` per call, so `app/fonts.ts` makes one call per subset on one family, and only Latin1 (69 KB) is preloaded. next/font names a call's class and variable after its JS name whatever `font-family` the `@font-face` declares, so the shared family is `plexSans` (`--font-plex-sans: "plexSans", "plexSans Fallback"`); the body's computed font contains `plexSans`, not `IBM_Plex_Sans`. `plexFontClassNames` puts every subset's faces on `<html>`. Plex Mono is the three complete files, not preloaded. The title template stays P3.9's `%s - {serverName}`, and `metadataBase` stays P3.9's (`NEXT_PUBLIC_APP_URL`, else `NEXTAUTH_URL`); the viewport test is in `app/__tests__/root-metadata.test.ts`. The toast slot was already P3.6's (a `<section>` named "Notifications" by Base UI, `role="status"`/`"alert"` items, `z-(--z-toast)`), so it is unchanged. `FlashFromQuery` strips the params with `history.replaceState` (Next keeps `useSearchParams` in step, with no server round trip and no `Route` cast), and only once the document has loaded and no streamed `[hidden][id^="S:"]` content is left: an update above `app/loading.tsx`'s boundary before React reveals it renders a second copy of the page beside the hidden one. `flash` and `error` (with `error_description`) are always stripped; `status` only when it is `linked`, because `/admin/queues` filters on `status`. The flash error copy lives in `lib/ui/error-copy.ts` under `FlashErrorCode`; `lib/plex-sign-in-codes.ts` is left for P10.27. The callback already sent codes (P4.9), so only `/discord/connect` changed. Mains: the admin layout's gate screens and the root `error.tsx`'s auth branches render inside a `main#main`, and a minimal `app/not-found.tsx` (Next's 404 text on the token canvas, `not-found-heading`) gives the 404 a `main#main` so the skip link has a target; P10.17 redesigns it. `e2e/a11y/routes.ts`'s `ready` is now always a test id. `typedRoutes` needed only the admin nav's `href: Route`. The axe baseline fell by 59 `region`, 39 `meta-viewport` (all), two each of `landmark-unique`, `landmark-no-duplicate-main` and `landmark-main-is-top-level`, and one `color-contrast|incomplete` on `/admin/users/regular-user-id` (61 to 60); the 404 scan is now clean. That last count is order-dependent: 60 when the axe specs run alone, 61 in the full suite after the setup-wizard project has changed the seeded data, so the full-suite run reports it as a rise until the phase E2E settles it. All 62 visual baselines were regenerated locally on a production build (desktop and mobile in one run, the setup screens in another, since the wizard renames the server): every screen's text is now Plex Sans, and the 404 is dark. design-debt lost `app/layout.tsx`'s two `zoom-lock` counts.)

**Done when.**
- [x] Plex Sans and Plex Mono load through `next/font` on every page.
- [x] No route has zoom locks, and every route has one `main#main` reached by the skip link.
- [x] Toasts sit in a "Notifications" region and are announced.
- [x] `FlashFromQuery` handles every code in `flash-codes.ts`, and never renders query text.
- [x] `typedRoutes` is on, and typecheck passes with generated route types.
- [x] The axe and visual baselines are updated.

### Step P3.3: Token mirror module and contrast tests

- **Track:** ui. **Lane:** UI. **Effort:** S. **Window:** 2026-10-28 to 2026-10-28. **Depends on:** P3.1.
- **Findings addressed:** UI-12

**Objective.** Mirror the CSS tokens in one TypeScript module for Satori, Chart.js and Rewind (`design/ui-design-system.md` 4.3). Prove in Jest that the two stay in sync, and that every text pair passes WCAG: 4.5:1 in both app themes and 7:1 on every Rewind ink.

**Guidance.**
- `lib/design/tokens.ts`, as specified in 4.3:
  - `TokenName` is a union of every colour name in 3.2, including the extras, `sidebar-*` and `overlay`. `TokenValue` is `{ oklch, hex }`, and `themes.dark` and `themes.light` use `satisfies Record<'dark' | 'light', Record<TokenName, TokenValue>>`.
  - `InkName`, `RewindInk` (`field`, `on`, `deep`, `spot`, `scheme`) and `rewindInks` hold the twelve inks of Rewind 5.2.
  - `archetypeInks` maps each archetype id to `{ field: InkName; spot: InkName | 'own'; deep: InkName }` from Rewind 5.3. The back-cover ink is `rewindInks[deep].deep`, which covers the Curator, whose deep ink is ultramarine.
  - `inkProps(ink, opts?)` returns `{ 'data-field', className: rewindInks[ink].scheme, 'data-spot'?, 'data-ink'? }`, with the 4.3 options `{ spot: 'arch' }` and `{ ink: 'arch-deep' }`.
  - `radius` and `fonts` constants.
- `lib/design/color.ts`, a pure TypeScript port of `design/mockups/ui/source/tools/color.js`:
  - `oklch()` to sRGB, `hex()`, `contrast()`, `mix()` (sRGB compositing, as the browser does), and a parser for `oklch(L% C H)` and `oklch(... / a)`;
  - the Machado CVD matrices from `tokens.js`.
  - `lib/ui/poster-palette.ts` (P3.9) and Rewind's registry test (P5.5) reuse it.
- `lib/design/__tests__/tokens.test.ts` runs the six checks of 4.3:
  1. Sync: a small parser strips comments, reads the `:root`, `.dark`, `[data-theme="rewind"]`, `[data-field]:where(...)` and twelve `[data-field="<ink>"]` blocks of `app/globals.css`, and asserts that the names and every `oklch()` string equal `tokens.ts`. `var()` references resolve within their block.
  2. Hex: every `oklch` converts to the stored hex within 1/255 per channel.
  3. App contrast: every pair in the 3.4 tables, for both themes:
     - text at 4.5:1 on background, card, popover, muted, secondary, accent and sidebar;
     - badges, with the tone composited at 14% (dark) or 10% (light) over each surface;
     - the alerts and fills;
     - `input`, `ring` and `primary-indicator` at 3:1 as non-text marks.
  4. Rewind contrast:
     - for each ink, the ink on its field, the deep ink on paper and the paper popover at 7:1 or better;
     - the spot against the field at 3:1;
     - every `archetypeInks` field and spot pair at 3:1.
  5. Closing set: every token that a `components/ui/*.tsx` recipe reads is declared in the `[data-field]` remap. The test greps `(bg|text|border|ring|outline|fill|stroke|divide|placeholder|shadow)-<token>` and `var(--<token>)`, ignoring `sidebar-*`.
  6. Charts: `chart-1` to `chart-5` are each 3:1 or better against `card`, and adjacent slots stay at OKLab ΔE x100 of 10 or more under deutan and protan simulation, in both themes.
- Keep the computed tables as a Jest snapshot beside the threshold assertions, so a token change shows the new ratios in review.
- `lib/design/__tests__/recipes.test.ts`: in `components/ui/{switch,checkbox,slider,progress,stepper,segmented-control}.tsx`, `bg-primary` and `border-primary` without an `-indicator`, `-foreground` or `-hover` suffix fail (3.4). Missing files are skipped; P3.5 and P3.7 make the test bite.
- `lib/design/testing.ts` exports `expectNoDarkInsideLight(container)` for Rewind component tests from P5 onwards (4.4), with a self-test here.
- `archetypeInks` keys must equal the `ARCHETYPES` ids. If P2.9 moves the ids, it repoints this test.
- `tokens.ts` has no production importer until P3.7 and P3.9. Add it to `knip.json`'s `entry` list with a comment, and remove the entry in P3.9.

**Tests.** The module's own tests are the deliverable:
- `tokens.test.ts` (sync, hex, app and Rewind contrast, closing set, charts) and `recipes.test.ts`;
- `lib/design/__tests__/color.test.ts`, which checks `color.ts` against known values: `#1a1c1e` from `oklch(22.5% 0.005 255)`, 15.45:1 for foreground on background, and 15.44:1 for ink on paper;
- `inkProps` returns the scheme class and the optional attributes;
- a mutation check written into the test file: changing `--muted-foreground` to `oklch(60% 0.01 255)` in a copy of the CSS string fails both sync and contrast.

**Integration.**
- `lib/charts/theme.ts` and `lib/ui/poster-palette.ts` (P3.9) read `themes` and `rewindInks`. P5.1 sets the scope with `inkProps`, and P5.10's card routes read `rewindInks`.
- The v2 OG route keeps its hex until P5.10 replaces it; P1.8's guard already excludes it.
- P1.5's Jest gate runs these tests on every PR, so a token edit without its mirror fails CI.

**Demo.** Run `npx jest lib/design`, and show the snapshot of ratios. Then edit one oklch value in `globals.css` only: the sync test names the token and both values.

(as merged: `tokens.ts` also exports `subtleAlpha` (`{ dark: 0.14, light: 0.1 }`, the `-subtle` tints, which are `color-mix()` and so not `TokenName`s) and `rewindRemap`, the mirror of the `[data-field]` remap (each token to `field`, `ink`, `spot`, `paper`, `on-paper`, `transparent` or the scope's overlay value), typed over every non-sidebar token so the closing set also holds at compile time. A translucent token's hex carries its alpha (`overlay` is `#08090bb8`). `lib/rewind/registry.ts` and `lib/wrapped/archetypes/catalogue.ts` now import `InkName` from `tokens.ts`, and `archetypeInks` is checked against `ARCHETYPE_STYLE`. The sync check also fails when a colour declared in `.dark` has no remap. The chart checks measure the hex Chart.js receives: from the unquantised OKLCH, dark chart-4 against chart-5 under protan is 9.997, and from the hex 10.06 (3.5's 10.1). The parser, sync and contrast tables are helpers in `lib/design/__tests__/helpers/`; the ratio snapshot is `lib/design/__tests__/__snapshots__/tokens.test.ts.snap`. `expectNoDarkInsideLight` throws an `Error` rather than calling `expect`, so it can live outside a test file. `knip.json` gains `lib/design/tokens.ts!` and `lib/design/color.ts!` (remove in P3.9) and `lib/design/testing.ts!` (permanent, as only tests import it), with comments, which knip reads as JSONC.)

**Done when.**
- [x] `lib/design/tokens.ts` holds `themes`, `rewindInks`, `archetypeInks` and `inkProps`, and `lib/design/color.ts` holds the colour maths.
- [x] The sync, hex, app-contrast, Rewind-contrast, closing-set and chart checks pass.
- [x] The recipe test and `expectNoDarkInsideLight` exist for later steps.
- [x] The knip entry is recorded with its removal step.

### Step P3.4: Base primitives on Base UI behind adapters

- **Track:** ui. **Lane:** UI. **Effort:** L. **Window:** 2026-10-27 to 2026-10-30. **Depends on:** P3.1.
- **Findings addressed:** UI-17, UI-27, UI-44, DUP-14

**Objective.** Add `components.json` and generate the shadcn Base UI Button, Card, Badge and StatusBadge, Alert, Spinner and Skeleton, restyled to the 5.4 recipes. Today's exports stay as `@deprecated` adapters (9.4), so the 41 Button importers and the other call sites keep compiling. Lint starts warning on raw elements.

**Guidance.**
- Add exact versions of `@base-ui/react` and `class-variance-authority`; `tw-animate-css` came in P3.1. Write `components.json` by hand:
  - `rsc: true`, `tsx: true` and `iconLibrary: "lucide"`;
  - `tailwind.css: "app/globals.css"` and `cssVariables: true`;
  - the aliases `ui: "@/components/ui"`, `utils: "@/lib/utils"`, `components: "@/components"`, `lib: "@/lib"` and `hooks: "@/hooks"`;
  - the Base UI style that `shadcn init -b base` proposes (Nova, per `research/modern-ui-stack-2026.md` 2.1). Read it in a throwaway worktree (`git worktree add ../shadcn-probe` on a scratch branch, run `npx shadcn@<exact version> init -b base` there, copy the proposed values into the hand-written `components.json`, then remove the worktree). The research confirms `--dry-run` and `--diff` only for `add`, so `init` is never run in the real checkout, where it would rewrite `components.json`, `globals.css` and `lib/utils.ts`.
  - Pin the CLI: every command uses `npx shadcn@<exact version>`, the version resolved on the day the step starts and recorded in the PR, never `@latest`.
- Read the upstream code with `npx shadcn@<exact version> add button card badge alert skeleton spinner --dry-run --diff`. Never run `add` without `--dry-run` while today's files exist. Port each file by hand:
  - Button (`components/ui/button.tsx`):
    - export `buttonVariants` (cva) with the variants `primary`, `secondary`, `outline`, `ghost`, `destructive`, `destructive-solid` and `link`, and the sizes `sm` (32px), `default` (36px), `lg` (44px), `icon` (36px) and `icon-sm` (32px);
    - deprecated aliases: `danger` to `destructive`, `success` to `secondary` (review its one call site by hand) and size `md` to `default`;
    - links use the `render` prop, `render={<Link href="/x" />}`, with `nativeButton={false}`;
    - `loading` and `loadingLabel` put a Spinner in place of the leading icon, set `aria-busy` and `disabled`, and keep the width by stacking both labels in one grid cell.
    - Pitfall: Base UI renders `type="button"`, and today's Button relies on the implicit submit. Grep every `<form>` file that imports Button, and add `type="submit"` before switching.
  - Card: `Card`, `CardHeader`, `CardTitle` (`text-h3`), `CardDescription`, `CardAction`, `CardContent` and `CardFooter`, as in 5.4. The deprecated `padding` prop wraps the children in `CardContent` with `p-0`, `p-4`, `p-6` or `p-8`.
  - Badge: the variants `neutral`, `outline`, `success`, `warning`, `info` and `destructive`, with an optional `dot` or `icon`. The `tone` adapter maps `danger` to `destructive`.
  - StatusBadge and StatusDot (`components/ui/status-badge.tsx`): presentational for now, taking `{ tone, label, icon?, sub? }`. A word always accompanies the colour (3.1). Create `lib/ui/status.ts` holding only the `Tone` type; P3.9 adds the `STATUS` table and the `domain` and `value` props of 5.5.
  - Alert: the same API (`tone`, `title`, `icon`, `action`) and roles, with `danger` aliasing `destructive`. The icons are lucide `info`, `circle-check`, `triangle-alert` and `circle-x`, replacing the glyph that warning and danger share today.
  - Spinner: lucide `LoaderCircle` with `data-slot="spinner"`, `animate-spin` and `aria-hidden`, plus an optional sr-only label. The `LoadingSpinner` adapter keeps `role="status"`, `aria-label` and the sizes `sm`, `md`, `lg` and `xl`, mapped to 12, 16, 20 and 24px.
  - Skeleton: `bg-muted rounded-md animate-skeleton`, with `PageHeaderSkeleton`, `StatGridSkeleton` and `TableSkeleton` (5.5, UI-44). `LoadingScreen` is restyled on Spinner, without `animate-pulse`, and marked `@deprecated`; P10.17 replaces the route loaders.
  - Icon (`components/ui/icon.tsx`): `<Icon icon={X} size={12 | 14 | 16 | 20} label? />`, with stroke 1.75 (2 at 12px) and `aria-hidden` unless labelled (3.10).
- In the files touched here, remove `forwardRef` (ref is a prop in React 19) and `'use client'` where no hook is used (UI-27). Every primitive forwards `data-testid` to its root and sets `data-slot`. Recipes use the base-layer `:focus-visible` ring, never `focus:` classes.
- ESLint (P1.3's config): create `eslint/restricted-syntax.mjs` (see the phase header) and add `no-restricted-syntax` warnings for JSX `button`, `input`, `select`, `textarea` and `svg` outside `components/ui/**`, with an allowlist for Rewind art and `app/dev/**`. In flat config a later block's `no-restricted-syntax` replaces an earlier one for the same files, so every later step extends this module's arrays instead of adding a block. Add `eslint/__tests__/restricted-syntax.test.ts`, which lints one failing and one passing fixture per selector with the real config, so a later block that drops a rule fails CI. Record the warning count in the PR.
- `app/dev/ui/page.tsx`: a Server Component that calls `notFound()` unless `process.env.ENABLE_DEV_UI === '1'`, with `robots: { index: false }`. It shows every primitive in every variant and state, with `dev-ui-<primitive>` test ids. Add `ENABLE_DEV_UI: '1'` to the Playwright `webServer.env`.
- In `jest.setup.js`, add the jsdom stubs Base UI needs: `ResizeObserver`, `Element.prototype.getAnimations = () => []`, `scrollIntoView`, the pointer-capture methods and `matchMedia`.

**Tests.**
- New `components/ui/__tests__/{button,card,badge,status-badge,alert,spinner,skeleton,icon}.test.tsx`, with Testing Library and `jest-axe` (add exact `jest-axe` and `@types/jest-axe`):
  - Button: it renders a native button; `render={<Link href="/x" />}` gives an `<a href="/x">`; `loading` sets `aria-busy` and `disabled` and keeps the label in the DOM; `variant="danger"` gets the destructive classes; `data-testid` and `ref` reach the node; no class starts with `focus:`.
  - Card: the `padding` adapter. Badge: the `tone` mapping. StatusBadge: the word and the icon render, and the dot is `aria-hidden`.
  - Spinner: `data-slot`, `aria-hidden`, and the `LoadingSpinner` role and label.
- Move `components/__tests__/{alert,loading-spinner,loading-screen}.test.tsx` into `components/ui/__tests__/`, rewriting class assertions such as `.w-8.h-8` as behaviour.
- New `e2e/visual/primitives.visual.spec.ts` captures `/dev/ui` in the P1.6 projects, in dark and again after `document.documentElement.classList.replace('dark', 'light')`.
- The existing E2E suite passes unchanged.

**Integration.**
- The adapters keep these importers compiling: Button (41), Card (3), Badge (2), Alert (3), LoadingSpinner (3) and LoadingScreen (7). P10.13 to P10.15 move call sites, and P10.11 deletes the adapters.
- P10.17 builds route skeletons on these presets, and P6.5 grows `/dev/ui` into the composites reference.

**Demo.** Start the app with `ENABLE_DEV_UI=1` and open `/dev/ui`. Every variant renders. Tabbing shows a 2px amber ring, and a mouse click shows none. `npm run lint` reports the raw-element warnings by file.

(as merged: `@base-ui/react` 1.8.0, `class-variance-authority` 0.7.1, `jest-axe` 11.0.0 and `@types/jest-axe` 3.5.9, exact. The shadcn CLI is pinned at 4.21.1, but ui.shadcn.com is unreachable from the build sandbox, so `init` and `add --dry-run --diff` could not run; `components.json` (`style: "base-nova"`, the Nova preset's values from the 4.21.1 CLI) and the primitives were ported by hand from the `shadcn@4.21.1` tag's `apps/v4/registry/bases/base/ui/*.tsx`. One rule has one severity, so `eslint/restricted-syntax.mjs` now runs warnings under a second id, `restricted-syntax/warn` (the core rule registered again by `restrictedSyntaxPlugin`), and errors under `no-restricted-syntax`; each `restrictedSyntaxBlocks` entry's `level` picks the id, a block replaces only earlier blocks of its own level, and the formatting warn block no longer covers `app/` and `components/` (the v2 viewer gets its own warn block). Later steps add warn and error selectors the same way; the test's real-config table shows what each kind of file ends up with. The raw-element warnings (307 at merge: 208 `svg`, 82 `button`, 15 `input`, one `select`, one `textarea`) skip `components/ui/**`, `components/rewind/**`, `app/dev/**` and `app/api/**`; the v2 viewer warns on raw controls but not its inline art. `Button` takes an `icon` slot for the leading icon that `loading` swaps for the Spinner; a busy button keeps its variant colour, stays focusable (`aria-disabled`) and ignores clicks. A `nativeButton={false}` link keeps the link role. The `Card` `padding` adapter has no default, so the two call sites that relied on the old `md` default now pass it, and `className` styles the padded `CardContent`. `ENABLE_DEV_UI` is in `lib/env.ts` and `example.env`. Eight baselines changed beyond the new `primitives-dark` and `primitives-light` pairs: the restyled Button (amber primary, 36px and 32px heights) on the admin settings and error screens at both sizes, and on the mobile admin users (both), invite-expired and access-denied screens; the desktop copies of those last four differ by less than the 1% threshold. The axe baseline lost one or two `color-contrast|incomplete` entries on ten scans (the gradient buttons are gone); no design-debt count fell. The baselines were regenerated locally on a production build, not through the workflow. At the merge with P4.3, its `actionsAndApi` blocks joined this structure: the migrated action modules leave both warn blocks (formatting and `actions/**`), so they get the formatting and error-text bans as errors only, and the real-config table gained the `actions/` and `app/api/` rows. Sixteen baselines differed from the merged code, all but the mobile admin user detail under the 1% threshold (the restyled Button on desktop admin users (both), invite-expired and access-denied, on admin queues and onboarding step 2 at both sizes, a re-wrapped announcement line on home at both sizes, admin settings taken on port 3340, and sub-pixel shifts on mobile admin invites and admin users with Plex down), so the merge retook all 16 on port 3100, with admin user detail at both sizes showing P4.7's Disable account button in the tinted `destructive` style. That button over the translucent header card raised `color-contrast|incomplete` on `/admin/users/regular-user-id`, so the header card is now opaque `bg-card` with `text-muted-foreground` labels, and the entry fell from 68 to 61.)

**Done when.**
- [x] `components.json` exists, and the six primitives follow the 5.4 recipes on Base UI.
- [x] The adapters keep every old prop, and every existing `data-testid` survives.
- [x] Each primitive has a component test with axe, and the moved tests pass.
- [x] The raw-element ESLint warnings are on, and `/dev/ui` has its visual baseline.

### Step P3.5: Form primitives and the Field pattern

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-03 to 2026-11-04. **Depends on:** P3.4.
- **Findings addressed:** UI-13, UI-14, UI-27

**Objective.** Add Input, Textarea, Label, Field, Checkbox, Switch and Select on Base UI. Field wires the label, the description and the error to the control (UI-13), and Select brings listbox semantics, a portal and typeahead (UI-14). StyledInput, StyledTextarea, StyledCheckbox and StyledDropdown stay as adapters.

**Guidance.**
- New files: `components/ui/{input,textarea,label,field,form-field,checkbox,select,portal-container}.tsx`, with `switch.tsx` rewritten in place.
- `field.tsx` builds `Field`, `FieldLabel`, `FieldDescription` and `FieldError` on Base UI `Field`:
  - `Field.Root invalid={!!error}` sets `aria-invalid` on the control, and puts the description and error ids into `aria-describedby`;
  - the label carries `htmlFor`, and "(optional)" is rendered in `muted-foreground`;
  - the error has a `circle-alert` icon.
- `form-field.tsx` is the 5.5 `FormField` (`name`, `label`, `optional`, `description`, `error`, `changedFrom`); P10.20 adds `SecretInput`.
- Input and Textarea recipe (5.4):
  - height 36px, or 40px with 16px text below `md` (`h-10 text-base md:h-9 md:text-ui`), so iOS does not zoom on focus (UI-11);
  - `bg-background border-input`, a `border-ring` and a 2px inset ring on focus, `aria-invalid:border-destructive`, and leading and trailing slots.
- Checkbox: Base UI Checkbox, 16px with radius 4, checked in `bg-primary-indicator` with a 12px check. Switch: Base UI Switch with today's props (`checked`, `onCheckedChange`, `loading`, `label`, `disabled`, `data-testid`), a stable label, and a 44px hit area on touch. Select: Base UI `Select` (`SelectTrigger` with a trailing `chevrons-up-down`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`), with 32px items and a trailing check on the selected one (5.4).
- `portal-container.tsx`:
  - `PortalContainerProvider({ container, popupProps })` and `usePortalContainer()`, which defaults to `document.body`;
  - every popup passes `container` to its `*.Portal`, and spreads `popupProps` on the popup, so P5.1's Rewind layout can print popups on paper;
  - an `InModal` context: popups inside a dialog use `z-(--z-popover-in-modal)` instead of `z-(--z-dropdown)`. Otherwise a Select inside a Dialog opens underneath it. P3.6 sets the flag.
- Adapters:
  - `StyledInput` (18 importers) and `StyledTextarea` (3) render Input and Textarea, mapping `size` to `h-8`, `h-9` and `h-11`, `error` to `aria-invalid`, and passing `resize` through. Keep the `setup-input-<name>` default test id, which `e2e/setup-wizard.spec.ts` uses; P10.11 removes it.
  - `StyledCheckbox` (3 files) renders Checkbox and keeps `label`, `description` and `data-testid`. Its `onChange` is typed `(e: { target: { checked: boolean } }) => void` and called from `onCheckedChange`, so `DiscordIntegrationForm.tsx:178`, `:186`, `wrapped-settings-form.tsx:206` and `announcement-form-modal.tsx:120` compile unchanged.
  - `StyledDropdown` (8 importers) renders Select with the same props: `value`, `onChange`, `options`, `optgroups`, `placeholder`, `size`, `disabled`, `id`, `name` and `data-testid`. Size `sm` becomes the 32px filter trigger in `text-label`, never 10px.
    - Preserve the E2E contracts: the trigger takes `testId`, a hidden input takes `${testId}-hidden` (render your own, with `name` and `value`, and do not rely on Base UI's internal input), and each item takes `${testId}-option-${value}`. `e2e/admin-functionality.spec.ts:30-34` and `e2e/setup-wizard.spec.ts:325` use them.
    - Pass string labels to `SelectItem` for typeahead.
- First adopters, which clear the four axe-critical `label` failures (UI-13): wire the date inputs of `components/admin/discord/discord-date-filter.tsx:69-92` and `components/admin/cost-analysis/cost-date-filter.tsx:57-100` through `FieldLabel` and `Input`.
- Add `no-restricted-imports` warnings for `@/components/ui/styled-*` to the ESLint constants.

**Tests.**
- New `components/ui/__tests__/field.test.tsx`:
  - `getByLabelText` finds the control, and clicking the label focuses it;
  - `aria-describedby` lists the description and error ids;
  - `aria-invalid` is set only with an error;
  - the "(optional)" text renders.
- `input.test.tsx` and `textarea.test.tsx` absorb the existing `components/ui/__tests__/styled-input.test.tsx` and `styled-textarea.test.tsx`, including the default test id and the size mapping.
- `checkbox.test.tsx`: Space toggles, a label click toggles, disabled blocks, and the StyledCheckbox `onChange` receives `target.checked`. Move `components/__tests__/switch.test.tsx` into `components/ui/__tests__/`, keeping its nine cases.
- `select.test.tsx`:
  - the trigger has role `combobox` and `aria-expanded`;
  - ArrowDown opens, typeahead jumps to "Sonarr", Enter selects, and Escape closes and returns focus;
  - the options carry `aria-selected`;
  - the popup renders in the provided container, and the hidden input holds the value.
- Move `components/__tests__/styled-dropdown.test.tsx` and rewrite its open, close and keyboard cases by role, keeping the hidden-input and option-test-id cases. Every test file runs `jest-axe`.
- New `e2e/forms-keyboard.spec.ts`: on `/admin/users`, open `users-filter-plex-access` from the keyboard, choose "All" with the arrows and Enter, and focus returns to the trigger. At 390x844, inputs compute to a 16px font size. The existing admin and setup-wizard specs pass unchanged.
- `/dev/ui` gains a forms section; update its visual baseline.

**Integration.**
- P6.5's `FilterBar` uses Select, P10.20 and P10.25 adopt `FormField`, and P10.2 replaces the two date filters with `DateRangeFilter`.
- The axe baseline drops the `label` (critical) entries on `/admin/discord` and `/admin/cost-analysis`.

**Demo.** On `/admin/users`, operate the filter with the keyboard only, and use VoiceOver to hear "Plex access, All, collapsed, popup button". Then show the setup wizard's provider select still submitting through its hidden input.

(as merged: `components/ui/portal-container.tsx` exports `PortalContainerProvider({ container, popupProps })`, `usePortalContainer()` (`{ container, popupProps }`, the container `document.body` by default and undefined on the server), the `PopupProps` type (`className` plus `data-*`), `InModalProvider` for P3.6's Dialog to wrap its popup in, and `usePopupLayer()`, which returns `z-(--z-popover-in-modal)` inside a dialog and `z-(--z-dropdown)` otherwise; the two providers carry `@public` for knip until P3.6 and P5.1 call them. `Label` (`components/ui/label.tsx`) is the native label with `optional`; `FieldLabel` is Base UI's `Field.Label` with the same recipe, and `FieldError` defaults `match` to `true`, so it renders only with a message. Textarea renders through `Field.Control` so Field wires it too. Switch renders Base UI Switch as a native `<button>` (so `disabled` and Enter work as before) with the spinner in the thumb; a busy switch keeps its state colour. Select's popup does not overlap the trigger (`alignItemWithTrigger={false}`), and its default trigger is 40px below `md` like Input. `StyledDropdown` gained an `aria-label` prop: a combobox takes no name from its content, so the triggers with no `<label htmlFor>` were named (`discord-marked-media`, `date-range-picker`) or their labels associated (`users-filter`, `queue-filters`, the two playground files), which kept axe's `button-name` from rising. The adapter warnings are `restricted-syntax/warn` selectors on `ImportDeclaration` (the `deprecatedImports` array, in the raw-element warn block) rather than `no-restricted-imports`, so P3.6 appends `modal-shell` and `confirm-modal` to the same array; 33 warnings at merge. `jest.setup.js` stubs `PointerEvent`, which Base UI's Checkbox dispatches. Tests that drive a Select click the option after `findByTestId`, since the list portals and mounts a frame later; `e2e/a11y/routes.ts`'s `openWith` runs the paused clock 100ms for the same reason, and `e2e/a11y/scan.ts` loads axe with `[role=listbox]` added to the `region` check's `regionMatcher` (axe already counts dialogs), so a portalled open list is not "outside landmarks". The axe baseline lost `label|critical` on `/admin/cost-analysis` and `/admin/discord` and two to five `color-contrast|incomplete` entries on eight scans. Eleven baselines changed, all regenerated locally on a production build: `primitives-dark` and `primitives-light` at both sizes (the new forms section), `admin-settings` at both sizes, mobile `admin-users`, `admin-users-plex-down` and `admin-queues` (the restyled inputs, selects and 32px filter triggers), and `setup-step-3` at both sizes (the restyled inputs); the desktop users and queues screens differ by less than the 1% threshold. design-debt fell in the two date filters.)

**Done when.**
- [x] The seven primitives, `FormField` and `PortalContainer` exist and follow 5.4.
- [x] The four adapters keep their props, test ids and hidden input.
- [x] Labelling and keyboard tests pass with axe, and the moved tests pass.
- [x] The four date inputs are labelled, and their axe entries are gone.

### Step P3.6: Overlay and feedback primitives

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-02 to 2026-11-03. **Depends on:** P3.4.
- **Findings addressed:** UI-10, UI-14, UI-42

**Objective.** Add Dialog, AlertDialog, ConfirmDialog with a pending state, `useActionDialog`, DropdownMenu, Popover and Tooltip, and a Base UI Toast behind the unchanged `useToast` facade. Toasts become live regions, errors persist, toasts with actions never auto-dismiss, and toasts render above dialogs (UI-10, UI-42). ModalShell and ConfirmModal stay as adapters.

**Guidance.**
- `components/ui/dialog.tsx` builds on Base UI Dialog (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`):
  - the panel recipe of 5.4: `max-w-[480px]` (640px for forms), a solid `bg-overlay` scrim, the backdrop at `--z-overlay` and the popup at `--z-modal`;
  - below `md` it becomes a bottom sheet;
  - it sets P3.5's `InModal` flag, and Base UI restores focus to the trigger.
  - `alert-dialog.tsx` is the same on Base UI AlertDialog (`role="alertdialog"`), with a `destructive-solid` confirm.
- `components/ui/confirm-dialog.tsx` takes the 5.5 props, plus a controlled `open` and `onOpenChange`:
  - `action()` runs in `useTransition`. While pending, the buttons are disabled, the confirm button shows a Spinner and `pendingLabel`, and Escape and backdrop clicks are ignored.
  - An `{ error }` result keeps the dialog open and renders `<Alert tone="destructive">` inside it, because the page behind is inert.
  - Success closes the dialog and returns focus. `typeToConfirm` enables confirm only when the typed text matches, ignoring case.
- `hooks/use-action-dialog.ts`, the `useAdminAction` that UI-42 asks for: `useActionDialog(action, { success, refresh = true })` returns `{ run, isPending }`. `run` shows the success toast and calls `router.refresh()` on success, and returns `{ error }` for ConfirmDialog to render.
- `dropdown-menu.tsx` builds on Base UI Menu: a `menu-label` header naming the entity, 32px items with 16px muted icons, separators, and destructive items in `text-destructive`. `popover.tsx` uses the popover styling. `tooltip.tsx` opens after 400ms, uses 12px/500 text, is hoverable, and closes on Escape. All three read `usePortalContainer()` and `InModal`.
- `components/ui/toast.tsx` builds on Base UI Toast, keeping `ToastProvider`, so `lib/providers.tsx` does not change:
  - `useToast()` still returns `showToast(message, type?, duration?)`, `showSuccess`, `showError` and `showInfo` for the 35 importers. It adds `toast({ title, description, tone, action })`.
  - Success and info toasts last 5s and pause on hover and focus. Errors use `timeout: 0` and `priority: 'high'` (an assertive `role="alert"`). Any toast with an `action` uses `timeout: 0` (WCAG 2.2.1). The legacy `duration` applies to success and info only.
  - The viewport fills P3.2's slot as `<section aria-label="Notifications">` at `z-(--z-toast)`: bottom-right on desktop, and full width with 16px insets on mobile.
  - Toasts are 360px wide, with a tone icon (errors use `circle-x`, no longer the close glyph, UI-42) and a "Dismiss notification" button.
  - F6 moves focus into the viewport (Base UI's own hotkey if it has one, otherwise a document key handler), and Escape dismisses the focused toast.
  - Keep `data-testid="toast"`, `data-tone` and `toast-viewport`.
- Adapters:
  - `ModalShell` (4 importers) renders Dialog: `isOpen` and `onClose` map to `open` and `onOpenChange`, `maxWidth` to `max-w-*`, `labelledBy` and `describedBy` become popup attributes, and `scrollable` aligns to the top. It is deprecated and gains no variants (9.4).
  - `ConfirmModal` (`components/admin/shared/confirm-modal.tsx`, 10 importers) renders ConfirmDialog in controlled mode, with `action: async () => { await onConfirm(); return {} }`, so the pending state shows during async confirms. `confirmButtonClass` maps red to `tone="destructive"` and is otherwise ignored; check the six user action buttons and `invites-page-client.tsx:640` by hand.
- Add `no-restricted-imports` warnings for `modal-shell` and `confirm-modal`.
- Update `waitForToast` (`e2e/helpers/test-utils.ts:223`) to `page.getByTestId('toast').filter({ hasText: message })`, following CLAUDE.md's `data-testid` rule.

**Tests.**
- New `components/ui/__tests__/{dialog,alert-dialog,confirm-dialog,dropdown-menu,popover,tooltip,toast}.test.tsx`, with `jest-axe`:
  - Dialog traps focus, closes on Escape and restores focus.
  - ConfirmDialog: pending disables the buttons and shows the label; an error renders inside the dialog with `role="alert"`; `typeToConfirm` gates the confirm button.
  - Menu: the arrows, Home and End, typeahead and Escape work, with `role="menuitem"`. Tooltip opens on focus after 400ms with fake timers, and closes on Escape.
  - Toast, with fake timers: `showSuccess` is `role="status"`, is gone at 5s and stays while hovered; `showError` is `role="alert"` and still present at 60s; an action toast persists; the region is named "Notifications".
- Rewrite `components/__tests__/confirm-modal.test.tsx` as an adapter test, and add `__tests__/hooks/use-action-dialog.test.tsx`.
- New `e2e/overlays.spec.ts`: a `/dev/ui` button opens a dialog and fires a toast, and `document.elementFromPoint` at the toast's centre returns the toast, so the toast sits above the dialog. `announcements.spec.ts` and `jellyfin-invite.spec.ts` pass unchanged.
- `/dev/ui` gains open-state panels; update their visual baselines.

**Integration.**
- P10.18 moves the six user action buttons onto ConfirmDialog and `useActionDialog`, and P6.1's assistant uses P3.7's Sheet, which builds on `dialog.tsx`.
- The axe baseline's open-dialog entries from P1.7 should drop.

**Demo.** In the create-invite dialog, cause a save error: it renders inside the dialog, not behind it. Remove access for a test member: the dialog shows "Removing" until the action resolves. Press F6 to reach a persistent error toast, then Escape.

(as merged: built on P3.5's `portal-container.tsx`; `DialogContent` wraps its children in `InModalProvider`, lays the panel out in Base UI's `Dialog.Viewport`, and takes `size: 'default' | 'form'`, `align: 'center' | 'top'` and `showCloseButton`. `AlertDialogContent` is the same panel without the Close button, and a press inside the toast viewport never counts as an outside press. ConfirmDialog is an AlertDialog (`role="alertdialog"`), so a backdrop click never dismisses it, pending or not; it also takes `cancelLabel`, `data-testid` and `confirmTestId`, and a thrown `action` shows fixed copy (`CONFIRM_FALLBACK_ERROR`). `useToast().toast()` takes `action: { label, onClick }`, and the action also dismisses the toast. Errors do not use Base UI's `priority: 'high'`, which keeps an unfocused toast and its Dismiss button behind `aria-hidden` (axe `aria-hidden-focus`, serious); each toast root is `role="alert"` (errors) or `role="status"` inside the polite "Notifications" region. Base UI's own F6 hotkey and per-toast Escape are used. The toast viewport renders from `ToastProvider` until P3.2 adds its slot. Base UI opens a tooltip on keyboard focus at once; only hover waits 400ms. Base UI sets no `aria-modal` on dialogs (it hides the page behind with `aria-hidden`, so portalled popups stay reachable), so `accessibility.spec.ts`'s Modal ARIA tests now check the alertdialog role and the hidden page, and run the paused clock before checking the exit. The deprecated-import warnings for `modal-shell` and `confirm-modal` join P3.5's `deprecatedImports` selectors. `/dev/ui` gains the overlay specimens, and `primitives.visual.spec.ts` adds viewport shots of the open dialog, the confirm error, the menu and an error toast. The axe baseline lost `heading-order` on the confirm-dialog scan but rose by one `color-contrast|incomplete` there, edited by hand because the update refuses rises: axe compares the page under each line of the two-line description beneath the scrim, which is not a contrast failure (the panel is opaque). No other open-dialog entry fell.)

**Done when.**
- [x] The seven primitives and `useActionDialog` follow 5.4 and 5.5.
- [x] Toasts keep the facade, announce through live regions, persist for errors and actions, and render above dialogs.
- [x] The ModalShell and ConfirmModal adapters keep their props, and ConfirmModal callers get a pending state.
- [x] Every primitive has tests, and the E2E toast helper uses test ids.

### Step P3.7: Rewind-ready primitives

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-04 to 2026-11-05. **Depends on:** P3.4, P3.6.
- **Findings addressed:** none (design or research item)

**Objective.** Add Sheet (right or bottom, with an optional grabber), Toggle, Slider (with `aria-valuetext`) and SegmentedControl, plus the Rewind-only Button entries `ink`, `ink-outline`, `pill` and `icon-pill`, which lint restricts to `components/rewind/**`. Draw all of them in both themes and in ink, and merge by 2026-11-08 so the Rewind story work (P5.1, P5.2) can start.

**Guidance.**
- `components/ui/sheet.tsx` reuses `dialog.tsx`'s Base UI Dialog parts:
  - `side: 'right' | 'bottom'`: right is 420px wide, full height and `rounded-l-xl`; bottom is full width, `rounded-t-xl` and `max-h-[85dvh]`, with `pb-[env(safe-area-inset-bottom)]`.
  - `grabber?: boolean` adds a 36x4px `bg-border-strong` bar that is `aria-hidden` and decorative only; nothing is drag-only (WCAG 2.5.7).
  - It slides on `--duration-slow` with `--ease-out-quiet`, portals through `usePortalContainer()` and spreads `popupProps`, so inside Rewind it prints on paper (`data-field="paper"`, `.light`, 4.4).
- `toggle.tsx` builds on Base UI Toggle (`aria-pressed`), following the 5.4 recipe: 32px or 36px, and pressed is the `bg-foreground text-background` inverse.
- `slider.tsx` builds on Base UI Slider:
  - a 4px `bg-input/45` track, a `bg-primary-indicator` range, and an 18px thumb whose 2px `border-primary-indicator` edge carries the 3:1;
  - a required `getAriaValueText` prop, so every thumb has a spoken value ("August");
  - the arrows, Page keys, Home and End come from Base UI, with a 44px hit area on touch.
  - Add the hatched Rewind track to the Rewind block of `app/globals.css`, between the markers: `[data-theme="rewind"] [data-slot="slider-track"]`.
- `segmented-control.tsx` builds on Base UI RadioGroup and Radio. It is `role="radiogroup"` and requires `aria-label` or `aria-labelledby`. Segments are 28px in `text-label`, and the selected one is the inverse. The arrows move the selection, and Tab leaves the group (5.4).
- In `buttonVariants`, add the variants `ink` and `ink-outline` and the sizes `pill` (`h-11 px-5 rounded-full`) and `icon-pill` (38px with a 3px `before:` inset, giving a 44px hit area), with the 5.4 classes. `icon-pill` requires `aria-label`; make it a type-level requirement on that size.
- ESLint: append errors for `JSXAttribute[name.name='variant'][value.value=/^ink(-outline)?$/]` and `JSXAttribute[name.name='size'][value.value=/^(icon-)?pill$/]` everywhere except `components/rewind/**`, `components/ui/**` and `app/dev/**`. These are new uses, so they start as errors (9.6). In `scripts/design-system/rules.mjs`, add `app/dev/**` to the `rewind-only` rule's allowlist.
- `/dev/ui` draws every P3.4 to P3.7 primitive three ways:
  - in the dark theme;
  - in the light theme, after the class swap;
  - in three ink panels, `<div data-theme="rewind"><section {...inkProps('paper' | 'marigold' | 'ultramarine')}>`, each inside a `PortalContainerProvider` whose `popupProps` are `inkProps('paper')`.
  - In the ink panels, Button, Switch, Checkbox, StatusBadge (as an ink outline chip), Tooltip and Toast render in ink with no copies (4.4). Open sheets print on paper.
- Fallback, from the plan's risks: if this step slips past 2026-11-08, Rewind builds its sheets on Dialog inside `components/rewind` and swaps them for Sheet afterwards.

**Tests.**
- New `components/ui/__tests__/sheet.test.tsx`: the side classes, an `aria-hidden` grabber, the focus trap with Escape and restore, the portal into a provided container, and `popupProps` applied to the popup.
- `toggle.test.tsx`: Space and Enter flip `aria-pressed`.
- `slider.test.tsx`: `aria-valuetext` follows `getAriaValueText` as ArrowRight, Home and End change the value, and disabled blocks input.
- `segmented-control.test.tsx`: the role is `radiogroup`, the arrows move both focus and `aria-checked`, and Tab leaves the group.
- `button-ink.test.tsx`: the four entries render their classes, and an `icon-pill` without `aria-label` fails the type check (`// @ts-expect-error` case).
- New `__tests__/lint/rewind-only-props.test.ts` runs ESLint's `ESLint` class with the repo config on in-memory sources: `variant="ink"` errors at `components/admin/x.tsx` and is clean at `components/rewind/x.tsx`.
- `e2e/visual/primitives.visual.spec.ts` adds the ink panels and the open bottom and right sheets at 390x844 and 1440x900. Axe runs on the ink panels with no contrast violations or incomplete results. A computed-style check confirms that an `ink` Button's background equals the panel's ink hex from `rewindInks`.

**Integration.**
- P5.1's Rewind layout provides `PortalContainerProvider` and `inkProps`. P5.2's chrome uses `ink-outline icon-pill`, P5.3 and P5.11 use `Sheet side="bottom" grabber`, and P8.3's race scrubber uses Slider.
- P6.1's assistant uses the right Sheet, and P6.5's mobile filters use the bottom Sheet.
- The 2026-11-08 milestone checks this step.

**Demo.** On `/dev/ui` at 390px, open the bottom sheet in a marigold panel: it prints on paper with ink controls. Drive the slider with the keyboard while VoiceOver reads "August". Then show the lint error on an `ink` Button placed in `components/admin`.

(as merged: `sheet.tsx` re-exports `dialog.tsx`'s parts as `Sheet`, `SheetTrigger`, `SheetClose`, `SheetHeader`, `SheetTitle`, `SheetDescription` and `SheetFooter`, and adds `SheetContent({ side, grabber, showCloseButton })` on the same Base UI Dialog, wrapped in `InModalProvider`; `dialog.tsx` exports its Close button as `PanelCloseButton` for it. Under reduced motion the sheet does not slide and fades in 120ms (Rewind 5.6). SegmentedControl is compound, `<SegmentedControl aria-label>` with `<Segment value>` children; it and `Slider` take `aria-label` or `aria-labelledby` as a type-level union. `Slider` is single-thumb, a client component (it wraps `getAriaValueText(formatted, value)`), and draws the focus ring on the thumb, whose hidden range input takes focus. `Toggle` takes `size: 'sm' | 'default'`. The `icon-pill` `aria-label` requirement is a union on `ButtonProps`. Toasts now carry the `popupProps` of where they were raised (`useToast` reads `usePortalContainer()`), and a toast whose props carry `data-field` also gets `data-theme="rewind"`, a one-element scope, because the single viewport renders outside every Rewind root; P5.1 relies on this to print toasts on paper. `usePortalContainer()` returns one shared empty `popupProps`, so `useToast()` stays referentially stable. `PortalContainerProvider` lost its knip `@public` (the dev sheet calls it). The `rewindOnlyProps` selectors (string and `{"..."}` forms) are errors in every error block outside `components/ui/**`, `components/rewind/**` and `app/dev/**`, including `app/api/`, the v2 viewer and `**/*.{jsx,tsx}` outside `app/` and `components/`; the formatting error block was split so those three globs keep the formatting bans. The design-debt `rewind-only` rule skips `app/dev/`. `/dev/ui` gains Sheet, Toggle, Slider and SegmentedControl specimens (`_sections/rewind-ready.tsx`) and "In the Rewind scope" (`_sections/ink.tsx`), three panels (`dev-ui-ink-<ink>`) with Button, Switch, Checkbox, Toggle, SegmentedControl, Slider, StatusBadge, Badge, Spinner, Skeleton, Field and Input, Card, Alert, Tooltip, Popover, DropdownMenu, Sheet and Toast. The axe and computed-style checks are in a new `e2e/rewind-primitives.spec.ts` (chromium project, so they also run on `next dev`), not the visual spec. Visual baselines: new `primitives-ink-{paper,marigold,ultramarine}` (panel shots), `primitives-sheet-bottom-ink` and `primitives-sheet-right` in both projects; `primitives-dark` and `primitives-light` changed for the new sections, and `primitives-toast-error` only because the longer page scrolls differently when the Error button is clicked. Taken locally on a production build. No axe-scanned route changed, so the axe baseline is unchanged, and no design-debt count fell.)

**Done when.**
- [x] Sheet, Toggle, Slider and SegmentedControl follow 5.4, with tests.
- [x] The four Button entries exist, and lint rejects them outside `components/rewind/**`.
- [x] `/dev/ui` draws every primitive in dark, light and three inks, with visual and axe coverage.
- [ ] Everything is merged by 2026-11-08.

### Step P3.8: Safe Markdown, safe links and error copy

- **Track:** ui. **Lane:** UI. **Effort:** S. **Window:** 2026-10-29 to 2026-10-29. **Depends on:** P3.1.
- **Findings addressed:** SEC-42, SEC-57, SEC-20, UI-25

**Objective.** Render announcements and assistant answers through one `MarkdownBody` that allows no images and no raw HTML and keeps real list styles. Links render through `SafeLink`, which allows only http and https and shows where they go. User-facing error text comes from one code-to-copy map, never from `error.message`.

**Guidance.**
- `lib/ui/markdown.ts` exports `MARKDOWN_ELEMENTS`: `p`, `strong`, `em`, `ul`, `ol`, `li`, `a`, `code`, `pre`, `blockquote`, `h2`, `h3`, `h4`, `hr` and `br`, one list for every caller (5.5).
- `components/ui/markdown-body.tsx` is a plain module, with no `'use client'`, so it renders in Server and Client Components alike:
  - `<ReactMarkdown allowedElements={MARKDOWN_ELEMENTS} unwrapDisallowed skipHtml components={{ a: SafeLink }}>`, with no `rehype-raw`;
  - an injected `![](https://attacker/?d=...)` never becomes an `<img>`, which closes the exfiltration path of SEC-42.
- Styles (UI-25): add exact `shadcn` for `shadcn/typeset.css`, imported in `app/globals.css`, and wrap the output in its typeset class. If shipping the CLI package is unwanted, `npx shadcn@latest eject` the CSS into `app/typeset.css`. Verify the import path against the installed package. Either way, bullets and numbers render, and links are underlined.
- `components/ui/safe-link.tsx`, and `safeHref(url)` in `lib/ui/markdown.ts`:
  - parse with `new URL(href, NEXT_PUBLIC_APP_URL)`; only `http:` and `https:` pass, and anything else renders as plain text (SEC-57);
  - same-origin links render as normal links;
  - external links show their full destination after the label in muted mono, end in `arrow-up-right`, and open with `target="_blank" rel="noopener noreferrer"`.
  - Use the http(s) predicate that P4.3 adds beside `createPublicUrlSchema` (`lib/validations/shared-schemas.ts:95`). If P4.3 has not merged, add `isHttpUrl()` there in this PR, and P4.3 builds on it.
  - Route the admin-set public URLs through `safeHref`: `app/(app)/page.tsx:45`, `components/dashboard/requests-card.tsx:12` and `components/auth/jellyfin-sign-in-form.tsx:113`.
- Adopt MarkdownBody:
  - In `components/dashboard/announcements-card.tsx:97`, replace the `dynamic()` `ReactMarkdown` and its no-op `prose` classes.
  - In `components/admin/chatbot/chat-window.tsx:181-205`, replace the hand-mapped component table. Drop the `ssr: false` workaround, then check `next build` and the E2E chat test for the vendor-chunk error it once avoided.
- `lib/ui/error-copy.ts` (SEC-20):
  - `errorCopy(code, { audience: 'member' | 'admin' })` returns `{ title, description }` for:
    - `ErrorCode` from `lib/security/error-handler.ts`;
    - `RewindErrorCode` from P0.9's `lib/wrapped/generation-errors.ts`, whose `memberErrorCopy` moves here, with its callers in `app/(app)/wrapped/page.tsx` and `components/dashboard/wrapped-card.tsx`;
    - the action codes of P4.3's helper;
    - the error entries of P3.2's `lib/ui/flash-codes.ts`, which keeps only the code-to-tone mapping.
  - The map uses `satisfies Record<AppErrorCode, ...>`, so a new code without copy is a type error. Unknown input returns "Something went wrong on our side", never the input.
  - `components/ui/error-state.tsx:47` stops rendering `error?.message`. It shows the caller's `message` or the generic copy, shows the digest in mono, and renders its action as `<Button>` instead of the amber pill (`:50-55`, UI-27). P10.17 restyles it.
- Jest: `react-markdown` and its tree are ESM. Extend `transformIgnorePatterns` in `jest.config.js` with `react-markdown|remark-.*|micromark.*|mdast-.*|hast-.*|unist-.*|vfile.*|unified|bail|trough|devlop|...` (about 67 packages), and remove the `react-markdown` mock from `components/__tests__/admin/chatbot/chat-window.test.tsx`.

**Tests.**
- New `components/ui/__tests__/markdown-body.test.tsx`:
  - a list renders `ul` and `li` inside the typeset wrapper;
  - an injected image renders no `img`, and raw `<img src=x onerror=...>` renders nothing;
  - `[x](javascript:alert(1))` and `data:` links render text with no `href`;
  - an external link shows its destination with `rel` and `target`, and a relative link has no suffix;
  - an `h1` is unwrapped to text.
- `safe-link.test.tsx` checks each protocol. `lib/ui/__tests__/error-copy.test.ts`: every code has member copy, unknown input returns the generic copy, and the output never contains the input string.
- Extend `components/ui/__tests__/error-state.test.tsx` (moved from `components/__tests__/`): an `Error('Can't reach database server at db:5432')` never appears.
- Update the announcements card and chat window tests. Extend `e2e/announcements.spec.ts`: a seeded announcement with a list shows `li` elements inside `announcement-<id>`.

**Integration.**
- P4.15 builds on this rendering for the assistant (untrusted tool output, history validation), and P10.17's `StatusScreen` reads `errorCopy`.
- P10.21 and P10.22 render announcements through MarkdownBody, and P10.5 adds the admin preview.

**Demo.** Post an announcement containing a bulleted list, an image and a `javascript:` link. Home shows the bullets, no image and plain text for the bad link. In the assistant, a reply containing `![](https://example.com/?d=x)` loads nothing: the network panel shows no request.

(as merged: the `shadcn` npm package ships no `typeset.css` (checked at 4.21.2 and 4.22.1; the docs say to copy the file), so no dependency was added. The file is vendored unchanged as `app/typeset.css` from shadcn-ui/ui at `3cdaa6eb` (2026-07-10, MIT), with its source in the header, and `app/globals.css` imports `./typeset.css` after `tw-animate-css`. `lib/ui/markdown.ts` also exports `safeLink(href)` (`{ href, external } | null`), which SafeLink uses; `safeHref` returns its href. Links resolve against `NEXT_PUBLIC_APP_URL`, or `https://app.invalid` when it is unset, so server and client agree; same-origin links come back as paths, and credentials in a URL are refused. `isHttpUrl(url: URL)` is in `lib/validations/shared-schemas.ts`; `createPublicUrlSchema` still accepts any URL until P4.3 routes it through `isHttpUrl`. `errorCopy(code: unknown, { audience })` keys P4.3's `ActionErrorCode` names through a local type; P4.3 replaces it with an import from `lib/actions/result.ts`, and P3.2 adds its flash error codes to the map when `lib/ui/flash-codes.ts` exists (it had not merged). `memberErrorCopy` is gone: `components/wrapped/wrapped-year-view.tsx` (the old `app/(app)/wrapped/page.tsx` caller), `components/dashboard/wrapped-card.tsx` and `lib/wrapped/tautulli-user-statistics.ts` call `errorCopy(...).description`, and the stored Rewind copy is unchanged. ErrorState looks its copy up from `error.digest`, shows the digest as "Reference <mono>", and keeps the old `Button` until P3.4 swaps it. There is no E2E chat test; a Jest case renders the real `Chatbot` instead, and `next build` passes without the `ssr: false` workaround. The `react-markdown` tree joins `ESM_ONLY_PACKAGES` in `jest.config.js` as regex alternatives. The new E2E case filters to the visible card, because home renders it in both layouts. Visual baselines are unchanged; design debt fell in `chat-window.tsx` and `announcements-card.tsx`.)

**Done when.**
- [x] MarkdownBody, SafeLink, `safeHref` and `error-copy.ts` exist with unit tests.
- [x] Announcements and the assistant render through MarkdownBody, and lists have bullets.
- [x] No member or admin surface renders `error.message` through ErrorState.
- [x] The three admin-set public links pass through `safeHref`.

### Step P3.9: Status vocabulary, icons, brand and chart theme

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-04 to 2026-11-05. **Depends on:** P3.3, P2.1.
- **Findings addressed:** UI-26, UI-39, UI-24

**Objective.** Give the app one status vocabulary, one icon map, one brand module, one chart theme and real app icons, a manifest and a default OG image. Each module is used by at least one production caller, and CLAUDE.md's file tree lists the new folders.

**Guidance.**
- `lib/ui/status.ts` (5.6):
  - the `STATUS` table for every domain row: subscription, exemption, Plex access, role, Rewind, connection, queue job, worker, invite and request;
  - the `Tone`, `StatusDomain` and `StatusValue<D>` types, and `resolveStatus(domain, value, { date? })`, which returns the label, tone, icon and filled sub-line;
  - `settingsCategory(status)` for the settings nav glyphs.
  - StatusBadge (P3.4) gains the `domain`, `value` and `sub` props on top of its presentational API.
- `lib/ui/icons.ts` holds the 3.10 concept map as lucide components (`plex: Tv`, `requests: CirclePlus`, `discord: MessagesSquare` and so on). Brand marks stay generic glyphs (UI Q9).
- `lib/ui/poster-palette.ts` holds the eight field and ink pairs from `rewindInks` (coral, marigold, rose, sky, mint, ultramarine, forest and oxblood), and `posterPalette(ratingKey)` picks one by a stable hash modulo 8 (3.11). The Poster primitive arrives with its first consumer; until then `/dev/ui` shows the eight title cards.
- `lib/brand.ts` (7.1, UI-39) holds `productName`, `plexProduct`, `jellyfinClientName`, `rewindName(year)` ("{server name} Rewind {year}") and `monogramFor(name)` (the first grapheme through `Intl.Segmenter`, uppercased per locale).
  - `serverName()` reads `Config.serverName` (P2.1), then the active `PlexServer.name` (`findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, select: { name: true } })`, never the token), then `productName`. It reads through P3.10's `getAppSettings()`, extended with `serverName`.
  - Replace the hard-coded names: `lib/plex-auth.ts:10`, `lib/watchlist/plex-watchlist.ts:104` ("Plex Wrapped"), `lib/connections/jellyfin-core.ts:46`, the defaults at `lib/discord/integration.ts:307` and `:340`, and the "Media Server" fallback at `app/(app)/page.tsx:43`. A new `X-Plex-Product` relabels the device in plex.tv, but tokens keep working, because the client identifier does not change.
- `lib/charts/theme.ts` (3.5, UI-24):
  - `registerCharts()` makes one `ChartJS.register` call covering every controller, element and plugin the 14 files use, including `Filler`, whose absence today makes `fill: true` a no-op;
  - `chartTheme(mode)` returns the series hex `chart-1` to `chart-5`, `border` for the grid, `muted-foreground` for ticks, and `popover`, `popover-foreground` and `border-strong` for tooltips, all from `themes[mode]`;
  - `rewindChartTheme(ink)` reads `rewindInks`.
  - The module never reads CSS variables, because `@kurkle/color` 0.3.4 cannot parse `oklch()`.
  - Adopt it in `components/admin/cost-analysis/cost-trend-chart.tsx` as the reference. P10.2 and P10.5 move the other admin charts onto it in January.
- Icons, manifest and OG (7.5):
  - New `scripts/build-og-fonts.py` uses fontTools to subset IBM Plex Sans 400, 500 and 600 and Plex Mono 500 from a pinned IBM release (version and SHA-256 in the script) into `lib/og/fonts/`. The subset covers Latin, Latin-1, Latin Extended-A, Greek and Cyrillic, with `OFL.txt` and `coverage.json` beside it.
  - The routes run in the Node runtime and read the fonts with `fs.readFile`: `app/icon.tsx` (`generateImageMetadata` for 32, 192 and 512px), `app/apple-icon.tsx` (180px), and `app/opengraph-image.tsx` (the monogram and server name at 1200x630), which `app/twitter-image.tsx` re-exports.
  - `next/og` has no public hook to stop its font fetch for missing glyphs, so render only code points listed in `coverage.json`. Otherwise fall back to the first Latin letter of the slug, then to the pip-only tile.
  - `app/manifest.ts` sets the name from `serverName()`, `theme_color` and `background_color` to `#1a1c1e`, `display: 'standalone'`, and the 192 and 512 icons.
  - Delete `public/icon.svg` and the `icons` field in `app/layout.tsx:15-19`. The root `metadata` becomes `generateMetadata` with `title.template` `%s - {serverName()}`.
- Add `components/shell/` (created in P6.1), `lib/design/`, `lib/ui/`, `lib/brand.ts`, `lib/charts/`, `lib/settings/` and `lib/og/fonts/` to the CLAUDE.md file tree. Check that P1.2's `__tests__/docs/claude-md-paths.test.ts` accepts the not-yet-created `components/shell/`, either by skipping the fenced tree or through an explicit pending list. Remove the `tokens.ts` knip entry added in P3.3.

**Tests.**
- New `lib/ui/__tests__/status.test.ts`: every 5.6 row resolves to its label, tone and icon; the `{date}` sub-lines format through `lib/utils/format.ts`; `settingsCategory` follows the 5.6 table. Extend `status-badge.test.tsx` for the `domain` API.
- `icons.test.ts`: every concept maps to a lucide component. `poster-palette.test.ts`: all eight pairs are 4.5:1 or better through `lib/design/color.ts`, and the same `ratingKey` always gets the same pair.
- New `lib/__tests__/brand.test.ts`, with Prisma mocked:
  - the fallback order of `serverName()`, and `rewindName(2026)`;
  - `monogramFor` for "Northfield Plex", "émile", "東京サーバー", an Arabic name and an emoji name, with the last three falling back.
- New `lib/charts/__tests__/theme.test.ts`: every colour handed to Chart.js parses with `@kurkle/color`, and every value equals `tokens.ts`.
- Route tests for `app/icon.tsx` and `app/opengraph-image.tsx`, with `global.fetch` mocked to throw: each returns a PNG for a CJK server name and makes no request.
- A font budget test: the files in `lib/og/fonts/` total less than 300 KB.
- Visual: update the cost-trend chart screens and add the palette to `/dev/ui`.

**Integration.**
- The shells (P6.1, P6.3), the invite pass (P10.26) and the Rewind titles (P5.1) read `lib/brand.ts`. The settings and queue pages (P10.19, P10.3) use `status.ts`.
- P10.2 and P10.5 move the charts onto the theme, P10.9 swaps them to Recharts, and P10.15 maps inline SVGs to `icons.ts`.

**Demo.**
- Set `Config.serverName` to "Northfield Plex". Tab titles read "Users - Northfield Plex", the installed PWA uses the N monogram, and an invite link pasted into Discord unfurls with the OG card.
- Set the name to "東京サーバー". The icon falls back to the pip tile, with no outbound request in the logs.

(as merged: `STATUS` entries are objects, `{ label, tone, mark?, sub? }`, where `mark` is `"dot"`, `"spinner"` or a lucide icon from `lib/ui/icons.ts`; domain keys are camelCase (`plexAccess`, `queueJob`) and the table's `true`/`false`/`null` and spaced values are named (`shared`, `notShared`, `unknown`, `notStarted`, `usedUp`, `notConfigured`, `untested`, ...). Every warning row carries `triangle-alert` (3.1) unless the table names a mark. `resolveStatus(domain, value, fill?)` fills `{date}` ("Nov 6, 2026"), `{day}` ("Oct 20"), `{ago}` (with `now`), `{by}`, `{left}` and `{total}` through `lib/utils/format.ts` (`fill.settings`, default UTC and en-US); a sub-line with an unfilled placeholder is left out, and an unfilled label placeholder drops ("Opens"). `StatusBadge`'s domain form is `{ domain, value, sub? }` and reads only fixed sub-lines from the table, so it stays a Server Component; callers pass `sub={resolveStatus(..., fill).sub}` for dated ones. `settingsCategory(status)` returns `{ category, label, tone, icon }`. `getAppSettings()` returns `AppSettings` (`serverName: string | null`, from `Config.serverName`, then the newest active `PlexServer.name`, then the active `JellyfinServer.name`, an addition so Jellyfin-only installs keep their name on home); `getFormatSettings()` returns the zone and locale alone for `FormatProvider` and `getFormat()`. `lib/brand.ts` has `productName`, `plexProduct` and `jellyfinClientName` as separate literals (knip flags aliases), async `serverName()` and `rewindName(year)`, and `monogramFor(name, locale?)`, which returns `null` for the pip-only tile; it imports `lib/settings/app-settings.ts`, so it is server-only. `PLEX_PRODUCT_NAME` is gone from `lib/connections/plex-pin.ts`. The Discord `platform_name` fallback is `serverName()`; `lib/validations/discord.ts` still defaults a blank form value to "Plex Wrapped" (left for P10.20). The OG fonts come from IBM's npm releases `@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@1.1.0` (WOFF sources, sha256 in the script), and are renamed "OG Sans" and "OG Mono" because the OFL reserves "Plex"; `lib/og/fonts/` is 276 KB (Plex Mono has no Greek). `lib/og/coverage.ts` reads `coverage.json`; `lib/og/brand-images.tsx` draws the icons and the OG card (monogram tile, name, and the public host in Mono); a name the fonts cannot draw becomes `productName` on the card. Every image route and the manifest await `connection()`, and `next.config.js` adds `lib/og/fonts/*` to `outputFileTracingIncludes`. `app/twitter-image.tsx` re-exports all but `runtime`, which Next will not accept re-exported. The root `generateMetadata` also sets `metadataBase` from `NEXT_PUBLIC_APP_URL` (else `NEXTAUTH_URL`), so the OG URL is absolute; P3.2 keeps it and adds the rest. `public/icon.svg` is deleted but `public/.gitkeep` stays, because the Dockerfile copies `public/` (P4.17 may drop both). Jest cannot load `@vercel/og`, so `app/__tests__/icon-routes.test.tsx` captures the element and renders it in a child Node process (`lib/og/__tests__/helpers/render-png.cjs`) with `fetch` disabled except for `data:` URLs, which `@vercel/og` uses for its own WebAssembly. Chart.js: `registerCharts()` also registers the line, bar, doughnut and pie controllers; `chartTheme(mode)` adds `area` (each series at 16%, through `lib/design/color.ts`) and `other`; `CostTrendChart` takes `mode` (default dark), drops its legend (one series, titled by its card) and fills its area for the first time. The knip entries for `tokens.ts` and `color.ts` are gone: their test-only exports are `@internal`, and exports awaiting Rewind callers (`inkProps`, `archetypeInks`, `radius`, `fonts`, `rewindName`, `rewindChartTheme`, `posterPalette`) are `@public`. `/dev/ui` gains Status vocabulary (every row, filled from a fixed date, plus the settings-nav glyphs), Icon concepts and the poster palette at the end of the sheet. There is no cost-analysis visual screen, so the changed baselines are `primitives-dark`, `primitives-light` (the three new sections) and `primitives-toast-error` (its viewport now shows them below the toast) at both sizes, regenerated locally on a production build. No design-debt count rose; `cost-trend-chart.tsx` fell to zero. The axe spec passes unchanged.)

**Done when.**
- [x] `status.ts`, `icons.ts`, `poster-palette.ts`, `brand.ts` and `charts/theme.ts` exist with tests, and each has a production importer.
- [x] The icons, manifest and default OG image render offline from committed fonts within the 300 KB budget.
- [x] Hard-coded product names use `lib/brand.ts`.
- [x] CLAUDE.md's tree lists the new folders.

### Step P3.10: One formatter module

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-10-28 to 2026-10-29. **Depends on:** P2.2.
- **Findings addressed:** DUP-09, UI-28, GAP-41, GAP-45, GAP-46, GAP-43

**Objective.** Replace `lib/utils/formatters.ts`, `lib/utils/time-formatting.ts` and the local copies with one `lib/utils/format.ts`. It formats every number, amount, date, duration and relative time in `Config.timezone` and `Config.locale`, identically on the server and the client, so the pages with hydration mismatches stop re-rendering.

**Guidance.**
- `serverZone()` lives in this module (7.4, Rewind 7.7). P2.2 introduces it; if P2.2 put it elsewhere (for example `lib/wrapped/time/zone.ts`), move it here and import it from `zone.ts`.
- `lib/settings/app-settings.ts`, a server-only module: `getAppSettings()` returns `{ timeZone: serverZone(), locale: Config.locale ?? 'en-US' }`, wrapped in React `cache()` over `unstable_cache` (tag `app-settings`, `revalidate: 60`). The saves of P2.2's zone setting and P7.12's settings call `revalidateTag('app-settings')`, and P3.9 adds `serverName`.
- `lib/utils/format.ts` is pure, and each function takes `{ timeZone, locale }`. It uses cached `Intl` instances keyed by those options (7.4):
  - `formatNumber`, `formatCompact` and `formatPercent` (GAP-46);
  - `formatMoney(usd, 'table' | 'prose')`: 2 decimals at $1 and above; below $1, 3 decimals in tables and 2 significant digits in prose (UI-28);
  - `formatTokens`;
  - `formatDate(d, 'short' | 'long' | 'day-month')` and `formatDateTime(d, { zoneLabel? })`, where `zoneLabel` adds `timeZoneName: 'short'` for server-rendered admin timestamps (GAP-43);
  - `formatDayKey('YYYY-MM-DD', style)`, which formats a date-only key from its parts instead of `new Date('YYYY-MM-DD')`. That fixes the one-day shift at `app/admin/discord/page.tsx:79-88`;
  - `formatRelative(d, { now, timeZone, locale })` on `Intl.RelativeTimeFormat` (`numeric: 'auto'`), using calendar-day differences in the zone. A post from 20:00 yesterday then reads "yesterday" at 18:00, and 360 days counts calendar months ("11 months ago"), not 30-day blocks ("12 months ago", GAP-45);
  - `calendarMonthsBetween(a, b, timeZone)`;
  - `formatDuration(minutes, 'short' | 'long', { largestUnit?, maxUnits? })`, always floored (DUP-09), and `formatApproxDuration`;
  - `formatBytes` (1024-based, "1.5 GB"), `formatResolution`, and `toEndOfDayExclusive`, moved unchanged with its UTC note.
- Keep the v2 outputs byte-identical with options. `formatDuration(m, 'long', { largestUnit: 'day' })` reproduces `formatWatchTime`, and `{ largestUnit: 'day', maxUnits: 1 }` reproduces `formatWatchTimeHours`. This leaves the v2 prompt text (`lib/wrapped/prompt-template.ts`) and the viewer unchanged until P7.13.
- Client access: `lib/providers.tsx` gains a `FormatProvider` value from the root layout (`await getAppSettings()`, after `await connection()` so no route prerenders at build time without a database). `useFormat()` returns bound formatters, so client components format exactly as the server does (GAP-41).
- `components/ui/time.tsx`, the `<Time value={iso} />` island (5.5): on the server and during hydration it renders the absolute date in the server zone inside `<time dateTime>`. After mount it switches to the relative text, refreshed each minute, with the viewer-local date in `title`, so nothing clock-dependent renders during hydration.
- Delete `lib/utils/formatters.ts`, `lib/utils/time-formatting.ts` and the shim file `components/wrapped/wrapped-sections/utils.ts`. Move their remaining importers (about 18 after P1.1 and P1.2) and the tests in `lib/utils/__tests__/` onto the new module.
- Replace the local copies:
  - `formatDate` in `app/admin/users/[userId]/page.tsx:24`, `app/admin/llm-usage/[usageId]/page.tsx:17`, `app/admin/prompts/page.tsx:10`, `app/admin/prompts/[promptId]/page.tsx:22`, `app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx:81` and `components/admin/wrapped/historical-wrapped-selector-header.tsx:89`;
  - `formatCost` (`:98`), `formatDateTime` in `components/admin/llm-usage/conversation-usage-row.tsx:20`, and `formatTime` in `components/admin/queues/job-table.tsx:33`;
  - `formatRelativeDate` in `components/dashboard/announcements-card.tsx:114`;
  - `formatResolution` in `lib/discord/commands/watching.ts:182` and `actions/chatbot/executors/plex-sanitizer.ts:188`;
  - the `Math.round` hours in `components/admin/playground/statistics-viewer.tsx:55`.
- Fix the GAP-41 sites with `useFormat()` or `<Time>`: `announcement-list-item.tsx:58`, `:60`, `user-table-row.tsx:134`, `:168`, `:171`, `discord-activity-table.tsx:147`, `:150`, `discord-bot-status.tsx:105` and the `:113` lock countdown, `discord-active-users.tsx:75`, `discord-marked-media.tsx:287`, `:301`, `user-activity-timeline.tsx:154`, `scheduler-info.tsx:13-24`, `expandable-prompt.tsx:171`, `wrapped-settings-form.tsx:40` and `plan-list.tsx:29`.
- Compute the 6-month Rewind rule on the server (`components/dashboard/wrapped-card.tsx:47-49`) with `calendarMonthsBetween`, and pass `eligible` to the card (GAP-45). P6.9's RewindCard reuses the helper.
- ESLint: bans on bare `toLocaleString()`, `toLocaleDateString()` and `toLocaleTimeString()` calls, and on `toFixed` inside a template literal that starts with `$` (GAP-46, UI-28). Add them as warnings, move every call site in `app/**` and `components/**` except `components/wrapped/**` (about 33 money and 94 number sites), then raise them to errors there in the same PR. Elsewhere they stay warnings.

**Tests.**
- New `lib/utils/__tests__/format.test.ts`:
  - `it.each` over UTC, America/Los_Angeles, Europe/Berlin and Australia/Sydney, and over en-US, en-GB and de-DE;
  - both DST changes, and 31 December at 23:30;
  - the "yesterday" case, and money in both modes;
  - duration flooring (119.9 minutes is "1 h 59 m");
  - the v2-compatibility tables copied from `time-formatting.test.ts`, asserting identical strings;
  - `formatDayKey` under Los Angeles.
  - A `test:tz` script reruns the file under `TZ=Pacific/Kiritimati`, to prove nothing reads the process zone.
- New `components/ui/__tests__/time.test.tsx`: the first render is absolute, the text turns relative after mount, it refreshes after 60s with fake timers, and `title` holds the local date.
- `lib/settings/__tests__/app-settings.test.ts`: the defaults, the fallback through `serverZone()`, and the cache tag.
- New `e2e/hydration.spec.ts` with `test.use({ timezoneId: 'America/Los_Angeles', locale: 'de-DE' })`. It visits `/admin/announcements`, `/admin/llm-usage/conversation/<seeded id>` and `/admin/users` (All filter) with rows seeded, and fails on any console message matching `Hydration failed|did not match`.

**Integration.**
- P2.13's `lib/rewind/format.ts` extends this module. P3.9's `brand.ts` uses `getAppSettings()`.
- P10.2 builds zone-correct day windows on `formatDayKey` and `serverZone()`, and P11.17 passes the zone to the Discord assistant.
- `example.env` documents that `Config.timezone` overrides `TZ`.

**Demo.** Set `Config.timezone` to Europe/Berlin, and the browser to de-DE in America/Los_Angeles. `/admin/announcements` and the conversation page load with no hydration warning; numbers group the same (in `Config.locale`) in the KPI tile and the tooltip; and an announcement from 20:00 Berlin time last night reads "yesterday".

**As merged** (P2.13 and later steps rely on these):
- `serverZone()` stays in the server-only `lib/utils/server-zone.ts` (P2.2), because `format.ts` must stay client-safe for `<Time>`; `getAppSettings()` takes the zone from it.
- `lib/utils/format.ts` functions take the settings last: `formatDate(d, style, { timeZone, locale })`, `formatMoney(usd, mode, { locale })`, `formatRelative(d, { now, timeZone, locale })`. Extra exports: `formatTime(d, settings)`, the date style `day-month-short` ("Oct 11", chart axes), `formatDuration`'s `smallestUnit` option (needed to reproduce `formatWatchTimeHours`, which prints "0 hours", not minutes) and `locale` option (grouping; default en-US), and `bindFormat(settings)`, which returns `f.number`, `f.money`, `f.tokens`, `f.date`, `f.time`, `f.dateTime`, `f.dayKey`, `f.relative`, `f.percent`, `f.duration` and `f.settings`. Long durations join with ", " ("26 hours, 10 minutes"), as v2 did. `formatPercent` takes a ratio. Prose money below $1 keeps 2 decimals from $0.10 ("$0.50"). `formatRelative` says "now" under 10 seconds, uses elapsed seconds, minutes and hours within the same calendar day, then calendar days, months and years.
- Server Components call `await getFormat()` (`lib/settings/app-settings.ts`); client components call `useFormat()` from `lib/format-context.tsx` (default UTC and en-US outside the provider, so isolated tests render). `getAppSettings()` falls back to `TZ` and en-US when the database is unreachable. `updateServerTimeZone` calls `updateTag('app-settings')` (Next 16's server-action form of `revalidateTag`); P7.12's locale save must do the same.
- The root layout awaits `connection()`, so every route is dynamic (the build lists no static pages).
- The v2 call sites call `formatDuration(m, 'long', { largestUnit: 'day' })` directly; `wrapped-sections/utils.ts` is gone.
- The home page decides the six-month rule (`memberLongEnough`) with `calendarMonthsBetween` in the server zone; `WrappedCard` takes `memberLongEnough` instead of `memberSince`, and `AnnouncementsCard` takes the server's `now`, so its relative dates hydrate unchanged ("Yesterday").
- P3.4 had not merged, so this step created `eslint/restricted-syntax.mjs` (`formatting` selectors, `restrictedSyntaxBlocks`) and `eslint/__tests__/restricted-syntax.test.ts`; P3.4 adds its arrays there. The bans cover every `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` call (not only bare ones) and `toFixed` after a `$` in a template literal or JSX text. The remaining warnings are in `components/wrapped/**`, `lib/wrapped/prompt-template.ts` and `actions/chatbot/executors/media-marking.ts` (GAP-44, P11.17).
- `lib/utils/format.ts` is a knip entry while some exports are only called through `bindFormat`; `eslint/restricted-syntax.mjs` is in knip's `ignore`. `npm run test:tz` runs in the unit-test CI job.
- `e2e/hydration.spec.ts` also matches React's minified errors #418, #423 and #425, because CI runs E2E on a production build. The cost-analysis "Period" header now shows the selected end date (GAP-42's quick fix), and the chart axes format the `YYYY-MM-DD` keys from their parts.
- Visual baselines: all 38 desktop and mobile screens still match locally. Text did change on covered screens (money below $1 at 3 decimals on LLM usage, users and user detail; zone-labelled timestamps), within the comparison threshold, so no baseline was regenerated. The `/admin/shares` axe count of `color-contrast|incomplete` fell from 47 to 46 and its baseline was lowered.

**Done when.**
- [x] `lib/utils/format.ts`, `lib/settings/app-settings.ts` and `<Time>` exist, and `formatters.ts`, `time-formatting.ts`, the shims and the local copies are deleted.
- [x] Server and client format in `Config.timezone` and `Config.locale`.
- [x] The hydration spec passes, and the zone and locale tests pass.
- [x] The lint bans are on for `app/` and `components/`.
