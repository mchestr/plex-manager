# Rewind (Wrapped) Presentation Audit

Generated 2026-10-17 · 1 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

Scope: everything a user sees of Rewind (the code still calls it "Wrapped"). That covers the dashboard card, the intro, the 14 cinematic v2 slides, Show All, the finale actions, the public share page, the OG image and story card, and the poster proxy. It also covers the code that drives them: `components/wrapped/**`, `app/(app)/wrapped/**`, `app/api/wrapped/**` and the presentation parts of `lib/wrapped/**`.

Evidence comes from:
- The audit screenshots in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/screenshots/`. These are `wrapped-*`, `user-home-*`, `public-wrapped-share-*` and `admin-user-wrapped-*`, each with a `--desktop.png` and a `--mobile.png` version.
- Probe captures and scripts in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/rewind-ui/` (the `probe-*.png`, `og.png`, `card.png`, `card-small.png` and `showall-archetype.png` files).
- One verifier probe in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/verifier-rewind-ui-01/`.

The probes were run against the seeded dev server on `http://localhost:3100`. Running them added share-visit rows to the audit database: 2 rows from the auditor's probes and 2 more from the verifier's curl.

## Executive summary

1. **The signature moment is blank (RWV-01).** For every user with motion enabled, the archetype name on the "And the award goes to…" slide paints as transparent text. This was confirmed in Chromium; WebKit was not tested. The same per-letter `MarqueeText` component also breaks slide headlines mid-word on phones ("WRAPP/ED", "TIM/E", "AUDIE/NCE"). It is a small (S) fix.
2. **Rewind 2026 breaks on New Year's Day (RWV-02).** The dashboard card uses the admin-configured Rewind year, but `/wrapped` always uses `new Date().getFullYear()`. From 1 January 2027, the card's "View Your Wrapped" link lands on "No Wrapped Found … 2027" for anyone in a Nov–Jan window. Owners cannot reach their past years at all.
3. **The share page fails at the moment Rewind spreads (RWV-05).** The page fetches its own API over HTTP, twice per render, and every visitor shares one rate-limit bucket. After about 50 renders in 15 minutes, every share link on the server returns 404. Each view is also recorded twice, with the server's own user agent. The page sits inside the auth-guarded `(app)` group and still uses the old space theme.
4. **The viewer is not a story player (RWV-03).** There is no tap, swipe, keyboard or pause control. The first manual Next turns autoplay off for good. The progress bar is drawn under the letterbox bar. The intro runs 7.5–8.5s and cannot be skipped.
5. **Slides do not fit a phone (RWV-04).** There is no fixed 9:16 stage:
   - The streaks slide is 1,004px tall on an 844px screen.
   - The monthly filmstrip hides the peak month on mobile.
   - Top-5 titles truncate to "The B…" and "Shogu…".
6. **The look changes five times in one viewing (RWV-07).** The pink dashboard card, the cyan/purple space intro, the gold slides, the cyan/pink buttons and the space-themed share page are five different identities, and the copy still says "Plex Wrapped". No web fonts are loaded, so the display serif and the share-image face differ by platform (RWV-08).
7. **Accessibility gaps (RWV-09).**
   - Reduced motion is honoured in only 4 primitives, and there is no global `MotionConfig`.
   - Charts have no labels for screen readers.
   - Non-peak bars have 1.63:1 contrast.
   - Autoplay cannot be paused.
   - Pinch-zoom is disabled app-wide (`userScalable: false`).

   Text contrast is good and should be kept.
8. **Sharing is one text-only card, offered only at the end (RWV-06).** It is set in Noto Sans Regular, so bold does nothing. There are no per-slide cards and no `navigator.share`, so on phones the card is saved to Files instead of posted to a story.
9. **The structure makes every slide change cost double (RWV-12).** There are two theme trees, two switch dispatchers, no slide registry and no Zod schema for stored data. This is the direct cause of the duplicated copy (RWV-10) and of zero-data or edge-case slides (RWV-11).
10. **Recommended foundation for Rewind 2026.** Build four things together:
    - a fixed 9:16 stage with story controls;
    - one Rewind theme with loaded fonts;
    - a slide registry holding each slide's component, Zod schema, duration, copy, eligibility check and share card;
    - per-slide share cards rendered with Satori (the engine behind next/og) and shared through `navigator.share`.

    Keep the cinematic concept, the colour tokens, the text contrast, slide pacing owned by the viewer, the `SlideFrame` scaffold and the poster proxy.

## Severity table

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 7 |
| Medium | 5 |
| Low | 1 |
| Info | 1 |
| **Total** | **14** |

No finding was refuted. Three severities were lowered during verification:

| Finding | Proposed | Final | Why |
|---|---|---|---|
| RWV-01 | critical | high | The viewer stays usable |
| RWV-06 | high | medium | Mostly a missing feature; the real defects are small |
| RWV-13 | medium | low | The 20 Hz loop only runs until the first tap; measured on a dev build |

The auditor's narrative summary still calls RWV-01 "critical", but this table uses the verified severities.

**Placeholder recommendations.** Six auditor recommendation fields contained only "No change needed." even though each finding describes a real defect: RWV-03, RWV-04, RWV-05, RWV-07 and RWV-08 are confirmed defects, and RWV-12 is confirmed debt. The recommendations below come from three sources:
- the verifiers' and second opinions' corrected recommendations (RWV-02, -03, -04, -05, -07);
- the auditor's summary and finding body (RWV-08, -12), marked as "derived";
- the auditor's own text, where it was a real recommendation (RWV-01, -06, -09, -10, -11, -13, -14).

---

## Findings

### A. Correctness and visual defects

#### RWV-01 · MarqueeText letter-splitting hides the archetype name and breaks every slide title mid-word

- **Severity:** high. The auditor proposed critical; the verifier lowered it because the viewer stays usable while one headline vanishes and titles wrap badly.
- **Status:** verified. The refutation attempt failed, and an independent DOM probe confirmed the cause.
- **Source:** rewind-ui-01
- **Where:**
  - `components/wrapped/cinematic/marquee-text.tsx:30-31` (reduced-motion branch), `:35-50` (per-letter spans), `:40` (inline-block), `:41-42` (filter animation)
  - `components/wrapped/wrapped-sections/cinematic/archetype-reveal-section.tsx:44-49`
  - `components/wrapped/cinematic/slide-frame.tsx:59-61` (every SlideFrame title)
  - `components/wrapped/wrapped-sections/cinematic/finale-section.tsx:47`

**Evidence:**

```tsx
// components/wrapped/cinematic/marquee-text.tsx:37-42
<motion.span
  key={i}
  aria-hidden
  className="inline-block whitespace-pre"
  initial={{ opacity: 0, y: "0.4em", filter: "blur(6px)" }}
  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
```

```tsx
// archetype-reveal-section.tsx:44-49
<MarqueeText text={name} delay={1.2} stagger={0.06}
  className="bg-gradient-to-b from-gold-bright via-gold to-gold bg-clip-text text-transparent" />
```

There are two symptoms, and both come from the per-letter inline-block `motion.span`.

**Symptom 1: the archetype name is invisible.**
- Framer Motion leaves `filter: blur(0px)` and a transform on each letter. That gives every letter its own paint layer, so the parent's `background-clip: text` gradient never paints through. Each letter inherits `color: transparent`.
- Probe at 6.5s on the slide: the h2 text is "The Series Devourer" and each letter is `rgba(0,0,0,0)` with `filter: blur(0px)`.
- When the verifier injected `filter: none`, the gold name appeared (`verifier-rewind-ui-01/after-filter-none.png`).
- With reduced motion on, MarqueeText returns one plain span and the name renders in gold (`probe-archetype-mobile-reduced.png`).
- Screenshots showing the empty gap:
  - `wrapped-slide-10-archetype-reveal--desktop.png` and `--mobile.png`
  - `wrapped-show-all--desktop.png`, taken after every animation had finished
  - `rewind-ui/showall-archetype.png`
  - `probe-archetype-desktop.png`

**Symptom 2: words break mid-word.** Inline-block letters are atomic inlines, so a line can break between any two of them.
- `wrapped-slide-01-hero--mobile.png`: "YOUR 2026 WRAPP/ED"
- Slide 02: "TOTAL WATCH TIM/E"
- Slide 05: "TOP BILLING — FIL/MS"
- Slide 06: "SE/RIES"
- Slide 07: "YOUR VIEWING PA/TTERNS"
- Slide 09: "AUDIE/NCE"
- Slide 11: "SCEN/ES"
- `admin-user-wrapped--mobile.png`: "WRA/PPED"
- `wrapped-show-all--mobile.png`: "WRAP/PED" and "TI/ME"
- The verifier's filter-none capture: "DE/VOURER"

The break point moves with the available width.

**Reach:** 12 slide files use SlideFrame (the auditor said 11; corrected). The archetype and finale slides call MarqueeText directly, so 14 headlines are affected.

**Caveats:** the invisibility was confirmed in headless Chromium only; WebKit (iOS Safari) was not tested. The mid-word breaking does not depend on the browser engine.

**Impact:** The archetype reveal is the most shareable fact in Rewind, and every user with motion enabled sees an empty space there. Every slide headline looks broken on phones, which are the main viewing device.

**Recommendation:**
1. Rewrite MarqueeText to split into words first, with one `inline-block whitespace-nowrap` span per word. Letters animate inside the word.
2. Fix the gradient in one of two ways: put the gradient classes on each letter span, or reveal whole words with `clip-path` or `mask` instead of a per-letter `filter`.
3. Set `transitionEnd: { filter: 'none' }` so no filter is left on the element.
4. Keep `aria-label` on the wrapper and `aria-hidden` on the letters.
5. Add `data-testid="rewind-archetype-name"`.
6. Add a Playwright check, in Chromium and WebKit, that the name is visible and has no mid-word breaks at 390px.

