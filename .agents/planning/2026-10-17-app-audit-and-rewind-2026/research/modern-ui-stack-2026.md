# Modern UI Stack and Incremental Migration Path (Late 2026)

- **Date:** 2026-10-17
- **Scope:** UI foundation for the whole app (admin, onboarding, setup, auth) and for Rewind 2026 (`components/wrapped/**`, `app/api/wrapped/og-image`).
- **Companion reports (same folder):** `visual-generation-skills.md` (agent skills, image models, Remotion skills) and `rewind-inspiration.md` (stat catalogue, narrative). This report does not repeat them. It covers libraries, tokens, framework features and the migration order.

## Question

What is the late-2026 best-practice way to give this Next.js 16 + React 19 + Tailwind v4 app a consistent, modern, clean UI, and how do we migrate incrementally? The answer should include a concrete recommended stack, the order of adoption, the codemods that exist, and the risks, all tailored to this repo and to a Rewind 2026 ship date before late December 2026.

## TL;DR

- **Adopt shadcn/ui (CLI v4) on Base UI, generated into the existing `components/ui/`, one primitive at a time.** Base UI became shadcn's default base on 2026-07-02. Radix is still supported and still maintained: it had commits on 2026-10-14. React Aria became a third base on 2026-07-17. The CLI's `--dry-run`, `--diff` and `--view` flags let us replace our 18 hand-built primitives without blind overwrites. HeroUI v3, Radix Themes and Park UI are viable, but each would mean owning less of the code or leaving Tailwind's idiom.
- **The real consistency problem is the lack of tokens, not the lack of components.** The repo uses 2,165 raw `slate-*` utilities and 230 `cyan-400` utilities. It hand-copies the card container 115 times, even though a `Card` primitive exists (3 importers). Start with a semantic OKLCH token layer in `app/globals.css` (shadcn's token names plus `success`, `warning`, `info` and a Rewind scope), then sweep surfaces area by area.
- **Fix the accessibility failures that are already measurable.**
  - `text-slate-500` (215 uses) is 3.07:1 on `slate-800` and 3.42:1 on the card surface. `text-slate-600` is 2.36:1. Both fail the 4.5:1 AA minimum.
  - `app/layout.tsx` disables pinch zoom (`maximumScale: 1`, `userScalable: false`), which fails WCAG 1.4.4.
  - `e2e/accessibility.spec.ts` scans only up to WCAG 2.1. It never runs axe's `wcag22aa` rules.
- **Motion: move from `framer-motion` 12.42 to `motion` 14.x (`motion/react`) and use React 19.3 `<ViewTransition>` for route changes.** React made View Transitions stable in 19.3.0 (2026-09-09), not in 19.2. Next.js's guide needs React 19.3+ and no config flag, and `<Link>` takes a `transitionTypes` prop. Add `<MotionConfig reducedMotion="user">` globally. Today only 4 of the 57 non-test files that import Motion respect reduced motion.
- **Charts: use shadcn Chart (Recharts 3) for admin dashboards and visx 4 plus Motion for bespoke Rewind graphics, then retire chart.js.** Recharts 3 turns `accessibilityLayer` on by default and themes through CSS variables. visx 4.0.0 (2026-06-11) added React 19 support.
- **Upgrade the framework before any refresh work. These are security items, not polish.**
  - The lockfile pins Next 16.1.1. Next 16.4.1 (2026-10-14) patched two critical unauthenticated RCEs (in `use cache` and in the Image Optimization API with SVG) and a Server Actions DoS. The latest release is 16.4.2.
  - `next.config.js` allows image optimization from any `http` or `https` host, yet every `next/image` in the repo passes `unoptimized`. Remove the wildcard.
  - Bump next-auth from 4.24.13 to 4.24.15, the 4.x security patch.
- **Defer Cache Components/PPR, full React Compiler, the auth-library migration and Remotion until after Rewind ships.** Each is stable or viable, but each has repo-wide blast radius: 41 files export `dynamic = 'force-dynamic'`, and every one of those becomes a build error under `cacheComponents`. Auth.js (NextAuth) is now maintained by Better Auth, and new projects are pointed to Better Auth. v4 still gets security fixes, so a migration in Q1 2027 is reasonable.
- **Share images: keep `next/og`, but give it real fonts and shared tokens.** Today the OG route hard-codes hex colors and loads no fonts. Consider standalone Satori plus resvg in the BullMQ worker for richer story cards. Treat WebGL backgrounds (OGL, under about 29 kB) and video (Remotion) as optional, lazy-loaded layers with static fallbacks.

## 1. Baseline: what the repo has today

Versions are from `package-lock.json` (installed), checked on 2026-10-17.

| Area | Today | Latest observed (2026-10-17) |
|---|---|---|
| `next` | 16.1.1 | 16.4.2 (2026-10-15); 16.4.1 was a security release (2026-10-14) |
| `react` / `react-dom` | 19.2.3 | 19.3.1 (2026-10-14); 19.2.9 backport on the same day |
| `tailwindcss` | 4.3.2 | 4.3.3 (Jul 16, fixes only) |
| `framer-motion` | 12.42.2 (66 files: 57 source, 9 tests) | `motion` 14.3.0 (2026-10-15) |
| `chart.js` + `react-chartjs-2` | 4.5.1 / 5.3.1 (14 component files) | chart.js 4.5.1 is still the latest (2025-10-13, per the npm registry) |
| `next-auth` | 4.24.13 (JWT strategy, 2 Credentials providers: Plex token and Jellyfin) | 4.24.15 (4.x security patch, 2026-07-20, per the npm registry) |
| `@axe-core/playwright` | ^4.11 | axe-core 4.14.0 (2026-10-05) |
| Fonts | none loaded (`font-serif` falls back to the OS serif) | n/a |

**Component layer.** `components/ui/` holds 18 hand-written primitives (1,621 lines) with tests in `components/ui/__tests__/`.

- **Import counts:** 122 files import from `@/components/ui/*` (91 of them outside `__tests__`). The main ones are `toast` (55 files, 36 outside tests), `button` (41) and `styled-dropdown` (13 files, 9 outside tests). `card` has 3 importers and `badge` has 2.
- **Dead code:** `styled-select.tsx` has no importers.
- **Visual identity:**
  - `Button`'s `primary` variant is a `cyan-600 to purple-600` gradient.
  - `Card` hard-codes `bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg`.
  - `ModalShell` hand-rolls the focus trap, ESC handling and scroll lock that a headless primitive would provide.
- **Refs:** 9 non-test files still use `forwardRef`. In React 19, `ref` is an ordinary prop.

**Tokens.** `app/globals.css` (101 lines) has `@import "tailwindcss"`, a `@theme` block with 6 Cinematic Premiere colors (`--color-stage`, `--color-gold` and others) and 5 keyframe animations. It has no semantic tokens (background, foreground, muted, border, ring, and so on). As a result:

- Raw palette utilities are everywhere: 2,165 `slate-*` occurrences. Text alone uses `text-slate-400` 629 times, `text-slate-500` 215 times and `text-slate-300` 196 times.
- Accent colors drift: cyan-400 (230), cyan-500 (161), purple-500 (103), red-500 (120) and others.
- Corner radii drift: `rounded-lg` (340), `rounded-md` (46), `rounded-xl` (41), `rounded-2xl` (28) and `rounded-3xl` (12).

**Rewind theme.** `components/wrapped/cinematic/theme.ts` exports class strings (`GOLD_HIGHLIGHT_CLASS`, `EYEBROW_CLASS`, `DISPLAY_CLASS`) and a hand-tuned `REVEAL_SPRING`. `app/api/wrapped/og-image/route.tsx` duplicates the same five hex values as constants and renders `next/og` cards with no custom fonts.

**Accessibility tooling.** `e2e/accessibility.spec.ts` uses AxeBuilder with `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` and fails only on `critical` or `serious` findings. Because axe 4.14 rates `meta-viewport` as `Moderate`, that filter would let the zoom lock in `app/layout.tsx` through even though its `wcag2aa` tag is already included. `eslint.config.mjs` uses `@eslint/js` and `typescript-eslint` but does not load `eslint-config-next`, even though the package is installed. That means no `react-hooks` rules, no `@next/next` rules and no a11y lint.

**Other relevant config.**

- `next.config.js` contains:
  - a CSP with `'unsafe-eval' 'unsafe-inline'` in `script-src`;
  - `images.remotePatterns` allowing `**` over both `http` and `https`;
  - a `webpack()` externals block that only runs with `--webpack` (Turbopack is the Next 16 default and the scripts do not pass `--webpack`).
- **Wrapped viewer:** `components/wrapped/wrapped-viewer.tsx` drives its progress bar with `setInterval(..., 50)` and `setState`, which re-renders the slide about 20 times a second.
- **Unused dependency:** `@next-auth/prisma-adapter` is installed, but a comment in `lib/auth.ts` says the adapter is not used.

## 2. Component layer

### 2.1 shadcn/ui in late 2026

shadcn/ui is still a copy-into-your-repo component system. Its official changelog in `shadcn-ui/ui`, `apps/v4/content/docs/changelog/`, shows a busy 2025 and 2026:

| Date | Change | Why it matters here |
|---|---|---|
| Feb-Mar 2025 | Tailwind v4 + React 19 support: OKLCH tokens, `@theme inline`, `data-slot` on every part, `forwardRef` removed, `tailwindcss-animate` replaced by `tw-animate-css`, `toast` deprecated for `sonner` | Matches our stack exactly. No Tailwind 3 baggage. |
| Aug 2025 | CLI 3 + MCP server | Agent tooling (see `visual-generation-skills.md` 4.1.4). |
| 2025-12-12 | `shadcn create`: choose base, icons, base color, theme, fonts and a visual style (Vega, Nova, Maia, Lyra, Mira) | Lets us generate one consistent style instead of hand-tuning. |
| 2026-01-20 | Full Base UI docs. Every component has Radix and Base UI variants with one shared API. | Choice of base. |
| 2026-02-02 | `new-york` style moves to the single `radix-ui` package; `npx shadcn@latest migrate radix` | Only relevant if we pick Radix. |
| 2026-03-06 | **CLI v4:** `shadcn/skills`, `--preset` (design system encoded as a code), `--dry-run`, `--diff` and `--view`, `init --template`, `init --base`, `shadcn info`, `shadcn docs`, and `registry:base` / `registry:font` | `--diff` is what makes an incremental migration over existing `components/ui/*` files safe. |
| Mar-May 2026 | New styles Luma, Sera (serif headings, square corners) and Rhea; `shadcn apply` to switch presets in place (Apr 2026) | Eight styles in total. Sera is worth a look for Rewind-adjacent pages. |
| 2026-05-31 | `shadcn eject` copies `shadcn/tailwind.css` utilities into your global CSS and drops the `shadcn` package dependency | Keeps runtime dependencies minimal. |
| 2026-07-02 | **Base UI becomes the default base.** Radix "is not being deprecated", "You do not need to migrate". `npx shadcn init -b radix` keeps Radix. The CLI's `-b, --base` option takes `base`, `radix` or `aria`. For moving existing Radix components, shadcn ships an agent skill (`npx skills add shadcn/ui`), not a codemod. | Default docs and new components land on Base UI first. |
| 2026-07-10 | `shadcn/typeset`: one CSS file for prose (headings, lists, tables) | Use for LLM-written Rewind copy and for docs or markdown surfaces (`react-markdown`). |
| 2026-07-17 | React Aria becomes a first-class base (`--base aria`) | Third option. |
| 2026-07-23 | Toast component for Base UI (actions, promise, stacking, swipe) | Can replace our `components/ui/toast.tsx` (55 importing files, 36 outside tests). |
| 2026-09-03 | The `cn` package replaces the local `clsx` + `tailwind-merge` helper; `npx shadcn@latest migrate cn` is optional | Our `lib/utils` `cn` keeps working. Migrating is optional. |

**Theming model.** All tokens are CSS variables in OKLCH, defined on `:root` and overridden under `.dark`, then exposed to Tailwind with `@theme inline`:

- **Token names:** `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1` to `chart-5`, and the `sidebar-*` set. Each surface pairs with a `-foreground` token, and `--radius` drives a `calc()` radius scale.
- **Dark variant:** `@custom-variant dark (&:is(.dark *))`.
- **Base colors:** Neutral, Stone, Zinc, Mauve, Olive, Mist and Taupe.

**Charts.** The `Chart` component is a thin layer over Recharts: `ChartContainer`, `ChartTooltip` and a `chartConfig` that maps series to `var(--chart-n)`. Its docs carry a Recharts v3 checklist:

- use `var(--chart-1)`, not `hsl(var(--chart-1))`;
- `defaultIndex` is initial state only;
- give `ChartContainer` a height, `min-h-*` or `aspect-*`.

**Blocks.** The registry includes dashboards, sidebars, login and settings blocks. The sidebar block alone would replace a good part of the admin chrome.

### 2.2 Primitive base: Base UI vs Radix vs React Aria

| | Base UI (`@base-ui/react`) | Radix (`radix-ui`) | React Aria Components |
|---|---|---|---|
| Maintainer | MUI, full-time team; "where we are concentrating our foundational work" | WorkOS | Adobe |
| Status (2026-10) | v1.9.0 (2026-10-09). v1.0.0 stable shipped 2025-12-11 (Base UI CHANGELOG and npm). InfoQ's February 2026 article is later coverage. Package renamed from `@base-ui-components/react`. | Active: primitives `main` has commits on 2026-10-13 and 2026-10-14 (dialog, select, slider and aria-hidden fixes) | `react-aria-components` 1.22.1 (2026-10-09; 1.22.0 on 2026-10-08) |
| shadcn support | Default since 2026-07-02 | Fully supported | Supported since 2026-07-17 |
| Composition | `render` prop (`<DialogClose render={<Button />}>`), plus `nativeButton` when the tag changes | `asChild` | Render props, plus a hooks layer |
| Strengths | Newest shadcn docs and examples land here first; also has Toast | Most third-party blocks and tutorials; longest track record | Strongest a11y, i18n and touch semantics |
| Weaknesses | Smaller ecosystem of older blocks; `render` semantics differ from `asChild` | Concern about maintainer pace (a DEV opinion piece, unverified); not shadcn's default any more | Largest API surface; fewer shadcn community blocks |

**Recommendation: Base UI.** We start from zero shadcn components, so the only migration cost is our own call sites, and the default base is where new shadcn work lands. React Aria is the right pick only if the design phase puts heavy keyboard and touch requirements first (for example, a drag-to-reorder admin UI or complex date pickers). Its stronger semantics do not justify leaving the default path for this app.

### 2.3 Alternatives considered

| Option | Status | Fit for this repo |
|---|---|---|
| **HeroUI v3** | Stable 2026-03-21. Tailwind v4 + React Aria. Animations moved to CSS ("no more Framer Motion dependency"; the quote is unverified, but the 3.2.6 npm manifest has no `framer-motion` dependency). Latest is v3.2.6 (2026-09-17). "75+ components" (unverified). | Good-looking and accessible, but an npm dependency rather than code we own. Restyling it toward the Cinematic Rewind look means fighting its theme layer. Second choice. |
| **Radix Themes** | 3.3.0 (2026-01-31). Ships its own CSS and theme. | Not Tailwind-idiomatic. Would run two styling systems side by side. No. |
| **Ark UI / Park UI** | Ark 5.39.x stable, 6.0.0-next.0 (2026-10-06). Park UI is now "built with Ark UI and Panda CSS". Its Tailwind plugin lags: the last `@park-ui/tailwind-plugin` release on npm was 0.20.1 (2024-03-06). | Park UI's direction is Panda, not Tailwind. No. |
| **React Aria Components (raw)** | v1.22.1 | Only through shadcn's `--base aria`, if at all. |
| **Keep hand-built `components/ui`** | n/a | It works, but we would keep re-implementing focus traps, popovers, menus and toasts. Today's drift shows the cost. No. |

## 3. Design tokens with Tailwind v4

Tailwind v4 is CSS-first. Variables in `@theme` generate utilities; variables in `:root` do not. Use `@theme inline` when a theme variable references another variable, such as a font variable from `next/font` or a shadcn-style `var(--primary)`. Namespaces drive utilities: `--color-*`, `--font-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--animate-*`, `--breakpoint-*` and `--container-*`. `--color-*: initial` removes the default palette.

Other v4 features relevant to the refresh:

- **v4.0 (2025-01-22):**
  - the default palette is in OKLCH (P3 gamut);
  - container queries are built in (`@container`, `@sm:`, `@max-md:`);
  - `starting:` (`@starting-style`) gives CSS-only enter transitions;
  - `color-mix()` handles opacity on variables;
  - 3D transform utilities;
  - `not-*`.
- **v4.1 (2025-04-03):** `text-shadow-*`, `mask-*`, colored `drop-shadow-*`, `pointer-fine` / `pointer-coarse`, safe alignment (`justify-center-safe`) and `@source inline()`.
- **v4.2 (2026-02-18) and v4.3 (2026-05-08):** the Mauve, Olive, Mist and Taupe neutral palettes, logical-property utilities, `font-features-*`, `@container-size` (height-based container queries), scrollbar utilities and stacked or compound `@variant`.

**Recommended token architecture for this repo:**

1. **Semantic layer, shadcn names, OKLCH values.** The app is dark-first and dark-only, so put the dark values on `:root` and keep `.dark` as an alias. A light theme can come later without touching components. Seed values from the current look so the first pass changes almost nothing visually. These are Tailwind v4's own OKLCH values:

   | Token | Current utility | Seed value |
   |---|---|---|
   | `--background` | page `slate-900` | `oklch(20.8% 0.042 265.755)` |
   | `--card` | `slate-800/50` over `slate-900` | `oklch(27.9% 0.041 260.031 / 0.5)`, or flatten to an opaque value |
   | `--border`, `--input` | `slate-700` | `oklch(37.2% 0.044 257.287)` |
   | `--foreground` | `white` / `slate-100` | near-white |
   | `--muted-foreground` | `slate-400` | `oklch(70.4% 0.04 256.788)` (about 6.2:1 on the card surface; passes AA) |
   | `--primary`, `--ring` | `cyan-500` / `cyan-600` | `oklch(71.5% 0.143 215.221)` |
   | `--destructive` | `red-500` | `oklch(63.7% 0.237 25.331)` |
   | `--success` / `--warning` / `--info` (custom) | green, amber, cyan | from the v4 palette |

   Retire `slate-500` and `slate-600` as text colors. There is no "subtle" text token below `muted-foreground`.

2. **Rewind scope.** Define the Cinematic palette as tokens scoped to `[data-theme="rewind"]`, which the Rewind layout sets. The same semantic utilities (`bg-background`, `text-primary`) then render gold on black inside Rewind. Converted values:

   | Token | Hex | OKLCH |
   |---|---|---|
   | stage | `#0a0908` | `oklch(14.1% 0.003 69.4)` |
   | stage-panel | `#16120e` | `oklch(18.6% 0.010 67.1)` |
   | gold | `#d4af37` | `oklch(76.7% 0.139 91.1)` |
   | gold-bright | `#f5d67b` | `oklch(88.3% 0.116 91.1)` |
   | ivory | `#ece5d8` | `oklch(92.4% 0.019 83.1)` |
   | taupe | `#9a9082` | `oklch(65.8% 0.023 76.4)` |

   Contrast is fine: gold on stage is 9.46:1 and taupe on stage is 6.33:1. Export the same values from one TypeScript module (for example `lib/design/tokens.ts`) for Satori, which cannot read CSS variables. Write a Jest test that keeps the module in sync with `globals.css`.

3. **Radius, shadow and motion tokens.** Define `--radius` with the shadcn `calc()` scale and pick one card radius. Define motion tokens (`--ease-*`, `--animate-*`) so CSS and Motion share easing curves.

4. **Container queries over viewport breakpoints for cards and panels**, so the same `StatCard` works in the admin grid and in a Rewind slide.

5. **Enforcement, after the sweep.** Either set `--color-*: initial` and re-add only semantic and brand colors, or add a lint or grep check in CI that rejects new `slate-*`, `cyan-*` and similar classes in `app/` and `components/`. The second option is lower risk.

## 4. Typography

- **Use `next/font/google`.** It downloads font files at build time and self-hosts them, so the browser never calls Google. That fits the self-hosted, privacy-minded audience and the current CSP (`font-src 'self'`). The Docker build therefore needs network access to Google Fonts at build time. Otherwise use `next/font/local` with committed files.
- **Use variable fonts.** Weight can then be omitted, and `axes` adds optical size or other axes.
- **Expose fonts to Tailwind v4** with `variable: '--font-...'` on `<html>` plus `@theme inline { --font-sans: var(--font-...) }`.
- **Suggested set, final picks to the design phase:**
  - one UI sans with tabular figures for stats (`font-features-*`, v4.2+);
  - one mono;
  - one Rewind display serif, replacing today's OS-dependent `font-serif` in `DISPLAY_CLASS`, which renders as a different typeface on Windows, macOS and Android.

  shadcn's `registry:font` and presets can carry the fonts.
- **Satori needs font binaries.** Commit TTF or OTF copies of the same families (Satori parses them faster than WOFF) and load them in the OG route. That fixes today's mismatch between share cards and the in-app Rewind.

## 5. Motion and transitions

### 5.1 `framer-motion` to `motion`

- **Package:** `motion` is the direct successor. Uninstall `framer-motion`, install `motion` and change imports to `motion/react`. The official upgrade guide says Motion for React 12 had no breaking changes (search snippet only; unverified). A client-only re-export (`motion/react-client`) exists for Server Component files: it is listed in the `motion` 14.3.0 package `exports`, alongside `motion/react-animate-view`.
- **Breaking changes after 12.x** (per `motiondivision/motion` CHANGELOG.md):
  - **13.0.0 (2026-08-05):** removed the optional `@emotion/is-prop-valid`. Prop filtering now needs `<MotionConfig isValidProp>`.
  - **14.0.0 (2026-10-02):** removed internal APIs and pinned the `framer-motion`, `motion-dom` and `motion-utils` versions.
- **Useful additions:**
  - **12.41 (2026-06-23):** `animateView` left Early Access.
  - **13.4 (2026-09-14):** `AnimateView` view transitions for React 19.3.
  - **14.2 (2026-10-13):** hardware-accelerated independent transforms.
  - **14.3 (2026-10-15):** grid `stagger`.
- **Codemod:** none official. The change is a mechanical import rewrite across 66 files (57 source, 9 tests).
- **Global hygiene:**
  - Wrap the providers in `<MotionConfig reducedMotion="user">` (`lib/providers.tsx`), so every spring respects the OS setting rather than only the four cinematic files that check it today.
  - Use `LazyMotion` with `m.*` on public pages, the Rewind share page included, if bundle size matters.

### 5.2 React `<ViewTransition>` and Next.js

- **Stable in React 19.3.0 (2026-09-09).** The release added `<ViewTransition />`, `addTransitionType`, Fragment refs and a `browser()` API. React 19.2.x has none of these.
- **Next.js's view-transitions guide:**
  - needs React 19.3+ and "no configuration" (the old `experimental.viewTransition` config page is gone from the canary docs);
  - `<Link transitionTypes={['nav-forward']}>` and `router.push(..., { transitionTypes })` tag navigations;
  - put the wrapper in `page.tsx`, not in a layout;
  - shared-element morphs use a matching `name`;
  - back and forward navigations carry no type;
  - reduced motion is handled with a `prefers-reduced-motion` rule on the `::view-transition-*` pseudo-elements.
- **Only Transitions animate.** `<ViewTransition>` runs only for Transitions, Suspense reveals and `useDeferredValue`. Plain `setState` does not trigger it. For Rewind slide-to-slide changes, wrap the index change in `startTransition`, or keep Motion's `AnimatePresence` for in-slide choreography.
- **Browser support:** same-document view transitions became Baseline Newly available when Firefox 144 shipped them (2025-10-14). Per MDN browser-compat-data, transition types (the `startViewTransition` options parameter) need Chrome 125, Safari 18.2 or Firefox 147. `view-transition-class` needs Chrome 125, Safari 18.2 or Firefox 144. Unsupported browsers simply do not animate.

### 5.3 CSS-first motion

- **Use CSS for hovers, enter states and simple loops.** Tailwind's `starting:` variant, `tw-animate-css` (shadcn's dependency) and the existing `--animate-*` tokens cover these.
- **Treat scroll-driven animations (`animation-timeline`) as progressive enhancement only.** MDN's browser-compat-data lists Chrome 115, Safari 26 and Firefox 159. Firefox moved to a two-week release cadence after Firefox 154, and the same data schedules Firefox 159 for 2026-10-27 (in beta today). Stable Firefox should therefore have it well before Rewind ships. Firefox ESR 153 (2026-07-21) and older devices will not. Guard with `@supports (animation-timeline: view())` and give the base state the finished values.