The same fix covers the mid-word issue noted under RWV-04 and RWV-11.

**Effort:** S

#### RWV-02 · `/wrapped` always uses the calendar year: from 1 Jan 2027 the 2026 Rewind says "No Wrapped Found", and past years cannot be viewed

- **Severity:** high
- **Status:** verified. The refutation attempt failed.
- **Source:** rewind-ui-08
- **Where:**
  - `app/(app)/wrapped/page.tsx:19-20`, `:106-108`
  - `components/dashboard/wrapped-card.tsx:67-75`, `:114`, `:272`
  - `actions/admin/admin-config.ts:52-62`, `:73-77`
  - `actions/user-queries.ts:48-53`
  - `components/admin/settings/wrapped-settings-form.tsx:31-35`, `:122-124`
  - `prisma/schema.prisma:256-257`
  - Other places that default to the current year:
    - `components/admin/users/regenerate-wrapped-button.tsx:18`
    - `components/admin/wrapped/historical-versions-inline.tsx:46`
    - `components/generator/wrapped-generator-status.tsx:45`
    - the defaults in `actions/wrapped-generation.ts` and `actions/user-queries.ts`
    - `components/wrapped/wrapped-home-button.tsx:29-38,78,158`, which is dead code (see RWV-12)

**Evidence:**

```ts
// app/(app)/wrapped/page.tsx:19-20
const currentYear = new Date().getFullYear()
const wrapped = await getUserPlexWrapped(session.user.id, currentYear)
```

```ts
// components/dashboard/wrapped-card.tsx:75  (year comes from getWrappedSettings)
const wrappedYear = wrappedSettings?.year ?? new Date().getFullYear()
```

```ts
// actions/admin/admin-config.ts:74-77
let wrappedYear = new Date().getFullYear()
if (config.wrappedGenerationStartDate) {
  wrappedYear = new Date(config.wrappedGenerationStartDate).getFullYear()
}
```

**A window that crosses New Year is an intended setup:**
- The schema documents a window like "Nov 20 … Jan 31" (`prisma/schema.prisma:256-257`).
- The settings form saves start 2026-11-20 and end 2026-01-31 (`wrapped-settings-form.tsx:31-35,122-124`).
- In January 2027, `getWrappedSettings` takes the `isInNextYear` branch, keeps Rewind enabled and returns year 2026.

**The two sides disagree:**
- The card links to plain `/wrapped`, and after generation it calls `router.push("/wrapped")` (`wrapped-card.tsx:114`).
- The page looks up the exact `userId_year` key for 2027, with no fallback (`user-queries.ts:48-53`).
- The result is "No Wrapped Found — You haven't generated your 2027 Plex Wrapped yet" (`page.tsx:106-108`).
- With no window configured, both sides switch to 2027 on 1 January, and the 2026 Rewind has no route for its owner at all.

**Past years:** only admins can choose a year, via `?year=` on `app/admin/users/[userId]/wrapped/page.tsx:23`. The seeded 2025 wrapped can't be reached by its owner.

**Impact:** Every user who opens or finishes generating their Rewind in the January part of the window sees a false empty state on the flagship feature. December views are not affected. Past years are lost to their owners.

**Recommendation:**
1. Add one shared resolver for the active Rewind year: the year from config, falling back to the calendar year.
2. Use it in `/wrapped` and in every caller listed under Where.
3. Accept `?year=` on `/wrapped`, or add `/wrapped/[year]`, with an archive list scoped to the owner.
4. Add a unit test for the Nov–Jan window in January.

**Effort:** M

---

### B. Story player and layout

#### RWV-03 · Not a story player: no keyboard, tap, swipe or pause; autoplay stops at the first tap; progress bar hidden under the letterbox; 8s intro cannot be skipped

- **Severity:** high
- **Status:** verified. The refutation attempt failed on the core claims; minor overstatements are corrected below.
- **Source:** rewind-ui-02
- **Where:**
  - `components/wrapped/wrapped-viewer.tsx:120-140` (auto-advance), `:142-154` (handleNext and handlePrevious), `:156-183` (Show All), `:228-235` (container and progress placement)
  - `components/wrapped/wrapped-viewer-progress.tsx:17-26`, `:48-63`
  - `components/wrapped/cinematic/letterbox.tsx:17`
  - `components/wrapped/wrapped-viewer-navigation.tsx:29-36`, `:58-64`
  - `components/wrapped/wrapped-transition.tsx:17-58`
  - `components/wrapped/wrapped-viewer-wrapper.tsx:30`

**Evidence:**

```tsx
// wrapped-viewer.tsx:142-147
const handleNext = () => {
  if (currentSectionIndex < sections.length - 1) {
    setCurrentSectionIndex((prev) => prev + 1)
    setIsAutoAdvancing(false)   // never set back to true
  }
}
```

```tsx
// letterbox.tsx:17  vs  wrapped-viewer.tsx:228 (progress bar is the first child)
className="pointer-events-none fixed top-0 inset-x-0 z-30 h-[6vh] min-h-8 bg-black"
<div className="min-h-screen relative py-8 sm:py-12 px-4 ...">
```

**No story input.** A grep of `components/wrapped`, `app/(app)/wrapped`, `hooks` and `lib` finds no keydown, touch, pan, drag, swipe or visibilitychange handlers. In the probe, ArrowRight, Space and a click on the right edge left the label at "section 1 of 14" while the timer kept running.

**Autoplay.** One Next or Previous ends autoplay for the rest of the session. The auto-advance effect at `:120-140` only runs while autoplay is on. There is no pause or hold-to-pause.

**Progress bar.**
- The 6px bar (`h-1.5`) lands at y 48–54px on desktop and 32–38px on mobile.
- The fixed letterbox ends at 54px on desktop and 50.6px on mobile, so the bar sits underneath it.
- Only the dots show, at about 68px (`wrapped-slide-10-archetype-reveal--desktop.png`, `wrapped-slide-02-total-watch-time--mobile.png`).
- The bar is visible only in the admin embed (`admin-user-wrapped--desktop.png`).
- The 14 dots are 6px, `aria-hidden` and not clickable (`progress.tsx:48-63`).

**Buttons.** Previous and Next are raw `<button>`s rendered after the slide content, so they move from slide to slide. On mobile, Next sits at about y 636 on most slides, 734 on the top lists, 888 on streaks and 713 on server stats.

**Intro.** WrappedTransition chains timers with no skip control and no reduced-motion branch: 1.5s intro, a 3×1s countdown, a 1s reveal and a 1s fade. That is about 7.5s in code. The probe measured Next appearing 8.1s after load on desktop and 8.5s on mobile with reduced motion. The intro is skipped only for share and preview views (`wrapped-viewer-wrapper.tsx:30`).

**Show All.** It is a one-way long scroll. `showAll` is never reset, and the view has no navigation or share actions.

**Corrections from verification:**
- "Never visible" is too strong. On desktop windows shorter than about 900px inner height, 6vh is under 54px and the bar shows partly or fully. On phones it is always covered.
- Keyboard users can still Tab to the native buttons. What's missing is story shortcuts, not keyboard operability.
- Timers in a hidden tab are throttled but still fire. This is real but minor.

**Impact:** Every viewer expects Instagram- or Spotify-style stories. Instead they get small buttons that move, a timeline they can't see, and autoplay that stops for good after one interaction.

**Recommendation:**
1. Add a `useStoryPlayer` hook with:
   - tap zones (left third goes back, right two thirds go forward)
   - ArrowLeft, ArrowRight and Space
   - horizontal swipe
   - hold-to-pause
   - pause on `visibilitychange`
   - autoplay that resumes after manual navigation
2. Replace the bar with segmented progress, one segment per slide, that can be clicked. Place it inside or below the letterbox (top offset of at least `6vh`).
3. Pin Previous, Next and Pause/Play in a fixed footer built with `components/ui/button`.
4. Add a Skip control to WrappedTransition, plus a short path for reduced motion.
5. Give Show All a "Back to story" control.
6. Add `data-testid`s to every control (see RWV-12).

**Effort:** M

#### RWV-04 · Slides are not built for a 9:16 phone stage: they overflow the viewport, scroll sideways and truncate titles

- **Severity:** high
- **Status:** verified. The refutation attempt failed; overstatements are corrected below.
- **Source:** rewind-ui-03
- **Where:**
  - `components/wrapped/wrapped-viewer.tsx:228-253`
  - `components/wrapped/wrapped-sections/cinematic/monthly-journey-section.tsx:26-37`
  - `components/wrapped/wrapped-sections/cinematic/streaks-patterns-section.tsx:27`
  - `components/wrapped/wrapped-sections/cinematic/top-billing-list.tsx:42-49`, `:84-91`
  - `components/wrapped/wrapped-sections/cinematic/overseerr-stats-section.tsx:37`
  - `components/wrapped/cinematic/gold-count-up.tsx:31`
  - `lib/utils/time-formatting.ts:18`

**Evidence:**

```tsx
// wrapped-viewer.tsx:228, :230, :253 — no stage, only a min-height
<div className="min-h-screen relative py-8 sm:py-12 px-4 sm:px-6 lg:px-8 pb-24 md:pb-12">
  <div className="max-w-4xl mx-auto relative z-10">
style={isCinematic ? { minHeight: "60vh" } : { ... }}
```

```tsx
// top-billing-list.tsx:84-91 — truncate loses to nowrap metadata
<span className="flex-1 text-ivory text-base sm:text-lg truncate">{entry.title}…</span>
<span className="text-taupe text-xs sm:text-sm whitespace-nowrap">
  {formatWatchTime(entry.watchTime)}{… ` · ×${entry.playCount}`}{… ` · ${entry.episodesWatched} ep`}
```

**No fixed stage.** The fixed 6vh letterbox bars take about 100px, 12% of an 844px phone screen.

**Slides taller than the viewport** (PNG heights checked):
- Streaks is 390×1004 on mobile (viewport 844) and 1440×992 on desktop (viewport 900).
- Top movies and top shows are 850px on mobile, 6px over, even though the posters failed to load. When Plex is reachable, the `w-24` 2:3 headliner poster adds about 150px.

**Monthly filmstrip.**
- It is 12 × `w-16 sm:w-20` frames in an `overflow-x-auto` + `min-w-max` row, 12×80 + 11×6 = 1,026px wide on desktop.
- Desktop: Nov and Dec are cut off, part of Oct shows, and the peak (Jul) is visible.
- Mobile: Jan–Apr and part of May show, so the gold peak month is off screen.
- Nothing hints that the strip scrolls (`wrapped-slide-08-monthly-journey--desktop.png` and `--mobile.png`).

**Truncation.**
- Top lists on mobile: "The B…", "Shogu…", "The Last…", "Andor…" (`wrapped-slide-06-top-shows--mobile.png`), and "Everything E…", "The Holdovers (2…" (`wrapped-slide-05-top-movies--mobile.png`). The metadata comes from `formatWatchTime`, for example "16 hours, 20 minutes · ×28 · 28 ep", and real heavy users get longer strings like "2 days, 5 hours, …".
- Genre labels in a `w-24 sm:w-28 … truncate` column: "SCIENCE FI…", "DOCUMENT…" (`wrapped-slide-12-overseerr-stats--mobile.png`).

**Wrapping.**
- The GoldCountUp suffix is an inline `text-[0.45em]` span, so the hero wraps to "1,307 HOURS / WATCHED" (`wrapped-slide-01-hero--mobile.png`).
- Slide 02's labels wrap to "FILMS · 18 DAYS, 3 / HOURS".

**Empty space.** About 150px of empty stage is left under the buttons on most mobile slides (02, 03, 08, 09).

**Corrections:**
- The bottom letterbox does not permanently hide the controls: `pb-24` (96px) is taller than the bar, so they appear once the user scrolls.
- Material vertical overflow happens only on streaks (about 160px).
- "Scroll sideways" means the filmstrip's own scroll area, not the page.
- The mid-word headline breaks in the same screenshots are covered by RWV-01.

**Impact:** On phones, users scroll inside a story, miss their peak month and can't read their own top-5 titles. Touch has no tooltip to recover a truncated title. Without a fixed frame there is no stable composition to turn into a share card (RWV-06).

**Recommendation:**
1. Wrap the slide `motion.div` (`wrapped-viewer.tsx:228-253`) in a fixed stage: `aspect-[9/16] max-h-[100dvh]`, centred, with the letterbox and progress inside it. On desktop, show the stage at phone proportions rather than a 4xl column.
2. Design every slide to fit the stage at 390×844, and add a Playwright assertion that the slide height is no taller than the stage.
3. Top lists: use a two-line row (title, then metadata) with a compact duration formatter such as "16h 20m" instead of `formatWatchTime`, and remove the repeated "×28 · 28 ep".
4. Filmstrip: a 12-column grid that fits the stage, or 2×6 on mobile, with no horizontal scroll.
5. Remove `truncate` from the genre labels and let them wrap.
6. Put the GoldCountUp suffix on its own line under the number.

**Effort:** L

---

### C. Share page and sharing

#### RWV-05 · Public share page: off-brand static summary inside the auth-guarded group, the page fetches its own API so visits are counted twice, one shared rate-limit bucket turns every share link into a 404, and an email can appear publicly

- **Severity:** high
- **Status:** verified. The refutation attempt failed on the core claims. The email part was downgraded to a low, theoretical sub-issue.
- **Source:** rewind-ui-07
- **Where:**
  - `app/(app)/wrapped/share/[token]/page.tsx:10-28`, `:42`, `:102-106`, `:108`
  - `app/(app)/layout.tsx:47-49`
  - `app/api/wrapped/share/[token]/route.ts:18`, `:54-71`, `:85`
  - `app/api/wrapped/og-image/route.tsx:75`
  - `lib/security/rate-limit.ts:37-43`, `:127-130`
  - `lib/guards.ts:45-55`
  - `actions/onboarding.ts:40-41`
  - `actions/share-analytics.ts:52`, `:110`
  - `components/wrapped/wrapped-share-summary.tsx:6`, `:20`, `:36`, `:46-47`
  - `components/admin/playground/preview-modal.tsx:101`

**Evidence:**

```ts
// app/(app)/wrapped/share/[token]/page.tsx:10-15 — called by generateMetadata (:42) AND the page (:102)
async function getSharedWrapped(token: string) {
  try {
    const baseUrl = getBaseUrl()
    const response = await fetch(`${baseUrl}/api/wrapped/share/${token}`, {
      cache: "no-store",
    })
```

```ts
// app/api/wrapped/share/[token]/route.ts:85
userName: wrapped.user.name || wrapped.user.email || "User",
```

**Visits counted twice.** Every call to the route writes a `WrappedShareVisit` (`route.ts:54-71`).
- The auditor measured 32 → 34 rows for one view; the second opinion measured 29 → 31 for one curl.
- The two rows are 60ms apart, both have userAgent `node`, no referer and the same IP hash.
- So the admin Shares analytics (`share-analytics.ts:52,110`) show double the visits, and the user agent, referer and IP describe the server, not the visitor.
- Whether a production build merges the two fetches was not tested.

**One shared rate-limit bucket.**
- The limiter key is `x-forwarded-for`, then `x-real-ip`, then `'unknown'` (`rate-limit.ts:37-43`), and `shareRateLimiter` allows 100 requests per 15 minutes (`:127-130`).
- The server-side fetch forwards none of the visitor's headers. In production it loops back through the reverse proxy, which reports the server's own IP.
- So all visitors and crawlers share one bucket. Every non-OK response, including 429, becomes `null` and then `notFound()` (`page.tsx:17-28,104-106`).
- This is capture failure 1: after about 50 views, every share page returned 404 until the server was restarted.

**Wrong route group.**
- The page sits under `app/(app)`, whose layout runs `ensureSetupComplete`, `ensureOnboardingComplete` and `ensureSubscriptionOrAccess` (`layout.tsx:47-49`).
- A signed-in friend with unfinished onboarding is sent to `/onboarding`. A member without paid access while Stripe gating is on is sent to `/subscribe` (`guards.ts:45-55`).
- Anonymous visitors get through only because `getOnboardingStatus` treats "no session" as complete (`onboarding.ts:40-41`).

**Off-brand page.**
- WrappedShareSummary is a client component on SpaceBackground with a cyan-purple-pink "{name}'s {year} Plex Wrapped" heading and slate stat cards. It shows no archetype and no story, and posters vanish when they fail (`public-wrapped-share--desktop.png` and `--mobile.png`).
- The OG preview for the same link is gold-on-black, so the link preview and the page look like different products.
- The viewer's `isShared` mode is unused in production; only `preview-modal.tsx:101` passes it, as `false`.

**Email fallback.** The fallbacks at `route.ts:85` and `og-image/route.tsx:75` exist. But every path that creates a user sets `name` from the username:
- `lib/auth.ts:206,230,360`
- `actions/invite.ts:334,746`
- `actions/import-plex-users.ts:77`

So an email appears only for a null or empty name, such as a legacy or hand-edited row.

**Impact:** The share page is how Rewind spreads. Today it looks like a different product, redirects some signed-in members away, returns 404 for everyone under a modest launch-week burst (Discord, Slack and social crawlers each render it), and doubles the share analytics.

**Recommendation:**
1. Remove the HTTP self-fetch. Read through one `getSharedWrappedByToken = cache(...)` Prisma helper used by both `generateMetadata` and the page.
2. Record the visit once, in the page, from the real request headers (`next/headers`), and rate-limit by the visitor's IP.
3. Call `notFound()` only for a real not-found. Show a retry state for 429 and 5xx.
4. Move the route out of `app/(app)`, for example to `app/(public)/wrapped/share/[token]`.
5. Render a Rewind-branded share view: the viewer in `isShared` mode, or a hero that matches the OG card.
6. Fall back to the username or "Someone", never the email.

**Effort:** M

#### RWV-06 · Sharing is a single text-only card: no per-slide cards, no native share sheet, default font, unused summary

- **Severity:** medium. The auditor proposed higher; the verifier lowered it because most of this is a missing feature, and the real defects (bold not rendering, unused summary, floored days, one-hour cache) are small.
- **Status:** adjusted
- **Source:** rewind-ui-05
- **Where:**
  - `app/api/wrapped/og-image/route.tsx:37`, `:75-91`, `:93-96`, `:98`, `:115`, `:146`, `:157`, `:223`, `:247`
  - `components/wrapped/share-card-download.tsx:22-32`, `:28`
  - `components/wrapped/wrapped-share-button.tsx:17-49`, `:53-80`
  - `components/wrapped/wrapped-viewer-navigation.tsx:41-59`

**Evidence:**

```tsx
// app/api/wrapped/og-image/route.tsx:86-98
summary: stripHighlightTags(rawSummary),          // computed, never rendered
watchTimeText:
  days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : `${hours} hour${hours !== 1 ? "s" : ""}`,
...
? new ImageResponse(<StoryCard {...cardStats} />, { width: 1080, height: 1920 })   // no `fonts`
: new ImageResponse(<OgCard {...cardStats} />, { width: 1200, height: 630 })
image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600")
```

**What exists.** One summary card in two sizes: `og.png` is 1200×630 (54KB) and `card.png` is 1080×1920 (78KB). Both are text on black: name, year, archetype, days, films and series. There is no poster art, top title, genre, server branding, URL or QR code.