### 5.4 Motion and accessibility rules for Rewind

- **WCAG 2.2.2 (Pause, Stop, Hide)** applies to auto-advancing slides. Provide a visible pause and play control, plus keyboard handling (Space, Left and Right). The viewer has an `isAutoAdvancing` state; confirm it is exposed as a control.
- **Replace the 50 ms `setInterval` progress updates** with a CSS animation or a Motion value (`useAnimate`, or `animate` on a `scaleX` motion value). That removes about 20 React renders a second.
- **Keep confetti, film grain and spotlight effects decorative** (`aria-hidden`), and disable them under reduced motion. The current cinematic components already do this.

## 6. Charts

| Library | Latest seen | Rendering | Theming with CSS variables | Notes |
|---|---|---|---|---|
| **Recharts 3** (via shadcn Chart) | 3.10.1 (2026-07-25); 3.11 canaries add an experimental theme system and an `autoTheme` that follows `color-scheme` | SVG, client | Yes (`var(--chart-n)`) | 3.0 made `accessibilityLayer` default to `true` (keyboard and screen-reader support) and removed `react-smooth` and `recharts-scale`. Best fit for admin. |
| **visx 4** | 4.0.0 (2026-06-11), React 18/19 | SVG primitives (scales, shapes, axes) | Yes (you write the SVG) | Best for bespoke, art-directed Rewind graphics animated by Motion. |
| **Nivo** | 0.99.0 (2025-05-23); 0.98 upgraded react-spring for React 19 | SVG, canvas, HTML | Theme object | Pretty defaults, but its react-spring animation stack would duplicate Motion. |
| **ECharts 6** | 6.0.0 (2025-07-30), 6.1.0 (2026-05-19) | Canvas or SVG, SSR-able | Theme registration | Powerful but heavy, with an imperative API. Overkill here. |
| **chart.js 4** | 4.5.1 (2025-10-13) | Canvas | No (JS config) | Canvas needs a hand-written accessible fallback. Its theming duplicates tokens in JS. Retire it. |