**Font.** No `fonts` option is passed, so Satori uses the only bundled face, `node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf`. `fontWeight: 700` and italic (`:115,146,157,223`) render as regular, which `card-small.png` confirms.

**Data on the card.**
- `cardStats.summary` is computed (`:86`) and never rendered.
- Days are floored, so 54d 11h shows as "54 days" and 47h as "1 day" (`:78-88`). This duplicates `formatWatchTimeHours` in `lib/utils/time-formatting.ts`.

**Sharing actions.**
- Share and Download appear only on the last slide (`navigation.tsx:41-59`).
- Share only writes the URL to the clipboard; there is no `navigator.share`.
- Download fetches the card, makes a blob URL, clicks a temporary `<a download="plex-wrapped-${year}.png">` and revokes the URL at once (`share-card-download.tsx:22-32`). On phones this saves to Files and can't post to a story.

**Cache.** A regenerated Rewind keeps serving the old image for up to an hour.

**Corrections from verification:**
- Copy feedback is not hover-only: the button itself switches to "Copied!" with `aria-live` (`share-button.tsx:53-80`).
- About the bottom 15% of the story card is empty, not "the lower third".
- Card downloads come from the visitor's browser, so behind a proxy they get their own IP key, not the shared server bucket from RWV-05.

**Impact:** Spotify-style recaps spread through per-slide 9:16 images posted to Stories. Rewind has one plain card, reachable only at the end, which limits how far Rewind 2026 can travel.

**Recommendation:**
- Quick fixes first (S):
  - Load fonts into `ImageResponse` with the same files as RWV-08.
  - Render the summary or drop it.
  - Use a compact "Xd Yh" formatter from `lib/utils/time-formatting.ts`.
  - Add `?v=<generatedAt>` to the image URLs.
  - Rename the download to `rewind-YYYY.png`.
- Then build the per-slide card system (L):
  - A card renderer declared per slide in the registry (RWV-12).
  - `navigator.canShare({ files })` with `navigator.share`, falling back to download and then copy-link.
  - Share actions available on every slide.
  - Optionally a toast for the fallback paths only; the in-button feedback already exists.

**Effort:** L (S quick wins first)

---

### D. Visual identity and typography

#### RWV-07 · Five visual identities in one Rewind journey; the cinematic theme stops at the slide edges

- **Severity:** high. The verifier rated it "at the edge between medium and high". The owner explicitly asked for consistency, and the problem reaches the public page.
- **Status:** verified. The refutation attempt failed.
- **Source:** rewind-ui-04
- **Where:**
  - `components/dashboard/wrapped-card.tsx:259-273`
  - `components/wrapped/wrapped-transition.tsx:67`, `:93`, `:113`, `:145-147`
  - `components/wrapped/wrapped-viewer-navigation.tsx:31-34`, `:60-63`
  - `components/ui/button.tsx:21`
  - `components/wrapped/wrapped-share-button.tsx:50`
  - `components/wrapped/share-card-download.tsx:28`, `:46`
  - `components/wrapped/wrapped-share-summary.tsx:36`, `:46`, `:69-86`, `:98`, `:147`, `:225-227`
  - `app/(app)/wrapped/page.tsx:38-117`
  - `components/wrapped/wrapped-viewer.tsx:68`, `:201`
  - `components/shared/formatted-text.tsx:20`
  - `app/layout.tsx:10`
  - `lib/wrapped/assemble-wrapped.ts:80`
  - `app/api/wrapped/og-image/route.tsx:247`
  - `app/(app)/wrapped/share/[token]/page.tsx:68`

**Evidence:**

```tsx
// components/dashboard/wrapped-card.tsx:259
<h2 className="... bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
// components/wrapped/wrapped-viewer-navigation.tsx:34
className="... bg-slate-800/50 border border-slate-600 rounded-md text-white hover:border-cyan-500 ..."
// components/shared/formatted-text.tsx:20
highlightClassName = "font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent",
// app/layout.tsx:10
themeColor: "#0f172a",
```

**One user's path through five looks.** The cinematic theme applies only when `version === 2` (`wrapped-viewer.tsx:68`), and all current data is v2, so every 2026 user goes from the space look to gold and back.
1. **Dashboard card:** pink→purple→cyan "2026 Wrapped" heading and a pink gradient CTA (`user-home--mobile.png`).
2. **Intro:** SpaceBackground with cyan/purple/pink rings and "Your 2026 Wrapped" (`wrapped-intro-01-logo--desktop.png`).
3. **Slides:** gold cinematic.
4. **Finale controls:** three button styles in one row (`wrapped-slide-14-finale--desktop.png`):
   - Previous and Next: raw slate buttons with a cyan hover
   - Show All: the ui `Button` primary, `from-cyan-600 to-purple-600`
   - Share: `from-cyan-600 via-purple-600 to-pink-600`
   - Download: gold outline
5. **Public share page:** SpaceBackground, cyan/purple/pink headings and slate cards (`public-wrapped-share--desktop.png`).

**Other surfaces in the old style:**
- `/wrapped`'s no-data, failed and parse-error states are hand-rolled slate cards with inline SVGs and cyan/purple CTAs (`page.tsx:38-117`).
- The viewer's empty fallback is a panel with a cyan border (`wrapped-viewer.tsx:201`).
- FormattedText defaults its highlight to the space gradient.
- The browser `themeColor` is slate `#0f172a`, while the stage is `#0a0908`.

**Branding still says "Wrapped":**
- the hero title `Your ${year} Wrapped` stored in the data (`assemble-wrapped.ts:80`)
- the OG footer "A Plex Wrapped Production" (`:247`)
- siteName "Plex Wrapped" (`share page:68`)
- the file name `plex-wrapped-${year}.png` (`share-card-download.tsx:28`)
- "Create Your Own Plex Wrapped" (`wrapped-share-summary.tsx:227`)

No layout, provider or shared theme wrapper normalises any of this; each component hardcodes its own Tailwind colours.

**Impact:** The experience switches brand four times in about two minutes and looks unfinished. The version strangers see, the share page, is in the old theme.

**Recommendation:**
1. Add a single Rewind theme module, building on the existing `@theme` tokens in `app/globals.css:24-31`, with Rewind button variants (primary, secondary, ghost) added to `components/ui/button.tsx`.
2. Move the dashboard card, intro, navigation, Share, Download, the share summary, the `/wrapped` states and the viewer fallback onto the cinematic background and tokens.
3. Make the FormattedText highlight a theme prop, or have Rewind pass the gold class.
4. Set `themeColor` per route, so the Rewind routes use the stage colour.
5. Rename user-facing "Wrapped" and "Plex Wrapped" strings to "Rewind". Stored v1 and v2 titles may need a display-time override.

**Effort:** M

#### RWV-08 · No web fonts loaded: the display serif and sans fall back to system fonts, and share images use a different face

- **Severity:** medium
- **Status:** confirmed
- **Source:** rewind-ui-06
- **Where:**
  - `app/layout.tsx:1-3` and `:28`
  - `app/globals.css:17-31`
  - `components/wrapped/cinematic/theme.ts:19-20`
  - `components/wrapped/cinematic/gold-count-up.tsx:26`
  - `app/api/wrapped/og-image/route.tsx:93-96`

**Evidence:**

```ts
// components/wrapped/cinematic/theme.ts:19-20
export const DISPLAY_CLASS =
  "font-serif uppercase tracking-[0.12em] text-ivory"
```

- A grep for `next/font`, `@font-face` and `fonts.googleapis` across `app`, `components` and `lib` finds nothing.
- The `@theme` block defines only colours and animations, with no `--font-*` tokens (`globals.css:17-31`).
- `/public` contains only `icon.svg`.
- So the "engraved marquee" titles and the GoldCountUp numbers (`font-serif tabular-nums`) use Tailwind's `ui-serif` system stack: New York on Apple, Georgia or Cambria on Windows, Noto or Droid Serif on Android. In the Linux Chromium screenshots they are a generic book serif (`wrapped-slide-01-hero--desktop.png`).
- The OG route passes no fonts, so share images use Noto Sans Regular and don't match what the user saw (`og.png` vs `wrapped-slide-01-hero--desktop.png`).

This overlaps RWV-06's font point, but the scope here is the app-wide font tokens.

**Impact:** The display type carries the cinematic theme, and it looks different on every platform. Typography is the cheapest big upgrade toward the "modern and clean" goal.