**Recommendation:**

- **Admin:** migrate the 13 admin chart components (`components/admin/discord/*`, `components/admin/cost-analysis/*`, `components/admin/shares/share-time-chart.tsx`) to shadcn `Chart`. They then share tooltips, legends, the `--chart-*` palette and accessibility behavior.
- **Rewind:** rebuild `components/wrapped/wrapped-charts.tsx` and the new 2026 stat graphics on visx primitives and hand-written SVG animated with Motion, inside the `[data-theme="rewind"]` scope.
- **Cleanup:** remove `chart.js`, `react-chartjs-2` and `react-countup` (5 source files plus 1 test; Motion's `animate` or `useSpring` replaces the count-up).
- **Color:** use the session-provided `dataviz` skill to validate the categorical palette for the `--chart-*` tokens (see `visual-generation-skills.md` 4.3).

## 7. Accessibility (WCAG 2.2 AA)

WCAG 2.2 adds AA criteria that matter here:

- **2.4.11 Focus Not Obscured:** sticky admin headers, toasts and the Rewind navigation must not cover the focused element.
- **2.5.7 Dragging Movements:** swipe-only slide navigation needs buttons too.
- **2.5.8 Target Size (Minimum):** targets at least 24 by 24 CSS px. Check icon buttons and Rewind dots.
- **3.3.8 Accessible Authentication:** the Plex PIN flow is fine. The Jellyfin username and password form must allow paste and password managers.

Repo-specific actions:

1. **`app/layout.tsx`:** remove `maximumScale: 1` and `userScalable: false` (WCAG 1.4.4 Resize Text; axe's `meta-viewport` rule flags this pattern). That rule's impact is `Moderate`, so the spec's critical/serious filter hides it today. Change `themeColor` to the token value.
2. **`e2e/accessibility.spec.ts`:** add `'wcag22aa'` (and `'wcag2aa'` coverage on Rewind pages) to `withTags`. Axe documents `wcag22aa` as a tag, and `withTags` restricts the run to the listed tags, so 2.2 rules never run today. Add scans for `/wrapped`, the share page, onboarding and the login page, not only admin pages.
3. **Contrast:** the token sweep removes `text-slate-500` and `text-slate-600` body text (3.07:1 and 2.36:1). The admin token check could be a Jest test that computes the contrast of the foreground and background token pairs.
4. **Lint:** adopt the Next 16 flat config (`eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`), which brings `eslint-plugin-react`, `react-hooks` and `@next/next`.
   - Next's docs do not list `eslint-plugin-jsx-a11y`. However, the installed `eslint-config-next` 16.2.10 already depends on it, registers it, and turns on only six rules as warnings: `alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props` and `role-supports-aria-props`.
   - For real coverage, add the plugin's recommended rule set on top. Since the plugin is already registered under `jsx-a11y`, spreading only its `rules` may avoid a flat-config "Cannot redefine plugin" error (unverified).
   - `next lint` was removed in 16, and the repo already runs `eslint .`.
5. **Headless primitives** (Base UI Dialog, Menu, Select, Toast) replace the hand-written focus trap in `components/ui/modal-shell.tsx` and the custom `styled-dropdown.tsx` (249 lines). Those are the riskiest a11y code we own.

## 8. Next.js 16 features: adopt, defer or skip

| Feature | Status (docs, 2026-10) | Recommendation | Caveats for this repo |
|---|---|---|---|
| **Upgrade 16.1.1 to 16.4.2** | 16.2 (2026-03-18), 16.3 (2026-08-03), security releases on 2026-08-25 (16.3.3 and 15.5.24) and 2026-10-14 (16.4.1 and 15.5.28) | **Now** | 16.3.3 fixed GHSA-p293-qw3h-jr36 (critical RCE on Windows-hosted servers) and GHSA-2xp9-vwfh-vxw4 (critical RCE, Image Optimization API with AVIF). 16.4.1 fixed GHSA-673q-mjm6-r5xr (critical RCE, `use cache` returning typed arrays), GHSA-2464-fhr4-w9xw (critical RCE, Image Optimization API with SVG) and GHSA-p3m5-59mp-jv5r (high, Server Actions DoS). Also bump React to 19.3.1, which brings an RSC transport-protocol improvement (#37845) on top of 19.3.0's `<ViewTransition>`. |
| **Images config** | v16 defaults: `qualities: [75]`, `dangerouslyAllowLocalIP: false`, `maximumRedirects: 3`; the docs warn that broad `remotePatterns` "may allow malicious actors to optimize urls you did not intend" | **Now** | Every `next/image` in the repo is `unoptimized`, so set `images.unoptimized: true` and delete the `**` patterns. If optimization is wanted later, LAN Plex URLs need `dangerouslyAllowLocalIP`, which is an SSRF risk. Keep proxying through `/api/wrapped/poster` instead. |
| **Turbopack** | Default for dev and build in 16 | **Now: clean up** | Delete the `webpack()` externals block if no one builds with `--webpack`. `serverExternalPackages` already covers Discord. |
| **Typed routes** | Stable (`typedRoutes: true`; "since 15.5" is unverified) | **Phase 1** | Cheap. Catches broken `<Link href>` values during the navigation refresh. |
| **React Compiler** | Stable top-level `reactCompiler` since 16.0, opt-in, Babel plugin; `compilationMode: 'annotation'` with `"use memo"`; `experimental.turbopackRustReactCompiler` (16.3, experimental) | **Phase 2, annotation mode** on Rewind and heavy admin tables; full mode in 2027 | Builds get somewhat slower. Turn on `eslint-plugin-react-hooks` compiler rules first; they flag code the compiler will skip. |
| **Cache Components** (`cacheComponents`, `use cache`, PPR by default, `<Activity>` route preservation) | Stable since 16.0. 16.3 adds Instant Navigations (`cacheComponents` + `partialPrefetching`). | **Defer to 2027** | Every route segment config becomes an error, and 41 files export `dynamic = 'force-dynamic'`. Request data must sit inside `<Suspense>`. The `use cache` default store is in memory, which is a problem with multiple replicas. Activity keeps hidden routes mounted, which changes dialog and dropdown behavior. Path: run the `cache-components-instant-false` codemod (adds `instant = false`), then convert route by route. |
| **CSP** | Nonce CSP via `proxy.ts` forces dynamic rendering and is incompatible with PPR. `experimental.sri` hashes keep pages static. `'unsafe-eval'` is needed only in development. | **Now:** drop `'unsafe-eval'` in production. **Later:** nonce or SRI, decided together with Cache Components. | Pick one strategy. Nonces and PPR do not mix. |

## 9. Authentication library status

- **What happened:** in September 2025, Auth.js (formerly NextAuth.js) became maintained by the Better Auth team. The Better Auth blog is dated 2025-09-22 and GitHub discussion #13252 is dated 2025-09-26.
  - Existing users can stay: "maintenance will continue for security and urgent issues" (discussion #13252).
  - New projects are told to use Better Auth.
  - A maintainer said there were "no immediate plans for v5" (2025-09-27). v5 remains beta.
- **NextAuth v4:** 4.24.15 (2026-07-20) is a "Security patch release for the 4.x line". It binds OAuth check cookies to their provider, NFKC-normalizes emails and gives an explicit `NEXTAUTH_URL` precedence over forwarded hosts.
- **Better Auth:**
  - 1.5.0 (2026-03-01) introduced the `npx auth` CLI;
  - 1.6.x was current in mid-2026;
  - 1.7.0 went stable on 2026-08-18 (the blog post is dated 2026-08-17). It moved MCP into `@better-auth/mcp`, built on `@better-auth/oauth-provider`. The latest stable is 1.7.10 (2026-10-15);
  - 1.8.0 is in beta (1.8.0-beta.1, 2026-10-16);
  - CVE-2026-45364 (IPv6 rate-limit bypass, CVSS 7.3) was fixed in 1.4.17.
  - It has a plugin API (`createAuthEndpoint`, a client plugin), a Prisma adapter, database sessions and built-in rate limiting.
  - No Plex PIN plugin exists, so we would write one. The exact session-creation helpers are unverified.
- **Next.js's auth guide** lists Better Auth and NextAuth.js among the libraries, plus `iron-session` and `jose` for session management. It stresses that `proxy.ts` checks are optimistic and that real checks belong in a data access layer.

**Recommendation:**

- **Now:** bump to `next-auth@4.24.15` and remove the unused `@next-auth/prisma-adapter`. Do not touch the flow before Rewind.
- **Q1 2027:** spike a Better Auth custom plugin. It would wrap the Plex PIN token check and the Jellyfin credential check as endpoints that create database sessions, which gives revocation and visibility of active sessions, something JWT-only sessions lack. Skip Auth.js v5.
- **Fallback:** if the spike shows the plugin API fighting a custom credential flow, a small DAL built on `jose` or `iron-session` is the fallback the Next docs endorse.

## 10. Share images

| Approach | Capabilities | Limits | Fit |
|---|---|---|---|
| **`next/og` `ImageResponse`** (current) | JSX to PNG, custom fonts (`fonts: [{name, data, weight, style}]`), emoji sets, Node runtime | Docs: "Only flexbox and a subset of CSS"; 500 KB bundle limit (JSX, CSS, fonts and images); TTF, OTF or WOFF | **Keep** for the 1200x630 OG card and the 1080x1920 story card. Add fonts and shared tokens. |
| **Standalone `satori` + `@resvg/resvg-js`** | Satori 0.62.0 (2026-10-16). Its README now lists Grid, z-index, `box-shadow`, `text-shadow`, `clip-path`, `mask`, filters, 2D and 3D transforms, WOFF2, HarfBuzz OpenType features, `@media` and `@container` in stylesheets. | Stateless JSX only. Satori "does not guarantee that the SVG will 100% match the browser-rendered HTML output". `next/og` does not bundle a Satori this new. Next 16.4.2 ships `@vercel/og` 1.0.1, which pins `satori` 0.29.0 and bundles `yoga.wasm`. Satori 0.29.0's README describes the Yoga Flexbox engine, so Grid is not available through `next/og`. | **Use** if story-card designs need Grid or effects. Render in a BullMQ job and cache the PNG next to the wrapped record. |
| **DOM capture in the browser** (`modern-screenshot`, a maintained MIT fork of `html-to-image`; SnapDOM) | "Save this slide" exactly as rendered, including our fonts | CORS: cross-origin images fail (our posters are same-origin via `/api/wrapped/poster`, which helps). Safari and font-embedding quirks. Output varies by device. | **Optional extra**, not the primary share path. |
| **Server Playwright screenshot** | Pixel-perfect rendering of the real React slide | Needs Chromium in the production image (hundreds of MB, unverified) and a queue. Slow per image. | Only if we also do video. Same infrastructure as Remotion. |

**Recommendation:** keep `next/og` and fix its fonts and tokens first. Prototype standalone Satori in the worker only if the Rewind design needs grid layouts or blend effects. Cache generated PNGs; today the image is regenerated on every rate-limited request.

## 11. Programmatic video (Remotion)

Details and skills are in `visual-generation-skills.md` 4.4.1. Points relevant to the stack decision:

- **License:** source-available. It is free for individuals, for-profit organizations with up to 3 employees and non-profits; others need a Company License. On the pricing page, "Remotion for Automators" ($0.01 per render, $100/month minimum) explicitly covers embedding the Remotion Player. The license text says it "will slightly change" in Remotion 5.0.
  - For an MIT self-hosted project, most operators are individuals and are covered.
  - A company running our app would need its own license.
  - Document this in `docs/` if Remotion ships.
- **`@remotion/player`** embeds a composition in the page. Each animation must be driven by `useCurrentFrame()`, which means a second component tree next to the Motion slides.
- **Server rendering** needs Chrome Headless Shell plus encoding in the worker container. CPU and memory cost per 30-second 1080x1920 clip is unverified. Benchmark before committing.
- **Recommendation:** not for the December deadline. If video is wanted, do it in 2027, or as a stretch goal limited to a short "trailer" composition.

## 12. WebGL and shader backgrounds

| Option | Size and status | Tradeoffs |
|---|---|---|
| **CSS only** (gradients, `mask-*`, film grain, `@property` animation) | 0 kB JS | Already the base of the Cinematic theme. Cheapest, works everywhere. |
| **OGL** | About 29 kB minzipped for everything (core 8 kB); zero dependencies; Unlicense | One full-screen fragment shader for an animated "projector light" background. Hand-written GLSL. |
| **react-three-fiber** | 9.8.0 (2026-09-22) adds React 19.3 support; latest stable is 9.8.2. v10 alphas center on WebGPU: 10.0.0-alpha.6 (2026-10-17) makes `WebGPURenderer` the default | Pulls in three.js. Justified only for real 3D scenes. The v10 WebGPU transition makes late 2026 an awkward time to start. |
| **ShaderGradient** (`@shadergradient/react`) | MIT, 2.4.20. The README's install line adds `@react-three/fiber` (v9 for the App Router), `three`, `three-stdlib` and `camera-controls`. The npm manifest itself declares only `react` and `react-dom` as peers. | Fast to drop in, with good animated gradients, but it brings the full three.js stack for a background. |

Rules if any shader ships:

- lazy-load it with `next/dynamic` and `ssr: false`;
- render a static CSS or poster fallback first;
- pause on `visibilitychange` and when offscreen (IntersectionObserver);
- disable it entirely under `prefers-reduced-motion`;
- cap `devicePixelRatio` (for example at 1.5);
- keep it `aria-hidden`;
- check text contrast against the brightest frame.

**Recommendation:** CSS first. If the design calls for a living background, use OGL with a single shader.

## 13. Recommended stack

| Layer | Choice | Replaces |
|---|---|---|
| Components | shadcn/ui CLI v4, **Base UI** base, one preset generated in `shadcn create` (style picked in the design phase; Nova or Mira suit dense admin screens) | Hand-built `components/ui/*` |
| Styling | Tailwind 4.3.x, semantic OKLCH tokens (`app/globals.css`), `[data-theme="rewind"]` scope, container queries | 2,165 raw `slate-*` utilities |
| Class helper | Existing `cn` in `lib/utils`; optionally `npx shadcn@latest migrate cn` later | No change needed |
| Prose | `shadcn/typeset` | Ad-hoc markdown styles |
| Fonts | `next/font` variable fonts (UI sans, mono, Rewind display serif), with TTF copies for Satori | OS `font-serif`, no fonts in OG cards |
| Icons | `lucide-react` (already 1.x) | Inline SVGs in components such as `share-card-download.tsx` |
| Toasts | shadcn Base UI Toast | `components/ui/toast.tsx` |
| Motion | `motion` 14 (`motion/react`) with global `MotionConfig reducedMotion="user"`; React 19.3 `<ViewTransition>` for routes; CSS for micro-interactions | `framer-motion` 12, `react-countup` |
| Charts | shadcn Chart (Recharts 3) for admin; visx 4 + Motion for Rewind | chart.js, react-chartjs-2 |
| Share images | `next/og` with fonts and a shared token module; standalone Satori in the worker if needed | Hard-coded hex values, no fonts |
| A11y | axe with `wcag22aa` in CI on all key routes; `eslint-config-next` + `jsx-a11y` | WCAG 2.1-only admin scans |
| Framework | Next 16.4.x, React 19.3.x, `typedRoutes`, React Compiler (annotation mode), Cache Components later | 16.1.1 / 19.2.3 |
| Auth | next-auth 4.24.15 now; Better Auth spike in Q1 2027 | n/a |

## 14. Recommendations for this repo

The migration runs in phases, ordered so that Rewind 2026 can freeze around 2026-12-10 and still have a two-week buffer before late December.

### Phase 0: safety and baselines (week of 2026-10-19, 2-3 days)

1. **Upgrade dependencies.** Bump `next` to 16.4.2 (or later) and `react` and `react-dom` to 19.3.1, plus `eslint-config-next` to match. Run Next's upgrade codemod first: `npx @next/codemod@canary upgrade latest`, the invocation in the canary "Upgrading to version 16" guide. Then run `npm run build`, `npm test` and `npm run test:e2e`.
2. **Bump `next-auth`** to `^4.24.15`. Remove `@next-auth/prisma-adapter`.
3. **Fix `next.config.js`:**
   - set `images.unoptimized: true` and delete the `remotePatterns` wildcard;
   - drop `'unsafe-eval'` from the production CSP (keep it behind `NODE_ENV === 'development'`);
   - delete the `webpack()` block and the empty `turbopack: {}`.
4. **Fix `app/layout.tsx`:** remove `maximumScale` and `userScalable`.
5. **Fix `e2e/accessibility.spec.ts`:** add `'wcag22aa'`, and add scans of `/wrapped`, `/wrapped/share/[token]`, onboarding and auth pages. Record the current violations as the baseline to burn down.
6. **Fix `eslint.config.mjs`:** add `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. These already register `jsx-a11y` with six warning-level rules, so also enable `eslint-plugin-jsx-a11y`'s recommended rules (see section 7). Pin the plugin as a direct devDependency. Start new rules as warnings so CI stays green.
7. **Add a visual-regression Playwright project** (`toHaveScreenshot()`) for about 10 key screens before any styling changes. Details are in `visual-generation-skills.md`. It is the safety net for every later phase.

### Phase 1: tokens, fonts, shadcn foundation (2026-10-26 to 2026-11-08)

1. **Tokens.** Rewrite `app/globals.css` into three parts:
   - the semantic token block (`:root`, plus a `.dark` alias) in OKLCH, seeded from today's look (table in section 3);
   - `@theme inline` mappings;
   - a `[data-theme="rewind"]` block holding the Cinematic palette.

   Keep the existing `--color-gold` utilities working until Rewind moves to semantic utilities. Create `lib/design/tokens.ts` mirroring the values for Satori, with a sync test.
2. **Fonts.** Add `next/font` variable fonts in `app/layout.tsx`, mapped to `--font-sans`, `--font-mono` and `--font-display`. Point `DISPLAY_CLASS` at `font-display`. Commit TTF copies under `public/fonts/` or `lib/og/fonts/` for the OG route.
3. **shadcn init.** Run `npx shadcn@latest init` (Base UI is the default; pass `-b base` to make it explicit in scripts) with `components.json` aliases pointing `ui` at `@/components/ui` and `utils` at `@/lib/utils`. The CLI docs list `-b, --base <base>` with the values `base`, `radix` and `aria`.
   - Use `--dry-run` and `--diff` on every `add`.
   - Pick the preset in `shadcn create` during the design phase, and apply it with `--preset`.
   - Optionally run `npx shadcn@latest eject` to avoid the runtime `shadcn` CSS package.
4. **Migrate primitives in this order**, keeping our export names and props through thin adapters so call sites do not change in the same PR:
   1. `Button`: map `primary` to `default`, `danger` to `destructive`; `success` becomes a custom variant. 41 importers.
   2. `Card` and `Badge`: add the shadcn versions. Then a scripted sweep replaces the 115 hand-copied card containers.
   3. `Input`, `Textarea`, `Checkbox`, `Switch`: replace `styled-input`, `styled-textarea`, `styled-checkbox` and `switch`.
   4. `Select` and `DropdownMenu`: replace `styled-dropdown` (249 lines; 9 importers outside tests, 13 with tests). Delete the unused `styled-select.tsx`.
   5. `Dialog` and `AlertDialog`: replace `modal-shell` (4 importers) and the confirm modals. Base UI handles the focus trap, ESC and scroll lock.
   6. `Toast`: Base UI Toast behind our existing `useToast` API (55 importing files, 36 outside tests).
   7. `Pagination`; `Calendar` with `Popover` for `date-range-picker`.
   8. `Alert`, `Skeleton` and `Spinner` for loading and error states.

   Update `components/ui/__tests__/*` and keep the `data-testid` attributes the E2E suite depends on (CLAUDE.md rule).
5. **Remove `forwardRef`** in the 9 remaining files, using the React codemod the shadcn Tailwind-v4 guide mentions, or by hand.
6. **Enable `typedRoutes: true`.**

### Phase 2: Rewind 2026 on the new foundation (2026-11-02 to 2026-12-10)

1. **Motion migration.** `npm rm framer-motion && npm i motion`, then rewrite imports to `motion/react` in the 66 files, tests included (scripted). Add `<MotionConfig reducedMotion="user">` in `lib/providers.tsx`. Replace `react-countup` with Motion's `animate` or `useSpring` in its 5 source files (`gold-count-up.tsx` and four section components) and 1 test. Replace `REVEAL_SPRING` with motion tokens.
2. **Rewind theme.** Have the Rewind layout set `data-theme="rewind"`. Move `theme.ts` class strings to semantic utilities. Let the design phase decide which Cinematic tells to keep (`visual-generation-skills.md` TL;DR).
3. **Transitions.** Use `<ViewTransition>` between the Rewind entry, viewer and share routes, with `transitionTypes` on `<Link>` and a reduced-motion CSS rule. Keep `AnimatePresence` for in-slide sequencing.
4. **Viewer fixes.** In `wrapped-viewer.tsx`, replace the 50 ms interval with a CSS or Motion progress animation, and add a visible pause and play control plus keyboard controls (WCAG 2.2.2, 2.5.7).
5. **Charts.** Build the new stat graphics on visx and SVG with Motion. Retire `wrapped-charts.tsx` (chart.js).
6. **Share images.** Load fonts and the token module in `app/api/wrapped/og-image/route.tsx`. Cache the generated PNG per `shareToken` and year. Prototype standalone Satori in the BullMQ worker only if the story card needs Grid.
7. **React Compiler.** Enable `reactCompiler: { compilationMode: 'annotation' }` and mark the heavy Rewind slide components with `"use memo"`.
8. **Background.** Optional: an OGL "projector" shader, lazy-loaded with a CSS fallback and reduced-motion off-switch. Drop it if it slips.
9. **Code freeze for Rewind** around 2026-12-10. Run the axe and visual baselines on every Rewind route.

### Phase 3: admin and app sweep (in parallel from mid-November; continues after the freeze)

1. **Scripted class codemod by area** (`app/admin/**`, `components/admin/**`, onboarding, setup), with a reviewed mapping table:
   - `text-slate-400` to `text-muted-foreground`;
   - `text-slate-300` to `text-foreground/80` or a token;
   - `bg-slate-800/50` to `bg-card`;
   - `border-slate-700` to `border-border`;
   - `cyan-*` accents to `primary`;
   - `red-*` to `destructive`, and so on.

   Do one PR per area, each checked against the screenshot baselines.
2. **Admin chrome.** Adopt the shadcn sidebar block for the admin layout. Migrate the 13 admin charts to shadcn Chart and then remove `chart.js` and `react-chartjs-2`.
3. **Enforcement.** Add a CI grep or lint rule that bans new raw palette classes outside `components/wrapped/cinematic/**`.

### Phase 4: 2027 Q1

1. Cache Components: the `cache-components-instant-false` codemod, then route-by-route conversion, removing the 41 `force-dynamic` exports. Decide nonce CSP vs `experimental.sri` at the same time.
2. React Compiler in full mode.
3. A Better Auth spike with a custom Plex PIN and Jellyfin plugin, and database sessions.
4. Remotion video recap, or HyperFrames, if wanted. Document the license.
5. Optional light theme (the tokens already support it).

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| `shadcn add` overwrites our same-named files (`button.tsx`, `card.tsx`, `badge.tsx`, `switch.tsx`, `alert.tsx`, `pagination.tsx`, `toast.tsx`) | Always use `--dry-run` and `--diff`. Migrate one file per PR. Adapters preserve today's props. |
| Base UI `render` composition differs from Radix `asChild` | Most of our code has no `asChild` today. Follow Base UI's composition handbook. Use `nativeButton` when rendering a non-button. |
| Visual drift during the class sweep | Screenshot baselines from Phase 0. One area per PR. |
| Motion 13 and 14 breaking changes | No `@emotion/is-prop-valid` usage is expected. Run Rewind E2E and visual tests after the bump. Pin the exact version. |
| `<ViewTransition>` needs React 19.3 | Phase 0 upgrade. Browsers without support simply do not animate. |
| React Compiler surfaces impure render code | Annotation mode first. Enable the react-hooks compiler lint rules before widening. |
| Satori feature mismatch between `next/og` and standalone `satori` | Design OG cards for flexbox. Use standalone Satori only behind a spike. |
| Contrast regressions from new tokens | A Jest contrast test over token pairs, plus axe `wcag22aa`. |
| Next.js security cadence (two critical releases in two months) | Add Renovate or Dependabot for `next`, `react`, `next-auth` and `motion`, and subscribe to GitHub advisories. |

## 15. Open questions and unverified items

Resolved during the fact-check (2026-10-17):

- **`shadcn init` flag for Base UI:** `-b base` / `--base base`. The values are `base`, `radix` and `aria`, per the shadcn CLI docs. The third-party spelling `--base base-ui` is wrong.
- **`next/og` in Next 16.4.2:** it bundles `@vercel/og` 1.0.1, which pins Satori 0.29.0 with Yoga (Flexbox only). There is no Grid.
- **Firefox 159:** scheduled for 2026-10-27, per MDN browser-compat-data.
- **Base UI v1.0.0:** 2025-12-11.
- **Release years that GitHub pages omit:** resolved from npm registry timestamps.

Still open:

- The exact Better Auth helpers for creating a session from a custom plugin endpoint.
- Remotion render cost per clip on our worker hardware, and the Remotion 5.0 license changes.
- The production Docker image size impact of Chromium (for Playwright or Remotion rendering).
- HeroUI v3's component count ("75+") and the exact wording of its CSS-animation claim.

## Sources

Primary sources were fetched on 2026-10-17 unless noted. Several vendor sites (`ui.shadcn.com`, `motion.dev`, `nextjs.org`, `react.dev`, `better-auth.com`, `developer.mozilla.org`, `infoq.com`) were not reachable from this sandbox (DNS failures). Their content was read from the projects' GitHub repositories instead, or from search snippets where marked.

**shadcn/ui** (changelog files in `shadcn-ui/ui`):
- [Changelog directory](https://github.com/shadcn-ui/ui/tree/main/apps/v4/content/docs/changelog)
- [Base UI as the default (2026-07-02)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx)
- [React Aria (2026-07-17)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-react-aria.mdx)
- [CLI v4 (2026-03-06)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-03-cli-v4.mdx)
- [cn package (2026-09-03)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-09-cn.mdx)
- [Toast (2026-07-23)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-toast.mdx)
- [shadcn eject (2026-05-31)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-05-shadcn-eject.mdx)
- [Unified radix-ui package (2026-02-02)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-02-radix-ui.mdx)
- [Typeset (2026-07-10)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-typeset.mdx)
- [shadcn create (2025-12-12)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2025-12-shadcn-create.mdx)
- [Base UI docs (2026-01-20)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-01-base-ui.mdx)
- [Component composition (2026-04-06)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-04-component-composition.mdx)
- [Theming docs](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/theming.mdx)
- [Tailwind v4 docs page](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/tailwind-v4.mdx)
- [Chart docs (search snippet)](https://ui.shadcn.com/docs/components/chart)
- [Sera changelog (search snippet)](https://ui.shadcn.com/docs/changelog/2026-04-sera)
- [shadcn apply changelog (search snippet)](https://ui.shadcn.com/docs/changelog/2026-04-shadcn-apply)

**Component libraries:**
- [Base UI releases (v1.9.0, Oct 9)](https://github.com/mui/base-ui/releases)
- [MUI, "2026 and beyond"](https://mui.com/blog/2026-and-beyond/)
- [InfoQ, Base UI v1 (February 2026, search snippet)](https://infoq.com/news/2026/02/baseui-v1-accessible/)
- [Base UI useRender and render prop (search snippet)](https://base-ui.com/react/utils/use-render)
- [Radix primitives commits](https://github.com/radix-ui/primitives/commits/main)
- [DEV opinion piece on Radix maintenance](https://dev.to/mashuktamim/is-your-shadcn-ui-project-at-risk-a-deep-dive-into-radixs-future-45ei)
- [Radix Themes releases](https://github.com/radix-ui/themes/releases)
- [React Spectrum / React Aria releases](https://github.com/adobe/react-spectrum/releases)
- [HeroUI v3 stable (2026-03-21)](https://herouiv3.featurebase.app/changelog/heroui-v3-is-officially-stable-and-pro-pre-sale-is)
- [HeroUI releases](https://heroui.com/docs/react/releases)
- [Ark UI releases](https://github.com/chakra-ui/ark/releases)
- [Park UI Tailwind changelog](https://park-ui.com/docs/tailwind/overview/changelog)

**Tailwind CSS:**
- [Releases](https://github.com/tailwindlabs/tailwindcss/releases)
- [v4.0 blog (2025-01-22)](https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/blog/tailwindcss-v4/index.mdx)
- [v4.1 blog (2025-04-03)](https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/blog/tailwindcss-v4-1/index.mdx)
- [v4.3 blog](https://tailwindcss.com/blog/tailwindcss-v4-3)
- [Theme variables docs](https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/theme.mdx)

**React and Motion:**
- [React releases (19.3.0 on 2026-09-09; 19.3.1 and 19.2.9 on 2026-10-14)](https://github.com/facebook/react/releases)
- [React 19.3 announcement on X](https://x.com/reactjs/status/2097766969080680729)
- [Motion CHANGELOG](https://raw.githubusercontent.com/motiondivision/motion/main/CHANGELOG.md)
- [Motion upgrade guide (search snippet)](https://motion.dev/docs/react-upgrade-guide)
- [Motion changelog (search snippet)](https://motion.dev/changelog?lib=motion)

**Next.js** (docs in `vercel/next.js` canary):
- [Releases (16.4.2; 16.4.1 security)](https://github.com/vercel/next.js/releases)
- [v16.4.1 advisories](https://github.com/vercel/next.js/releases/tag/v16.4.1)
- [View transitions guide](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/view-transitions.mdx)
- [cacheComponents](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.mdx)
- [Migrating to Cache Components](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/migrating-to-cache-components.mdx)
- [reactCompiler](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/reactCompiler.mdx)
- [turbopackRustReactCompiler](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopackRustReactCompiler.mdx)
- [typedRoutes](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/typedRoutes.mdx)
- [Image component and config](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/02-components/image.mdx)
- [Font component](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/02-components/font.mdx)
- [ImageResponse (next/og)](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/04-functions/image-response.mdx)
- [ESLint config](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/03-eslint.mdx)
- [CSP guide](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/content-security-policy.mdx)
- [Authentication guide](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/authentication.mdx)
- [Next.js 16.2 blog (2026-03-18, search snippet)](https://nextjs.org/blog/next-16-2)
- [Next.js 16.3 Instant Navigations (search snippet)](https://nextjs.org/blog/next-16-3-instant-navigations)
- [Vercel supports Next.js 16.3](https://vercel.com/blog/vercel-supports-next-js-16-3)
- [Next.js 16 blog (search snippet)](https://nextjs.org/blog/next-16)

**Auth:**
- [Auth.js is now part of Better Auth (discussion #13252)](https://github.com/nextauthjs/next-auth/discussions/13252)
- [Better Auth blog post (search snippet)](https://better-auth.com/blog/authjs-joins-better-auth)
- [next-auth releases (4.24.15)](https://github.com/nextauthjs/next-auth/releases)
- [Better Auth plugin docs (search snippet)](https://better-auth.com/docs/concepts/plugins)
- [CVE-2026-45364](https://www.mend.io/vulnerability-database/CVE-2026-45364/)
- [Better Auth release overview](https://releases.sh/better-auth/overview)

**Images, video, WebGL:**
- [Satori README](https://github.com/vercel/satori)
- [Satori tags](https://github.com/vercel/satori/tags)
- [modern-screenshot](https://github.com/qq15725/modern-screenshot)
- [SnapDOM on Best of JS](https://bestofjs.org/projects/snapdom)
- [monday.com engineering on DOM capture](https://engineering.monday.com/?p=11028)
- [Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- [Remotion pricing (search snippet)](https://www.remotion.dev/docs/license/pricing)
- [react-three-fiber releases](https://github.com/pmndrs/react-three-fiber/releases)
- [ShaderGradient](https://github.com/ruucm/shadergradient)
- [OGL](https://github.com/oframe/ogl)

**Charts:**
- [Recharts releases](https://github.com/recharts/recharts/releases)
- [Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide)
- [visx releases](https://github.com/airbnb/visx/releases)
- [Nivo releases](https://github.com/plouc/nivo/releases)
- [ECharts releases](https://github.com/apache/echarts/releases)
- [Chart.js releases](https://github.com/chartjs/Chart.js/releases)

**Accessibility and the web platform:**
- [axe-core API tags](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- [axe-core releases](https://github.com/dequelabs/axe-core/releases)
- [MDN browser-compat-data, animation-timeline](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/animation-timeline.json)
- [web.dev, same-document view transitions Baseline (2025-10-16)](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [Mozilla Connect, scroll-driven animations](https://connect.mozilla.org/t5/ideas/implement-css-scroll-driven-animations-animation-timeline/idi-p/116931)

**Added by the fact-check (fetched 2026-10-17):**
- [npm registry metadata](https://registry.npmjs.org/), the source for version and publish dates: `next`, `react`, `tailwindcss`, `motion`, `next-auth`, `@base-ui/react`, `react-aria-components`, `recharts`, `@visx/shape`, `satori`, `@vercel/og`, `@heroui/react`, `better-auth`, `@react-three/fiber`, `@shadergradient/react`, `ogl`, `echarts`, `chart.js`, `@nivo/core`, `@radix-ui/themes`, `@ark-ui/react`, `axe-core`, `modern-screenshot` and `@park-ui/tailwind-plugin`
- [Next.js 16.4.2 package tarball](https://registry.npmjs.org/next/-/next-16.4.2.tgz) (`dist/compiled/@vercel/og/package.json` reports 1.0.1 and bundles `yoga.wasm`)
- [Satori 0.29.0 tarball README](https://registry.npmjs.org/satori/-/satori-0.29.0.tgz)
- [Next.js v16.3.3 security release](https://github.com/vercel/next.js/releases/tag/v16.3.3)
- [Next.js "Upgrading to version 16" guide](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/upgrading/version-16.mdx)
- [Next.js Link docs (`transitionTypes`, added in v16.2.0)](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/02-components/link.mdx)
- [Next.js partialPrefetching docs](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/partialPrefetching.mdx)
- [shadcn CLI docs (`-b, --base` values)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/cli.mdx)
- [shadcn Chart docs (Base UI)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/components/base/chart.mdx)
- [Base UI CHANGELOG (v1.0.0, Dec 11, 2025)](https://raw.githubusercontent.com/mui/base-ui/master/CHANGELOG.md)
- [MUI blog source, "2026 and beyond" (2026-01-01)](https://raw.githubusercontent.com/mui/material-ui/master/docs/pages/blog/2026-and-beyond.md)
- [React CHANGELOG (19.3.0, September 9, 2026)](https://raw.githubusercontent.com/facebook/react/main/CHANGELOG.md)
- [React v19.3.1 release](https://github.com/facebook/react/releases/tag/v19.3.1)
- [visx v4.0.0 release](https://github.com/airbnb/visx/releases/tag/v4.0.0)
- [HeroUI releases](https://github.com/heroui-inc/heroui/releases)
- [Better Auth v1.5.0 release](https://github.com/better-auth/better-auth/releases/tag/v1.5.0)
- [Better Auth 1.7 blog](https://better-auth.com/blog/1-7)
- [next-auth 4.24.15 release](https://github.com/nextauthjs/next-auth/releases/tag/next-auth%404.24.15)
- [MDN browser-compat-data, Firefox releases](https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/firefox.json)
- [MDN browser-compat-data, Document.startViewTransition](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Document.json)
- [axe-core rule descriptions (meta-viewport impact)](https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/rule-descriptions.md)
- [Remotion pricing component source](https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/promo-pages/src/components/homepage/FreePricing.tsx)
- [OGL README (size table)](https://raw.githubusercontent.com/oframe/ogl/master/README.md)
- [ShaderGradient README](https://raw.githubusercontent.com/ruucm/shadergradient/main/README.md)
- [Park UI README](https://raw.githubusercontent.com/chakra-ui/park-ui/main/README.md)
- The installed `node_modules/eslint-config-next` 16.2.10 (`dist/index.js`, jsx-a11y rules)

## Fact-check notes (2026-10-17)

Method. I checked claims against primary sources:

- npm registry metadata and package tarballs;
- raw docs and changelogs on GitHub (shadcn, Next.js canary, React, Motion, Tailwind, Base UI, axe-core, MDN browser-compat-data);
- GitHub release pages;
- the installed `node_modules`.

I also re-ran the repo counts and contrast ratios. Many vendor sites (`mui.com`, `vercel.com`, `web.dev`, `park-ui.com`, the HeroUI changelog host) failed DNS from the sandbox, so I used their GitHub sources where they exist. The report makes no Anthropic or Claude claims, so the `claude-api` skill was not needed.

These checked out unchanged:

- the lockfile versions;
- Next 16.4.1 and 16.4.2 and their GHSA IDs;
- React 19.3.0, 19.3.1 and 19.2.9;
- Tailwind 4.3.3;
- the Motion 12.41 to 14.3 changelog entries;
- the shadcn changelog dates and contents;
- Recharts 3 defaults and visx 4.0.0;
- Satori 0.62.0 and its features;
- the Remotion license and pricing;
- OGL's size and license;
- the Auth.js and Better Auth dates;
- CVE-2026-45364;
- the Next.js docs claims on view transitions, the React Compiler, Cache Components, images, CSP, auth and ESLint;
- the WCAG and axe tags;
- the repo counts for `slate-*`, `cyan-400`, `force-dynamic`, Motion files, primitives, `forwardRef`, `Card`/`Badge` and chart.js files;
- the contrast figures 3.07:1, 2.36:1 and 3.42:1, and the Rewind OKLCH conversions.

Corrections made:

1. **shadcn Base UI flag (sections 2.1, 14 Phase 1, 15).** The flag is `-b base` / `--base base`, not `--base base-ui`. The CLI docs list `base | radix | aria`. I also noted that shadcn ships a migration skill rather than a codemod.
2. **`next/og` Satori version (sections 10, 15).** The open question is resolved: Next 16.4.2 bundles `@vercel/og` 1.0.1, which uses Satori 0.29.0 with Yoga, so there is no Grid. The recommendation (flexbox OG cards, standalone Satori only behind a spike) is unchanged and now confirmed.
3. **Firefox 159 (sections 5.3, 15).** It is scheduled for 2026-10-27, not about December 2026. Firefox moved to two-week releases after 154. The `@supports` guidance stays; ESR 153 still lacks support.
4. **Base UI v1.0.0 date (sections 2.2, 15).** It was 2025-12-11, not "early 2026 / unresolved".
5. **React Aria version (sections 2.2, 2.3).** The latest is `react-aria-components` 1.22.1 (2026-10-09). 1.22.0 was released on 2026-10-08.
6. **HeroUI (section 2.3).** v3.2.2 was released on 2026-07-06/07, not 2026-06-19, and the latest is 3.2.6 (2026-09-17). "75+ components" and the quoted CSS-animation wording are marked unverified. The npm manifest does confirm there is no `framer-motion` dependency.
7. **Next.js security release date (section 8).** The earlier security release was 16.3.3 on 2026-08-25, not 2026-08-26. I added its two critical GHSAs. I also reworded React 19.3.1 as an RSC transport-protocol improvement (#37845), not "fixes".
8. **Better Auth status (section 9).** 1.7.0 went stable on 2026-08-18 and 1.7.10 is the latest stable. The report had described 1.7 as only in release candidates. I added the 1.5.0 date and the CVE's CVSS score, and replaced a paraphrase shown in quotation marks with the exact discussion #13252 wording.
9. **ESLint jsx-a11y (sections 7, 14 Phase 0).** `eslint-config-next` 16.2.10 already depends on and registers `eslint-plugin-jsx-a11y`, but enables only six rules as warnings. **Recommendation updated:** extend jsx-a11y's recommended rules on top of the Next config, rather than "add the plugin because Next does not include it". A possible plugin-redefinition clash in flat config is flagged as unverified.
10. **axe `meta-viewport` (sections 1, 7).** This is an addition, not a fix. The rule's impact is `Moderate`, so the current critical/serious filter hides the zoom lock even under `wcag2aa`.
11. **Repo import counts (sections 1, 2.1, 14 Phase 1).**
    - Files importing `@/components/ui/*`: 122 (91 outside tests), not 111.
    - `toast`: 55 files (36 outside tests), not 54.
    - `styled-dropdown`: 13 files (9 outside tests), not 12.
12. **Contrast (section 3).** `slate-400` on the card surface is about 6.2:1, not 6.3:1. It still passes AA.
13. **Missing years and small precision fixes (sections 1, 2.3, 3, 5.2, 6, 12).**
    - Years filled in from npm: chart.js 4.5.1 (2025-10-13), next-auth 4.24.15 (2026-07-20), axe-core 4.14.0 (2026-10-05), Radix Themes 3.3.0 (2026-01-31), Tailwind 4.2 and 4.3 (2026-02-18, 2026-05-08), Recharts 3.10.1 (2026-07-25), Nivo 0.99.0 (2025-05-23) and ECharts 6.1.0 (2026-05-19).
    - View transition types need Firefox 147 and Safari 18.2.
    - The ShaderGradient install line also needs `camera-controls`, and its npm peers are only `react` and `react-dom`.
    - The latest react-three-fiber is 9.8.2, and v10 alpha.6 makes WebGPU the default.
    - Park UI's Tailwind plugin was last released on 2024-03-06.
    - The Next upgrade codemod is `npx @next/codemod@canary upgrade latest`.

Not verified (WebSearch budget exhausted or source unreachable):

- the X post link for React 19.3;
- the Motion upgrade-guide statement that Motion 12 had no breaking changes for React (search snippet only);
- that `typedRoutes` became stable in 15.5 (consistent with the current docs, but no version-history row);
- the HeroUI items above.