**Recommendation** (derived; the auditor's field was a placeholder):
1. Load a display serif and a UI sans with `next/font` in `app/layout.tsx`. `next/font/local` with files committed to the repo keeps self-hosted builds independent of the network.
2. Expose them as CSS variables and map them to `--font-serif` and `--font-sans` (or a `--font-display`) in the `globals.css` `@theme` block.
3. Read the same font files in the og-image route and pass them through the `ImageResponse` `fonts` option, including the bold weight, so share images match the slides.
4. Choose the fonts as part of the UI refresh, so Rewind and the rest of the app share one type scale.

**Effort:** S

---

### E. Accessibility

#### RWV-09 · Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled

- **Severity:** high. The zoom block alone is an app-wide WCAG 1.4.4 failure.
- **Status:** verified. The refutation attempt failed; two details are corrected below.
- **Source:** rewind-ui-09
- **Where:**
  - `components/wrapped/cinematic/gold-count-up.tsx:24-32`
  - `components/wrapped/wrapped-viewer.tsx:106`, `:120-140`, `:239-249`
  - `components/wrapped/wrapped-transition.tsx:17-57`
  - `components/wrapped/cinematic/slide-frame.tsx` (REVEAL_SPRING)
  - `components/shared/formatted-text.tsx:34-44`
  - `components/wrapped/wrapped-sections/cinematic/finale-section.tsx:60-64`, `:69`
  - `components/wrapped/wrapped-sections/cinematic/streaks-patterns-section.tsx:52-105` (labels at `:67,89,92`)
  - `components/wrapped/wrapped-sections/cinematic/monthly-journey-section.tsx:39-55` (label at `:59`)
  - `components/wrapped/wrapped-sections/cinematic/overseerr-stats-section.tsx:40-50`
  - `components/wrapped/wrapped-sections/cinematic/top-billing-list.tsx:39`
  - `components/wrapped/wrapped-viewer-progress.tsx:26`, `:48-63`
  - `app/layout.tsx:8-9`

**Evidence:**

```ts
// app/layout.tsx:5-11
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};
```

```tsx
// components/shared/formatted-text.tsx:38-44 — every <highlight> pulses forever
animate={{ scale: [1, 1.05, 1] }}
transition={{ duration: 0.5, delay: index * 0.1, repeat: Infinity, repeatDelay: 3 }}
```

**Reduced motion.**
- `useReducedMotion` appears only in marquee-text, spotlight and confetti-burst. FilmGrain uses `motion-reduce:animate-none`.
- There is no `<MotionConfig reducedMotion="user">` and no `prefers-reduced-motion` rule in `globals.css`.
- With `reducedMotion: 'reduce'`, the probe found:
  - The intro still ran 8.5s.
  - Autoplay still advanced.
  - The finale credits still rolled away and left an empty window (`probe-finale-21s-mobile-reduced.png`).
- These also still animate under reduced motion:
  - the 1.2s slide spring with `y` and `scale` (`viewer.tsx:239-249`)
  - the SlideFrame reveals and letter-spacing animation
  - bar growth in streaks and monthly
  - react-countup
  - the infinite highlight pulse

**No pause.** Autoplay (`viewer.tsx:120-140`) has no pause or stop control, which is a WCAG 2.2.2 gap.

**Screen readers.**
- GoldCountUp renders a bare `<CountUp start={0} …>` with no stable label.
- No chart has `role="img"` or a label. The hour and weekday histograms, the filmstrip, the genre bars and the percentile bar are `div`s whose heights are the only data.
- Slide changes are not announced and focus does not move. The only `aria-live` in `components/wrapped` is on the Share button.

**Contrast against `#0a0908`** (WCAG 1.4.11 asks 3:1 for graphical objects; ivory is `#ece5d8`):

| Mark | Ratio | Passes 3:1 |
|---|---|---|
| Bar track, ivory/10 | 1.21:1 | no |
| Non-peak bar, ivory/20 | 1.63:1 | no |
| Non-peak bar, ivory/25 | 1.92:1 | no |
| Inactive progress dot, slate-600 | 2.63:1 | no |
| Taupe text | 6.33:1 | yes (text) |
| Gold text | 9.46:1 | yes (text) |

**Small text and zoom.** Many labels are `text-[10px]` uppercase with wide tracking. The viewport blocks pinch-zoom app-wide; Safari has ignored that since iOS 10, but Android and desktop browsers honour it.

**Corrections from verification:**
- The count-up final value does stay in the DOM once the roughly 2.4s animation ends. The defect is unstable, changing text plus slide changes that are never announced, not a value that is permanently missing.
- The progress `aria-label` already includes "section X of Y". The defect is the percentage in front of it, which changes every 50ms (`viewer.tsx:106`).

**Impact:** Users with vestibular disorders get springs, blur reveals, endless pulsing and scrolling credits. Screen-reader users get no chart data and no slide announcements. Low-vision users can't zoom the 10px labels.

**Recommendation:**
- **Motion:**
  - Add a global `<MotionConfig reducedMotion="user">` in the Rewind tree, plus a `useRewindMotion` hook.
  - Under reduced motion: skip the intro, crossfade between slides, show final values, show the credits as a static list and drop the highlight pulse.
  - Add a visible Pause/Play control (shared with RWV-03).
- **Charts:** add a labelled chart primitive (`role="img"` with an `aria-label` summary, for example "Peak hour 9 pm; most active day Saturday"). Raise non-peak bars and tracks to at least 3:1.
- **Announcements:** add a polite live region that says "Slide N of M: <title>", and move focus to the slide heading on change.
- **Count-ups:** render the final value in an `sr-only` span and mark the animated span `aria-hidden`.
- **Progress label:** replace the per-50ms percentage with a static slide label.
- **Size and zoom:** make labels at least 12px. Remove `maximumScale` and `userScalable` from `app/layout.tsx`, which affects the whole app.

**Effort:** M

---

### F. Content, pacing and robustness

#### RWV-10 · Copy and pacing: the eyebrow repeats the title, narratives repeat the number, the finale credits box is empty, reveals are too slow for tapping

- **Severity:** medium
- **Status:** adjusted. The narrative quotes come from mock data; the root cause also includes the real prompt.
- **Source:** rewind-ui-12
- **Where:**
  - `lib/wrapped/assemble-wrapped.ts:87`, `:125-127`, `:137`, `:167`, `:189`, `:209`
  - `components/wrapped/wrapped-sections/cinematic/top-movies-section.tsx:19`
  - `components/wrapped/wrapped-sections/cinematic/top-shows-section.tsx:19`
  - `components/wrapped/wrapped-sections/cinematic/percentile-section.tsx:21`, `:30`
  - `components/wrapped/wrapped-sections/cinematic/server-stats-section.tsx:17`
  - `components/wrapped/wrapped-sections/cinematic/fun-facts-section.tsx:20`
  - Act labels: `total-watch-time-section.tsx:25`, `movies-breakdown-section.tsx:16`, `shows-breakdown-section.tsx:20`, `streaks-patterns-section.tsx:25`, `monthly-journey-section.tsx:24`
  - `components/wrapped/wrapped-sections/cinematic/finale-section.tsx:60-63`
  - `components/wrapped/cinematic/slide-frame.tsx:40`, `:60`, `:67`
  - `components/wrapped/wrapped-sections/cinematic/archetype-reveal-section.tsx:67`
  - `lib/wrapped/derived-statistics.ts:183-186`
  - `lib/wrapped/prompt-template.ts:216`, `:229-235`
  - `lib/wrapped/mock-data.ts:41-63`

**Evidence:**

```tsx
// components/wrapped/wrapped-sections/cinematic/finale-section.tsx:60-63
<motion.div
  initial={{ y: "70%" }}
  animate={{ y: "-100%" }}
  transition={{ duration: Math.max(credits.length * 1.6, 8), delay: 0.5, ease: "linear" }}
```

```ts
// lib/wrapped/derived-statistics.ts:183-186 — bottom user gets "Top 100%"
const percentile = Math.min(100, Math.max(1, raw))
return { percentile, topPercentLabel: `Top ${percentile}%` }
```

**Eyebrow vs title.** Titles come from `assemble-wrapped.ts`, but each component hardcodes its eyebrow.
- Exact duplicates on 5 slides: "TOP BILLING — FILMS", "TOP BILLING — SERIES", "AMONG THE AUDIENCE", "BEHIND THE SCENES", "DELETED SCENES".
- Near duplicates on 3: "ACT II — THE FEATURES" over "THE FEATURES", the series slide, and "ACT IV — A YEAR IN REELS" over "A YEAR IN REELS" (`wrapped-slide-03/04/05/06/08/09/11/13-*.png`).
- The acts run I, II, II, III, IV and then stop.

**Repeated numbers.**
- The hero and slide 02 both lead with `floor(total/60)` hours (1,307).
- The narratives restate each slide's big number: "You screened 112 films, totaling 18 days, 3 hours" → "112 FILMS" → "18 DAYS, 3 HOURS IN THE SCREENING ROOM", plus "Top 3%", "48.2 TB" and "27 requests" each shown twice.
- Slides 03 and 04 show a single number with no comparison (vs last year, vs the server median, rewatches, genres or people).
- The seeded narratives come from `mock-data.ts:41-63`, not real LLM output. But the real prompt pushes the same way: `prompt-template.ts:229` says "numbers are displayed separately", yet the field instructions ask for "their film count and film watch time" (`:230-235`), and rule 3 says to wrap ALL numbers in highlight tags (`:216`).

**Finale credits.**
- The credits start at 70% of their own height and roll to −100%.
- With 11 credits, the window is empty for roughly the first 3–5s and empty for good after about 17–18s (probe at 21s; `wrapped-slide-14-finale-*.png`, `probe-finale-21s-*.png`).
- The finale is the last slide and nothing auto-advances from it, so the slide that holds the share buttons mostly shows an empty box.

**Reveal delays.**
- Title at 0.3s and narrative at 0.9s (`slide-frame.tsx:40,60`), but the content block only at 1.3s (`:67`).
- The archetype dedication appears at 3.2s, and the monthly bars finish at about 3.5s.
- A viewer tapping every 1–1.5s sees the eyebrow, title and narrative but misses the stat block and the later reveals.

**Percentile.** A bottom-ranked user is shown "Top 100%" as an award (`percentile-section.tsx:30`).

**Impact:** The copy reads as padded and repetitive, which undercuts the premium feel. The final shareable moment is visually empty, and fast tappers miss content.

**Recommendation:**
- **Copy ownership:** give eyebrow and title one owner, the slide registry (RWV-12) or `assemble-wrapped`. Use a coherent act sequence, or drop acts.
- **Prompt:** rewrite the narrative field descriptions in `prompt-template.ts` to add context (a comparison, a rank, an anecdote) instead of restating the displayed number, and update `mock-data.ts` to match.
- **Checking the copy:** do not add a hard check in `parse-llm-output.ts`. That parser fails the whole generation on any violation (`parse-llm-output.ts:1-7,47-56`). Use an eval or test, or log a soft warning.
- **Credits:** start in view (`y: 0`) and end on a resting state with all credits visible, not off-screen. Show static credits under reduced motion.
- **Reveal timing:** cap reveal delays at about 0.6s. The first tap completes the reveal, the second advances.
- **Percentile:** present it as an achievement only at Top 50% or better; otherwise use neutral copy.

**Effort:** M

#### RWV-11 · Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render

- **Severity:** medium
- **Status:** adjusted. Three sub-claims were unreachable for v2 data and were removed (see the Appendix).
- **Source:** rewind-ui-13
- **Where:**
  - `components/wrapped/wrapped-section-filter.ts:6-37`
  - `components/wrapped/wrapped-sections/index.tsx:30-36`
  - `components/wrapped/wrapped-viewer.tsx:41-65`, `:189-196`, `:197-212`
  - `lib/wrapped/assemble-wrapped.ts:87`, `:100-120`
  - `lib/wrapped/llm-output-schema.ts:111-112`
  - Hardcoded plural suffixes:
    - `components/wrapped/wrapped-sections/cinematic/movies-breakdown-section.tsx:18`
    - `shows-breakdown-section.tsx:23`
    - `server-stats-section.tsx:24-26`
    - `overseerr-stats-section.tsx:26`
  - Ties: `streaks-patterns-section.tsx:81`, `:96`; `monthly-journey-section.tsx:29-33`
  - `components/wrapped/cinematic/poster-image.tsx:32-33`
  - `components/wrapped/wrapped-sections/cinematic/top-billing-list.tsx:51`, `:66`
  - `components/wrapped/wrapped-share-summary.tsx:102`, `:151`

**Evidence:**

```tsx
// components/wrapped/cinematic/poster-image.tsx:31-33
export function PosterImage({ ratingKey, alt, shareToken, className, sizes }: PosterImageProps) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
```

```tsx
// movies-breakdown-section.tsx:18 — "1 films", and shown even at 0
<GoldCountUp value={data.moviesWatched ?? 0} className="text-6xl sm:text-8xl" suffix="films" />
```

**Section filter.** `filterSections` drops only null sections and `service-stats`. It deliberately keeps sections with a missing type, which then render "Section data unavailable". It does no eligibility or empty-data check.

**Zero states.**
- movies-breakdown and shows-breakdown are always included (`assemble-wrapped.ts:100-120`).
- The schema forces non-null movie and show narratives (`llm-output-schema.ts:111-112`).
- So TV-only or film-only viewers get a "0 FILMS" or "0 SERIES / 0 EPISODES" slide with a forced narrative.
- The hero shows `floor(total/60)`, so it says "0 HOURS WATCHED" for anyone under an hour.

**Plurals.** The suffixes are static: "1 films", "1 episodes", "1 requests". The streaks slide handles the singular correctly.

**Ties.** Every tied maximum is highlighted gold.

**Posters.**
- PosterImage returns `null` when a poster fails, so the bordered headliner box collapses with no designed placeholder.
- This is seen on every slide and on the share page when Plex is unreachable: all poster requests returned 5xx in the capture (`wrapped-slide-05-top-movies-*.png`).

**Keys.** React keys use `entry.title` (`top-billing-list.tsx:66`; `wrapped-share-summary.tsx:102,151`), so remakes and same-named shows collide.

**Viewer internals.**
- WrappedViewer mutates refs during render, keyed on the JSON of the sorted section ids (`viewer.tsx:41-65`). This is latent today, because the data is static per mount and the playground preview unmounts on close. The real risk is stale content when ids stay the same but content changes.
- An unguarded render-time `console.warn` runs in production (`:189-196`).
- The empty-state fallback shows debug text in the v1 style (`:197-212`).

**Long text.** The headliner title (`font-serif text-2xl sm:text-4xl uppercase`, `top-billing-list.tsx:51`) has no `break-words` for long unbroken titles. The mid-word headline breaks are covered by RWV-01.

**Impact:** Low-activity users, users without Overseerr or Plex art, and odd LLM output all produce empty or broken-looking slides. These are exactly the edge cases the 2026 rebuild should design for.

**Recommendation:**
- **Eligibility:** give each slide an `eligible(data)` check in the registry (RWV-12) or `assemble-wrapped`. Hide the movies breakdown at 0 films and the shows breakdown at 0 episodes, and make the matching narrative fields nullable in the schema and prompt. Show minutes, or a different hero stat, for anyone under an hour.
- **Formatting:** add a small `pluralize` helper using `Intl.PluralRules` and an `Intl.NumberFormat` count helper.
- **Posters:** PosterImage renders a designed fallback (a deterministic gradient plus initials), never `null`.
- **Keys and ties:** key list items by `ratingKey ?? \`${title}-${year}\``, and pick a single peak index.
- **Viewer:** replace the ref logic with `useMemo` over `wrappedData.sections`, and remove or guard the `console.warn`.
- **Tests:** add fixture tests for a TV-only user, a film-only user, a user under one hour and a user with no posters.

**Effort:** M

---

### G. Code structure and performance

#### RWV-12 · No slide registry: two duplicated theme trees, two switch dispatchers, copy split between lib and components, stored data never validated, dead files

- **Severity:** medium
- **Status:** confirmed
- **Source:** rewind-ui-10
- **Where:**
  - `components/wrapped/wrapped-sections/index.tsx:4-13`, `:29-43` (version dispatcher), `:51-98` (LegacySectionRenderer)
  - `components/wrapped/wrapped-sections/cinematic/index.tsx:29-70` (CinematicSectionRenderer)
  - `components/wrapped/cinematic/theme.ts:31-56`
  - `lib/wrapped/assemble-wrapped.ts:77-218`
  - `app/(app)/wrapped/page.tsx:27`
  - `app/(app)/wrapped/share/[token]/page.tsx:108`
  - `app/api/wrapped/share/[token]/route.ts:74`
  - `lib/wrapped/llm-output-schema.ts`
  - `components/wrapped/user-wrapped-viewer.tsx:23`
  - `components/wrapped/wrapped-home-button.tsx:17`
  - `components/wrapped/wrapped-viewer.tsx:25`
  - `components/wrapped/wrapped-sections/utils.ts:2`
  - `components/wrapped/wrapped-viewer-navigation.tsx:32`, `:61`
  - `components/wrapped/share-card-download.tsx:42`
  - `e2e/user-scenarios.spec.ts:104-119`

**Evidence:**

```ts
// app/(app)/wrapped/page.tsx:27 — stored JSON parsed and cast, never validated
const wrappedData: WrappedData = JSON.parse(wrapped.data)
```

**Two parallel trees render the same slide types:**
- legacy v1: 10 section components (1,067 lines) plus `wrapped-charts.tsx` (464 lines, chart.js)
- cinematic v2: 14 slides plus 9 primitives (1,388 lines)

**Slide knowledge lives in four places:**
1. the legacy switch (`index.tsx:51-98`)
2. the cinematic switch (`cinematic/index.tsx:29-70`)
3. durations in `theme.ts:31-56`
4. titles and inclusion rules in `assemble-wrapped.ts:77-218`, with eyebrows hardcoded in each component

**No validation.**
- Slide data is pulled with `section.data && "x" in section.data ? … : undefined) as T`. The auditor counted 16 casts; a grep finds 14 `in` checks.
- Stored JSON is parsed and cast on the page, on the share page and in the share API.
- A Zod schema exists only for the LLM output (`lib/wrapped/llm-output-schema.ts`), not for the stored `WrappedData` that is read back to render. This breaks the CLAUDE.md rule "validate all external data".

**Dead or unused code:**
- `user-wrapped-viewer.tsx` (208 lines, uses `any`, reads the non-existent top-level `wrappedData.totalWatchTime` and `topMovies`) and `wrapped-home-button.tsx` (262 lines) are imported only by tests.
- WrappedViewer accepts `userName`, `summary` and `onComplete`. It doesn't destructure the first two, and no production caller passes `onComplete`.
- WrappedShareButton ignores its `year` prop.
- `wrapped-sections/utils.ts` is a one-line re-export shim.

**Convention gaps:**
- Raw `<button>`s instead of `components/ui/button`.
- No `data-testid` on Next, Previous, Show All, Share or the progress bar. ShareCardDownload does have `wrapped-download-card`.
- The E2E test only checks that `/wrapped` shows the year.

The legacy tree still serves stored v1 (2025) rows, so it can't simply be deleted.

**Impact:** Adding or redesigning a slide means editing 4–5 files in two layers. The copy duplication in RWV-10 comes straight from this split. Bad or old stored JSON fails at render instead of at a schema boundary. Keeping both trees doubles the redesign cost.

**Recommendation** (derived from the auditor's summary; the field was a placeholder):
1. Introduce one slide registry keyed by `WrappedSectionType`. Each entry holds:
   - component
   - Zod data schema
   - duration (absorbing `SLIDE_DURATIONS`)
   - eyebrow and title copy
   - `eligible(data)`
   - share-card renderer (RWV-06)

   One dispatcher reads it.
2. Add a `WrappedData` Zod schema under `lib/validations/`, and `safeParse` stored data in the page, the share page and the share API. Show a designed error state on failure.
3. Keep v1 renderable without paying for it on every load: either load `LegacySectionRenderer` through `next/dynamic` (see RWV-13), or write a v1→v2 adapter and retire the legacy tree.
4. Delete `user-wrapped-viewer.tsx`, `wrapped-home-button.tsx` and their tests, the unused props and the `utils.ts` shim.
5. Use `components/ui/button` and add stable `data-testid`s to every story control.
6. Extend E2E to cover:
   - navigation
   - the archetype name being visible (RWV-01)
   - the share page
   - the year resolver (RWV-02)

**Effort:** L

#### RWV-13 · Performance: 20 Hz React re-render of the whole slide during autoplay, width-animated progress, chart.js shipped to v2, full-size posters for thumbnails

- **Severity:** low. The auditor proposed medium; the verifier lowered it. The loop stops at the first tap, the numbers come from an unthrottled dev build, and no jank was seen in any capture.
- **Status:** adjusted
- **Source:** rewind-ui-11
- **Where:**
  - `components/wrapped/wrapped-viewer.tsx:86-109`, `:175`, `:255`
  - `components/wrapped/wrapped-viewer-progress.tsx:29-33`
  - `components/wrapped/wrapped-sections/index.tsx:4-13`, `:38`
  - `components/wrapped/wrapped-charts.tsx:4-25`
  - `components/wrapped/cinematic/marquee-text.tsx:41-42`
  - `components/shared/formatted-text.tsx:34-44`
  - `components/wrapped/cinematic/poster-image.tsx:36-46`
  - `app/api/wrapped/poster/[ratingKey]/route.ts:14-15`, `:98-103`, `:121`
  - `components/wrapped/wrapped-sections/cinematic/top-billing-list.tsx:80-81`

**Evidence:**

```tsx
// wrapped-viewer.tsx:98-106
const updateProgress = () => {
  const elapsed = Date.now() - sectionStartTime
  const progressPercent = Math.min((elapsed / delay) * 100, 100)
  setProgress(progressPercent)
}
const interval = setInterval(updateProgress, 50)
```

```tsx
// wrapped-viewer-progress.tsx:29-33
initial={{ width: "0%" }}
animate={{ width: `${progress}%` }}
```

**Progress loop.**
- The `setProgress` interval runs on WrappedViewer state, and the SectionRenderer is not memoised (`:255`). So the whole slide re-renders 20 times a second, including every MarqueeText letter span.
- The fill animates `width`, which forces layout.
- CDP `Performance.getMetrics` over 4s with mobile emulation (dev build): 1.215s of script and 240 layouts while autoplaying, against 0.017s and 3 layouts paused.
- The fill is invisible anyway, because it is drawn under the letterbox (RWV-03).

**Bundle.**
- `wrapped-sections/index.tsx` statically imports every legacy section. Those pull in `wrapped-charts.tsx`, which registers chart.js and react-chartjs-2 (`chart.umd.min.js` is 208KB).
- So `/wrapped` and the admin previews ship chart.js even though every seeded 2026 Rewind is v2. The share page does not use the viewer.
- framer-motion's full `motion` is used in 31 in-scope files, without LazyMotion.

**Wasted rendering.**
- Per-letter `filter: blur()` animations.
- `backdropFilter: blur(8px)` on all 14 Show All panels (`:175`).
- The highlight pulse animates `scale` on a `display: inline` span, where transforms have no effect, so it is invisible work.

**Posters.**
- The proxy always transcodes 400×600, even for 32px list thumbnails and 40px share rows, and `unoptimized` disables Next.js resizing.
- The route returns `Cache-Control: public` even for requests authorised by a session (`route.ts:121`).
- Posters start loading only when their slide mounts.

**Corrected sub-claims:**
- PosterImage already reserves an `aspect-[2/3]` box while loading. The layout only shifts when a poster fails (RWV-11).
- The headliner block itself only appears at 1.4s by design (`top-billing-list.tsx:36`), so "the headliner appears late" because of posters is weak.

**Impact:** Battery drain and possible jank on mid-range phones during passive autoplay, a heavier first load, and wasted poster bandwidth.

**Recommendation (S–M):**
- **Progress timing:** drive progress with a CSS keyframe (`animation-duration` from `getSlideDuration`, `animation-play-state` for pause) or a framer `useMotionValue`, and advance on `onAnimationEnd`. This removes the 50ms `setState` loop.
- **Fill:** animate `transform: scaleX` with `origin-left`.
- **Legacy tree:** load `LegacySectionRenderer` with `next/dynamic`; stored v1 rows still need it (`index.tsx:38`).
- **Framer:** adopt `LazyMotion` with `domAnimation` and `m.*` inside the Rewind tree.
- **Pulse and blur:** drop the infinite highlight pulse and the per-letter blur filter (RWV-01).
- **Poster route:** accept a clamped `?w=`, send `private` caching when the request was authorised by session, and optionally preload the next slide's posters.

**Effort:** M

---

### H. Opportunities

#### RWV-14 · No audio layer; best-in-class recaps score their stories

- **Severity:** info
- **Status:** confirmed
- **Source:** rewind-ui-14
- **Where:**
  - `components/wrapped/wrapped-viewer.tsx:227`
  - `components/wrapped/cinematic/theme.ts:31`

**Evidence:** A grep of `components/wrapped`, `lib/wrapped` and `app` finds no `<audio>`, `new Audio()`, mute control or theme-music handling. The viewer is silent, and the cinematic concept (premiere, award reveal, closing credits) has no sound.

**Impact:** This is an opportunity, not a defect. Music lifts how premium Spotify Wrapped and Apple Music Replay feel.

**Recommendation (optional, M):**
- **Audio hook:** add a `useRewindAudio` hook with a mute toggle in the story chrome. Keep it muted by default and start sound only after the user's first tap, to respect browser autoplay policy.
- **Per-slide cues:** declare short licensed or royalty-free cues per slide in the registry: an overture, a drumroll on the archetype reveal, a credits theme.
- **Theme music:** playing the top show's theme only works if the Plex API exposes it. This must be checked against developer.plex.tv; no current `lib/connections/plex-*` module fetches it. Any audio served from the server needs the same session or share-token gating as the poster proxy (`app/api/wrapped/poster/[ratingKey]/route.ts:23-45,73-85`).
- **User preferences:** honour `prefers-reduced-motion` and reduced-data settings.

**Effort:** M

---

## Strengths to preserve

- **Cinematic Premiere concept.** Gold on near-black, letterbox, film grain, a spotlight sweep, the "And the award goes to…" reveal and closing credits. It reads as a premiere, not a generic dashboard (`wrapped-slide-01-hero--desktop.png`, `wrapped-slide-07-streaks-patterns--mobile.png`). Keep it as the Rewind brand.
- **Text contrast.** Against the stage `#0a0908`: gold `#d4af37` 9.46:1, gold-bright 14.01:1, ivory 15.88:1, taupe 6.33:1. Gold-on-dark text is not an accessibility problem; only the chart marks in RWV-09 are.
- **Palette as tokens.** Tailwind v4 `@theme` tokens already exist: `stage`, `stage-panel`, `gold`, `gold-bright`, `ivory`, `taupe`, `animate-grain` (`app/globals.css:24-31`). The Rewind theme can grow from them.
- **Viewer-owned pacing.** `SLIDE_DURATIONS` per slide type (`components/wrapped/cinematic/theme.ts:31-56`) keeps pacing out of the LLM's hands. It is a good seed for the slide registry.
- **SlideFrame scaffold.** `components/wrapped/cinematic/slide-frame.tsx` gives every slide the same eyebrow → title → narrative → content structure.
- **Small, composable primitives.** Spotlight, ConfettiBurst, FilmGrain, Letterbox, PosterImage and GoldCountUp. Three use `useReducedMotion` and FilmGrain uses `motion-reduce`. Confetti uses deterministic pseudo-random positions, so server and client markup match.
- **Lightweight v2 charts.** The v2 charts are plain divs with no chart.js: hour histogram, weekday, filmstrip and genre bars (`streaks-patterns-section.tsx`, `monthly-journey-section.tsx`, `overseerr-stats-section.tsx`).
- **Poster proxy design.**
  - The Plex token stays on the server.
  - `ratingKey` is checked against a regex.
  - Share-token access is limited to the wrapped's own top items.
  - The Plex transcoder resizes images.
  - Fetches time out after 10s.

  (`app/api/wrapped/poster/[ratingKey]/route.ts:13-45,97-108`)
- **Social previews work.** `generateMetadata` sets OpenGraph, Twitter `summary_large_image` and a canonical URL (`app/(app)/wrapped/share/[token]/page.tsx:32-89`). next/og renders a 1200×630 OG image and a 1080×1920 story card (`og.png`, `card.png`).
- **Versioned data.** Stored data carries `version: 2`, and a version dispatcher keeps older wrappeds renderable (`components/wrapped/wrapped-sections/index.tsx:29-43`). Smoke and version tests exist (`components/wrapped/__tests__/wrapped-viewer-v2-smoke.test.tsx`, `components/wrapped/wrapped-sections/__tests__/section-renderer-version.test.tsx`).
- **Route resilience.** The route has `error.tsx` and `loading.tsx`. The generating state polls and shows a toast after 3 failures (`app/(app)/wrapped/error.tsx`, `loading.tsx`, `components/wrapped/wrapped-page-client.tsx:21-52`).

## Metrics and inventories

### Scope size

| Item | Value |
|---|---|
| Lines in scope | about 5,500 |
| Legacy v1 tree | 10 section components, 1,067 lines, plus `wrapped-charts.tsx` (464 lines, chart.js) |
| Cinematic v2 tree | 14 slides plus 9 primitives, 1,388 lines |
| Dispatchers / registry | 2 switch dispatchers, no registry |
| Unchecked `section.data` casts | 16 (auditor); 14 `"x" in section.data` checks (verifier grep) |
| Zod schema for stored WrappedData | none (only the LLM output schema exists) |
| Files importing framer-motion | 31, no LazyMotion |
| Files using react-countup | 5 |
| Dead code (imported only by tests) | `user-wrapped-viewer.tsx` (208 lines), `wrapped-home-button.tsx` (262 lines) |
| Slides that use SlideFrame | 12 slide files; plus archetype and finale call MarqueeText directly |

### Measured in the running app

Probe scripts are in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/rewind-ui/`.

| Measurement | Desktop | Mobile |
|---|---|---|
| Next button visible after load (intro) | 8.1s | 8.5s (reduced motion) |
| Intro length in code | about 7.5s (1.5 + 3×1 + 1 + 1) | same |
| Progress bar y-range | 48–54px | 32–38px |
| Top letterbox bottom edge | 54px | 50.6px |
| Progress bar visible | no (yes below about 900px inner height) | no |
| ArrowRight / Space / right-edge tap | no effect | no effect |
| Viewport height | 900px | 844px |
| Streaks slide height | 992px | 1,004px |
| Top-movies / top-shows slide height (no posters) | n/a | 850px |
| Monthly filmstrip visible months | Jan–Sep, part of Oct (Nov, Dec cut) | Jan–Apr, part of May (peak Jul hidden) |
| Next button y on mobile | n/a | about 636 (most), 734 (top lists), 888 (streaks), 713 (server stats) |
| Empty stage under buttons | n/a | about 150px on slides 02, 03, 08, 09 |
| Autoplay total | 143s for 13 timed slides plus the intro | same |

| Main thread over 4s (mobile emulation, dev build) | Script | Layouts |
|---|---|---|
| Autoplaying | 1.215s | 240 |
| Paused | 0.017s | 3 |

| Share and image metrics | Value |
|---|---|
| WrappedShareVisit rows per share-page view | 2 (32 → 34 auditor; 29 → 31 verifier; userAgent `node`) |
| Share rate limit | 100 per 15 min, one shared `unknown`/server-IP bucket; about 50 page renders exhaust it |
| OG image | 1200×630 PNG, 54KB |
| Story card | 1080×1920 PNG, 78KB, Noto Sans Regular only; bottom about 15% empty |
| Image cache | `public, max-age=3600, s-maxage=3600` |
| Poster transcode size | always 400×600 (thumbnails are 32–40px) |
| chart.js bundle carried by `/wrapped` | `chart.umd.min.js` 208KB |
| Finale credits roll | `max(n × 1.6, 8)`s; 11 credits: empty for the first ~3–5s and after ~17–18s |

### Contrast against `#0a0908`

| Token / mark | Ratio | Use |
|---|---|---|
| ivory `#ece5d8` | 15.88:1 | text |
| gold-bright | 14.01:1 | text |
| gold `#d4af37` | 9.46:1 | text |
| taupe | 6.33:1 | text |
| slate-600 | 2.63:1 | inactive dots (below 3:1) |
| ivory/25 | 1.92:1 | non-peak bars (below 3:1) |
| ivory/20 | 1.63:1 | non-peak bars (below 3:1) |
| ivory/10 | 1.21:1 | bar tracks (below 3:1) |

### Slide-by-slide inventory

Slide components are in `components/wrapped/wrapped-sections/cinematic/`. Screenshots are `wrapped-slide-NN-*--desktop.png` and `--mobile.png`.

| # | Slide | Component | Shows | Problems | Findings |
|---|---|---|---|---|---|
| — | Intro | `components/wrapped/wrapped-transition.tsx` (`wrapped-intro-01-logo`, `wrapped-intro-02-countdown`) | Logo, 3-2-1 countdown, reveal | Space theme (off-brand); about 8s; no skip; ignores reduced motion | 03, 07, 09 |
| 01 | Hero | `hero-section.tsx` | Total hours (prominentStat), "Now Presenting", opening narrative | "WRAPP/ED"; "HOURS / WATCHED" wraps; same 1,307 hours as slide 02; "0 hours" under an hour | 01, 04, 10, 11 |
| 02 | Total watch time | `total-watch-time-section.tsx` | Total hours, films/series split bar | "TIM/E"; split labels wrap; narrative restates the number | 01, 04, 10 |
| 03 | Movies breakdown | `movies-breakdown-section.tsx` | Films watched, movie watch time | Number shown 3×; eyebrow nearly repeats title; "1 films"; shown at 0 | 10, 11 |
| 04 | Shows breakdown | `shows-breakdown-section.tsx` | Shows, episodes, watch time | Same as 03; "1 episodes" | 10, 11 |
| 05 | Top movies | `top-movies-section.tsx` + `top-billing-list.tsx` | Top 5 with posters, headliner, play count | Eyebrow = title; "FIL/MS"; poster box collapses on failure; titles truncate; 850px on mobile | 01, 04, 10, 11 |
| 06 | Top shows | `top-shows-section.tsx` + `top-billing-list.tsx` | Top 5 shows, episodes, play count | "The B…", "Shogu…"; "×28 · 28 ep" says it twice; "SE/RIES" | 01, 04, 11 |
| 07 | Streaks and patterns | `streaks-patterns-section.tsx` | Longest streak, peak hour, 24h histogram, weekday histogram, weekend % | 1,004px / 992px tall; charts have no values or ARIA; non-peak bars 1.63:1; ties all gold; "PA/TTERNS" | 01, 04, 09, 11 |
| 08 | Monthly journey | `monthly-journey-section.tsx` | 12-month filmstrip, top title per month | Horizontal scroll; peak month hidden on mobile; Nov–Dec cut on desktop; no values | 04, 09 |
| 09 | Percentile | `percentile-section.tsx` | "Top N%" label and bar, server name | Eyebrow = title; "AUDIE/NCE"; "Top 100%" shown as an award | 01, 10 |
| 10 | Archetype reveal | `archetype-reveal-section.tsx` | Archetype name, tagline, dedication, spotlight, confetti | **Name invisible** with motion on; dedication at 3.2s | 01, 10 |
| 11 | Server stats | `server-stats-section.tsx` | Server name, library counts, storage | Eyebrow = title; "SCEN/ES"; about the server, not the user; static plurals | 01, 10, 11 |
| 12 | Overseerr stats | `overseerr-stats-section.tsx` | Total requests, top 4 requested genres | "SCIENCE FI…", "DOCUMENT…"; "1 requests" | 04, 11 |
| 13 | Fun facts | `fun-facts-section.tsx` | facts[] | Eyebrow = title ("DELETED SCENES") | 10 |
| 14 | Finale | `finale-section.tsx` + `wrapped-viewer-navigation.tsx` | Rolling credits, farewell line, Share / Download card / Show All | Credits box empty at the start and after the roll; three button styles in one row; share only here | 06, 07, 10 |
| — | Show All | `wrapped-viewer.tsx:161-183` (`wrapped-show-all`) | Long scroll of every slide | No exit back to the story, no share; mid-word breaks; archetype name missing; 14× backdrop blur | 01, 03, 13 |
| — | Share page | `wrapped-share-summary.tsx` (`public-wrapped-share`, `user-wrapped-share-own`) | Static summary | Space theme; no archetype; self-fetch and double count; in the `(app)` guard group | 05, 07 |
| — | OG image / story card | `app/api/wrapped/og-image/route.tsx` (`og.png`, `card.png`) | Name, year, archetype, 3 stats | Text only; default font; one card; unused summary; floored days | 06, 08 |

## Appendix: Investigated and ruled out

No finding was refuted in full. The sub-claims and hypotheses below were dropped or corrected during verification, and the findings above reflect the corrections.

- **og-image route is empty or a stub:** ruled out. It renders a working 1200×630 OG image and a 1080×1920 story card (`og.png`, `card.png`).
- **RWV-01 is critical:** lowered to high. The viewer stays usable; one headline vanishes and titles wrap badly.
- **SlideFrame is used by 11 slides:** corrected to 12 slide files, plus 2 direct MarqueeText callers.
- **The progress bar is never visible:** corrected. It shows partly or fully on desktop windows shorter than about 900px inner height; on phones it is always covered.
- **Keyboard users cannot operate the viewer:** corrected. They can Tab to the native buttons; story shortcuts are what's missing.
- **The bottom letterbox covers the controls:** ruled out. `pb-24` (96px) is taller than the 6vh bar, so the controls show after scrolling.
- **Share copy feedback is hover-only:** ruled out. The button switches to "Copied!" with `aria-live` (`wrapped-share-button.tsx:53-80`).
- **The lower third of the story card is empty:** corrected to about the bottom 15%.
- **Card downloads use the shared server rate-limit bucket:** ruled out. Downloads come from the browser and get their own IP key.
- **The public share page leaks emails broadly:** downgraded to a theoretical edge case. Every user-creation path sets `name` from the username.
- **Count-ups give screen readers "0 or nothing":** corrected. The final value stays in the DOM after about 2.4s; the defect is transient text and unannounced slide changes.
- **The progress `aria-label` lacks the slide number:** corrected. It includes "section X of Y"; the defect is the 50ms percentage in front of it.
- **An empty fun-facts slide can render:** ruled out for v2. The schema requires 3–7 `funFacts` (`lib/wrapped/llm-output-schema.ts:127`).
- **A title-only top-list slide can render:** ruled out for v2. Top lists are only pushed when non-empty (`lib/wrapped/assemble-wrapped.ts:123-141`).
- **Sections with a missing type or duplicate ids reach the viewer:** ruled out for v2. `assembleWrappedData` always sets a type and fixed unique ids; only legacy or corrupt rows are affected.
- **Reordering sections breaks the ref-mutation logic in practice:** corrected to latent. The data is static per mount; the real risk is stale content with unchanged ids.
- **Posters cause layout shift while loading:** ruled out. PosterImage reserves an `aspect-[2/3]` box; the shift only happens on failure (RWV-11).
- **The headliner appears late because of poster loading:** weak. The headliner block appears at 1.4s by design.
- **Repeated numbers in narratives come from real LLM output:** corrected. The seeded text is mock data (`lib/wrapped/mock-data.ts:41-63`), but the real prompt also steers toward restating numbers (`lib/wrapped/prompt-template.ts:216,229-235`).
- **Fast tappers see "mostly empty slides":** corrected. They see eyebrow, title and narrative, and miss the content block and later reveals.
- **The 20 Hz re-render loop drains every session:** reduced. It stops at the first tap and was measured on an unthrottled dev build.
- **chart.js is shipped to the public share page:** ruled out. The share page does not use the viewer; only `/wrapped` and the admin previews carry it.
