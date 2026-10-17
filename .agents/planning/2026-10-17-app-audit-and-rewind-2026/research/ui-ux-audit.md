# UI and UX Consistency Audit

Generated 2026-10-17 · 3 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

Scope: the design system, tokens, primitives and accessibility across all 258 non-test `.tsx` files in `app/` and `components/` (ui-design-system); the admin area, 25 `app/admin` files and 113 admin component files, about 18.5k lines (ui-admin); and the member-facing flows: sign-in, setup, onboarding, invite, home, subscribe and the Rewind viewer (ui-user-facing). The three auditors filed 63 findings. After merging findings that share a root cause, 46 remain. Each finding lists its original auditor IDs under **Sources** (DS = ui-design-system, ADM = ui-admin, UX = ui-user-facing).

Screenshot filenames refer to the 152 captures (plus a few extra ones named `adminux-*` and `ux-*`) in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/screenshots/`. They were taken from `next dev` at `http://localhost:3100` with seeded data. Where production behaves differently from dev (auth error screens, UI-19), the finding says so. The capture script overrides `html, body { height:100%; overflow-x:hidden }` to get full-page shots, so fixed elements appear once at their viewport position.

**Status legend**

| Status | Meaning |
|---|---|
| verified | Re-checked by a verifier, and for critical/high also survived an independent refutation attempt |
| confirmed | Verifier confirmed the finding as written |
| adjusted | Verifier confirmed the core issue but corrected the severity, impact or details (the corrections are folded in here) |
| disputed | Reviewers disagree; both sides are summarised (no finding in this report has this status) |
| unverified | Not re-checked (no finding in this report has this status) |

For merged findings the status line names the status of each source.

## Executive summary

- **There is no design system to refresh against (UI-16, UI-17, UI-18).** `app/globals.css` defines tokens only for the Wrapped v2 "cinematic" theme. Everything else is hand-written against the raw Tailwind palette: 2,031 slate utilities, 14 accent hues, 44 distinct gradient combinations and 10 different primary-CTA treatments. The screenshots show four visual languages: admin slate, a neon starfield for setup, onboarding and invite, a warm amber/magenta home, and the gold cinematic Rewind. The primitives in `components/ui` are mostly well built but barely used (Card 4 uses against 162 hand-copied panels; Button 65 against 93 raw `<button>`s). The refresh should start with a foundation phase: semantic tokens with two themes (App and Rewind), a real `<body>` canvas, `color-scheme: dark` and `next/font`. Primitive adoption and codemods come after that.
- **Rewind, the showpiece, is the least consistent surface.** The public share link renders the old neon starfield, not the cinematic viewer (UI-16). Inside the viewer, Previous/Next, Share, Download and Show All use three button languages. The viewer has no pause control or keyboard shortcuts; slide titles use a prohibited ARIA pattern and break mid-word on phones ("PA / TTERNS"); and the 6.5 s intro cannot be skipped (UI-09). At the year boundary the home card and `/wrapped` disagree on the year, which can loop users. Past years cannot be reached, and the viewer has no exit (UI-02).
- **Three member and owner flows are broken outright.** Discord account linking cannot be reached from any UI, yet every bot nudge points at the dead `/discord/link` (UI-01). The setup wizard cannot be finished without a live, passing connection to Overseerr, Sonarr, Radarr, Prometheus and both LLM providers, all of which the README calls optional (UI-03).
- **Admin on mobile has two traps.** The assistant panel covers its own toggle, has no close button, runs 18px off-screen and stays open across navigation until a reload (UI-04). The users list, the admin landing page, shows "No users found" next to "Total Users 7" whenever Plex is unreachable, and on phones the filter menu that would fix it is painted over by the next filter (UI-05).
- **The accessibility baseline needs work across the app.**
  - Pinch-zoom is disabled on every page (UI-11).
  - Toasts are silent to screen readers, and both wizards drop focus on every step (UI-10).
  - Secondary text and several primary buttons fail AA contrast, and the axe gate in CI cannot see contrast on the gradient page backgrounds (UI-12).
  - About 45 admin form labels are not connected to their fields (UI-13). The shared dropdown has no listbox semantics and is trapped by stacking contexts (UI-14).
  - Reduced motion is honored in 3 of 57 animated files (UI-15).
- **Error and status screens come in six designs, and the admin auth gate will misbehave in production (UI-19).** `requireAdmin()` throws from the layout, and `app/error.tsx` matches on `error.name`/`error.message`, which production builds strip. Signed-out and non-admin visitors would get a generic error with Next's "omitted in production" text instead of a sign-in path.
- **Year-end Rewind operations have no console (UI-29).** `/admin` redirects to the users list. Bulk generation exists only in an unreachable component and runs sequentially inside one server-action request. Stuck "generating" rows cannot be retried from the list. Cost charts overstate projected spend about sevenfold for light usage, and shift dates by a day in US time zones (UI-24).
- **Shared composite patterns are re-implemented per page:** page headers (UI-21), stat tiles, cards, badges and empty states (UI-22), tables with no sort, no search and actions hidden on mobile (UI-23), two unrelated wizard steppers (UI-33), and charts (UI-24). Building PageHeader/AdminPage, StatTile, EmptyState, Table, Stepper, Skeleton and FormField once covers most of the admin refresh.
- **Branding is split and "Rewind" appears nowhere (UI-39).** The product is "Plex Manager", "Plex Wrapped", "Wrapped" and "plex-wrapped" in different places. Only 1 of 32 pages exports metadata, so invite links unfurl as "Plex Manager - Your Plex media manager" with no image.

## Severity summary

Counts after merging, non-refuted findings only. No finding was refuted.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 8 |
| Medium | 30 |
| Low | 8 |
| Info | 0 |
| **Total** | **46** |

Raw counts before merging:

| Auditor | Critical | High | Medium | Low | Info | Total |
|---|---|---|---|---|---|---|
| ui-design-system (DS) | 0 | 2 | 14 | 3 | 0 | 19 |
| ui-admin (ADM) | 0 | 1 | 15 | 6 | 0 | 22 |
| ui-user-facing (UX) | 0 | 5 | 15 | 2 | 0 | 22 |
| **All** | **0** | **8** | **44** | **11** | **0** | **63** |

## Findings

### 1. Broken flows and functional UX bugs

#### UI-01: Discord account linking cannot be reached from any user-facing UI

- **Severity:** High
- **Status:** verified. The verifier downgraded it from critical, because Discord is an optional integration and members linked before Dec 2025 are unaffected; the refutation reviewer kept high.
- **Sources:** UX-01
- **Where:** `components/discord/link-callout.tsx:25`, `components/discord/link-panel.tsx:27`, `app/(app)/discord/link/page.tsx:13-14`, `components/dashboard/discord-card.tsx:4`, `:13-96`, `components/dashboard/user-dashboard.tsx:11`, `components/onboarding/onboarding-steps/discord-support-step.tsx:140-147`, `lib/discord/config.ts:101-106`, `lib/discord/routing/dm-router.ts:74`, `:85`, `lib/discord/commands/require-linked-user.ts:52`, `:57`, `app/admin/settings/page.tsx:59`, `components/admin/settings/DiscordIntegrationForm.tsx:140-142`, `lib/guards.ts:31-35`, `app/(app)/layout.tsx:51-53`
- **Evidence:**
  ```ts
  // components/discord/link-callout.tsx:25 (the only link to the OAuth start route)
  defaultConnectUrl = "/discord/connect?redirect=%2F"
  ```
  - **Callout and panel never render.** `DiscordLinkCallout` and `DiscordLinkPanel` are only imported for the `DashboardDiscordConnection` type (`user-dashboard.tsx:11`, `discord-card.tsx:4`). Commit 70a7b0a (2025-12-07) removed them when `DiscordCard` replaced them.
  - **`/discord/link` is a dead end.** It redirects to `/` with the comment "the callout there is sufficient" (`discord/link/page.tsx:13-14`), but no callout exists any more.
  - **The home tile has no link action.** `DiscordCard` is either a discord.gg invite link or a static `motion.div` (`discord-card.tsx:13-96`).
  - **Everything advertised points at the dead end:** `getDiscordPortalUrl()` (`config.ts:101-106`), the DM nudges ("please link your account first: ${portalUrl}", `dm-router.ts:74,85`), the slash-command gate (`require-linked-user.ts:52,57`), the admin settings "Portal URL" (`settings/page.tsx:59`), the docs and `example.env` (`DISCORD_PORTAL_URL=https://yourdomain.com/discord/link`), and the onboarding "Open Portal" button (`target=_blank`). During onboarding the `(app)` guard sends that new tab straight back to `/onboarding`.
  - Screenshots: `user-discord-link--desktop.png` (redirected to `/`), `user-home--desktop.png` (Discord tile is only a join link), `user-onboarding-04-discord-support--desktop.png` ("Open Portal").
- **Impact:** on a Discord-enabled server no unlinked member can link. Linked Roles, the DM assistant's entitlement check and every slash command gated by `requireLinkedUser` are unavailable to them, and every bot reply sends them to a page that bounces home.
- **Recommendation:**
  - Build `/discord/link` from `DiscordLinkPanel`: connected state, a "Link Discord" CTA to `/discord/connect?redirect=<return>`, unlink, and join server.
  - Give `DiscordCard` a "Link Discord" primary action when the member is not linked.
  - In onboarding, link inline to `/discord/connect?redirect=%2Fonboarding` (the redirect param already flows through `createDiscordAuthorizationUrl`, `connect/route.ts:33-36`) instead of opening `/discord/link` in a new tab. That avoids exempting the page from `ensureOnboardingComplete`.
  - Delete whichever of `link-callout.tsx`/`link-panel.tsx` ends up unused, and move the `DashboardDiscordConnection` type to `types/`.
  - Ship the flash-message handling from UI-07 in the same change, so users see "Discord linked" or the failure reason.
- **Effort:** M

#### UI-02: Rewind entry breaks across the year boundary; no archive of past years and no exit from the viewer

- **Severity:** High
- **Status:** verified
- **Sources:** UX-02
- **Where:** `app/(app)/wrapped/page.tsx:19-20`, `:75-77`, `:106-114`, `actions/admin/admin-config.ts:50-77`, `components/admin/settings/wrapped-settings-form.tsx:31-34`, `components/dashboard/wrapped-card.tsx:46-51`, `:67-82`, `:114`, `:150-158`, `:270-275`, `components/wrapped/wrapped-viewer-navigation.tsx:29-75`, `components/wrapped/wrapped-home-button.tsx`
- **Evidence:**
  ```ts
  // app/(app)/wrapped/page.tsx:19-20
  new Date().getFullYear()
  ```
  - **The card and the page compute the year differently.** The home `WrappedCard` takes its year from `getWrappedSettings()`, which uses the year of `wrappedGenerationStartDate` and deliberately keeps windows that cross the year end enabled (`isInNextYear`, `admin-config.ts:52-62`, `:73-77`). `/wrapped` hard-codes the current year.
  - **Loop scenario.** An admin saves a Dec 1 - Jan 31 window in 2026; the form stores 2026-12-01 and 2026-01-31 (`wrapped-settings-form.tsx:31-34`). On Jan 10, 2027 the card says "2026 Wrapped - Ready to view" (`user-home--desktop.png`). "View Your Wrapped" goes to plain `/wrapped` (`wrapped-card.tsx:270-272`; the post-generation `router.push('/wrapped')` at `:114` also carries no year). The page looks up 2027 and shows "No Wrapped Found - You haven't generated your 2027 Plex Wrapped yet" with a link back home (`page.tsx:106-114`), where the card again says 2026 is ready.
  - **Past years disappear even without a window.** The refutation reviewer showed that from Jan 1 the previous year's Rewind cannot be reached in the app either way: with no window the card offers "Generate" for the new year; with a Dec 31 end the card returns null. No route takes a year parameter, so the seeded 2025 Rewind is reachable only through an old share link or admin pages.
  - **Unexplained absences.** Outside the window (`wrapped-card.tsx:150-153`) and for members under 6 months (`:46-51`, `:156-158`) the card returns null with no explanation.
  - **No exit.** The viewer has no Home or Close control: `wrapped-slide-14-finale--mobile.png` shows only Previous, Share, Download card and Show All, and neither `wrapped-viewer.tsx` nor `wrapped-viewer-navigation.tsx` contains a Link or router. `wrapped-home-button.tsx` exists but is imported only by its test.
  - **Raw errors.** The failed state shows `wrapped.error` verbatim (`page.tsx:75-77`); the seeded value is "Tautulli request failed: ECONNREFUSED".
- **Impact:** the busiest Rewind period (late December and January) can land members in a generate-and-view loop. Every member loses in-app access to last year's Rewind on Jan 1, and new members never learn why they have no Rewind.
- **Recommendation:**
  - Add one server helper, `getActiveRewindYear()` in `lib/wrapped`, and use it in both the card and the page.
  - Add a `/rewind/[year]` route, redirect `/wrapped` to the active year, and add a "Your Rewinds" strip on home that lists completed years.
  - Replace the null returns with explanatory states: "Rewind 2026 opens Dec 1", "Available after 6 months of membership", "Rewind window closed - view anytime below".
  - Give the viewer chrome a persistent Close/Home control (reuse or delete `wrapped-home-button.tsx`).
  - Map generation errors to friendly copy; keep raw errors for admins.
  - Load the card's wrapped status on the server page and pass it as props (see UI-41).
- **Effort:** M

#### UI-03: The setup wizard requires every optional integration to pass a live connection test, with no skip

- **Severity:** High
- **Status:** verified. Both reviewers called it borderline critical for owners without Prometheus or an OpenAI key, and kept high because it only affects new installs.
- **Sources:** UX-03
- **Where:** `types/setup.ts:7-52`, `components/setup/setup-wizard/setup-wizard.tsx:72-113`, `actions/setup.ts:171-175`, `:226-230`, `:281-285`, `:413-416`, `:471`, `:480-485`, `components/setup/setup-wizard/wizard-form-actions.tsx:38-60`, `components/setup/setup-wizard/prometheus-form.tsx:15-18`, `components/setup/setup-wizard/sonarr-form.tsx:115`, `:139`, `:192`, `components/setup/setup-wizard/plex-server-form.tsx:182-212`, `components/setup/setup-wizard/discord-integration-form.tsx:30`, `components/setup/setup-wizard/final-success-animation.tsx:12`, `lib/guards.ts:24-28`, `app/(app)/layout.tsx:47`, `README.md:105-110`, `:156`
- **Evidence:**
  - **No optional flag.** `SETUP_STEPS` lists 9 steps with no required/optional marker (`types/setup.ts:7-52`). Each form only gets `onComplete` and `onBack` (`setup-wizard.tsx:92-113`).
  - **Every save is gated on a live test.** `saveOverseerr`, `saveSonarr`, `saveRadarr`, `saveLLMProviderForPurpose` (chat and wrapped) and `savePrometheus` each test the connection and return an error before `currentStep` moves ("Test connection before saving", `actions/setup.ts:226-230`, and the other cited lines). Their Zod schemas require name, url and apiKey or query.
  - **No way around it.** `WizardFormActions` offers only Back and Continue (`wizard-form-actions.tsx:38-60`); the step cards are not clickable; only the Discord step can be skipped, by leaving its toggle off (`discord-integration-form.tsx:30`). `ensureSetupComplete` redirects the whole `(app)` group, including sign-in at `/`, to `/setup`.
  - **The bypass flag is not a workaround.** `SKIP_CONNECTION_TESTS` is set only by CI and Playwright, and it mocks `getPlexUserInfo` (`lib/connections/plex-user-info.ts:30`), which corrupts `adminPlexUserId`.
  - **The README disagrees.** `README.md:105-110` and `:156` call Overseerr, Sonarr/Radarr and the LLM provider optional. `setup-step-09--desktop.png` and `setup-step-09--mobile.png` show the Prometheus step with only Back and Continue.
  - **Side bug.** `saveLLMProvider` writes `currentStep` 10, not 9 (`actions/setup.ts:471`), so reloading on step 9 hits the "ready to finish" branch (`setup-wizard.tsx:72-90`) and silently skips Prometheus.
  - **Other first-run friction.** The Plex step asks the owner to paste an X-Plex-Token found through a support article (`plex-server-form.tsx:182-212`), although the app already implements Plex PIN sign-in. The finish screen says "Your Plex Wrapped is ready" (`final-success-animation.tsx:12`), then drops the owner on sign-in and member onboarding ("Learn how to configure your Plex client").
- **Impact:** an owner without Sonarr, Radarr, Prometheus or an OpenAI key cannot finish setup, and therefore cannot use the product at all without editing the `Setup` row in Postgres. This is the very first experience of the product.
- **Recommendation:**
  - Add `optional: boolean` and `group` to `SETUP_STEPS` (Core: Plex and Tautulli; Requests: Overseerr; Automation: Sonarr/Radarr; AI; Community; Monitoring).
  - Give optional steps a "Skip for now - configure later in Admin > Settings" action in `WizardFormActions`, backed by server actions that only advance `currentStep`. Fix the step-10 write at the same time.
  - Replace the token field with a "Connect with Plex" PIN flow that lists owned servers from plex.tv resources, keeping manual token entry as an "Advanced" fallback.
  - End on a summary screen (configured / skipped, with links to settings) and a "Sign in as owner" CTA, and skip member onboarding for the owner.
- **Effort:** M

#### UI-04: The admin assistant cannot be closed on mobile, runs off-screen, and the floating button covers primary actions

- **Severity:** High
- **Status:** verified (ADM-01); DS-13's FAB evidence was corrected by its verifier and folded in here.
- **Sources:** ADM-01, DS-13 (chat FAB part), DS-17 (chat launcher semantics)
- **Where:** `components/admin/chatbot/chat-window.tsx:97-99`, `:120`, `:127-162`, `:252-268`, `components/admin/chatbot/chat-context.tsx:19`, `components/admin/shared/admin-layout-shell.tsx:30`, `:33`, `app/admin/layout.tsx:14`, `:17`, `components/admin/shared/admin-nav.tsx:300`, `lib/chatbot/assistant.ts:61-70`
- **Evidence:**
  ```tsx
  // components/admin/chatbot/chat-window.tsx
  // :98  toggle  "fixed bottom-24 md:bottom-6 right-6 z-40"
  // :120 panel   "fixed bottom-24 md:bottom-24 right-6 z-40 ... w-96"
  ```
  - **The panel covers its own toggle.** Below md both elements sit at `bottom-24 right-6 z-40`, and the panel comes later in the DOM, so it paints over the toggle and takes its taps.
  - **No other way to close it.** The header (`:127-162`) holds only Expand, New and "AI Powered". `closeChat` exists (`chat-context.tsx:19`), but nothing calls it. There is no Escape handler and no `role="dialog"`.
  - **Clipped.** On a 390px viewport the `w-96` panel at `right-6` has no `max-w`, so its left edge is at x = -18 (`admin-chat-open--mobile.png`, text cut off on the left).
  - **Reproduced.** In `adminux-chat-close-mobile--mobile.png` the second tap on "Toggle Chatbot" timed out because the panel intercepts the pointer.
  - **Stays open across pages.** `ChatProvider` wraps the admin shell (`app/admin/layout.tsx:17`), so the panel stays open across client navigation until a reload. The bottom nav (`z-50`, `admin-nav.tsx:300`) still works but only moves the panel to another page.
  - **The bubble covers content.** `<main>` reserves only `pb-20 md:pb-6` (`admin-layout-shell.tsx:30`), which clears neither the mobile FAB (which correctly sits at `bottom-24`, above the bottom nav) nor the desktop one. The bubble covers "Update Template" (`admin-prompt-edit--desktop.png`), the Top Models "Avg Cost" column (`admin-cost-analysis--desktop.png`), the last row's Admin button (`admin-shares--mobile.png`), the last LLM row (`admin-llm-usage--mobile.png`) and the Total Cost tile (`admin-users--mobile.png`).
  - **Shown where it does not belong.** It renders on immersive wrapped routes, because the shell ignores `hideChrome` (`admin-layout-shell.tsx:33`; `admin-user-wrapped--mobile.png`). It is gated only on `chatLLMProvider` (`layout.tsx:14`), so it still shows when the LLM master switch is off, where it only returns a canned "AI features are currently disabled" reply (`assistant.ts:61-70`).
  - **Accessibility.** The launcher has only `aria-label="Toggle Chatbot"`, with no `aria-expanded`/`aria-controls` (`:97-99`). Messages are not in a live log. The chat input is placeholder-only, and the send button has no accessible name (`:252-268`).
- **Impact:** an admin on a phone who opens the assistant loses the middle of every admin page until they reload. On desktop the bubble hides submit buttons and table cells at the bottom of long pages. The desktop part on its own would be low severity; high rests on the mobile trap.
- **Recommendation:**
  - Make the assistant a real dialog: a close button and Escape in the header, `role="dialog"` with `aria-labelledby`, focus moved to the input on open and back to the trigger on close. Make the launcher a disclosure with `aria-expanded`/`aria-controls`, give the message list `role="log" aria-live="polite"`, the input an sr-only label and the send button `aria-label="Send"`.
  - Below md, render it as a bottom sheet (`inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl`, above the bottom nav) and hide the floating button while it is open. On desktop add `max-w-[calc(100vw-2rem)]`.
  - Reserve bottom padding in the admin shell (or `AdminPage`, UI-21) when the assistant is present: roughly `pb-40` on mobile (bottom nav plus FAB) and `md:pb-24` on desktop. Alternatively, move the trigger into the page header or a command palette ("Ask assistant").
  - Hide it on immersive routes, and gate it on `!config.llmDisabled`.
  - Add testids `admin-chat-toggle`, `admin-chat-close` and `admin-chat-input`.
- **Effort:** S

#### UI-05: The users list hides everyone by default when Plex is unreachable, hides the active filter, and its filter menu is covered on mobile

- **Severity:** Medium
- **Status:** verified. The verifier argued high (the admin landing page looks empty whenever Plex is down); the refutation reviewer lowered it to medium (admin-only, one dropdown change on desktop, and "Unknown" is still tappable on mobile).
- **Sources:** ADM-04, DS-05 (overlap symptom)
- **Where:** `components/admin/users/users-list.tsx:16-27`, `components/admin/users/users-filter.tsx:20`, `:31-39`, `:43`, `:65`, `:88`, `:110`, `:131`, `components/ui/styled-dropdown.tsx:57`, `:101-117`, `:174`, `:178`, `actions/user-queries.ts:122`, `:217`, `:359-415`, `app/admin/users/page.tsx:31-37`, `e2e/admin-functionality.spec.ts:30-34`
- **Evidence:**
  - **Hidden default.** `UsersList` starts with `plexAccess: "yes"` and drops every user whose `hasPlexAccess !== true` (`users-list.tsx:16-27`). `UsersFilter` repeats the default, and Reset goes back to "yes" (`users-filter.tsx:20`, `:31-39`).
  - **Where `hasPlexAccess` comes from.** `buildPlexAccessMap` sets every user to null when there is no active Plex server or the plex.tv check fails, and any user without a `plexUserId` (Jellyfin-invite users) is always null. The admin gets `true` only inside the success branch (`user-queries.ts:359-415`, `:217`).
  - **No signal.** `activeFilterCount` does not count "yes" (`:43`), so the default view shows no badge and no Reset button (`:65`). `admin-users--desktop.png` shows "No users found" next to "7 users in database" and "Total Users 7". "1 active" appears only after the admin widens the filter to All (`admin-users-filter-all--desktop.png`). The repo's own E2E clicks "All" first to work around this (`admin-functionality.spec.ts:30-34`).
  - **Mobile overlap.** Each filter cell is `relative z-30` (`:88`, `:110`, `:131`), which makes them sibling stacking contexts with equal z-index. The menu's `z-[200]` and its `fixed inset-0 z-40` backdrop (`styled-dropdown.tsx:174`, `:178`) only apply inside the first cell. On the single-column mobile grid the Role and Subscription cells paint over "All" and "No" (`admin-users-filter-menu-overlap--mobile.png`). A tap lands on the Role label, the document mousedown handler closes the menu (`:101-117`), and the filter stays on "Yes". Desktop's 3-column layout avoids it (capture failure 4).
  - **Tiny controls.** `size="sm"` is `px-2 py-0.5 text-[10px]`, about 22px tall (`styled-dropdown.tsx:57`).
  - **Layout.** The KPI tiles render below the table (`users/page.tsx:31-37`).
- **Impact:** every install sees an empty first admin screen whenever Plex or plex.tv is unreachable, or for Jellyfin users, and nothing says a filter is responsible. On phones the filter cannot be changed by touch.
- **Recommendation:**
  - Default Plex Access to "all", count every non-default value as active, and show removable filter chips.
  - When access can't be verified, show `<Alert tone="warning">Plex access couldn't be checked</Alert>` above the full list instead of hiding everyone.
  - Remove the per-wrapper `relative z-30` (S quick fix), and render the dropdown menu in a portal (UI-14).
  - Use size md (36-40px) for filter controls, and keep filters in `searchParams`.
  - Move the KPI tiles above the table as a compact `StatGrid` (UI-22).
- **Effort:** S

#### UI-06: Broken admin deep links: links drop the year or the user, the admin lands on the full-screen user-facing generation screen, and the nav loses its active state

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** ADM-11
- **Where:** `app/admin/shares/page.tsx:192`, `actions/share-analytics.ts:215`, `components/generator/wrapped-generating-animation.tsx:136`, `app/admin/users/[userId]/wrapped/page.tsx:23`, `:28`, `:33`, `components/admin/shared/admin-layout-shell.tsx:9-12`, `app/admin/llm-usage/[usageId]/page.tsx:172`, `:205`, `app/admin/llm-usage/page.tsx:245-273`, `components/admin/invites/invite-details-client.tsx:279`, `components/admin/shared/admin-nav.tsx:191-193`, `app/admin/users/[userId]/page.tsx:239`, `:329`, `components/admin/users/user-actions-menu.tsx:122`
- **Evidence:**
  - **Share Analytics "Admin" link drops the year.** It is `` `/admin/users/${wrap.userId}/wrapped` `` even though `wrap.year` is in the data (`shares/page.tsx:192`, `share-analytics.ts:215`), and the page falls back to the current year (`wrapped/page.tsx:23`).
  - **Dead-end screen.** Morgan Lee's 2025 row therefore opens her 2026 wrapped, which is stuck in "generating". The admin lands on the user-facing "Creating Your 2026 Wrapped" screen, which is `fixed inset-0 z-50` and comes later in the DOM than the z-50 admin header, so it covers it. The immersive route also hides the admin nav (`admin-layout-shell.tsx:9-12`). The only way out is the browser's Back button (`adminux-share-admin-link-2025--desktop.png`).
  - **LLM request detail.** "View All Users" goes to `/admin/users` instead of this user (`llm-usage/[usageId]/page.tsx:172`), and "View Wrapped" omits the year (`:205`).
  - **Plain-text names.** Invite usage names (`invite-details-client.tsx:279`) and LLM usage user cells (`llm-usage/page.tsx:245-273`) are not links.
  - **Back link.** The wrapped viewer's back link is hard-coded to `/admin/users`, not the user detail page you came from (`wrapped/page.tsx:33`).
  - **Inconsistent year handling.** Wrapped History rows on user detail pass `?year` (`users/[userId]/page.tsx:329`), but the header "View" (`:239`) and `user-actions-menu.tsx:122` don't.
  - **Nav state.** The Users nav item is active only on exactly `/admin/users` or `/admin` (`admin-nav.tsx:191-193`), so nothing is highlighted on `/admin/users/[id]` (`admin-user-detail--desktop.png`, `--mobile.png`).
- **Impact:** admins open the wrong year, lose their place, and can end up on a full-screen page with no admin controls.
- **Recommendation:**
  - Add `lib/admin/routes.ts` with `userDetail(id)`, `userWrapped(id, year)`, `llmUsage({ userId })` and `invite(id)`, use it in every link, and always pass the year.
  - On admin routes, show the generating or failed state inside the immersive header as a status card with "Back to user" and "Regenerate", not the user-facing full-screen animation.
  - Add breadcrumbs (UI-21), e.g. Users › Regular User › 2026 Rewind.
  - Match nav items by prefix with an explicit `match` array per item (UI-32), and set `aria-current="page"` (UI-10).
- **Effort:** S

#### UI-07: Status and error query params from Discord and NextAuth are silently dropped

- **Severity:** Medium
- **Status:** adjusted. Downgraded because the NextAuth part is rarely reached and the Discord part is masked today by UI-01.
- **Sources:** UX-05
- **Where:** `app/(app)/page.tsx:26`, `app/(app)/discord/connect/route.ts:25-31`, `:39-43`, `app/api/discord/callback/route.ts:35-48`, `lib/auth.ts:434-436`
- **Evidence:**
  - `/discord/connect` redirects to `/?error=Too many Discord link attempts...` or `/?error=<reason>`. `/api/discord/callback` redirects to `/?status=linked` or `/?error=...`.
  - `Home()` takes no `searchParams` (`page.tsx:26`), and the only non-admin `useSearchParams` consumer is `callback-client.tsx`. `ux-home-error-param--mobile.png`, loaded with `?error=...&status=linked`, shows no message.
  - NextAuth sets only `pages.signIn: '/'` (`lib/auth.ts:434-436`), so `/api/auth/error` renders NextAuth's unbranded light "Server error" card (`ux-nextauth-error--desktop.png`). Every `signIn()` call uses `redirect: false` and handles errors inline, so this page is only reached by direct navigation or server misconfiguration.
- **Impact:** once UI-01 is fixed, a successful Discord link gets no confirmation and every failure looks like nothing happened, so users retry until they are rate-limited.
- **Recommendation:** ship this with UI-01.
  - Add a small client `FlashFromQuery`, mounted in the `(app)` layout and on the sign-in page. It maps short codes (`discord_linked`, `discord_rate_limited`, `discord_unavailable`, `discord_failed`) to a toast or `Alert`, then strips the params with `router.replace`.
  - Change both Discord routes to send codes instead of raw `error.message`, which can contain internal text.
  - Setting `pages.error: '/auth/error'` on the StatusScreen from UI-19 is a cheap, low-priority extra.
- **Effort:** S

#### UI-08: Monitoring pages never refresh, the queue chip says "Processing" while the worker is stopped, and the status row overflows on mobile

- **Severity:** Medium
- **Status:** adjusted. The headline correctly says "Worker Stopped"; only the chip contradicts it. The mobile horizontal scroll is partly a capture artifact.
- **Sources:** ADM-16
- **Where:** `app/admin/queues/page.tsx:26`, `components/admin/queues/queue-status.tsx:54`, `:72`, `:88-95`, `components/admin/queues/job-table.tsx:64`, `:78`, `components/admin/discord/discord-bot-status.tsx`
- **Evidence:**
  - No `refetchInterval` or `setInterval` exists anywhere in `app/admin` or `components/admin`. `/admin/queues` is a `force-dynamic` server snapshot, and Discord's "Bot Status / Last hour" is static. The only refreshes are `router.refresh()` calls after job actions (`job-table.tsx:64`, `:78`).
  - The "Processing" chip is green whenever `!isPaused`, whatever the worker state (`queue-status.tsx:88-95`). `admin-queues--desktop.png` shows "Worker Stopped" next to a green Processing chip. The chips show state through color alone.
  - The flex rows at `:54` and `:72` don't wrap. On a 390px phone "Proc" is cut off (`admin-queues--mobile.png`). In the real app the row is clipped rather than scrolled, because `overflow-x:hidden` is on `body`.
- **Impact:** while Rewind jobs run, admins see stale or contradictory status and have to reload by hand to know whether generation is progressing.
- **Recommendation:**
  - Poll `getQueueDashboardData` every 5 s while the tab is visible, through TanStack Query with `refetchInterval` or a small `useAutoRefresh` that calls `router.refresh()`. Show "Updated 3s ago · Pause live".
  - Derive "Processing" from `workerRunning && !isPaused && redisConnected`, or relabel the chip "Queue: running/paused".
  - Render the chips as text badges ("Worker: stopped") with `Badge`, and wrap or stack the row on mobile.
- **Effort:** S

### 2. Accessibility

#### UI-09: Rewind viewer: no pause or keyboard shortcuts, prohibited ARIA on slide titles, mid-word title breaks on mobile, unskippable intro

- **Severity:** High
- **Status:** verified. Both reviewers called high borderline but defensible: the mid-word breaks hit most mobile viewers of the flagship, and the auto-advancing carousel has no explicit pause (WCAG 2.2.1/2.2.2, level A).
- **Sources:** DS-07
- **Where:** `components/wrapped/cinematic/marquee-text.tsx:27-51`, `components/wrapped/cinematic/slide-frame.tsx:59-61`, `components/wrapped/wrapped-viewer.tsx:106`, `:120-131`, `:142-159`, `components/wrapped/cinematic/theme.ts:31-48`, `components/wrapped/wrapped-viewer-progress.tsx:20-26`, `components/wrapped/wrapped-transition.tsx:17-58`, `components/wrapped/wrapped-viewer-wrapper.tsx:30`, `:40`, `components/wrapped/wrapped-viewer-navigation.tsx:32`, `:61`, `lib/wrapped/assemble-wrapped.ts:127`, `:147`
- **Evidence:**
  - **Per-letter titles.** `SlideFrame` renders `<h2><MarqueeText/></h2>` (`slide-frame.tsx:59-61`). `MarqueeText` splits the title into one `inline-block whitespace-pre` motion span per letter, marks each letter `aria-hidden`, and puts `aria-label` on a role-less span (`marquee-text.tsx:35-51`).
  - **Prohibited ARIA.** `aria-label` on a generic span is prohibited (axe `aria-prohibited-attr`, serious, on `/wrapped`). Chromium still computes the heading name (a Playwright ariaSnapshot shows heading "Your 2026 Wrapped"), but other screen reader and browser combinations and browse modes are unreliable.
  - **Mid-word breaks.** Browsers can wrap between any two letter spans. The titles are fixed strings in the production assembler ("Top Billing — Films", "Your Viewing Patterns", `assemble-wrapped.ts:127`, `:147`), so every mobile viewer sees "TOP BILLING — FIL / MS" (`wrapped-slide-05-top-movies--mobile.png`) and "YOUR VIEWING PA / TTERNS" (`wrapped-slide-07-streaks-patterns--mobile.png`). Users with reduced motion get plain text (`marquee-text.tsx:30-32`) and normal wrapping.
  - **Auto-advance with no pause.** Slides advance on a 9-15 s timer (`theme.ts:31-48`, `wrapped-viewer.tsx:120-131`). There is no pause/play control, no pause on hover, focus or `visibilitychange`, and no ArrowLeft, ArrowRight or Space handling (a repo-wide grep for `keydown` finds only MobileMoreMenu and ModalShell). Auto-advance stops only as an undiscoverable side effect of Previous, Next or Show All (`:142-159`).
  - **No announcement.** Nothing announces the new slide, and focus is not managed. The `role=progressbar` changes `aria-label` and `aria-valuenow` every 50 ms (`wrapped-viewer-progress.tsx:20-26`, `wrapped-viewer.tsx:106`).
  - **Unskippable intro.** `WrappedTransition` forces 1.5 s of logo, a 3 s countdown and 1 s + 1 s of reveal (about 6.5 s, `wrapped-transition.tsx:17-58`), with no skip control and no reduced-motion branch. It plays on the user's own `/wrapped` and admin views; share and preview skip it (`wrapped-viewer-wrapper.tsx:30`).
  - **Corrected by reviewers.** Keyboard users can navigate, since Previous and Next are native buttons (`wrapped-viewer-navigation.tsx:32`, `:61`). Only shortcuts and focus management are missing.
- **Impact:** on phones the hero titles of the flagship feature break mid-word. Users who need more time lose slides to auto-advance. Screen-reader users get an unreliable slide title and no announcement of slide changes.
- **Recommendation:**
  1. Render the title as sr-only text plus an `aria-hidden` visual layer.
  2. Wrap each word in an inline-block, `whitespace-nowrap` wrapper so breaks only happen between words, and add `text-balance`.
  3. Add a visible Pause/Play control. Pause on hover, focus and `document.hidden`. Add ArrowLeft/ArrowRight/Space shortcuts.
  4. On slide change, move focus to the slide heading or announce it through a polite live region. Throttle the progressbar so its label updates per slide, not every 50 ms.
  5. Add "Skip intro", and skip the intro under reduced motion.
  6. Restyle or replace `WrappedTransition` in the Rewind theme (UI-16).
- **Effort:** M

#### UI-10: Status messages, focus and landmark semantics are missing: silent toasts, focus loss in wizards, no `aria-current`, no `<main>` or skip link, skipped heading levels

- **Severity:** High
- **Status:** verified (UX-11); confirmed (DS-17)
- **Sources:** UX-11, DS-17
- **Where:** `components/ui/toast.tsx:40`, `:62`, `:84`, `:142-148`, `components/subscribe/plan-list.tsx:61`, `:70`, `components/subscription/manage-subscription-button.tsx:49`, `:58`, `components/onboarding/onboarding-wizard.tsx:68`, `:162`, `:230-248`, `components/setup/setup-wizard/setup-wizard.tsx:222-232`, `components/setup/setup-wizard/success-animation.tsx:25-38`, `components/auth/service-sign-in-toggle.tsx:110-131`, `components/admin/shared/admin-nav.tsx:206-226`, `app/onboarding/layout.tsx:6`, `app/setup/layout.tsx:6`, `components/dashboard/user-dashboard.tsx:86`, `:101`, `components/dashboard/announcements-card.tsx:58`, `:96`, `components/admin/users/users-filter.tsx:61`, `components/admin/queues/queue-controls.tsx:55`, `components/dashboard/status-background.tsx:143-150`
- **Evidence:**
  - **Toasts are silent.** `ToastProvider` is mounted app-wide. Its container is a plain fixed div (`toast.tsx:84`), and each `ToastItem` is a `motion.div` with no role and no `aria-live` (`:142-148`), so dynamically inserted toasts are never announced. About 105 `showError`/`showToast` calls go through it.
  - **Some errors are toast-only:** checkout (`plan-list.tsx:61`, `:70`), billing portal (`manage-subscription-button.tsx:49`, `:58`) and onboarding completion (`onboarding-wizard.tsx:68`). Toasts auto-dismiss on a bare timer (3 s for success/info at `:40`, 5 s for errors at `:62`) and don't pause on hover or focus.
  - **Wizard focus loss.** Both wizards swap step content inside `AnimatePresence mode="wait"` keyed on `currentStep` (`setup-wizard.tsx:222-232`, `onboarding-wizard.tsx:230-248`). The focused Continue button is unmounted, so focus falls to `<body>` after every step. `components/setup` and `components/onboarding` contain 0 `.focus()` calls, 0 `aria-current` and 0 `aria-describedby`.
  - **Unannounced overlay.** The 1.5 s `SuccessAnimation` is a `pointer-events-none` overlay with no role or live region (`success-animation.tsx:25-38`).
  - **Toggle state.** The Plex/Jellyfin sign-in toggle is two plain buttons; the selected one is shown only by a gradient class, with no `aria-pressed`, tab or radio semantics (`service-sign-in-toggle.tsx:110-131`).
  - **No `aria-current` anywhere in the codebase.** The admin sidebar marks the active item only with a gradient and a dot (`admin-nav.tsx:206-226`); the onboarding stepper has no `aria-current="step"`.
  - **Landmarks.** The onboarding and setup layouts wrap the page in a div with no `<main>` (axe `region`, 9 nodes on `/onboarding`). There is no skip-to-content link.
  - **Heading order skips levels.** Home goes h1 server name (`user-dashboard.tsx:86`), then h3 "Announcements" (`announcements-card.tsx:58`), then h4 items (`:96`), then h2 "Quick Links" (`user-dashboard.tsx:101`). Admin pages put an h3 right after the h1 (`users-filter.tsx:61`, `queue-controls.tsx:55`). axe reports `heading-order` on `/`, `/admin/users` and `/admin/queues`.
  - **Mouse-only detail.** Home status-bar segments reveal detail on `onMouseEnter` only (`status-background.tsx:143-150`). This is minor, since overall status and uptime % are shown as text.
  - Related items tracked elsewhere: field-error linking (UI-13), chat launcher semantics (UI-04), `<th scope>` (UI-23), toasts painted under the modal backdrop (UI-42).
- **Impact:** screen-reader users miss every async error and lose their place on each wizard step (WCAG 4.1.3 Status Messages and 2.4.3 Focus Order). For checkout and onboarding completion the toast is the only feedback. They also can't tell which admin section they're in, and navigate by headings and landmarks poorly.
- **Recommendation:**
  1. Give `ToastContainer` `role="region" aria-label="Notifications"`, and each toast `role="status"` (`role="alert"` for errors), or adopt Sonner or Radix Toast. Pause the timer on hover and focus.
  2. In both wizards, focus the new step's heading (`tabIndex={-1}`) after each transition, and set `aria-current="step"` on the active indicator (the shared Stepper in UI-33).
  3. Give the service toggle `aria-pressed` or radiogroup semantics.
  4. Set `aria-current="page"` on the active sidebar and bottom-nav links.
  5. Add `<main id="main">` to the onboarding and setup layouts, and a skip link in the root layout.
  6. Make `SectionHeader` render h2 by default. On home, change "Announcements" to h2 and its items to h3.
  7. Make the status segments focusable, or give them a text summary.
- **Effort:** M

#### UI-11: Pinch-zoom is disabled on every page (WCAG 1.4.4 Resize Text)

- **Severity:** Medium
- **Status:** verified. Both refutation reviewers lowered it from high to medium: iOS Safari has ignored `user-scalable=no` since iOS 10, desktop browser zoom is unaffected, and Android has a "force enable zoom" setting. It is still an AA failure on every page with a two-line fix.
- **Sources:** DS-03, UX-09
- **Where:** `app/layout.tsx:5-11`, `components/ui/styled-dropdown.tsx:57`, `components/ui/styled-input.tsx:13-14`, `components/ui/styled-select.tsx:54`, `components/auth/jellyfin-sign-in-form.tsx:134`, `e2e/accessibility.spec.ts:13`, `:27-29`
- **Evidence:**
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
  - It renders `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` on every route (checked on `/invite/AUDIT2026`). No nested layout or page exports `viewport`/`generateViewport`, and git history gives no reason for the setting.
  - axe reports `meta-viewport` on 12 of 12 scanned pages, and on every one of the 9 admin routes the admin auditor scanned. The rule is rated "moderate", so the critical/serious filter in `e2e/accessibility.spec.ts:27-29` lets it through.
  - The UI relies on small type that low-vision users would want to zoom: 549 `text-xs`, `text-[10px]` ×21 (30 by the refutation reviewer's recount), including `StyledDropdown` size sm, which the users filters use (`admin-users--mobile.png`).
- **Impact:** low-vision users on Android Chrome and other Chromium mobile browsers can't enlarge text anywhere in the app unless they find a browser accessibility setting.
- **Recommendation:**
  - Delete `maximumScale` and `userScalable`, keeping `width`, `initialScale` and `themeColor`.
  - So that iOS doesn't zoom in on focus, make form controls at least 16px on small screens (`text-base sm:text-sm`) in `StyledInput`, `StyledTextarea`, `StyledSelect`/`StyledDropdown` and the raw inputs in the Jellyfin sign-in form.
  - Add `meta-viewport` to the blocking rules in `e2e/accessibility.spec.ts`.
- **Effort:** S

#### UI-12: Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds

- **Severity:** Medium
- **Status:** verified (DS-06). The refutation reviewer lowered it from high: the failures are moderate (3.1-3.7:1), they hit mostly captions and hints, and about 56 of the 83 affected files are admin. The admin contrast items from ADM-05 are folded in.
- **Sources:** DS-06, ADM-05 (contrast part)
- **Where:** `components/ui/button.tsx:21`, `:22`, `components/admin/queues/queue-controls.tsx:64`, `components/admin/users/users-stats-summary.tsx:45`, `app/loading.tsx:5`, `components/admin/shared/admin-layout-shell.tsx:28`, `app/admin/llm-usage/page.tsx:308`, `app/admin/users/[userId]/page.tsx:240`, `:330`, `app/admin/prompts/page.tsx:126`, `app/admin/shares/page.tsx:187`, `components/admin/llm-usage/conversation-usage-row.tsx:101`, `components/admin/prompts/prompt-template-actions.tsx:74`, `e2e/accessibility.spec.ts:7-66`
- **Evidence:** ratios were recomputed from Tailwind v4's oklch values (`node_modules/tailwindcss/theme.css`):

  | Pair | Ratio | Where |
  |---|---|---|
  | slate-500 on slate-900 | 3.74 | 206 `text-slate-500` uses in 83 files, almost always `text-xs`/`text-sm` |
  | slate-500 on slate-800 | 3.07 | |
  | slate-500 on slate-800/50 over slate-900 | 3.42 | "Across all years & regenerations", `users-stats-summary.tsx:45` |
  | white on cyan-600 | 3.60 | `Button` primary gradient start (`button.tsx:21`); the `bg-cyan-600 text-xs` row actions |
  | white on cyan-500 (hover) | 2.36 | `Button` primary lightens on hover |
  | white on green-600 | 3.22 | `Button` success (`button.tsx:22`) |
  | white on yellow-600 | 2.93 | Pause Queue (`queue-controls.tsx:64`), axe-confirmed |
  | white on purple-600 | 5.53 | passes (gradient end) |
  | white on cyan-700 | 5.28 | passes (proposed fix) |
  | slate-400 on slate-900 | 6.79 | passes (proposed muted text) |

  - **axe violations on the running app:** `color-contrast` (serious) on `/admin/queues` (Pause Queue) and ×4 on `/admin/llm-usage` (white `text-xs` over `bg-cyan-600`; the same class recurs at the other cited admin lines).
  - **axe is blind on gradient backgrounds.** For `color-contrast` it returns "incomplete: background could not be determined due to a background gradient" for 46 of 50 nodes on `/admin/users` and 153 of 154 on `/admin/settings`. The canvas is `bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900` (`admin-layout-shell.tsx:28`, `app/loading.tsx:5`, plus 12 other copies). `e2e/accessibility.spec.ts` fails only on critical/serious violations, never inspects `incomplete`, scans only users, settings and invites in their default state, and never visits `/admin/queues`.
- **Impact:** secondary and hint text is hard to read for low-vision users and on dim or outdoor phone screens, several primary buttons fall below AA, and CI gives false confidence that contrast is fine.
- **Recommendation:**
  1. Define `--color-muted-foreground` at slate-400 or lighter and codemod `text-slate-500` to it; keep slate-500 only for disabled or decorative use.
  2. Choose primary fills that reach at least 4.5:1 with white (cyan-700 or a solid brand color). If a gradient is kept, start it at the darker step and darken on hover instead of lightening.
  3. Make the warning button dark text on amber, or amber-700.
  4. Replace the gradient page canvas with a solid `--color-background` so axe can compute contrast; any glow goes on an `aria-hidden` decorative layer.
  5. Treat `incomplete` color-contrast results as failures, and extend the axe spec to every admin route and its edit and modal states.
  6. Add a unit test that asserts the contrast of each semantic foreground/background token pair.
- **Effort:** M

#### UI-13: Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms

- **Severity:** Medium
- **Status:** adjusted (DS-08, ADM-05). The verifier noted that most inputs fall back to their placeholder or current value for a name, so the name exists but doesn't say what the field is. That is why axe flags only the four date inputs, which have no placeholder.
- **Sources:** DS-08, ADM-05 (labels part), UX-11 (field-error part)
- **Where:** `components/admin/discord/discord-date-filter.tsx:69-92`, `components/admin/cost-analysis/cost-date-filter.tsx:57-100`, `components/admin/settings/DiscordIntegrationForm.tsx:175`, `components/admin/settings/ServerForm.tsx:162-217`, `components/admin/settings/LLMProviderForm.tsx`, `components/admin/settings/StripeSettingsForm.tsx`, `components/admin/playground/test-configuration.tsx:118`, `:142`, `:191`, `:245`, `:268`, `components/admin/users/users-filter.tsx:89`, `:111`, `:132`, `components/admin/queues/queue-filters.tsx`, `components/setup/setup-wizard/sonarr-form.tsx:105-123`, `components/setup/setup-wizard/plex-server-form.tsx:212-220`, `components/admin/invites/invites-page-client.tsx:323-340`, `components/ui/styled-checkbox.tsx:13`, `components/admin/announcements/announcement-form-modal.tsx:117`
- **Evidence:**
  - **Labels.** Of 101 `<label>` elements, 13 use `htmlFor`, and 48-49 neither use `htmlFor` nor wrap a control, across 14-15 files. The worst files are DiscordIntegrationForm (9 of 9), ServerForm (6 of 6), LLMProviderForm (5 of 5), playground test-configuration (5 of 5), setup discord-integration-form (5), StripeSettingsForm (4 of 5) and users-filter (3), plus queue-filters, cost-date-filter and discord-date-filter (2 each). The admin subset: 62 labels, 11 with `htmlFor`, 6 wrapping their control, so about 45 unconnected.
  - **axe `label` (critical)** ×2 on `/admin/discord` (`discord-start-date`, `discord-end-date`) and ×2 on `/admin/cost-analysis`. The two date filters are near-duplicates that differ only in default range and route.
  - **Errors not linked.** Outside the primitives, `aria-describedby` appears twice and `aria-invalid` never. Setup field errors are bare `<p className="mt-1 text-sm text-red-400">` with no id (`plex-server-form.tsx:212-214`, `sonarr-form.tsx:123`). Submit errors are a hand-rolled box without a role (`plex-server-form.tsx:216-220`), although `<Alert tone="danger">` already sets `role="alert"`.
  - **Label styles vary:** cyan-400 in setup (`sonarr-form.tsx:107`, `setup-step-02--desktop.png`); slate-400 (36), slate-300 (17) or white elsewhere.
  - **Small targets.** The invites table's icon buttons are 16px with no padding (`invites-page-client.tsx:323-340`).
  - **Random ids.** `StyledCheckbox` generates its id with `Math.random()` during render (`styled-checkbox.tsx:13`), which gives an unstable id on every render. At the cited call site (`announcement-form-modal.tsx:117`) it cannot cause a hydration mismatch, because the modal renders only on the client.
  - **Duplicated forms.** The setup sonarr, radarr, overseerr and tautulli forms are 218-line near-copies; sonarr and radarr differ by 2 lines after renaming.
- **Impact:** screen-reader users can't tell what many admin and setup fields are, or which error belongs to which field. Clicking a label doesn't focus its field, and the form look differs between setup, settings and the playground.
- **Recommendation:**
  - Add `components/ui/form-field.tsx` (Label, Description, Error) using `useId` to wire `htmlFor`/`id`, `aria-describedby` and `aria-invalid`, with one label style. Start without react-hook-form, which is not a dependency, unless the team wants it.
  - Label the four date inputs first; they are the only axe-critical failures.
  - Adopt FormField in setup, settings, the playground, invites and filters.
  - Collapse the four setup service forms into one config-driven `ServiceConnectionForm`, and merge the two date filters into one `DateRangeFilter`.
  - Switch `StyledCheckbox` to `useId`. Give icon buttons at least a 32px hit area (`IconButton`, UI-17).
- **Effort:** M

#### UI-14: The dropdown and menu layer is ad hoc: no listbox semantics, no arrow keys or Escape, inline rendering trapped by stacking contexts, no z-index scale

- **Severity:** Medium
- **Status:** adjusted (DS-05, ADM-05). "Keyboard users can't operate it" was corrected: options are native buttons, so Tab plus Enter works. What's missing is listbox semantics, expanded state, an accessible label, and arrow-key/Escape support. The impact is admin-wide plus the setup wizard.
- **Sources:** DS-05, ADM-05 (dropdown part)
- **Where:** `components/ui/styled-dropdown.tsx:57`, `:134`, `:144-243`, `:174`, `:178`, `components/admin/users/users-filter.tsx:88-89`, `components/admin/users/user-actions-menu.tsx:99-115`, `:281-284`, `components/admin/wrapped/historical-wrapped-selector-header.tsx:154-160`, `components/admin/shared/mobile-nav/MobileMoreMenu.tsx:27-97`, `:165`, `components/ui/modal-shell.tsx:125`, `components/setup/setup-wizard/llm-provider-form.tsx:221`, `:283`
- **Evidence:**
  - **No semantics.** The trigger is a plain button (`styled-dropdown.tsx:144`) with no `aria-haspopup`, `aria-expanded` or `aria-controls`, and its id is never tied to a label. Options are buttons without `role=listbox`/`option` or `aria-selected`. There is no arrow-key, Home/End, typeahead or Escape handling (`:144-243`). At runtime the users-filter trigger reports `labels=0`, `ariaExpanded=null`, and an accessible name of just "Yes".
  - **Inline rendering.** The menu is `absolute z-[200]` (`:178`) with a `fixed inset-0 z-40` backdrop (`:174`). Any ancestor that creates a stacking context traps it: `backdrop-blur` (170 uses), transforms, `motion.div`. The visible symptom is the covered mobile users filter (UI-05).
  - **Three more menu implementations:** `user-actions-menu.tsx:99-115` (portal plus manual fixed positioning, z-50), `historical-wrapped-selector-header.tsx:154-160` (inline `absolute z-50` with its own backdrop) and `MobileMoreMenu.tsx:165` (role=menu with custom roving focus; this one is good).
  - **Overlay z-indexes in use:** z-40, z-50, z-[200], z-[9999] (ModalShell, `modal-shell.tsx:125`), z-[10000].
  - **Scope.** StyledDropdown is used in 8 admin consumer files and in the setup wizard (`llm-provider-form.tsx:221`, `:283`).
- **Impact:** screen readers hear unlabeled "Yes" and "All" buttons on the main filter, sort and select control across admin, setup, Discord and queues. Menus get clipped or covered whenever an ancestor creates a stacking context, and every new menu reinvents positioning.
- **Recommendation:**
  - Quick fix (S): render the StyledDropdown menu in a portal, or remove the `relative z-30` wrappers in `users-filter.tsx`. Add `aria-haspopup="listbox"`, `aria-expanded` and `aria-labelledby` to the trigger, plus Escape to close.
  - Structural fix (M): headless `Select`, `DropdownMenu` and `Popover` primitives in `components/ui`, built shadcn-style on Radix or Base UI (a new dependency, so call it out). Migrate the three ad-hoc menus to them.
  - Add a `--z-*` scale in `@theme` (for example nav 40, popover 50, modal 60, toast 70), and pass `data-testid` through.
  - Re-test the setup wizard after the change.
- **Effort:** M

#### UI-15: Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens

- **Severity:** Medium
- **Status:** confirmed (DS-12); adjusted (UX-10, downgraded from high because it causes discomfort but blocks no task)
- **Sources:** DS-12, UX-10
- **Where:** `lib/providers.tsx:21-29`, `app/globals.css:17-32`, `components/setup/setup-wizard/space-background.tsx:33-93`, `components/dashboard/announcements-card.tsx:29-35`, `:46-50`, `:60-61`, `:92`, `components/dashboard/wrapped-card.tsx:17-38`, `:224-229`, `:245-252`, `app/auth/denied/denied-client.tsx:16`, `:53`, `:73`, `:136`, `:159`, `components/shared/formatted-text.tsx:38-44`, `components/admin/shared/unauthenticated-error.tsx:8`, `components/setup/setup-wizard/final-success-animation.tsx`, `components/wrapped/cinematic/film-grain.tsx:11`
- **Evidence:**
  - **Almost no reduced-motion support.** 57 files import framer-motion; only `marquee-text`, `spotlight` and `confetti-burst` call `useReducedMotion`. `lib/providers.tsx:21-29` has no `<MotionConfig reducedMotion="user">`. `globals.css` has no `@media (prefers-reduced-motion)` block, so the float, wiggle, twinkle, blink and grain keyframes are unguarded. The only `motion-reduce` variant in the codebase is `film-grain.tsx:11`.
  - **Infinite loops everywhere.** There are 26 `repeat: Infinity` in 11 files, and `animate-bounce`/`ping`/`pulse` in 21-23 files.
  - **The home page alone runs about 12 concurrent infinite animations:** a `gradient-shift` border (inline style, `announcements-card.tsx:33`), a bell that wiggles every 3 s (`:46-50`), a pinging NEW badge and pinging dots per announcement, and sparkles, a gradient border, a pulsing badge and an `animate-ping` dot on the Rewind card (`wrapped-card.tsx:17-38`, `:224-229`, `:245-252`).
  - **Other surfaces.** `SpaceBackground` animates 50 stars forever plus two blurred nebulas drifting over 40-50 s (`space-background.tsx:38-93`). It is mounted by the setup, onboarding and invite layouts and by `wrapped-share-summary`, `wrapped-transition` and the non-cinematic `wrapped-viewer`. `/auth/denied` spawns 50 looping particles, 3 shockwave rings and a pulsing heading. `FormattedText` pulses highlighted words forever. Rex bounces on error pages (`unauthenticated-error.tsx:8`). None of these has a pause control.
- **Impact:** users with vestibular disorders or motion sensitivity get continuous movement on every user page and full-strength slide transitions in Rewind. Decorative loops longer than 5 s next to content conflict with WCAG 2.2.2 (level A), and they cost battery and CPU on phones.
- **Recommendation:**
  1. Wrap the app in `<MotionConfig reducedMotion="user">` in `lib/providers.tsx`.
  2. Add a global `@media (prefers-reduced-motion: reduce)` block that neutralizes the `animate-*` utilities and the custom keyframes, and prefix CSS bounce, ping and pulse with `motion-safe:`.
  3. Render static backgrounds under reduced motion. This step is required, not optional: `MotionConfig` disables only transform and layout animations, so SpaceBackground's opacity loop on 50 stars keeps running.
  4. Remove the infinite loops (bell wiggle, ping dots, sparkles, denied particles) or make each play once.
  5. Define motion tokens (`--ease-standard`, `--duration-fast/base/slow`) and presets in one module, generalizing `REVEAL_SPRING` in `components/wrapped/cinematic/theme.ts`, so Rewind 2026 and the app share one motion language.
- **Effort:** S

### 3. Design system and visual consistency

#### UI-16: Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme

- **Severity:** High
- **Status:** verified. The refutation reviewer's caveat: "four unrelated" is slightly overstated, because admin and setup share the slate base and cyan-to-purple accent. A more accurate description is one legacy neon palette applied inconsistently, plus a divergent amber/magenta home and a separate gold cinematic Rewind. The root cause, fix and severity are unchanged.
- **Sources:** DS-02, UX-12 (Rewind looks part)
- **Where:** `components/setup/setup-wizard/space-background.tsx:33-80`, `app/onboarding/layout.tsx:6`, `components/setup/setup-wizard/sonarr-form.tsx:107`, `components/setup/setup-wizard/wizard-form-actions.tsx:54`, `components/auth/service-sign-in-toggle.tsx:37`, `components/dashboard/announcements-card.tsx:30-44`, `components/dashboard/wrapped-card.tsx:273`, `components/wrapped/wrapped-viewer-navigation.tsx:34`, `:63`, `:68`, `components/wrapped/wrapped-share-button.tsx:50`, `components/wrapped/share-card-download.tsx:46`, `components/wrapped/wrapped-transition.tsx:67`, `:93`, `:113`, `:145`, `:185`, `components/wrapped/wrapped-viewer-wrapper.tsx:40`, `app/(app)/wrapped/share/[token]/page.tsx:110-118`, `components/wrapped/wrapped-share-summary.tsx:36`, `:46`, `:69`, `:76`, `components/admin/invites/invites-page-client.tsx:238`, `components/ui/error-state.tsx:52`, `components/admin/playground/preview-modal.tsx:58`
- **Evidence:** compared side by side in the screenshots:
  - **Admin** (`admin-users-filter-all--desktop.png`, `admin-cost-analysis--desktop.png`): flat slate canvas, cyan-to-purple active nav, small type, and stat numbers colored by position (cyan tokens, green cost, purple projections, yellow 12-month figure).
  - **Setup, onboarding and invite** (`setup-step-02--desktop.png`, `user-onboarding-01-welcome--desktop.png`, `public-invite-valid--desktop.png`): animated starfield with nebulas, neon cyan-purple-pink gradient-text headlines, cyan-400 field labels, a tri-color CTA. Sign-in uses the same tri-color at `px-10` with `scale-105` hover (`service-sign-in-toggle.tsx:37`).
  - **User home** (`user-home--desktop.png`): an amber/orange glowing announcement card, a magenta Wrapped card with a pink-to-purple pill CTA, a brand-hex Plex quick link, an amber toggle, and a red text "Sign Out" link.
  - **Inside the Rewind viewer** (`wrapped-slide-02-total-watch-time--desktop.png`, `wrapped-slide-14-finale--desktop.png`): a near-black stage with gold/ivory serif type, but one control row mixes three button languages. Previous/Next are raw slate buttons with a cyan hover (`wrapped-viewer-navigation.tsx:34`, `:63`); Show All is the cyan-to-purple `Button` primary (`:68`); Share is cyan-purple-pink (`wrapped-share-button.tsx:50`); Download is a gold outline (`share-card-download.tsx:46`).
  - **Rewind intro.** `WrappedTransition` renders SpaceBackground with a cyan/purple/pink orb and gradient title before every viewing (`wrapped-transition.tsx:67-185`, mounted from `wrapped-viewer-wrapper.tsx:40`; `wrapped-intro-01-logo--desktop.png`).
  - **Public share page.** The page for the same 2026 v2 wrapped always renders `WrappedShareSummary`, whatever the version (`share/[token]/page.tsx:110-118`). That component mounts SpaceBackground, a neon gradient h1 and cyan/purple/pink stat numbers (`wrapped-share-summary.tsx:36`, `:46`, `:69`, `:76`; `public-wrapped-share--desktop.png`, `public-wrapped-share--mobile.png`).
  - **Ten distinct primary-CTA treatments:** Button cyan-to-purple; cyan-purple-pink at `rounded-md`, at `rounded-xl px-10`, and at `rounded-xl` with `scale-105`; pink-to-purple; solid cyan-700 (`invites-page-client.tsx:238`); solid red-600; amber `rounded-full` with black text (`error-state.tsx:52`); green-to-emerald (`preview-modal.tsx:58`); gold outline. There are 30-31 gradient-text headlines in 23-24 files.
- **Impact:** the product doesn't read as one app: users move from a neon onboarding to a warm-toned home to a corporate admin to a gold cinema. The Rewind brand the owner wants as the showpiece is undermined inside its own viewer and on the share link, the surface most likely to be seen by people outside the server.
- **Recommendation:**
  1. Settle on two themes only: an App theme (admin, home, onboarding, setup, invite, auth) with a neutral slate surface system, one brand accent for primary actions and focus, and semantic success/warning/danger; and a Rewind theme (`[data-theme=rewind]`) built on the cinematic tokens.
  2. Retire the starfield SpaceBackground and tri-color gradient text from app chrome; keep at most one subtle accent-glow token for hero areas.
  3. Make a single Button primary the only CTA style (UI-17).
  4. Inside the Rewind viewer, render navigation, share and download with Button variants under the Rewind theme (gold primary, ivory ghost), and move the intro to the Rewind theme.
  5. Rebuild `app/(app)/wrapped/share/[token]` on the cinematic `SlideFrame` and `GoldCountUp` components, with a legacy fallback for v1 wrappeds, so the public share matches the viewer and the OG card.
  6. Stop coloring stat values by position: use the foreground color for values, and reserve color for meaning (over budget, failures).
  7. Rename visible "Wrapped" copy to "Rewind" in the same pass (UI-39).
- **Effort:** L

#### UI-17: The shared primitives exist but are bypassed at scale, partly because they lack features

- **Severity:** High
- **Status:** verified (UX-07). DS-04 was adjusted to medium by its verifier, because most of the duplicated card and spinner markup looks the same to users. ADM-15 was confirmed. Merged at the higher severity, because every user passes through sign-in, onboarding, home and the Rewind CTA, and each uses a different primary-button treatment. It sits at the lower end of high, since nothing is functionally broken.
- **Sources:** UX-07, DS-04, ADM-15 (buttons part)
- **Where:** `components/ui/button.tsx:14-45`, `components/ui/card.tsx:21-32`, `components/ui/loading-spinner.tsx:8`, `components/ui/switch.tsx:15`, `:31`, `components/ui/pagination.tsx:50`, `components/admin/settings/llm-toggle.tsx:38-46`, `components/admin/settings/LLMToggle.tsx`, `components/admin/settings/llm-settings.tsx:83-89`, `components/admin/settings/watchlist-sync-settings.tsx:151-161`, `:189`, `components/watchlist/sync-settings-card.tsx:209-228`, `components/setup/setup-wizard/discord-integration-form.tsx:150-160`, `components/admin/prompts/prompt-template-editor.tsx:557-563`, `components/admin/users/users-stats-summary.tsx:24-49`, `components/admin/users/users-filter.tsx:67`, `components/setup/setup-wizard/wizard-form-actions.tsx:18-26`, `:54`, `components/auth/service-sign-in-toggle.tsx:35-37`, `components/dashboard/wrapped-card.tsx:270-275`, `components/onboarding/onboarding-steps/discord-support-step.tsx:145`, `:179-185`, `app/auth/denied/denied-client.tsx:181-182`, `components/admin/invites/invites-page-client.tsx:235-238`, `app/admin/prompts/page.tsx:32-36`, `app/admin/shares/page.tsx:184-196`, `app/admin/users/[userId]/page.tsx:238-243`, `components/admin/users/regenerate-wrapped-button.tsx:139-212`, `components/auth/jellyfin-sign-in-form.tsx:134`
- **Evidence:**
  - **Adoption** (full table under Metrics). Repo-wide outside `components/ui`: Button 65 vs 93 raw `<button>` in 48 files plus 33 `<Link>`s styled as buttons; Card 4 vs 162 hand-copied surfaces; LoadingSpinner 2 vs 32-34 inline spinner SVGs in 26 files; Switch 1 vs 4 hand-rolled toggles; StyledCheckbox 4 vs 7 raw checkboxes; StyledInput 66 vs 17 raw inputs. Admin alone: 66 raw buttons vs 42 `<Button>`, plus 20 Links styled as buttons. User-facing scope: 19 raw vs 20 `<Button>`.
  - **Missing features force hand-rolling.** Button has no `asChild`/link form, no `loading` prop and no icon size (`button.tsx:14-45`), so every link CTA and saving state is hand-rolled. Switch already has a loading prop (`switch.tsx:15`). Even `Pagination` uses a raw `<select>` (`pagination.tsx:50`).
  - **Toggles.** The four hand-rolled toggles turn green-500, amber-500 (`sync-settings-card.tsx:214`) or red-600 (`llm-settings.tsx:89`) when on. The setup Discord toggle uses `aria-pressed` instead of `role="switch"` (`discord-integration-form.tsx:150-160`). `llm-toggle.tsx:38-46` pairs `checked={llmDisabled}` with `aria-checked={!llmDisabled}` on a native checkbox, so the visible red "on" state means the LLM is off and assistive tech gets the opposite. `watchlist-sync-settings.tsx:161` and `sync-settings-card.tsx:219` flip `aria-label` between Enable and Disable while also exposing `aria-checked`. There are three separate LLM on/off controls: `llm-toggle.tsx` (footer), `LLMToggle.tsx` (a Button on the settings page) and the inline switch in `llm-settings.tsx:83`.
  - **Native controls.** The prompt editor's raw checkbox renders OS blue (`prompt-template-editor.tsx:557-563`; `admin-prompt-edit--desktop.png`).
  - **Onboarding alone has four primary-button looks and two Back styles.** "Let's Go" gradient; "Got it"/"Next" via `<Button>`; solid indigo "Next" and "Open Portal" (`discord-support-step.tsx:145`, `:179-185`); "Go to Dashboard" at lg size. Back is ghost text on step 4 and a filled slate button on step 5 (`user-onboarding-04-discord-support--desktop.png` vs `user-onboarding-05-final--desktop.png`).
  - **Deliberately different CTAs.** The setup wizard keeps its own 3-stop gradient on purpose (doc comment at `wizard-form-actions.tsx:18-26`, button at `:54`).
  - **Admin primary actions use six fills:** gradient, cyan-600, cyan-700, purple-600, red-600 and slate-700 (gradient Link at `prompts/page.tsx:32-36`, cyan-600 at `users/[userId]/page.tsx:238-243`, slate-700 on shares). On user detail, Regenerate is a purple icon square next to a labelled cyan "View" button. It has an `aria-label`, so it is unlabelled visually only (`regenerate-wrapped-button.tsx:139-212`; `admin-user-detail--desktop.png`).
  - **White halo.** Button uses `focus:outline-none focus:ring-2 focus:ring-offset-2` with no offset color (`button.tsx:17`). Tailwind v4's default offset color is white, and `focus:` also fires on mouse click, so a clicked button on a dark panel gets a white 2px halo. Keyboard users do still get a ring.
  - Nothing enforces the primitives: there is no lint rule or shared wrapper.
- **Impact:** this is the main reason the app doesn't feel consistent, modern and clean. The same control looks and behaves differently page to page, fixes made in a primitive (focus, contrast, sizes) don't reach most of the UI, and every visual refresh has to be repeated in dozens of files.
- **Recommendation:**
  - **Button:** extend it with `asChild` or a `ButtonLink` (wrapping `next/link`), a `loading` prop that renders `LoadingSpinner`, an icon size, and a small set of intents: primary, secondary, ghost, outline, danger, danger-ghost and link. Rewind variants come from the Rewind theme tokens. Use `focus-visible:` with a token ring-offset color. Export `buttonVariants()`, and add `IconButton` (required `aria-label`, optional tooltip). Use a plain variant map with `cn()`, or add class-variance-authority, which is not installed.
  - **Every CTA** uses Button, including `WizardFormActions`; drop the "intentionally different" gradient.
  - **One Switch everywhere** with a stable label. Collapse the three LLM toggles into one Switch-based component whose checked state means "LLM enabled".
  - **Card and Badge:** extend Card's existing `padding` prop with tone variants, and add Badge tones (UI-22). Replace raw checkboxes, inputs and selects (including Pagination's) with the primitives, and inline spinners with `LoadingSpinner`.
  - **Enforcement:** add a v4-aware lint rule. `eslint-plugin-tailwindcss`'s stable releases target Tailwind v3, and this repo uses `tailwindcss ^4.3`, so use `eslint-plugin-better-tailwindcss` or the v4 beta. Add a `no-restricted-syntax` regex that bans raw fills such as `bg-(cyan|purple|red)-[67]00` on `<button>`/`<Link>` classNames outside `components/ui`.
- **Effort:** L

#### UI-18: No theme foundation: no semantic tokens, no body canvas, no dark color-scheme, and `<body>` is the scroll container

- **Severity:** Medium
- **Status:** adjusted (DS-01, DS-09, UX-08). The DS-01 verifier rated the token gap medium on its own user impact: it enables the refresh rather than being a defect users hit, and its visible result is UI-16.
- **Sources:** DS-01, DS-09, UX-08
- **Where:** `app/globals.css:1-32`, `app/layout.tsx:28-33`, `components/ui/card.tsx:32`, `components/ui/button.tsx:21`, `components/dashboard/plex-link-card.tsx:15`, `components/admin/cost-analysis/cost-trend-chart.tsx:81`, `app/(app)/layout.tsx:55`, `components/dashboard/user-dashboard.tsx:57`, `components/subscription/subscription-banners.tsx:35-36`, `components/ui/alert.tsx:22-25`, `components/admin/cost-analysis/cost-date-filter.tsx:62`
- **Evidence:**
  - **Tokens.** The `@theme` block (`globals.css:17-32`) holds only 6 animation tokens and 6 Wrapped v2 colors (stage, stage-panel, gold, gold-bright, ivory, taupe). There is no background, foreground, card, popover, muted, primary, secondary, accent, destructive, success, warning, border, input, ring, radius, shadow or z-index token.
  - **Raw palette everywhere.** 2,031-2,050 slate utilities in 192 files; 14 accent hues; 146-147 `bg-gradient-to-*` in 69 files with 44 distinct combinations; 193 hex literals in 23 files (the 14 chart files repeat `#94a3b8` ×32 and `#1e293b` ×15); 67 `rgb()/rgba()` literals; 47 arbitrary color classes (`plex-link-card.tsx:15` uses `[#e5a00d]`, `[#1f1f1f]`, `[#282828]`); 172 arbitrary values; 7 radius steps; z-index from z-10 to z-[10000]; `backdrop-blur` ×170, mostly on near-opaque cards over flat backgrounds. The canonical surface string lives in Card (`card.tsx:32`) and is copied by hand 162 times.
  - **Bare document shell.** `<html lang="en"><body>` carry no classes (`layout.tsx:28-33`). At runtime `colorScheme` is "normal" and the body background is `rgba(0,0,0,0)`. Every page paints its own canvas: `bg-slate-950` ×10, the slate gradient ×9-12, `bg-slate-900` ×4.
  - **Unreadable banners (code-derived, not captured).** `SubscriptionBanners` mounts above the dashboard's background div (`(app)/layout.tsx:55`, `user-dashboard.tsx:57`). Its Alert tones put `text-red-100` on `bg-red-500/10` (`alert.tsx:22-25`) over the white body, so past-due subscribers effectively can't read the payment-failed banner.
  - **Native controls in light mode.** Because `color-scheme` isn't dark: the date-input calendar glyph is low-contrast on dark fields (`admin-cost-analysis--desktop.png`, `admin-discord--desktop.png`), the prompt editor checkbox is OS blue, and scrollbars are light.
  - **Body is the scroll container.** `html, body { height:100%; overflow-x:hidden }` (`globals.css:4-8`) makes `<body>` the scroller. `window.scrollTo`, scroll restoration and iOS tap-status-bar-to-top therefore don't work, and plain full-page screenshots come out blank below the first viewport. App Router scroll-to-top still works, because Next falls back to `scrollIntoView`.
- **Impact:** a UI refresh can't be done by changing a theme. Every one of the 192 slate-using files needs a hand edit, and drift returns with each new screen. A distinct Rewind 2026 theme can't be scoped cleanly. Separately, the past-due banner is unreadable, native controls render in light mode, and scrolling misbehaves in subtle ways.
- **Recommendation:** plan this as the foundation phase that UI-12, UI-16 and UI-17 build on.
  1. Quick fix (S): give `<body>` the app canvas (`min-h-dvh bg-background text-foreground antialiased`). Set `color-scheme: dark` and `accent-color` on `:root`. Remove `height:100%` and `overflow-x:hidden` from `html` (keep `overflow-x: clip` on body if needed), then regression-check pages that use `fixed inset-0` or `h-full`. Don't add `className="dark"`: Tailwind v4's `dark:` variant is media-based unless a `@custom-variant` is declared.
  2. Define semantic `@theme` tokens: background, surface, surface-raised, border, foreground, muted-foreground, accent/primary, ring, danger/warning/success, radius, shadow, z-index and motion. Add a scoped `[data-theme=rewind]` override built on the cinematic tokens.
  3. Codemod raw palette classes to tokens, delete the per-route canvases, and enforce with the lint rules from UI-17.
  4. Track `not-found.tsx` and `global-error.tsx` under UI-19, and fonts under UI-20.
- **Effort:** L

#### UI-19: Six different error and status screen designs, dead ends, and an admin auth gate that relies on error names production strips

- **Severity:** Medium
- **Status:** adjusted (DS-10, UX-04, ADM-07). The verifiers found the production behavior and raised the effort to M.
- **Sources:** DS-10, UX-04, ADM-07
- **Where:** `app/admin/layout.tsx:12`, `lib/admin.ts:30-41`, `app/error.tsx:15-34`, `components/admin/shared/unauthenticated-error.tsx:3-18`, `components/admin/shared/unauthorized-error.tsx:30`, `:39-45`, `:59-63`, `app/admin/error.tsx:11`, `:43-58`, `components/ui/error-state.tsx:47`, `:50-55`, `app/auth/denied/denied-client.tsx:166`, `:180-197`, `app/auth/callback/plex/callback-client.tsx:90`, `:216`, `:245`, `app/invite/[code]/page.tsx:117-124`, `:207`, `:216`, `app/subscribe/page.tsx:36`, `app/(app)/wrapped/error.tsx:13`, `app/admin/discord/page.tsx:71-75`, `:140`, `components/admin/playground/wrapped-playground.tsx:72-92`, `components/admin/invites/invite-details-client.tsx:46-47`
- **Evidence:**
  - **Six designs in the screenshots, plus a seventh in code:**
    1. Next's default white 404, because there is no `app/not-found.tsx` or `app/global-error.tsx` (`public-404--desktop.png`, `public-wrapped-share-unknown--desktop.png`).
    2. A bouncing Rex and a bare "401" with no text or action (`unauthenticated-error.tsx:3-18`; `public-admin-unauthenticated--desktop.png`). `app/admin/error.tsx:43-58` has the same layout with "500", ignores `reset` (`reset: _reset`, `:11`), and offers no message, retry or navigation.
    3. Rex with "Access Denied", an "Oops!" title and a cyan-purple-pink pill with `hover:scale-105` (`unauthorized-error.tsx:30`, `:39-45`; `user-admin-access-denied--desktop.png`).
    4. A red-bordered "Access Denied" card with 50 animated particles, a hand-rolled red "Try Again" Link and a slate "Return Home" Button, both going to `/`. Its copy says "Plex server" to every user (`denied-client.tsx:166`, `:180-197`; `public-auth-denied--desktop.png`).
    5. An "Authentication Error" card that shows raw developer strings, "No PIN ID received from Plex" (`callback-client.tsx:90`) or `err.message` (`:216`), with a cyan-purple button (`public-auth-callback-no-pin--desktop.png`).
    6. A plain "Subscription required" page with a cyan text link (`subscribe/page.tsx:36`; `user-subscribe--desktop.png`).
    7. The `ErrorState` primitive, which shows `error?.message` to users (`error-state.tsx:47`) and uses an amber `rounded-full` button with black text (`:50-55`) that matches nothing else.
  - **Invite errors.** The invite page titles every error, including sign-in failures, "Invalid Invite" (`invite/[code]/page.tsx:117`, fed from `:207` and `:216`).
  - **Canvas drift.** Route-level error and loading wrappers alternate between `bg-slate-950` and the slate gradient.
  - **Production behavior.** `requireAdmin()` throws `UnauthenticatedError`/`UnauthorizedAdminError` from the admin layout (`layout.tsx:12`, `lib/admin.ts:30-41`). Errors thrown in a segment's layout skip that segment's `error.tsx` and reach `app/error.tsx`, which matches on `error.name` and `error.message` (`:15-34`). Production builds replace Server Component errors with a generic message plus a digest, so these checks never match. Signed-out and non-admin `/admin` visitors in production would get `ErrorState` with Next's "omitted in production builds" text and a "Try again" button that throws again. `proxy.ts` does no auth redirect. Access is still denied, so this is a UX dead end, not a security hole.
  - **Silent data failures.** Discord page actions that fail are mapped to null and rendered as 0 through `?? 0` (`discord/page.tsx:71-75`, `:140`). The "Success Rate 0.0%" in `admin-discord--desktop.png` is a real zero, but the failure path renders the same thing. Playground failures show only a disappearing toast and leave both buttons at "Waiting for statistics…" (`wrapped-playground.tsx:72-92`; `admin-playground--desktop.png`; capture failure 6). Invite details sends the admin back to the list on any failure, without a message (`invite-details-client.tsx:46-47`).
- **Impact:** users who hit an error, a denial or a gate see a different product each time. Signed-out admins aren't sent to sign in, unexpected errors are dead ends, copy leaks implementation details, and admins can't tell a real zero from a failed load.
- **Recommendation:**
  - Build `components/ui/status-screen.tsx` (icon or illustration, title, description, primary and secondary actions). Route `not-found.tsx`, `global-error.tsx`, `error.tsx`, `app/admin/error.tsx` (with `reset` and a "Back to Overview" link), auth denied, the callback errors, the subscription gate and the invite states through it. Make `ErrorState` and `LoadingScreen` thin wrappers.
  - Stop signalling auth through thrown errors. In the admin layout, `redirect('/?callbackUrl=/admin')` when there is no session, and render the 403 StatusScreen directly for non-admins, or use Next's `forbidden()`/`unauthorized()` with `forbidden.tsx`/`unauthorized.tsx` behind `experimental.authInterrupts`. Then drop the error-name matching in `app/error.tsx`.
  - Map known error codes to user copy, and never render `error.message`.
  - Add a `SectionError` for per-panel load failures, and render "—" instead of 0 when a load fails.
  - Verify with a production build (`next build && next start`).
- **Effort:** M

#### UI-20: Typography: no loaded fonts, an OS-dependent serif for Rewind, 15 different h1 styles, and sub-12px text

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** DS-15
- **Where:** `app/layout.tsx:28-33`, `components/wrapped/cinematic/theme.ts:20`, `components/ui/styled-dropdown.tsx:57`, `components/shared/admin-footer-client.tsx:107`, `components/admin/wrapped/historical-wrapped-selector.tsx`, `app/api/wrapped/og-image/route.tsx`
- **Evidence:**
  - **No fonts loaded.** There is no `next/font` import anywhere; the runtime body font is `ui-sans-serif, system-ui, sans-serif`.
  - **OS-dependent Rewind face.** The cinematic `DISPLAY_CLASS` is `font-serif uppercase tracking-[0.12em] text-ivory` (`theme.ts:20`; 11-12 `font-serif` uses), which resolves to the viewer's OS serif: New York, Georgia/Cambria, or DejaVu/Noto. The OG and share-card route sets only `fontSize` and `fontWeight` and loads no font, so they render in the ImageResponse default sans and never match the viewer.
  - **Headings.** 38 h1s use about 15 distinct className strings; 14 are identical copies of `text-2xl sm:text-3xl font-bold text-white mb-2`.
  - **Small text.** `text-[10px]` ×21 in 13 files (chat window, historical selector, admin footer, StyledDropdown sm, and five Rewind slides), `text-[9px]` ×1, `text-[11px]` ×2, `text-xs` ×549.
  - **Letter-spacing.** 7 arbitrary `tracking-[…em]` values, from 0.12em to 0.4em.
- **Impact:** brand typography is uncontrolled, especially in Rewind, where type is the main visual element. Headings have inconsistent hierarchy, and 9-10px labels are hard to read.
- **Recommendation:**
  1. Load fonts with `next/font` in `app/layout.tsx` and expose `--font-sans`, `--font-display` and `--font-mono` in `@theme`: for example Inter or Geist for UI, a display serif for Rewind (Fraunces, Playfair Display or Cormorant), and Geist Mono or JetBrains Mono for code. Load the same font files in the OG and share-card route.
  2. Define a type scale (display, h1, h2, h3, body, small, caption) as `@utility` classes or tokens, used through PageHeader and SectionHeader (UI-21).
  3. Set a 12px floor (`text-xs`).
  4. Replace the arbitrary tracking values with 2-3 tokens (eyebrow, display, caps).
- **Effort:** S (fonts and tokens; applying the type scale depends on UI-21)

#### UI-21: No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav

- **Severity:** Medium
- **Status:** adjusted (ADM-02; the verifier noted most of the 20 admin content pages already share one pattern, and named the outliers)
- **Sources:** ADM-02, DS-11 (PageHeader part)
- **Where:** `app/admin/users/page.tsx:17-22`, `app/admin/announcements/page.tsx:11`, `app/admin/prompts/new/page.tsx:33`, `app/admin/prompts/[promptId]/edit/page.tsx:45`, `components/admin/invites/invites-page-client.tsx:232`, `components/admin/invites/invite-details-client.tsx:106`, `:113`, `components/admin/announcements/announcements-page-client.tsx:155`, `app/admin/users/[userId]/page.tsx:41-47`, `app/admin/users/[userId]/wrapped/page.tsx:27`, `:32-52`, `:72`, `:92`, `app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx:23-25`, `:92-94`, `app/admin/llm-usage/page.tsx:89`, `components/admin/shared/admin-layout-shell.tsx:30`, `components/admin/users/import-plex-users-button.tsx:43`, `components/admin/prompts/prompt-template-actions.tsx:74`
- **Evidence:**
  - **Shared but hand-copied.** Most of the 20 admin content pages repeat `<div className="p-4 sm:p-6"><div className="max-w-7xl mx-auto">` with a `text-2xl sm:text-3xl font-bold` h1 (users, settings, discord, queues, cost-analysis, the three llm-usage pages, prompts and prompt detail, shares, playground). Across the app, 14 h1s copy `text-2xl sm:text-3xl font-bold text-white mb-2`.
  - **Width jumps.** Announcements and the conversation page use `max-w-5xl`, so the content's left edge moves between pages (x≈336 in `admin-announcements--desktop.png` vs x≈280 in `admin-invites--desktop.png`).
  - **Four h1 styles:** the shared one; gradient `text-3xl sm:text-4xl bg-clip-text text-transparent` (prompts/new `:33`, edit `:45`); plain `text-2xl` in three client components (invites, invite details, announcements); and `text-xl` on the two immersive pages.
  - **Three back-link forms:** "← Back to Users" text (`users/[userId]/page.tsx:41-46`), an icon-only arrow (`invite-details-client.tsx:106`), and an icon-only chevron Link with no accessible name (`wrapped/page.tsx:32-50`).
  - **Five header-action styles:** gradient Button (`import-plex-users-button.tsx:43`), raw cyan-700 button (`invites-page-client.tsx:235-238`), gradient Link "+ New Template" (`prompts/page.tsx:32-36`), cyan-600 Edit next to purple-600 Playground (`prompt-template-actions.tsx:74`), and a red-tinted Delete.
  - **Titles don't match the nav:** LLM Usage is "LLM Requests" (`llm-usage/page.tsx:89`), Discord Bot is "Discord Bot Dashboard", Job Queues is "Job Queue Dashboard", Playground is "Wrapped Playground". The user detail h1 is the generic "User Details", not the user's name (`:47`).
  - **Immersive pages.** `AdminHeader` is defined inside render (`wrapped/page.tsx:27`); the history page copies its header twice (`:25`, `:94`). Both nest a `<main>` inside the shell's `<main>` (`admin-layout-shell.tsx:30`).
- **Impact:** the admin area looks assembled from different eras, every new page invents its own header, and the refresh can't be applied in one place.
- **Recommendation:**
  - Add `components/admin/shared/admin-page.tsx` (title, description, breadcrumbs, actions, back link with `aria-label`, one max width) and an `AdminImmersiveHeader`, both built on a `PageHeader` in `components/ui` that member pages can also use.
  - Most pages only need their wrapper and h1 block swapped. The real restyle work is in prompts/new and edit, the three client-component headers (invites, invite detail, announcements) and the two immersive routes.
  - Take titles from the nav config (UI-32), use the user's name on user detail, and change the nested `<main>` to `<div>`/`<section>`.
- **Effort:** M

#### UI-22: Surfaces, stat tiles, badges and empty states are hand-copied (95 admin panel copies), and KPI tiles stack one per row on mobile

- **Severity:** Medium
- **Status:** adjusted (ADM-14; Card has more importers than reported, and it already has a `padding` prop to extend). DS-11's StatTile and EmptyState parts were adjusted on effort only.
- **Sources:** ADM-14, DS-11 (StatTile and EmptyState parts), DS-13 (stat-stack part)
- **Where:** `components/ui/card.tsx:21-44`, `components/ui/badge.tsx`, `components/admin/users/users-stats-summary.tsx:23-59`, `app/admin/users/[userId]/page.tsx:202-226`, `app/admin/shares/page.tsx:32-69`, `app/admin/llm-usage/page.tsx:146-183`, `app/admin/cost-analysis/page.tsx:76-135`, `app/admin/discord/page.tsx:127-157`, `components/admin/queues/queue-stats.tsx:45-57`, `components/admin/playground/cost-display.tsx`, `components/admin/users/user-table-row.tsx:101-124`, `components/admin/announcements/announcement-list-item.tsx:34-52`, `components/admin/invites/invites-page-client.tsx:255-261`, `:288-292`, `app/admin/settings/page.tsx:11-52`, `components/admin/users/users-list.tsx:95`
- **Evidence:**
  - **Panels.** The canonical panel class `bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg` is copied 95 times across 25 admin files, and 162 times in 53 files repo-wide. Card's own JSDoc says it replaces that string (`card.tsx:21`). Card is imported by `subscribe/plan-list.tsx`, `subscription/subscription-status-view.tsx` and the dead `settings/llm-settings.tsx`, so in admin its only importer is dead code.
  - **Stat tiles** are rebuilt in at least seven places (the cited users summary, user detail, shares, LLM usage, cost analysis, Discord, queue stats and playground cost display), about 30 copies in all. Values switch between `text-2xl` and `text-3xl`, and colors carry no fixed meaning: green marks cost, visits, completed and success; purple marks projection, models and average visits.
  - **Mobile stacking.** Grids like `grid-cols-1 md:grid-cols-2 lg:grid-cols-6` put every tile full width on phones: Cost Analysis shows 7 stacked tiles before its first chart (`admin-cost-analysis--mobile.png`), and the users page ends with 6, about 650px (`admin-users-filter-all--mobile.png`).
  - **Badges.** `ui/badge.tsx` has 3 uses against 15+ hand-rolled pills in 10 files. `user-table-row.tsx` imports Badge yet hand-rolls its Admin/User and Yes/No pills (`:101-124`). Settings defines its own `StatusBadge` and `toneClasses` (`settings/page.tsx:11-52`), announcements their own status pills (`:34-52`), and invites their own server-type pill (`:288-292`).
  - **Empty states** are ad hoc in 37 files. `admin-discord--desktop.png` shows three treatments on one page: centered text, text flush to the card's bottom edge ("Help Command Usage"), and a header-only table with no rows and no message ("Commands by Type"). Elsewhere: a bare "No users found" row (`users-list.tsx:95`), and an icon with copy on invites (`:255-261`) and queues.
- **Impact:** visual weight and color meaning change from page to page, mobile dashboards are mostly scrolling, and a token-level refresh can't reach all these copies.
- **Recommendation:**
  - Extend Card's existing `padding` API with variants (default, inset, interactive, danger), then codemod the 95/162 panel copies to `<Card>`.
  - Add `<StatTile label value hint trend tone>` and `<StatGrid>` (2 columns on mobile, 4 on desktop), with semantic tones (neutral, info, success, warning, danger) mapped to tokens, and money in one neutral emphasis.
  - Extend Badge with `variant="outline"` and status helpers (`subscriptionBadge`, `wrappedStatusBadge`, `serverTypeBadge`), and replace the local `StatusBadge`.
  - Add `components/ui/empty-state.tsx` (icon, title, description, action), and use it for empty tables and panels.
  - Build StatTile and EmptyState first (S each), then migrate page by page.
- **Effort:** M

#### UI-23: No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard

- **Severity:** Medium
- **Status:** adjusted (ADM-03; the verifier lowered it from high for a small admin audience, corrected file locations, and found the keyboard problem worse than reported). DS-11's table part was adjusted on effort.
- **Sources:** ADM-03, DS-11 (DataTable part), DS-13 (clipped tables part)
- **Where:** `components/admin/users/users-list.tsx:77-111`, `components/admin/users/user-table-row.tsx:60`, `:66-70`, `components/admin/users/user-actions-menu.tsx`, `app/admin/users/[userId]/page.tsx:262-342`, `components/admin/invites/invites-page-client.tsx:265-346`, `:269-273`, `app/admin/shares/page.tsx:97-203`, `:109-113`, `app/admin/llm-usage/page.tsx:18-83`, `:188-317`, `:331`, `:339`, `app/admin/cost-analysis/page.tsx:183-251`, `app/admin/prompts/page.tsx`, `components/ui/pagination.tsx:50`, `components/admin/users/user-activity-timeline.tsx:240`, `components/admin/queues/job-table.tsx:276`, `components/admin/discord/discord-activity-table.tsx`
- **Evidence:**
  - **Hand-built tables.** There are 16 `<table>` elements in 15 files, with 84 `<th>` and 0 `scope` attributes. Header padding comes in 5 variants (`px-4 py-3` ×37, `px-3 sm:px-6 py-3` ×31, `px-2 py-2`, `px-6 py-3`, `px-6 py-4`). None sorts.
  - **No search or paging on the landing page.** The users list has no search and no pagination.
  - **Three pagination styles.** `ui/Pagination` is used once (`user-activity-timeline.tsx:240`) and contains a raw `<select>` (`pagination.tsx:50`). LLM usage hand-rolls Prev/Next Links. `job-table.tsx:276` shows "Page {page}" with no total.
  - **LLM usage bugs.** Its Prev/Next links drop `conversationId` (`llm-usage/page.tsx:331`, `:339`; only hand-typed URLs carry it today). It groups conversations after paginating (`:18-83`), which can split a conversation across a page boundary, while "Showing X to Y of N results" counts ungrouped records.
  - **Mobile.** The users, LLM usage, prompts, conversation and user-detail tables scroll sideways inside 22 `overflow-x-auto` wrappers, cutting headers ("JOINE" in `admin-users--mobile.png`) and pushing actions off-screen: Subscription, Cost, Joined and the ⋮ menu in `admin-users-filter-all--mobile.png`, "View" in `admin-prompts--mobile.png`, truncated Context in `admin-llm-usage--mobile.png`. Invites and shares hide low-priority columns instead (`invites-page-client.tsx:269-273`, `shares/page.tsx:109-113`), so there are two strategies.
  - **Keyboard block.** Users rows navigate through `<tr onClick>` (`user-table-row.tsx:66-70`), and names are not links. The ⋮ menu offers "View Wrapped" but no "View details", and the only route to `/admin/users/[id]` anywhere is `router.push` in the row handler (`:60`). Keyboard users cannot reach user detail at all.
- **Impact:** admins can't find a user by name or sort by cost or join date, mobile admins have to scroll sideways to reach row actions, and keyboard users can't open a user.
- **Recommendation:**
  1. Quick win (S), fast-tracked: make the name/avatar cell a real `<Link href="/admin/users/[id]">`, keep the row click as an enhancement, and add "View details" to the ⋮ menu.
  2. Build a plain styled `<Table>` primitive with `scope="col"`, one header padding, and a responsive wrapper with a stacked card mode on mobile. Use EmptyState (UI-22) for empty bodies.
  3. Add `@tanstack/react-table`, a new dependency, only for the tables that need sorting, search or pagination (users, LLM usage, shares). TanStack Query being in the project does not justify it on its own.
  4. Replace Pagination's raw select with StyledDropdown or the rebuilt Select from UI-14, not the deprecated StyledSelect.
  5. In LLM usage, group by conversation in the query before paginating, and keep all `searchParams` in page links.
- **Effort:** L

#### UI-24: Charts: 14 files each register Chart.js and hard-code their own theme; no accessible names, repeated tick labels, invented curves, UTC date shifts and an inflated cost projection

- **Severity:** Medium
- **Status:** confirmed (DS-16, ADM-12)
- **Sources:** DS-16, ADM-12
- **Where:** `components/admin/cost-analysis/cost-trend-chart.tsx:15-22`, `:46-64`, `:81`, `:135`, `components/admin/cost-analysis/cost-model-chart.tsx:63-128`, `:105`, `components/admin/cost-analysis/cost-user-chart.tsx:105`, `components/admin/shares/share-time-chart.tsx:42`, `components/admin/discord/discord-trend-chart.tsx:15`, `components/admin/discord/discord-linking-metrics.tsx`, `components/wrapped/wrapped-charts.tsx:17`, `app/admin/cost-analysis/page.tsx:29-37`, `:131`, `lib/wrapped/usage.ts:151`, `:163-167`
- **Evidence:**
  - **Duplicated setup.** `ChartJS.register` appears once in each of 14 files (8 Discord, 4 cost-analysis, shares and Wrapped), and each re-declares tooltip, grid and tick styling as hex: `#94a3b8` ×32, and `#e2e8f0`, `#cbd5e1`, `#475569`, `#1e293b` ×15 each. Series colors are picked per file (`#22c55e`, `#22d3ee`, `#a855f7`, `#f59e0b`, `#ec4899` and so on). `admin-cost-analysis--desktop.png` shows a green line, a green donut, full-green "Cost by Model" bars and full-purple "Cost by User" bars. Repeated registration is idempotent, so that part is maintenance, not a bug.
  - **No accessible names.** axe reports `role-img-alt` (serious) ×4 on `/admin/cost-analysis`.
  - **Repeated ticks.** Currency ticks use `toFixed(2)` (`cost-trend-chart.tsx:135`; `cost-model-chart.tsx:105` and `cost-user-chart.tsx:105`), so the y-axis reads "$0.03, $0.03 … $0.01, $0.01, $0.01". gpt-4o-mini's $0.0008 is a thin sliver, and Top Models shows "$0.00".
  - **Invented curve.** The trend line uses `tension: 0.4` over category labels for only the days that had usage (`:46-64`). The empty days Oct 13-14 disappear, and the curve invents a bump between Oct 15 and 16. `fill: true` does nothing on a direct load, because Filler is registered only in `discord-linking-metrics.tsx` (`cost-trend-chart.tsx:15-22`).
  - **UTC date shift.** `byDate` is bucketed by UTC ISO date (`usage.ts:151`), then parsed with `new Date('YYYY-MM-DD')`, which is UTC midnight, so labels move back a day in US time zones (`cost-trend-chart.tsx:48`, `share-time-chart.tsx:42`, `cost-analysis/page.tsx:131`).
  - **Inflated projection.** Projections divide by days that had usage, not calendar days (`page.tsx:29-37`, over `byDate` sorted descending in `usage.ts:163-167`). The seeded $0.0874 over 4 active days becomes "$0.66 / 30 days" and "$7.98 / year", while the calendar run-rate is about $0.09 per 30 days.
  - **Wasted panel.** A single-provider donut fills a whole panel.
- **Impact:** cost charts overstate projected spend about sevenfold for light usage, which matters most for Rewind's once-a-year burst. They also mislabel dates for US admins, give screen-reader users nothing, and drift from the rest of the UI and the Rewind theme.
- **Recommendation:**
  - Create `lib/charts/theme.ts`: register Chart.js once, read CSS custom properties (`--color-chart-1..6`, `--color-muted-foreground`, `--color-border`, `--color-popover`) through `getComputedStyle`, and export base options for line, bar and doughnut charts.
  - Use a validated categorical palette (the dataviz skill's palette method), and format currency ticks adaptively (`Intl.NumberFormat` with `maximumSignificantDigits`).
  - Add a `<ChartCard title description summary>` that sets `role="img"` and an `aria-label` on the canvas and offers a toggleable or sr-only data table.
  - Use a time scale with zero-filled days (or bars for daily cost), `tension: 0`, and local date parsing.
  - Compute projections as the sum divided by calendar days in the chosen window, and state the method in the tile hint.
  - Replace a donut with fewer than 2 categories by a stat or a ranked bar list.
  - Make Rewind charts consume the Rewind tokens through the same module.
- **Effort:** M

#### UI-25: Announcements: Markdown lists lose their bullets, the list is clipped in a hidden scroll box, "NEW" is permanent, and the admin list shows raw Markdown with no preview

- **Severity:** Medium
- **Status:** confirmed (UX-18, DS-19); adjusted (ADM-21: the eye toggle has an `aria-label`, so it is only visually ambiguous, and there is no "Scheduled" state)
- **Sources:** UX-18, DS-19, ADM-21
- **Where:** `components/dashboard/announcements-card.tsx:59-65`, `:78`, `:97-98`, `app/globals.css:1`, `package.json:65`, `components/admin/chatbot/chat-window.tsx:182-185`, `components/admin/announcements/announcement-list-item.tsx:34-52`, `:54-56`, `:65-83`, `components/admin/announcements/announcement-form-modal.tsx:80-83`, `prisma/schema.prisma:582-595`
- **Evidence:**
  ```tsx
  // components/dashboard/announcements-card.tsx:97
  className="prose prose-sm prose-invert … prose-ul:my-1 prose-li:my-0.5 prose-a:text-amber-400"
  ```
  - **No bullets.** `@tailwindcss/typography` is not in `package.json` or `node_modules/@tailwindcss`, and `globals.css` has only `@import "tailwindcss";` with no `@plugin`, so every `prose` class is a no-op and preflight strips list styles. "New cinematic slides" and "Shareable cards" render as plain lines (`user-home--desktop.png`; capture failure 8). This card is the only `prose` consumer; the chat window avoids the problem with hand-mapped `ul`/`ol` components (`chat-window.tsx:182-185`).
  - **Hidden clipping.** The list is capped at `max-h-48 sm:max-h-56 overflow-y-auto` with no fade or "show all" (`:78`). The second announcement is cut mid-sentence on mobile (`user-home--mobile.png`), and its date is cut off at 224px on desktop. axe flags the region as not keyboard-focusable (`scrollable-region-focusable`, serious, on `/`).
  - **Permanent NEW.** The pinging "NEW" badge is unconditional, with no read state (`:59-65`).
  - **Raw Markdown in admin.** The admin list prints content as plain text with `whitespace-pre-wrap line-clamp-3`, so admins see `**December 1st**` and `- New cinematic slides…` (`announcement-list-item.tsx:54-56`; `admin-announcements--desktop.png`). The form says "Content (Markdown supported)" but has no preview (`announcement-form-modal.tsx:80-83`).
  - **Visibility toggle.** It is an eye/eye-off icon button that can read visually as either the current state or the action. It has `title` and `aria-label` "Deactivate"/"Activate" (`:65-83`). `components/ui/switch.tsx` isn't used. Status pills are hand-written spans rather than Badge (`:34-52`). The Announcement model has only `isActive` and `expiresAt` (`schema.prisma:582-595`).
- **Impact:** admin-authored formatting is lost, content is silently truncated on phones, a permanent "NEW" teaches users to ignore it, and admins publish notices without seeing how they will render.
- **Recommendation:**
  - Create one shared `components/ui/markdown.tsx` wrapping react-markdown with token-styled `components` overrides for `ul`/`ol`/`li`/`a`/`strong`/`p`, or add `@tailwindcss/typography` with `@plugin "@tailwindcss/typography";` and theme `--tw-prose-invert-*` through tokens. Reuse it in the home card, the chat window, a clamped preview in the admin list, and a Write/Preview toggle in the form.
  - On home, show the latest 2-3 items plus a "View all announcements" disclosure or page, and show "NEW" only for items newer than the user's last-seen timestamp, stored per user.
  - Replace the eye icon with the Switch primitive, labelled "Visible on home page", and the status pills with Badge tones: neutral (Inactive), danger (Expired), success (Active), info (Priority). Don't add a "Scheduled" state unless a `startsAt` field is added.
- **Effort:** S

#### UI-26: The icon system is inline SVG copy-paste; lucide-react is installed but used once; `service-icons.tsx` is dead and points at missing files

- **Severity:** Low
- **Status:** adjusted (DS-14; lowered because the inline icons are almost all one family, Heroicons v1 outline, and axe flagged no SVG rule). ADM-15's icon part was confirmed.
- **Sources:** DS-14, ADM-15 (icons part)
- **Where:** `components/ui/pagination.tsx:3`, `components/ui/service-icons.tsx:5-38`, `components/admin/users/users-filter.tsx:56`, `components/ui/toast.tsx:112`, `components/ui/error-state.tsx:30`, `components/admin/shared/admin-nav.tsx:83`, `app/admin/settings/page.tsx:193`, `app/invite/[code]/page.tsx:156-159`, `components/dashboard/media-server-link-card.tsx:59`
- **Evidence:**
  - **lucide-react barely used.** `lucide-react` (^1.23.0) is imported only by `components/ui/pagination.tsx`.
  - **Copy-paste SVGs.** There are 243 inline `<svg>` in 82 files (246 in 85 by a later recount): 153 in admin and 79 in 36 user-facing files. They contain 115 distinct path strings, with the spinner ×33-34, check `M5 13l4 4L19 7` ×16, chevron-down ×8, close ×7 and warning triangle ×6. Sizes (w-3.5 to w-6) and stroke widths (2 or 3) vary.
  - **Accessibility.** Counting full opening tags, 33 of 243 SVGs carry `aria-hidden`, a role or a label; the rest (about 86%) are unhidden, including the toast, error-state and users-filter icons.
  - **Inconsistent brand marks.** The Discord logo appears with two different path strings (1,086 vs 2,072 characters; `admin-nav.tsx:83`, `settings/page.tsx:193`). The Plex mark is an outlined diamond on the invite page (`invite/[code]/page.tsx:156-159`) and a filled chevron on the home quick link (`media-server-link-card.tsx:59`). Admin settings draws its own per-service glyphs inline (`admin-settings--desktop.png`).
  - **Dead module.** `service-icons.tsx` has 0 importers and renders `<img src="/plex.ico">`, `/tautulli.ico`, `/radarr.ico` and `/sonarr.ico`, but `public/` contains only `icon.svg`.
- **Impact:** bundle size grows with duplicated markup, decorative icons can be exposed to assistive tech, brand marks differ between pages, and any icon refresh means editing 82 files.
- **Recommendation:**
  1. Standardize on lucide-react for UI glyphs through a wrapper, `<Icon icon={X} size="sm|md|lg" />`, that defaults to `aria-hidden` and accepts an optional label. Keep the map in `components/ui/icons.ts`.
  2. Replace the duplicated inline paths with a codemod.
  3. Rebuild `service-icons.tsx` (rather than adding a new file) as the brand-mark set, from simple-icons SVGs with brand color tokens: Plex, Jellyfin, Discord, Overseerr, Sonarr, Radarr, Tautulli and OpenAI.
  4. Keep Rex as an illustration component.
- **Effort:** M

#### UI-27: Primitive quality gaps: a white focus halo, `focus:` instead of `focus-visible:`, template-string classes, a deprecated export, and 9 of 18 primitives untested

- **Severity:** Low
- **Status:** adjusted (DS-18; the verifier found 9, not 3, primitives with tests, and ruled out the toast overflow claim)
- **Sources:** DS-18
- **Where:** `components/ui/button.tsx:17`, `components/ui/styled-dropdown.tsx:134`, `:150`, `components/ui/styled-checkbox.tsx:16`, `components/ui/styled-select.tsx:3`, `components/ui/error-state.tsx:50`, `components/ui/styled-input.tsx`, `components/ui/styled-textarea.tsx`
- **Evidence:**
  - **Focus.** Button uses `focus:outline-none focus:ring-2 focus:ring-offset-2` with no offset color. `--tw-ring-offset-color` defaults to `#fff` in Tailwind v4, so focus draws a white halo on dark backgrounds (capture `design-a11y/focus-button.png` in the scratchpad). Switch and the admin nav use `focus-visible` with `ring-offset-slate-900`, and the inputs use a 1px `focus:ring-1`: three focus treatments in one kit.
  - **Class merging.** StyledDropdown, StyledCheckbox and StyledSelect build `className` with template strings instead of `cn()` (`styled-dropdown.tsx:134`, `:150`; `styled-checkbox.tsx:16`), so caller overrides can't be merged.
  - **Leftovers.** StyledSelect is `@deprecated` but still exported (0 importers). ErrorState hard-codes an amber button instead of `<Button>` (`error-state.tsx:50`).
  - **Unneeded client components.** Button, StyledInput and StyledTextarea are marked `'use client'` without using hooks, which goes against CLAUDE.md.
  - **Tests.** 9 of 18 primitives have dedicated tests (pagination, styled-input, styled-textarea in `components/ui/__tests__`; switch, alert, error-state, styled-dropdown, loading-screen, loading-spinner in `components/__tests__`). The switch test covers `aria-checked`, `aria-busy` and Enter/Space; the dropdown test covers keyboard navigation. Untested: button, toast, badge, card, modal-shell, styled-checkbox and date-range-picker, plus the dead styled-select and service-icons.
- **Impact:** small, noticeable inconsistencies in focus and override behavior across the kit. With several primitives untested, refactoring them during the refresh is risky.
- **Recommendation:**
  - Switch every primitive to `focus-visible:` with a token ring-offset color.
  - Use `cn()` in all primitives, delete StyledSelect, and render ErrorState's action with `<Button>`.
  - Drop `'use client'` from Button, StyledInput and StyledTextarea where no hook is used.
  - Add Testing Library and jest-axe tests for the untested primitives, extend the existing switch and dropdown tests rather than rewriting them, and move all primitive tests into one location.
- **Effort:** S

#### UI-28: Money and dates are formatted ad hoc: four currency precisions and more than six date formats

- **Severity:** Low
- **Status:** adjusted (ADM-18; the 0 and 1 decimal hits are durations, not money; both displayed values are correct roundings, so this is polish)
- **Sources:** ADM-18
- **Where:** `components/admin/users/users-stats-summary.tsx:53`, `app/admin/cost-analysis/page.tsx:80`, `app/admin/llm-usage/page.tsx:169`, `:171`, `:235-241`, `components/admin/users/user-table-row.tsx:134-138`, `:168`, `components/admin/invites/invites-page-client.tsx:225`, `:319`, `components/admin/announcements/announcement-list-item.tsx:58`, `app/admin/users/[userId]/page.tsx:24-32`, `lib/utils/formatters.ts:69`
- **Evidence:**
  - **Currency.** Money is formatted with `` `$${n.toFixed(p)}` `` at about 33 sites, at precisions 2, 3, 4 and 6. The same total shows as $0.0874 on users and LLM usage (`users-stats-summary.tsx:53`, `llm-usage/page.tsx:169`) and $0.09 on Cost Analysis (`cost-analysis/page.tsx:80`). Per-user cost uses 3 decimals ($0.056), and the average reads "$0.017480 avg per request" (`:171`).
  - **Dates come in at least 6 formats:** "Oct 17, 24" with a two-digit year (`user-table-row.tsx:134-138`, `:168`); "10/17/2026", the browser default (`invites-page-client.tsx:225`, `:319`; `announcement-list-item.tsx:58`); "October 17, 2026 at 03:26 PM" (`users/[userId]/page.tsx:24-32`); "Oct 17, 2026, 02:26 PM" (`llm-usage/page.tsx:235-241`); and "10/17/2026, 3:26:49 PM" (invite usage, settings "Last Config Update").
  - **Unused helper.** `lib/utils/formatters.ts` already exports `formatDate` (`:69`), but admin pages never import it.
- **Impact:** the same number looks different on two pages, which erodes trust in the cost figures, and dates are hard to compare.
- **Recommendation:**
  - Add `lib/utils/format.ts` (or extend `formatters.ts`) with `formatCurrency(usd)`: 2 decimals at $1 and above, 2 significant digits below (e.g. $0.087, $0.0008).
  - Add `formatTokens`, `formatDate` and `formatDateTime` with one locale and timezone policy and a 4-digit year, plus a `<Time value relative>` component that shows the full timestamp in its `title`.
  - Add a lint rule that bans `.toFixed(` inside JSX template literals that begin with `$`.
- **Effort:** S

### 4. Navigation, information architecture and admin workflows

#### UI-29: No admin overview or Rewind generation console; bulk generation is unreachable, and stuck jobs can't be retried from the list

- **Severity:** Medium
- **Status:** adjusted (ADM-06). Mitigations: members generate their own Rewind from home, and the user detail page's Regenerate works whatever the status. Planning note: the existing bulk action can't simply be wired to a button.
- **Sources:** ADM-06
- **Where:** `app/admin/page.tsx:5`, `components/admin/users/user-management.tsx:17`, `actions/wrapped-generation.ts:401`, `:439-447`, `components/admin/users/user-actions-menu.tsx:152-154`, `components/admin/users/users-stats-summary.tsx:24-59`, `app/admin/users/[userId]/wrapped/page.tsx:126-157`, `app/admin/users/[userId]/page.tsx:245`
- **Evidence:**
  - **No overview.** `/admin` redirects to `/admin/users` (`page.tsx:5`). Generation status appears only as tiles under the users table (`users-stats-summary.tsx:24-59`).
  - **Bulk generation is unreachable.** `generateAllPlexWrapped` (`wrapped-generation.ts:401`) is called only from `user-management.tsx:17`, which nothing renders. It also loops `generatePlexWrapped` sequentially inside one server-action request (`:439-447`), so a button on it would time out on any real server.
  - **Stuck jobs.** The ⋮ menu offers Regenerate only for completed, failed or missing wrappeds (`user-actions-menu.tsx:152-154`), so a row stuck in "generating" (the seeded `audit-user-1`) can't be retried from the list. The detail page renders `RegenerateWrappedButton` whatever the status (`users/[userId]/page.tsx:245`).
  - **Scattered signals.** Failures are visible only one user at a time (`wrapped/page.tsx:126-157`). Service health, queue state and LLM spend are spread across four pages.
- **Impact:** at year end the admin can't start, track or repair the Rewind 2026 run in one place. They have to open users one at a time and can't recover stuck jobs from the list.
- **Recommendation:**
  - Add an Overview page (service health, queue state, Rewind progress, LLM spend this period) and a `/admin/rewind` console: generated / missing / failed / stuck counts, "Generate missing", "Retry failed", "Reset stuck", and per-user status.
  - Before adding the bulk actions, rewrite bulk generation as a BullMQ fan-out (one job per user, progress read from `PlexWrapped` status) instead of calling the sequential action.
  - "Reset stuck" marks "generating" rows older than N minutes as failed. Show Regenerate in the list menu for "generating" rows past that threshold.
  - Delete `user-management.tsx` (UI-45).
- **Effort:** L

#### UI-30: No member app shell: home, Rewind, Discord, membership and account are connected by no navigation

- **Severity:** Medium
- **Status:** adjusted (UX-06; part of the impact repeats UI-01 and UI-02, and a hub-and-cards home is reasonable for a product this small)
- **Sources:** UX-06
- **Where:** `components/dashboard/user-dashboard.tsx:59-79`, `:133-138`, `app/(app)/layout.tsx:54-58`, `app/(app)/wrapped/layout.tsx:1`, `components/admin/shared/admin-nav.tsx:285`
- **Evidence:**
  - **Bare header.** The member header contains only "Admin" (admins only) and a red "Sign Out" (`user-dashboard.tsx:59-79`), with no logo, avatar, account menu or nav (`user-home--desktop.png`, `user-home--mobile.png`).
  - **No chrome.** The `(app)` layout adds none (`layout.tsx:54-58`); the Rewind layout is a bare `<main>`.
  - **Hidden surfaces.** Membership appears only as a section at the bottom of home when a Stripe row exists (`:133-138`), and Discord only as a tile. Requests is an external Overseerr link, and there is no account page.
  - **Admin contrast.** The admin side has a full sidebar shell with "Back to Home" (`admin-nav.tsx:285`; `admin-users-filter-all--desktop.png`).
- **Impact:** member surfaces are reachable only through home, there is no identity or account affordance, and the two halves of the app feel like different products.
- **Recommendation:**
  - Add a lightweight shared member header (`components/shell/app-header.tsx`) used by the `(app)` layout, `/subscribe` and `/onboarding`. It shows the server logo and name linking home, a Rewind link, and an avatar menu with Membership (when a Stripe row exists), Discord (link or unlink, UI-01), Admin (admins only) and Sign out.
  - Skip a mobile bottom bar for 2-3 destinations, and don't add an account page unless there is content for it.
  - Give the Rewind viewer a close control (UI-02).
- **Effort:** M

#### UI-31: Settings is one 3,200px page with vague or misleading status badges, no connection health, and two editing patterns

- **Severity:** Medium
- **Status:** adjusted (ADM-10; the "closed ports but Enabled" case is a seed artifact, and the LLM/Wrapped and Discord pairs are separate flags with vague labels rather than contradictions)
- **Sources:** ADM-10
- **Where:** `app/admin/settings/page.tsx:3`, `:11-52`, `:130-134`, `:165-169`, `:197-200`, `:223-370`, `:274-275`, `:400`, `components/admin/settings/DiscordIntegrationForm.tsx:126`, `components/admin/settings/ServerForm.tsx:113`, `:149`, `components/admin/settings/LLMToggle.tsx:29`, `components/admin/settings/llm-toggle.tsx:11`, `actions/admin/admin-servers.ts:89`, `:172`, `lib/wrapped/llm.ts:41-43`, `app/admin/layout.tsx:14`
- **Evidence:**
  - **Length.** `admin-settings--desktop.png` is 3,198px tall and `admin-settings--mobile.png` 4,806px, with about 15 cards and no in-page navigation. The integration card block is pasted 7 times (`:223-370`).
  - **LLM badges.** The LLM header shows "Feature Disabled / Enable LLM" (`:130-134`) while Wrapped Generation below shows "Feature Enabled" with a configured model (`:165-169`), and the layout still offers the chat assistant (`layout.tsx:14`). They are independent flags, but when the LLM is off, generation silently returns `generateMockWrappedData` (`lib/wrapped/llm.ts:41-43`), so members get placeholder copy and nothing says so.
  - **Discord badges.** Discord shows "Feature Enabled" (that flag is Linked Roles, `:197-200`) next to "Bot Status: Disabled" (`DiscordIntegrationForm.tsx:126`).
  - **No ongoing health.** Integration cards show "Feature Enabled" whenever a config row exists (`Boolean(settings.tautulli)`, `:274-275`). In normal use the save path tests connectivity first (`admin-servers.ts:89`, `:172`), so the badge reflects a connection that worked when saved; what's missing is ongoing health and a "last checked" time. `ServerForm` has no Test button.
  - **Two editing patterns.** Read-only with an Edit toggle (ServerForm, LLMProviderForm, DiscordIntegrationForm) versus always-open forms (StripeSettingsForm; WatchlistSyncSettings, whose card also lacks the header band, `:400`). Edit is a raw button in `ServerForm.tsx:149` and `<Button variant="secondary">` in DiscordIntegrationForm. Errors appear only as toasts, never on the field (`ServerForm.tsx:113`).
  - **Local duplicates.** The page defines its own `StatusBadge` and `toneClasses` (`:11-52`). There are two LLMToggle components (UI-17), and the folder mixes PascalCase and kebab-case file names behind a "backwards compatibility" re-export barrel (`settings-edit-forms.tsx`, imported at `:3`).
- **Impact:** admins can't tell what is actually on, configured or reachable, and finding a setting means scrolling through 15 cards.
- **Recommendation:**
  - Split settings into sections (Media servers, Requests and automation, AI and Rewind, Community, Billing, Advanced), with an in-page nav or sub-routes and one card and header pattern.
  - Use one status vocabulary through Badge, adding "Degraded: LLM off, Rewind will use template copy" for Wrapped when `llmDisabled` is true. Rename the Discord badges "Linked Roles" and "Bot".
  - Run a health probe on page load (or cached) with a "Test connection" button that reuses the existing `testXConnection` helpers in `lib/connections`.
  - Use one editing pattern, with inline field errors through FormField (UI-13).
  - Delete `llm-toggle.tsx` with the unused footer (UI-45), remove the barrel, and normalise file names to kebab-case.
- **Effort:** L

#### UI-32: Admin navigation config is hard-coded with pasted icons, grouping is odd, there is no command palette, and the copy still says "Wrapped"

- **Severity:** Low
- **Status:** adjusted (ADM-17; the "More" grid shows full labels, the aside does contain a `<nav>`, and every tool is two taps away, so it is mostly structural and enhancement work)
- **Sources:** ADM-17
- **Where:** `components/admin/shared/admin-nav.tsx:11-136`, `:56-98`, `:139-151`, `:234`, `:249`, `:278-295`, `components/admin/shared/mobile-nav/MobileNavButton.tsx:33`
- **Evidence:**
  - **Hard-coded config.** Nav items are defined inline with pasted SVGs (`admin-nav.tsx:11-136`).
  - **Odd grouping.** The groups are an unlabelled core group, "Analytics" (which holds Job Queues and Discord Bot, both operational tools, `:56-98`) and "Prompts & Testing".
  - **Mobile bar.** The bottom bar promotes Share Analytics and puts Announcements, LLM Usage, Cost, Discord, Queues, Prompts and Playground in an ungrouped 3-column "More" grid (`:139-151`; `admin-nav-more-menu--mobile.png`). Bottom-bar labels are cut to their first word, e.g. "Share" (`MobileNavButton.tsx:33`).
  - **Missing hooks.** The desktop `<aside>` contains an unlabelled `<nav>` (`:234`, `:249`). Desktop Back to Home and Sign Out have no testids (`:278-295`).
  - **No search.** With 12 destinations and users, invites and prompts as entity types, admins have no search and no command palette.
  - **Old copy.** It says "Wrapped" everywhere ("Wrapped Playground", "Completed Wrapped", "Regenerate Wrapped"), while the owner calls the feature Rewind.
- **Impact:** reaching a specific user or operational page takes several clicks, mobile tools are ungrouped, and the Rewind rebrand would mean hunting down strings file by file.
- **Recommendation:**
  - Move the nav config to `lib/admin/nav.ts` (id, label, href, icon, group, match, mobilePriority) and share it with breadcrumbs and page titles (UI-21).
  - Regroup into Overview; People (Users, Invites); Rewind (Status, Prompts, Playground, Share analytics); Communication (Announcements, Discord); Operations (Job queues, LLM usage, Cost); Settings. On mobile use Overview, Users, Rewind, Settings and More, where More is a grouped sheet.
  - Add a ⌘K command palette (e.g. cmdk) covering destinations, user search through a server action, invite-code lookup and quick actions (Create invite, New announcement, Generate missing Rewinds).
  - Keep product copy in `lib/brand.ts` (UI-39), so "Rewind" is a one-line change. Add `aria-label="Admin navigation"` and testids.
- **Effort:** M

### 5. First run, onboarding and member surfaces

#### UI-33: Two separate wizard steppers; the setup stepper puts about 1,300px of cards before the form on mobile, and every step forces a timed interstitial

- **Severity:** Medium
- **Status:** confirmed (UX-13); DS-11's Stepper part was adjusted on effort, and DS-13's setup-cards part was confirmed
- **Sources:** UX-13, DS-11 (Stepper part), DS-13 (setup cards part)
- **Where:** `components/setup/setup-wizard/setup-wizard.tsx:163-215`, `components/onboarding/onboarding-wizard.tsx:60`, `:162`, `:196`, `:211`, `components/setup/setup-wizard/success-animation.tsx:25-38`, `components/setup/setup-wizard/final-success-animation.tsx:33-35`
- **Evidence:**
  - **Setup stepper.** Setup renders all 9 steps as motion description cards in `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`, with a progress bar and no list semantics (`setup-wizard.tsx:163-215`). That is about 500px above the form on desktop (`setup-step-01--desktop.png`). On mobile it is roughly 1,150-1,330px of cards, so the first input sits about 1,400-1,600px down on every step (`setup-step-01--mobile.png`, `setup-step-02--mobile.png`, `setup-step-09--mobile.png`).
  - **Onboarding stepper.** A different nav/ol design of circles and connectors. Labels and connectors are `hidden sm:block` (`onboarding-wizard.tsx:196`, `:211`), so mobile shows bare numbers, and the connectors render unevenly on desktop (`user-onboarding-01-welcome--desktop.png`).
  - **Forced waits.** Each Continue triggers a full-screen, non-skippable `SuccessAnimation` (`fixed inset-0 pointer-events-none`, 1,500 ms; `user-onboarding-01b-transition--desktop.png`), and the last step adds 3,000 ms (`final-success-animation.tsx:33-35`). Onboarding adds another 500 ms sleep (`onboarding-wizard.tsx:60`). In total that is 15 s of forced waiting in setup (8 × 1.5 s + 3 s) and about 9.5 s in onboarding.
- **Impact:** mobile admins scroll past a wall of cards on every step, members wait through animations, and the two wizards feel like different products.
- **Recommendation:**
  - Build one `components/ui/stepper.tsx`: a compact progress bar with the current step name ("Step 3 of 9 - Overseerr"), an expandable step list or sheet on mobile, chips for optional steps (UI-03), and `aria-current="step"`. Use it in both wizards.
  - Put the shared wizard frame (card, header, actions) in one component.
  - Replace the per-step overlay with a 300 ms inline check transition. Keep a single celebratory finish, and make it skippable and reduced-motion aware.
- **Effort:** M

#### UI-34: Onboarding copy is Plex-only, leaks admin and internal details, and promises features the dashboard lacks

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** UX-14
- **Where:** `components/onboarding/onboarding-steps/media-request-step.tsx:61`, `:70`, `actions/onboarding.ts:144-152`, `app/(app)/page.tsx:45`, `components/onboarding/onboarding-steps/final-step.tsx:43`, `:57`, `:61`, `:65`, `components/onboarding/onboarding-steps/discord-support-step.tsx:45-71`, `:81`, `:106`, `:132-137`, `components/onboarding/onboarding-steps/welcome-step.tsx:39`, `components/onboarding/onboarding-wizard.tsx:104-116`, `types/onboarding.ts:68-70`
- **Evidence:**
  - **Plex-only copy shown to Jellyfin users.** The MediaRequest, DiscordSupport and Final steps are shared between the Plex and Jellyfin flows (`onboarding-wizard.tsx:104-116`), so Jellyfin users see "Log in with your Plex account." (`media-request-step.tsx:61`), "Browse available media on the Plex app" (`final-step.tsx:57`), "a private community of other Plex members" and "Linked role proves you're a Plex member" (`discord-support-step.tsx:81`, `:106`).
  - **Admin and internal details.** Members are told "If you are the admin, you can configure this in Admin > Settings > Overseerr" (`:70`). The request-portal link falls back to the internal URL when `publicUrl` is unset (`actions/onboarding.ts:144-152`; home does the same at `page.tsx:45`), so `user-onboarding-03-media-request--desktop.png` shows `http://localhost:5055`.
  - **Promised features.** "What's Next" promises "View server statistics and insights" and "Manage your requests and watch history" (`final-step.tsx:61`, `:65`), which the dashboard doesn't offer.
  - **Generic or empty steps.** The welcome is a generic "Welcome to the Server!" (`welcome-step.tsx:39`). "Contact Support" has no action (`discord-support-step.tsx:53-67`). The Discord step is never filtered out (`types/onboarding.ts:68-70`) and says "Discord linking is coming soon" when Discord is disabled (`:132-137`).
  - **Mobile.** Step 4 is about 2,000px of cards nested three deep (`user-onboarding-04-discord-support--mobile.png`).
- **Impact:** new members, especially Jellyfin users, get inaccurate instructions and a link they cannot open from outside the LAN.
- **Recommendation:**
  - Pass `service` and `serverName` into every step, and build service names from them (or from `lib/brand.ts`).
  - Show only `publicUrl` to members, and hide the requests step when none is set. Remove admin-only hints from member flows.
  - Rewrite "What's Next" to match real features (Rewind, Requests, Discord).
  - When Discord is disabled, hide only the "Discord Community" block and keep the "Reporting Issues" guidance (`:45-71`). Flatten the step into one card with the inline link CTA from UI-01.
- **Effort:** S

#### UI-35: Sign-in takes two clicks plus a forced 3-second wait, on a landing page with no context

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** UX-15
- **Where:** `components/auth/service-sign-in-toggle.tsx:33-59`, `:63-80`, `:135`, `components/auth/plex-sign-in-button.tsx:89-96`, `:121-133`, `lib/plex-auth.ts:10`, `app/(app)/page.tsx:145`
- **Evidence:**
  - **Bare landing.** The landing page shows only the server name and a "Sign in" button (`public-home-signin--desktop.png`).
  - **Two clicks.** With a single provider, that button only expands into a second "Sign in with Plex" button (`service-sign-in-toggle.tsx:33-59`, then `:63-80`; `ux-signin-expanded--mobile.png`).
  - **Forced wait with vague copy.** Clicking it creates the PIN and shows "You may see a warning, but this is only needed to match your Plex account to a <server> subscriber", then waits `warningDelay=3000` before redirecting (`plex-sign-in-button.tsx:89-96`, `:121-133`). The delay is intentional, but nothing explains what the site is, what "subscriber" means or what the warning will be. Plex's consent screen then names the app "Plex Manager" (`plex-auth.ts:10`).
  - **No scrolling.** The landing `<main>` is `fixed inset-0` with no overflow handling (`page.tsx:145`). With two providers the form container is `min-h-[280px]` (`service-sign-in-toggle.tsx:135`), so it clips on short landscape screens.
- **Impact:** the first interaction is the slowest and most confusing, and the vague warning reduces trust right before the OAuth hand-off.
- **Recommendation:**
  - Render the provider button directly when only one provider exists; show both side by side when there are two.
  - Remove the timed delay, and add a short static note under the button ("You'll approve access on plex.tv").
  - Add a one-line value proposition and the server artwork or logo.
  - Use `min-h-dvh overflow-auto` instead of `fixed inset-0`, and align X-Plex-Product with `lib/brand.ts` (UI-39).
- **Effort:** S

#### UI-36: The invite page is client-only (no unfurl), shows the wrong server name and mismatched brand marks, and labels every failure "Invalid Invite"

- **Severity:** Medium
- **Status:** confirmed. The verifier also raised a security note: `validateInvite` returns the whole Invite row to an unauthenticated client.
- **Sources:** UX-16
- **Where:** `app/invite/[code]/page.tsx:1-86`, `:117-124`, `:156-159`, `:206-208`, `:215-217`, `actions/server-info.ts:19-29`, `actions/invite.ts:531-552`, `components/dashboard/media-server-link-card.tsx:59`
- **Evidence:**
  - **Client-only.** The page is `'use client'` and validates in `useEffect` behind a spinner card (`page.tsx:1-86`), so it can't export `generateMetadata`, and invite links unfurl as "Plex Manager" (UI-39).
  - **Wrong server name.** `getServerName()` reads only `plexServer` and falls back to "Plex" (`server-info.ts:19-29`), and `validateInvite` doesn't check that a server of the invite's type exists (`invite.ts:531-552`). `/invite/JELLY2026` shows the Jellyfin account form for "Test Plex Server" (`public-invite-jellyfin--mobile.png`; capture failure 8).
  - **One error state for everything.** The Plex and Jellyfin `onError` handlers feed the same state, rendered under "Invalid Invite" with only "Go Home" (`:117-124`, `:206-208`, `:215-217`). The expired, used-up and unknown states end in "Go Home" too, which leads to a sign-in the invitee can't use (`public-invite-expired--mobile.png`).
  - **Mismatched marks.** The Plex mark here is two thin chevrons forming an outlined diamond (`:156-159`), unlike the filled chevron on the home quick link (`media-server-link-card.tsx:59`), and the Jellyfin mark is a generic rounded square.
  - **Security note.** `validateInvite` returns `{ success: true, data: invite }`, the full row, to the unauthenticated client (`invite.ts:551`).
- **Impact:** an invitee's first impression is a spinner, a wrong server name, and dead-end errors with no next step.
- **Recommendation:**
  - Make `app/invite/[code]/page.tsx` a server component. It validates the code, resolves server type and name (Plex or Jellyfin) server-side, and exports `generateMetadata` ("You're invited to <Server>" with an OG image).
  - Pass only `serverType` and `serverName` to small client islands for the sign-in buttons.
  - Reject Jellyfin invites when no Jellyfin server is active.
  - Split the error copy: invite problems ("This invite has expired - ask <admin> for a new one") versus sign-in problems (with retry), through StatusScreen (UI-19).
  - Use the shared brand marks (UI-26).
- **Effort:** M

#### UI-37: The subscription pages are unstyled, show raw Stripe price IDs, and leave gated users with no way out

- **Severity:** Medium
- **Status:** adjusted (UX-17; "Return home" is a dead end rather than a redirect loop, the UNPAID notice case is unreachable for gated users, and the impact is limited to installs with Stripe on, which is off by default)
- **Sources:** UX-17
- **Where:** `app/subscribe/page.tsx:35-67`, `app/subscribe/success/page.tsx:15-27`, `:46-88`, `components/subscription/subscription-status-view.tsx:104-106`, `lib/guards.ts:45-55`, `app/(app)/layout.tsx:22-40`, `lib/access.ts:29`
- **Evidence:**
  - **Unstyled.** `/subscribe` and `/subscribe/success` are flat `bg-slate-900` pages with plain text links, and no branding, server name, card or header (`user-subscribe--desktop.png`, `user-subscribe-success--mobile.png`).
  - **Wrong state.** `/subscribe` always says "Subscription required", even to a member who already has access (the screenshot is the regular user).
  - **No way out.** "Return home" appears only in the no-plans state (`:57-63`); for a gated user it bounces back to the same page through `ensureSubscriptionOrAccess` (`guards.ts:45-55`). When plans exist there is no exit link at all, and neither page has a sign-out, so the user can't switch accounts.
  - **Success page.** It promises "this only takes a moment" but never refreshes or polls (`success/page.tsx:71-79`). It reads the session (`:15-27`) but doesn't redirect anonymous visitors, who get the "being set up" copy.
  - **Raw price ID.** `SubscriptionStatusView` shows `subscription.priceId` as the plan name (`:104-106`; the seed value is `price_audit_monthly`).
  - **Banners ignore the toggle.** `getBannerFlags` doesn't check `stripeEnabled` (`(app)/layout.tsx:22-40`), so a leftover PAST_DUE row still shows the banner with Stripe disabled.
- **Impact:** the payment surfaces, which need the most trust, look unfinished, show internal identifiers, and can leave gated users stuck.
- **Recommendation:**
  - Put both pages in the member shell (UI-30) with an account menu and sign-out.
  - Make the copy state-aware: on `/subscribe`, show "You already have access - Manage subscription" when `getAccessGateStatus` is true.
  - Lay out plans with Card and Button, and take the product name from `getOfferedPrices` or Stripe instead of `priceId`.
  - Poll `/subscribe/success` with TanStack Query until the invite is accepted or pending, and redirect anonymous visitors to `/`.
  - Gate `getBannerFlags` on `stripeEnabled`.
- **Effort:** M

#### UI-38: Home quick links and feature cards: the Plex link goes to plex.tv, the Discord tile can be dead, the grid has holes, and watchlist sync shows where it can't work

- **Severity:** Medium
- **Status:** adjusted (UX-19; the watchlist card shows a skeleton while loading, is already hidden without Overseerr, and its toggle already has switch semantics)
- **Sources:** UX-19
- **Where:** `components/dashboard/media-server-link-card.tsx:14`, `app/(app)/page.tsx:104-106`, `components/dashboard/discord-card.tsx:64-96`, `components/dashboard/user-dashboard.tsx:111`, `:119`, `:128`, `components/watchlist/sync-settings-card.tsx:109-133`, `:203`, `:208-221`, `:235-245`, `prisma/schema.prisma:59-71`, `:78`
- **Evidence:**
  - **Plex link.** The quick link for Plex users points to the generic `https://plex.tv` homepage (`media-server-link-card.tsx:14`), not the user's server. `PlexServer` stores no `machineIdentifier` (`schema.prisma:59-71`), which a deep link would need.
  - **Jellyfin link.** Jellyfin users get the internal `jellyfinServer.url` (`page.tsx:104-106`), even though `JellyfinServer` has a `publicUrl` field (`schema.prisma:78`).
  - **Dead Discord tile.** With Discord enabled but no invite code, the tile is a static div with no action (`discord-card.tsx:64-96`).
  - **Grid holes.** A missing Overseerr or Discord leaves invisible `hidden sm:block` placeholders, which put holes in the 3-column desktop grid (`user-dashboard.tsx:111`, `:119`).
  - **Watchlist Sync.** The card shows Plex-only copy ("Auto-request items from your Plex watchlist") to everyone, including Jellyfin users (`sync-settings-card.tsx:203`). When the admin has disabled the feature, it still shows with a disabled toggle and an explanation (`:235-245`; "Log in with Plex to enable watchlist sync" in `user-home--desktop.png`). It is already hidden when Overseerr is not configured (`:109-111`), and its hand-rolled toggle already has `role=switch` and `aria-checked` (`:208-221`).
- **Impact:** the main dashboard actions go to the wrong place or nowhere, and unusable features take up space.
- **Recommendation:**
  - Plex: add a `machineIdentifier` column filled during setup from the server's `/identity` endpoint, and link to `https://app.plex.tv/desktop/#!/media/<machineId>/com.plexapp.plugins.library`. Until then, fall back to `plexServer.publicUrl + '/web'`. Jellyfin: link to `jellyfinServer.publicUrl`.
  - Render the quick links from a filtered array in an auto-fit grid with no placeholders.
  - Make the Discord tile link to `/discord/link` when Discord is enabled, the member isn't linked and there is no invite (UI-01).
  - Hide WatchlistSyncCard when the primary service isn't Plex or `globalSyncEnabled` is false. Pass its initial settings from the server page, and swap its toggle for the Switch primitive (a consistency fix).
- **Effort:** S

#### UI-39: Branding, page titles and social metadata are inconsistent or missing; "Rewind" appears nowhere

- **Severity:** Medium
- **Status:** confirmed. The verifier found more "Plex Wrapped" instances than the auditor listed.
- **Sources:** UX-12
- **Where:** `app/layout.tsx:13-20`, `package.json:2`, `lib/plex-auth.ts:10`, `lib/watchlist/plex-watchlist.ts:104`, `lib/connections/jellyfin-core.ts:46`, `app/loading.tsx:6`, `components/setup/setup-wizard/setup-wizard.tsx:136-139`, `components/setup/setup-wizard/final-success-animation.tsx:12`, `components/admin/shared/admin-nav.tsx:244`, `app/(app)/wrapped/share/[token]/page.tsx:46-75`, `lib/discord/integration.ts:307`, `:340`, `components/admin/settings/DiscordIntegrationForm.tsx:88`, `components/wrapped/wrapped-share-summary.tsx:227`, `app/(app)/page.tsx:43`
- **Evidence:**
  - **Four names for one product.** "Plex Manager" appears in the metadata (`layout.tsx:13-20`), the loader ("Loading Plex Manager...", `loading.tsx:6`), the setup headline (`setup-wizard.tsx:136-139`), the admin nav (`admin-nav.tsx:244`) and X-Plex-Product, which Plex shows on its consent screen (`plex-auth.ts:10`). It is "plex-wrapped" in `package.json:2`. "Plex Wrapped" appears in the share title and OG (`share page:46-75`), the Discord defaults (`integration.ts:307`, `:340`; `DiscordIntegrationForm.tsx:88`), "Create Your Own Plex Wrapped" (`wrapped-share-summary.tsx:227`), the watchlist X-Plex-Product (`plex-watchlist.ts:104`), the Jellyfin client name (`jellyfin-core.ts:46`) and the setup finish (`final-success-animation.tsx:12`). It is "Wrapped" on the home card, and "Media Server" is the fallback (`page.tsx:43`).
  - "Plex Wrapped" is also shown to Jellyfin users, and "Rewind" appears nowhere.
  - **Metadata.** Only `app/layout.tsx` and the share page export metadata, against 32 `page.tsx` files, so every tab reads "Plex Manager". The rendered head of `/invite/AUDIT2026` has title "Plex Manager", description "Your Plex media manager", and icon and apple-touch-icon both `/icon.svg`. There is no OpenGraph, no `metadataBase`, no PNG apple-touch-icon (iOS ignores SVG) and no web manifest; `public/` holds only `icon.svg`.
  - **Three Rewind looks:** the pink/purple home card (`user-home--desktop.png`), the gold serif viewer (`wrapped-slide-01-hero--desktop.png`) and the cyan/purple space share page (`public-wrapped-share--mobile.png`). Visual unification is tracked in UI-16.
- **Impact:** invite links shared in Discord or iMessage unfurl as a generic "Plex Manager" with no image, which is the invitee's first impression, and users see several names for one product.
- **Recommendation:**
  - Settle the naming (a product name for the shell, the server name as the hero, "Rewind" for the recap) and put it in one `lib/brand.ts` used by metadata, loaders, setup copy, X-Plex-Product, the Jellyfin client name, OG and Discord defaults. Rename the package if desired.
  - In `app/layout.tsx`, add `metadataBase`, `title.template` ("%s - <Server>") and default `openGraph`/`twitter` fields.
  - Add per-route `metadata`/`generateMetadata` for invite ("You're invited to <Server>" with an OG image), Rewind and subscribe.
  - Add `app/icon.png`, `app/apple-icon.png`, `app/opengraph-image.tsx` and `app/manifest.ts`.
- **Effort:** M

#### UI-40: Copy has no shared voice: the same actions carry different labels, casing and tone

- **Severity:** Low
- **Status:** confirmed
- **Sources:** UX-21
- **Where:** `app/auth/denied/denied-client.tsx:184`, `:192`, `app/invite/[code]/page.tsx:123`, `app/auth/callback/plex/callback-client.tsx:90`, `:245`, `components/admin/shared/unauthorized-error.tsx:30`, `:44`, `app/subscribe/page.tsx:62`, `app/subscribe/success/page.tsx:86`, `components/onboarding/onboarding-steps/final-step.tsx:43`, `:90`, `components/admin/shared/admin-nav.tsx:285`, `app/(app)/wrapped/page.tsx:85`, `components/ui/error-state.tsx:54`, `components/wrapped/share-card-download.tsx:63`, `components/dashboard/wrapped-card.tsx:275`, `:314`, `components/onboarding/onboarding-wizard.tsx:84-88`
- **Evidence:**
  - **Going home** is labelled "Return Home" (`denied-client.tsx:192`), "Go Home" (`invite page:123`; `callback-client.tsx:245`, where the same button reads "Try Again" on a non-invite error), "Go to Home" (`unauthorized-error.tsx:44`, next to "Oops!" at `:30`), "Return home" (`subscribe/page.tsx:62`), "Continue to the app" (`success/page.tsx:86`), "Go to Dashboard" (`final-step.tsx:90`, with "exploring the dashboard" at `:43`) and "Back to Home" (`admin-nav.tsx:285`).
  - **Retry** is "Try Again" (`wrapped/page.tsx:85`, `denied-client.tsx:184`), "Try again" (`error-state.tsx:54`, `share-card-download.tsx:63`) and "Retry Generation" (`wrapped-card.tsx:314`).
  - **Casing.** Buttons mix Title Case ("Let's Go", "View Your Wrapped", `wrapped-card.tsx:275`) with sentence case ("Sign in", "Got it").
  - **Tone** swings from "Oops!" and the onboarding titles "Great!", "Got it!" and "Perfect!" (`onboarding-wizard.tsx:84-88`) to developer strings ("No PIN ID received from Plex", `callback-client.tsx:90`).
- **Impact:** small inconsistencies that add up to a product that doesn't feel designed as one piece.
- **Recommendation:**
  - Write a short copy guide: sentence-case buttons, "Back to home", "Try again", "Sign in", a plain tone, and no raw error strings. Apply it during the StatusScreen and Button migration.
  - Centralize only the labels repeated three or more times (home, retry) next to `lib/brand.ts`, not a full copy catalog (CLAUDE.md: no premature abstractions).
  - Replace "dashboard" with "home" in onboarding, and map the raw PIN error to friendly copy.
- **Effort:** S

### 6. Data loading, feedback and code health

#### UI-41: Pages load data client-side in `useEffect`, as sequential waterfalls, instead of server props or TanStack Query

- **Severity:** Medium
- **Status:** adjusted (ADM-08: don't move client reads into server actions, and the 429s need a separate rate-limiter fix; UX-20: WrappedCard is worse than reported, and WatchlistSyncCard has a skeleton)
- **Sources:** ADM-08, UX-20 (data-fetching part)
- **Where:** `components/admin/invites/invites-page-client.tsx:40`, `:61-77`, `:129-144`, `:168`, `:202`, `components/admin/invites/invite-details-client.tsx:38-56`, `app/admin/invites/page.tsx:5`, `components/admin/playground/wrapped-playground.tsx:76`, `:98`, `:128`, `components/admin/settings/LLMProviderForm.tsx:50`, `components/admin/wrapped/historical-wrapped-selector-header.tsx:35`, `components/admin/announcements/announcements-page-client.tsx:40-50`, `components/admin/users/user-activity-timeline.tsx`, `components/dashboard/wrapped-card.tsx:66-97`, `:161-179`, `app/invite/[code]/page.tsx:25-86`, `components/onboarding/onboarding-wizard.tsx:30-38`
- **Evidence:**
  - **Invites.** The list and detail load through server actions inside `useEffect` (`invites-page-client.tsx:61-77`, `:129-144`, with `@ts-ignore` at `:133`; `invite-details-client.tsx:38-56`, with another `@ts-ignore`), although `app/admin/invites/page.tsx` is a server component that passes nothing. Jellyfin availability is checked by calling `getJellyfinLibraries` on mount.
  - **Effect fetches against `/api/admin`.** The playground fetches `/api/admin/plex/users` (`:76`), `/api/admin/models` (`:98`) and statistics (`:128`). LLMProviderForm fetches `/api/admin/models` again (`:50`), historical-wrapped-selector-header fetches versions (`:35`), and watchlist settings also load in an effect.
  - **Manual re-fetching.** After mutations, announcements and invites re-fetch by hand (`announcements-page-client.tsx:40-50`; `invites-page-client.tsx:168`, `:202`).
  - **TanStack Query unused.** In admin, only `user-activity-timeline.tsx` uses `useQuery`; it is the only consumer in `app/` and `components/`. Every effect rebuilds its own loading and error state.
  - **Rate limits.** These internal routes sit behind the shared admin rate limiter, which returned 429 during normal browsing (capture failure 2). The root cause is rate-limit keying: requests without `x-forwarded-for` share one bucket. Changing the fetch strategy only lowers the request count.
  - **Home card waterfall.** On the home page, itself a server component, `WrappedCard` fetches `getWrappedSettings` and then `getUserPlexWrapped` in sequence inside `useEffect` (`wrapped-card.tsx:66-97`). On mount `wrappedSettings` is null, so the effect sets `isLoading=false` and the card briefly shows the default "Generate" CTA, then a spinner card (`:161-179`), then the real state. The wrong call to action flashes, and the hero changes size.
  - **Other client-validated pages.** The invite page validates on the client (`invite/[code]/page.tsx:25-86`), and onboarding fetches its info after mount (`onboarding-wizard.tsx:30-38`).
- **Impact:** pages flash a spinner or the wrong CTA before content, layouts shift on the most-visited page, data goes stale, internal reads use up the rate limit, and the code goes against CLAUDE.md's own data-fetching rules.
- **Recommendation:**
  - Load initial data on the server and pass it as props: the invites list, invite detail (with `notFound()`), Jellyfin availability, prompt templates, the home page's wrapped settings and status, WatchlistSyncCard settings, onboarding info, and the invite page (UI-36).
  - For client-driven reads (models, Plex users, wrapped versions, playground statistics), keep the GET route handlers and wrap them in TanStack Query hooks (`hooks/admin/use-admin-models.ts` and so on) with shared keys and retry/error UI. Don't turn them into server actions, which are POST, run one at a time per client, and are meant for mutations.
  - Keep only generation polling on the client, as `useQuery` with `refetchInterval` while the status is "generating".
  - After mutations, call `revalidatePath` in the action plus `router.refresh()` or `invalidateQueries`. Type the action results so the `@ts-ignore`s can go.
  - Fix the rate-limiter key in the security plan.
- **Effort:** M

#### UI-42: Action, confirm and toast patterns are re-implemented per button; the confirm dialog has no pending state, and toasts appear under the modal backdrop

- **Severity:** Medium
- **Status:** adjusted (ADM-13; six action buttons, not seven, and corrected line numbers. Hidden toasts apply only to form modals that stay open on error.)
- **Sources:** ADM-13
- **Where:** `components/admin/users/regenerate-wrapped-button.tsx:22-54`, `components/admin/users/change-user-role-button.tsx:28-50`, `:160-164`, `components/admin/users/unshare-user-button.tsx`, `components/admin/users/toggle-exempt-button.tsx`, `components/admin/users/grant-access-button.tsx`, `components/admin/users/cancel-subscription-button.tsx`, `components/admin/shared/confirm-modal.tsx:30-33`, `components/ui/toast.tsx:84`, `components/ui/modal-shell.tsx:125`, `components/admin/invites/invites-page-client.tsx:182`, `:637-640`, `components/admin/announcements/announcements-page-client.tsx:67`
- **Evidence:**
  - **Copied action buttons.** Six user action buttons (regenerate, change-role, unshare, toggle-exempt, grant-access, cancel-subscription) each rebuild the same pieces: isLoading, showSuccess and showConfirm state, an inline spinner SVG, ConfirmModal, a toast and `router.refresh()`. For example, `regenerate-wrapped-button.tsx:22-54`, and the handler at `change-user-role-button.tsx:28-50`.
  - **Raw classes into the modal.** They pass raw color classes into ConfirmModal (`confirmButtonClass="bg-red-600 …"`, `change-user-role-button.tsx:160-164`; `invites-page-client.tsx:640`).
  - **No pending or error state.** ConfirmModal calls `onConfirm()` and closes immediately (`confirm-modal.tsx:30-33`), so the dialog has neither. Its messages don't name the target ("Are you sure you want to delete this invite?", `invites-page-client.tsx:637`).
  - **Toasts under the backdrop.** Toasts render at z-50 (`toast.tsx:84`), under ModalShell's portaled `z-[9999]` overlay with `bg-black/60` and `backdrop-blur` (`modal-shell.tsx:125`). Error toasts raised while the Create Invite or announcement create/edit dialog stays open are therefore blurred and dimmed behind it (`invites-page-client.tsx:182`; `announcements-page-client.tsx:67`). Destructive confirmations close first, so their toasts are not hidden.
  - **Confusing icon.** The toast error icon uses the same path as its close button (`M6 18L18 6M6 6l12 12`; `admin-playground--desktop.png`).
  - **Spinners.** They are hand-drawn in 16 admin files; `ui/loading-spinner.tsx` is used by none of them.
- **Impact:** when a save inside a form modal fails, the admin sees a dimmed, blurred error. Destructive actions give no in-dialog progress or error, and every new action button copies about 100 lines of the same code.
- **Recommendation:**
  - Add `useAdminAction(action, { success, error, refresh })`, wrapping `useTransition`, the toast and `router.refresh()`.
  - Add a `ConfirmDialog` with `tone="danger" | "default"`. Its async `onConfirm` keeps the dialog open with disabled buttons and an inline error, and its copy names the target ("Delete invite AUDIT2026?").
  - Give Button a `loading` prop (UI-17).
  - Put toasts above modals on the z-index scale (UI-14, e.g. modal 60, toast 70), render them in a live region (UI-10), and use a distinct alert icon for errors.
- **Effort:** M

#### UI-43: Oversized client components (prompt editor 853 lines, invites 644, playground 394 + 430) mix UI, state machines and duplicated business logic

- **Severity:** Medium
- **Status:** confirmed. Nuance: `{{statistics}}` isn't a production placeholder either, so the real risk is the two replacement maps drifting apart, with no warning about unknown placeholders.
- **Sources:** ADM-09
- **Where:** `components/admin/prompts/prompt-template-editor.tsx:26-121`, `:124-250`, `:258-322`, `:361-412`, `:523`, `:543`, `:557`, `:673`, `components/admin/invites/invites-page-client.tsx:507-570`, `components/admin/playground/wrapped-playground.tsx:56-69`, `components/admin/playground/test-configuration.tsx:18-60`, `app/admin/settings/page.tsx:223-370`, `app/admin/users/[userId]/page.tsx:1`, `lib/wrapped/prompt-template.ts:10`, `:27`
- **Evidence:**
  - **`prompt-template-editor.tsx` (853 lines)** contains:
    - hand-rolled undo/redo history (`:36-38`, `:361-412`);
    - a placeholder catalog with a search modal (`:26-121`, a ModalShell around `:700-787`);
    - a large example-statistics fixture (`:124-250`);
    - a client-side "simplified version" of placeholder replacement (`:258-322`) that duplicates `lib/wrapped/prompt-template.ts` and silently leaves unknown placeholders such as `{{statistics}}` in the preview (`admin-prompt-edit--desktop.png`);
    - raw input, checkbox and textarea elements (`:523`, `:543`, `:557`, `:673`);
    - 0 data-testids across 17 interactive elements.

    The production `replacePlaceholders` is private (`prompt-template.ts:27`), and that module imports a server action (`@/actions/prompts`, `:10`), so it isn't cleanly importable from the client today.
  - **`invites-page-client.tsx` (644 lines)** combines the list, the create modal, the server-type toggle, two copy-pasted library pickers for Plex and Jellyfin (`:507-570`), and clipboard handling.
  - **`wrapped-playground.tsx` (394 lines)** has 13 `useState` hooks (`:56-69`) and 3 fetch effects. **`test-configuration.tsx` (430 lines)** takes about 20 props, including 9 `on*Change` callbacks (`:18-60`).
  - **Server pages.** `settings/page.tsx` is 448 lines and `users/[userId]/page.tsx` 419, both over the 200-300 line limit in CLAUDE.md.
- **Impact:** these files are hard to restyle, test or extend, and the prompt preview can drift from what production actually sends.
- **Recommendation:**
  - Split the prompt editor into `PlaceholderPalette`, `PromptPreview`, a `useUndoRedo` hook and the form, using the primitives for its inputs. Add data-testids while splitting.
  - Move `replacePlaceholders` and the placeholder catalog into a pure, client-safe module (e.g. `lib/wrapped/prompt-placeholders.ts`, with no server imports). Import it from both `generateWrappedPrompt` and `PromptPreview`, and have it return the list of unknown `{{tokens}}` for the preview to flag.
  - Split invites into list, create dialog and one `LibraryPicker` used for both server types.
  - Move the playground state into a reducer or hook, and group test-configuration props into one config object.
  - Break up the settings and user detail pages along the sections in UI-31 and UI-21.
- **Effort:** L

#### UI-44: One full-screen loading screen for every admin route, brand-text spinners elsewhere, and no skeleton primitive

- **Severity:** Low
- **Status:** adjusted (ADM-22; Suspense boundaries wrap client widgets, not slow data, so the fetches must move into async children)
- **Sources:** ADM-22, UX-20 (loader part)
- **Where:** `app/admin/loading.tsx:3-5`, `components/admin/shared/admin-layout-shell.tsx:28`, `app/loading.tsx:6`, `app/admin/cost-analysis/page.tsx:22`, `:72`, `app/admin/discord/page.tsx:56`, `components/admin/invites/invites-page-client.tsx:40`, `:247-253`, `components/admin/announcements/announcements-page-client.tsx:33`, `:40-50`, `:163-178`
- **Evidence:**
  - **One generic admin loader.** `app/admin/loading.tsx` is the only loading boundary under `app/admin`. Inside the shell it renders its own `min-h-screen bg-gradient-to-b …` wrapper (duplicating the shell's gradient, `admin-layout-shell.tsx:28`) with "Loading Admin Dashboard..." on every route, so every navigation blanks the content area.
  - **Slow data isn't streamed.** Discord, queues and cost-analysis (`:72`) wrap only client widgets in Suspense. Each page awaits all of its data up front (`discord/page.tsx:56` Promise.all; `cost-analysis/page.tsx:22`).
  - **Invites loads twice.** It renders no server data and starts with `loading=true` (`invites-page-client.tsx:40`), so the user sees the route fallback and then a second hand-drawn SVG spinner (`:247-253`).
  - **Announcements flashes.** It gets server data, but its spinner replaces the whole list on every reload after a mutation (`announcements-page-client.tsx:33`, `:40-50`, `:172-178`).
  - **Member loaders.** The 7 `loading.tsx` files are centered spinners with brand text ("Loading Plex Manager...", `app/loading.tsx:6`) on two backgrounds: `bg-slate-950` in auth/callback/plex, wrapped, setup, onboarding and invite, and the slate gradient in `app/loading.tsx` and `app/admin/loading.tsx`. `components/ui` has no Skeleton.
- **Impact:** every admin click blanks the content area, slow panels hold up the whole page, and loading feels generic rather than polished.
- **Recommendation:**
  - Add `components/ui/skeleton.tsx` and build header, stat-row and table-row skeletons from it.
  - Rewrite `app/admin/loading.tsx` without the `min-h-screen` gradient wrapper, as a generic header plus content skeleton. Add route-specific `loading.tsx` only where the layout differs (users, llm-usage, cost-analysis, discord).
  - On Discord, cost-analysis and queues, move the slow fetches into async child server components, each in its own Suspense boundary with a matching skeleton, so the header and filters stream first.
  - Unify all `loading.tsx` files on one background token with layout-shaped skeletons.
  - Replace inline spinners with LoadingSpinner, and keep the current announcements list on screen during reloads.
- **Effort:** S

#### UI-45: About 1,385 lines of unreachable admin code and several dead member components, with duplicates and naming drift

- **Severity:** Low
- **Status:** confirmed (ADM-19); adjusted (UX-22: two more orphans were found, and tests must be deleted too)
- **Sources:** ADM-19, UX-22
- **Where:** `components/admin/users/user-management.tsx`, `components/admin/settings/llm-settings.tsx`, `components/admin/wrapped/historical-versions-inline.tsx`, `components/admin/wrapped/historical-wrapped-selector.tsx`, `components/admin/wrapped/wrapped-viewer.tsx`, `components/admin/llm-usage/scrollspy-nav.tsx`, `components/admin/shared/sign-out-button.tsx`, `components/shared/admin-footer.tsx`, `components/shared/admin-footer-client.tsx`, `components/admin/settings/llm-toggle.tsx`, `components/admin/settings/settings-edit-forms.tsx:1`, `components/wrapped/wrapped-home-button.tsx:17-20`, `components/wrapped/user-wrapped-viewer.tsx:23`, `components/dashboard/plex-link-card.tsx:9`, `components/ui/service-icons.tsx:5`, `components/ui/styled-select.tsx:1`, `components/discord/link-panel.tsx:27`, `components/generator/wrapped-generator.tsx:14`, `components/generator/wrapped-generator-status.tsx`, `components/generator/wrapped-generator-prompt.tsx`
- **Evidence:**
  - **Admin (exactly 1,385 lines, no app route imports any of them):**
    - `user-management.tsx` (97 lines, the only caller of bulk generation)
    - `llm-settings.tsx` (134, the only admin importer of `ui/card`)
    - `historical-versions-inline.tsx` (144) and `historical-wrapped-selector.tsx` (203); the header variant is the one in use
    - `admin/wrapped/wrapped-viewer.tsx` (203); `wrapped-viewer-wrapper` imports `components/wrapped/wrapped-viewer` instead
    - `scrollspy-nav.tsx` (135)
    - `sign-out-button.tsx` (22); the nav has its own sign-out
    - `admin-footer.tsx` (38) and `admin-footer-client.tsx` (324), referenced only by tests
    - `llm-toggle.tsx` (85), used only by that footer
  - **Admin naming drift.** The settings folder mixes PascalCase and kebab-case files, and `settings-edit-forms.tsx` is a "backwards compatibility" barrel that CLAUDE.md asks not to keep.
  - **Member side (imported only by tests, or not at all):**
    - `wrapped-home-button.tsx`, a second copy of the WrappedCard generate/poll logic typed `useState<any>`
    - `user-wrapped-viewer.tsx`, which duplicates the `/wrapped` page states
    - `plex-link-card.tsx`, superseded by `MediaServerLinkCard`
    - `service-icons.tsx`, which points at missing `.ico` files (UI-26)
    - `styled-select.tsx` (deprecated)
    - `link-panel.tsx` (UI-01)
    - `wrapped-generator.tsx` and the `wrapped-generator-status.tsx` and `wrapped-generator-prompt.tsx` it orphans
  - **Keep.** `wrapped-generating-animation.tsx` is still used by `wrapped-page-client.tsx:4`.
- **Impact:** readers chase the wrong component (two LLMToggles, two historical selectors, two home generate buttons), refresh work can land in a dead copy, and the dead code still carries tests and lint load.
- **Recommendation:**
  - Delete these files and their tests, e.g. `components/__tests__/wrapped-home-button.test.tsx`, `components/__tests__/wrapped/user-wrapped-viewer.test.tsx` and `components/__tests__/wrapped-generator.test.tsx`.
  - Revive the ones the new design needs instead: `link-panel.tsx` for UI-01, and bulk generation rebuilt as a fan-out for UI-29.
  - Rename the settings files to kebab-case, and import them directly instead of through the barrel.
  - Add a knip check to CI that also flags files imported only by tests.
- **Effort:** S

#### UI-46: 40 interactive admin files have no data-testid, and admin E2E selects by DOM structure

- **Severity:** Low
- **Status:** confirmed
- **Sources:** ADM-20
- **Where:** `components/admin/shared/confirm-modal.tsx:56`, `components/admin/users/user-table-row.tsx:66`, `components/admin/settings/ServerForm.tsx:149`, `components/admin/prompts/prompt-template-editor.tsx:523`, `components/admin/chatbot/chat-window.tsx:96`, `e2e/admin-functionality.spec.ts:14`, `:57`, `e2e/accessibility.spec.ts:110`, `components/ui/styled-input.tsx:21`, `components/ui/styled-dropdown.tsx:82`
- **Evidence:**
  - **No testids.** Exactly 40 files in `app/admin` and `components/admin` with buttons, links or click handlers have no `data-testid` or `testId`. They include `confirm-modal.tsx`, which every destructive confirmation goes through, plus user-table-row, ServerForm, DiscordIntegrationForm, LLMProviderForm, prompt-template-editor (17 interactive elements), test-configuration (12), chat-window, invite-details-client, and the regenerate, unshare and change-role buttons.
  - **Structural selectors.** Admin specs use `locator('aside')` and `locator('main')` (`admin-functionality.spec.ts:14`, `:57`) and `` button[aria-label*="Delete invite"] `` (`accessibility.spec.ts:110`), which CLAUDE.md forbids.
  - **Leaking default.** StyledInput and StyledDropdown default to a `setup-input-${name}` testid (`styled-input.tsx:21`, `styled-dropdown.tsx:82`), so a setup-wizard prefix shows up in admin.
- **Impact:** admin flows such as role changes, settings edits and confirmations can't be covered by stable E2E tests, and refactors break the selectors that do exist.
- **Recommendation:**
  - Adopt the convention `admin-<area>-<element>[-<id>]`.
  - Have the primitives (Button, IconButton, ConfirmDialog, FormField, Table) accept and forward `testId`; table rows emit `<table>-row-<id>`.
  - Remove the `setup-` default from the styled inputs.
  - Move the admin specs to `getByTestId`, and add E2E coverage for settings edit, invite create and delete, and role changes.
- **Effort:** M

## Strengths to preserve

**Primitives and patterns worth building on**
- `components/ui/modal-shell.tsx` is a solid dialog: portal, `role=dialog` plus `aria-modal`, focus trap, Escape, scroll lock and focus restoration. ConfirmModal, the invite, announcement and prompt-preview modals already use it.
- `components/ui/alert.tsx` maps tone to role (`alert` vs `status`) and has an action slot. `components/ui/switch.tsx` uses `role=switch` with `aria-checked`, a `focus-visible` ring with a slate offset, and a loading state. Both are good templates for the rest of the kit.
- Button, Card, Badge, Alert, Pagination, LoadingSpinner, StyledInput (with `aria-invalid`), Switch and ErrorState already exist with JSDoc. Badge and Card JSDoc already state the intent to centralize surfaces and pills, so the refresh can extend and adopt them instead of starting over.
- The `cn()` helper (clsx plus tailwind-merge) exists, and most newer primitives use it.
- The announcement form is the cleanest form: StyledInput, StyledTextarea, StyledCheckbox, ModalShell and Button, labels linked with `htmlFor`, and data-testids (`announcement-form-modal.tsx`, `announcement-list-item.tsx`).

**Rewind theme**
- The Wrapped v2 cinematic theme already follows the right pattern: colors are `@theme` tokens (`--color-gold`, `--color-ivory`, `--color-taupe`, `--color-stage` in `app/globals.css:25-30`), and shared class presets live in `components/wrapped/cinematic/theme.ts`.
- MarqueeText, Spotlight and ConfettiBurst honor `useReducedMotion` (`marquee-text.tsx:27`, `spotlight.tsx:17`, `confetti-burst.tsx:20`), a pattern ready to extend app-wide.
- The share page already has `generateMetadata` with OpenGraph and Twitter cards and a dynamic OG image route (`app/(app)/wrapped/share/[token]/page.tsx:33-80`, `app/api/wrapped/og-image/route.tsx`).

**Consistency already in place**
- Every neutral utility is slate (0 uses of gray, zinc, neutral or stone), so tokenizing neutrals is a mostly mechanical codemod.
- No element removes the outline without a replacement focus style.
- Admin sidebar links and MobileMoreMenu have `focus-visible` rings, `aria-expanded`, `aria-haspopup`, `aria-controls`, and roving arrow-key, Home/End, Tab-wrap and Escape handling, with testids on every item (`admin-nav.tsx:210`, `MobileMoreMenu.tsx:27-148`).
- No captured member page overflows horizontally on mobile; layouts collapse to a single column.

**Architecture**
- Most admin pages are async server components that load data with `Promise.all` (`users/page.tsx:11-14`, `shares/page.tsx:12-16`, `queues/page.tsx:26-34`, `discord/page.tsx:55-68`), as CLAUDE.md asks.
- Filters on cost analysis, Discord and job queues live in the URL (`cost-date-filter.tsx:31`, `discord-date-filter.tsx:37`, `queues/page.tsx:12-33`), so views can be shared and refreshed.
- The member guard chain is centralized: `app/(app)/layout.tsx` runs `ensureSetupComplete`, `ensureOnboardingComplete`, then `ensureSubscriptionOrAccess` (`lib/guards.ts`).
- Subscription status and banners are server-rendered and use Alert and Badge (`subscription-status-view.tsx`, `subscription-banners.tsx`).
- The user actions menu renders in a portal so it escapes the table's overflow clipping (`user-actions-menu.tsx:281-284`).

**Forms and security hygiene**
- Secrets never reach the client in settings forms: `hasToken`/`hasApiKey`/`hasClientSecret` drive "leave blank to keep" (`ServerForm.tsx:35-45`, `DiscordIntegrationForm.tsx:66-93`).
- Setup forms use real `<label htmlFor>` associations and `type=password` for tokens and API keys. The Jellyfin forms set autocomplete hints (`jellyfin-sign-in-form.tsx:142-177`).
- Invite error states give specific reasons: expired, max uses, unknown code (`public-invite-expired--mobile.png`).

**Responsive patterns and testability**
- The Invites and Share Analytics tables hide low-priority columns below sm/md (`invites-page-client.tsx:269-273`, `shares/page.tsx:109-113`), a pattern to generalize in the Table primitive.
- `@axe-core/playwright` is already wired into `e2e/accessibility.spec.ts`, and data-testid coverage is good in onboarding, invite, subscribe and the dashboard. A tightened accessibility gate and visual-regression tests can be added cheaply.

## Metrics and inventories

Counts are from grep and regex over the 258 non-test `.tsx` files in `app/` and `components/` unless noted. Runtime checks used Playwright and axe 4.11 against `http://localhost:3100`. Measurement scripts and extra captures (focus rings, axe JSON) are in `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/design-a11y/` and `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/admin-ux/axe.js`. Where a verifier's recount differs, both numbers are shown.

### Tokens and theming

| Item | Value |
|---|---|
| `@theme` animation tokens | 6 (verifier; the auditor counted 5, missing `grain`) |
| `@theme` colors | 6 cinematic: stage, stage-panel, gold, gold-bright, ivory, taupe |
| Semantic color, radius, shadow and z-index tokens | 0 |
| `color-scheme` declarations | 0 (runtime `colorScheme` "normal"; body background `rgba(0,0,0,0)`) |
| Fonts loaded with `next/font` | 0 (runtime body font `ui-sans-serif, system-ui`) |
| Unused animation utility | `--animate-wiggle` (the home bell wiggles through framer-motion instead). `gradient-shift` is used only through an inline style (`announcements-card.tsx:33`) |
| Cinematic token uses | gold 46, gold-bright 20, ivory 21, taupe 18, stage 2, stage-panel 1 (in 11-15 files) |
| Page canvas backgrounds | `bg-slate-950` ×10, slate gradient ×9 (12 files by the user-facing count), `bg-slate-900` ×4 |

### Color family utilities (uses / files)

| Family | Uses / files |
|---|---|
| slate | 2,031 / 192 (2,050 on recount) |
| gray, zinc, neutral, stone | 0 each |
| cyan | 483 / 124 |
| red | 273 / 66 |
| purple | 272 / 79 |
| green | 142 / 56 |
| pink | 98 / 30 |
| amber | 94 / 22 |
| yellow | 43 / 22 |
| indigo | 31 / 7 |
| emerald | 24 / 6 |
| blue | 22 / 12 |
| orange | 17 / 7 |
| rose | 8 / 2 |
| violet | 2 / 1 |
| fuchsia | 1 / 1 |
| white | 502 / 135 |
| black | 17 / 13 |

### Gradients, hard-coded colors, arbitrary values and z-index

| Item | Value |
|---|---|
| `bg-gradient-to-*` | 146 in 69 files (147 on recount), 44 distinct from/via/to combinations; top is `from-cyan-400 via-purple-400 to-pink-400` (24 uses) |
| Gradient text (`bg-clip-text`) | 30 in 23 files (31 in 24 on recount); the cyan-purple-pink recipe is copied 21 times in member scope |
| Inline CSS `gradient()` calls | 11 |
| Hex literals in TSX | 193 in 23 files, mostly the 14 chart files; `#94a3b8` ×32 |
| `rgb()`/`rgba()` literals | 67 in 16 files |
| Arbitrary color classes | 47 in 3 files (`[#e5a00d]`, `[#5865F2]`, `[#1f1f1f]`, …) |
| Inline `style={{}}` | 62 in 27 files |
| Arbitrary values overall | 172 in 58 files: `text-[10px]` ×21 (30 on recount), `text-[9px]` ×1, `text-[11px]` ×2, 7 different `tracking-[…em]` |
| z-index | z-10 ×23, z-20 ×4, z-30 ×5, z-40 ×13, z-50 ×19, z-[200] ×1, z-[9999] ×2, z-[10000] ×1; no scale |
| `backdrop-blur` | 170 |

### Typography, radius, shadow and spacing

| Item | Value |
|---|---|
| Text sizes | sm 613, xs 549, lg 140, 2xl 119, 3xl 53, base 52, xl 44, 4xl 35, 6xl 23, 5xl 22, 7xl 8, 8xl 7, 9xl 4 |
| Weights | medium 448, bold 195, semibold 181, normal 22, black 5 |
| h1 | 38 h1s, 15 className strings; 14 identical copies of `text-2xl sm:text-3xl font-bold text-white mb-2` |
| Font families | `font-serif` ×11-12 (cinematic, resolved by the OS); `font-mono` ×66 |
| Radius | `rounded-lg` 325, `rounded-full` 146, `rounded` 124, `rounded-md` 46, `rounded-xl` 41, `rounded-2xl` 23, `rounded-3xl` 12, plus 6 one-off directional variants |
| Shadows | lg 54, 2xl 23, sm 13, xl 12, md 6, inner 1, colored 39 |
| Padding | p-4 178, p-6 114, p-3 45, p-8 43, p-12 15; half-step (x.5) 190; off-scale (5, 7, 9, 10, 11) 22 |

### `components/ui` inventory (18 files, 1,621 lines)

| File | Status |
|---|---|
| alert, badge, button, card, date-range-picker, error-state, loading-screen, loading-spinner, modal-shell, pagination, styled-checkbox, styled-dropdown, styled-input, styled-textarea, switch, toast | In use |
| styled-select | `@deprecated`, 0 imports |
| service-icons | 0 imports; points at `/plex.ico`, `/tautulli.ico`, `/radarr.ico` and `/sonarr.ico`, none of which exist (`public/` holds only `icon.svg`) |
| Tests | 9 of 18 have tests (pagination, styled-input, styled-textarea, switch, alert, error-state, styled-dropdown, loading-screen, loading-spinner). Untested: button, toast, badge, card, modal-shell, styled-checkbox, date-range-picker, styled-select, service-icons |

### Primitive adoption (primitive instances vs hand-rolled equivalents outside `components/ui`)

| Primitive | Repo-wide | Admin only | Member scope |
|---|---|---|---|
| Button | 65 vs 93 raw `<button>` in 48 files, plus 33 Links styled as buttons (75 `<Button>` on the refutation recount) | 42 vs 66 raw, plus 20 styled Links | 20 vs 19 raw |
| Button variant mix | secondary 27, primary 10, ghost 5, danger 1, success 1 | | |
| Card | 4 vs 162 hand-copied surfaces in 53 files (144 matches in 77 files by another regex) | 0 live vs 95 in 25 files | 2 vs 19 |
| LoadingSpinner | 2 vs 32-34 inline spinner SVGs in 26 files | 0 vs 16 files | `animate-spin` in 38 files (28 by verifier scope) |
| Switch | 1 (StripeSettingsForm) vs 4 hand-rolled toggles | | |
| StyledCheckbox | 4 vs 7 raw in 5 files | | |
| StyledInput | 66 vs 17 raw in 8 files | | |
| StyledTextarea | 3 vs 1 raw | | |
| StyledDropdown | 15 vs 1 raw `<select>`, plus 1 inside Pagination | | |
| Badge | 3 vs 15+ hand-rolled pills in 10 files | | |
| Alert | 5 | | |
| ModalShell | 4, against 1 hand-rolled dialog (PreviewModal) and 4 ad-hoc popover/menu implementations | | |

**Missing primitives:** EmptyState (ad-hoc empty copy in 37 files); StatTile (about 30 copies across 6+ files); PageHeader (14 copies); DataTable (16 `<table>` in 15 files, 84 `<th>`, 0 with `scope`); FormField (101 labels, 13 with `htmlFor`, 48-49 orphan in 14-15 files); Stepper (2 implementations); Skeleton (none); Popover/Menu (none); a chart theme (14 files each call `ChartJS.register`).

### Icons

| Item | Value |
|---|---|
| lucide-react imports | 1 file (`components/ui/pagination.tsx`); 0 in admin |
| Inline `<svg>` | 243 in 82 files (246 in 85 on recount); 153 in admin; 79 in 36 member-scope files |
| Distinct path strings | 115; repeats: spinner ×33-34, check ×16, chevron-down ×8, close ×7, warning triangle ×6 |
| SVGs with `aria-hidden`/role/label | about 11 by a single-line count; 33 of 243 counting full opening tags |

### Accessibility counts

| Item | Value |
|---|---|
| `focus-visible:` | 30 in 5 files (2 in member scope) |
| `focus:` | 159 in 27 files |
| `aria-current` | 0 |
| `aria-live` | 3 |
| `aria-describedby` | 3 (2 outside primitives) |
| `aria-invalid` | 2 (primitives only) |
| `sr-only` | 3 |
| Skip links | 0 |
| Pages with `<main>` | 22; onboarding and setup layouts have none (axe `region`: 9 nodes) |
| framer-motion importers | 57 |
| `useReducedMotion` | 3 files (all cinematic) |
| `MotionConfig` / `prefers-reduced-motion` CSS | 0 / 0 |
| `motion-reduce`/`motion-safe` | 1 (`film-grain.tsx:11`) |
| `repeat: Infinity` | 26 in 11 files |
| `animate-bounce`/`ping`/`pulse` | 21 files (23 on recount) |
| `.focus()` / `aria-current` in the wizards | 0 / 0 |
| `text-slate-500` | 206 uses in 83 files (about 56 of them admin) |

### axe results

ui-design-system, wcag2a/aa/21/22 plus best-practice, 12 pages: public `/`, `/invite`, `/wrapped/share`; user `/`, `/onboarding`, `/wrapped`; admin users, settings, discord, invites, queues, prompts/new.

| Rule | Impact | Where |
|---|---|---|
| meta-viewport | moderate | 12 of 12 pages |
| label | critical | 2 nodes, `/admin/discord` date inputs |
| aria-prohibited-attr | serious | `/wrapped` (MarqueeText) |
| scrollable-region-focusable | serious | user home announcements |
| color-contrast | serious | `/admin/queues` Pause button; `/wrapped/share` 30 nodes (possibly mid-animation) |
| heading-order | moderate | 3 pages (`/`, `/admin/users`, `/admin/queues`) |
| region | moderate | `/onboarding`, 9 nodes |
| color-contrast incomplete (gradient background) | n/a | 46 of 50 nodes on `/admin/users`; 153 of 154 on `/admin/settings` |

ui-admin, wcag2a/aa/21a/21aa, 9 admin routes: `label` (critical) ×4 on cost-analysis and discord; `role-img-alt` (serious) ×4 on cost-analysis chart canvases; `color-contrast` (serious) ×5 (queues ×1, llm-usage ×4); `meta-viewport` (moderate) on every page. `/admin/users` and `/admin/settings` in read mode have no critical or serious violations. `e2e/accessibility.spec.ts` covers only users, settings and invites in their default state.

### Contrast (WCAG ratios, recomputed from Tailwind v4 oklch)

| Pair | Ratio | Result |
|---|---|---|
| slate-500 on slate-900 | 3.74 | fail |
| slate-500 on slate-800 | 3.07 | fail |
| slate-500 on slate-800/50 card | 3.42 | fail |
| white on cyan-600 | 3.60 | fail |
| white on cyan-500 | 2.36 | fail |
| white on green-600 | 3.22 | fail |
| white on yellow-600 | 2.93 | fail (axe-confirmed) |
| white on purple-600 | 5.53 | pass |
| white on cyan-700 | 5.28 | pass |
| slate-400 on slate-900 | 6.79 | pass |
| taupe on stage | 6.33 | pass |
| gold on stage | 9.46 | pass |

### Screens

| Item | Value |
|---|---|
| Visual worlds | 4: admin slate; space/neon (setup, onboarding, invite, share page, Rewind intro); warm-card user home; cinematic Rewind |
| Error and status designs | 6 in screenshots plus the admin 500 and the ErrorState primitive |
| Primary-CTA treatments | 10 |
| Rewind looks | 3: home card, viewer, share page |

### Admin scope (ui-admin)

| Item | Value |
|---|---|
| Files | 25 `app/admin` + 113 `components/admin` and `components/shared` admin files, about 18.5k lines; 20 content pages |
| Screenshots | 30 admin screenshots plus `adminux-share-admin-link-2025--desktop.png` and `adminux-chat-close-mobile--mobile.png` |
| Hand-copied panel class | 95 in 25 files; Card imported only by dead code |
| Labels | 62; 11 `htmlFor`; 6 wrap their control |
| Chart.js components | 13 (4 cost, 8 Discord, 1 shares); 0 accessible names |
| Data fetching | 8 files fetch in `useEffect`; 1 uses TanStack Query; 7 client fetches to `/api/admin/*` |
| data-testid | 40 interactive files with none |
| Currency formatting | about 33 ad-hoc `toFixed` sites at precisions 2, 3, 4 and 6 (the auditor's 37 at 6 precisions included durations) |
| Date formatting | about 33 ad-hoc calls, 6+ formats |
| Unreachable admin code | about 1,385 lines in 10 files |
| Largest client components | prompt-template-editor 853 lines, invites-page-client 644, test-configuration 430, wrapped-playground 394 (13 `useState`) |
| Largest server pages | settings 448, user detail 419 |
| Settings page height | 3,198px desktop, 4,806px mobile, about 15 cards |
| Header styles | 4 h1 styles, 3 back-link forms, 5 header-action styles, 6 primary fills |

### Member scope (ui-user-facing)

| Item | Value |
|---|---|
| Coverage | 33 of 152 screenshots plus 4 new captures (`ux-signin-expanded--desktop/mobile`, `ux-nextauth-error--desktop`, `ux-home-error-param--mobile`); about 50 files read |
| Inline `<svg>` | 79 across 36 files |
| Hand-rolled `animate-spin` | 38 files |
| Buttons | 19 raw vs 20 `<Button>` |
| Card | 2 uses vs 19 hand-rolled card class strings |
| Page background | gradient re-declared in 12 files; `min-h-screen bg-slate-950` wrapper in 10 |
| Metadata | 1 of 32 `page.tsx` files exports metadata (the share page); 0 `not-found.tsx`; 0 `global-error.tsx` |
| `loading.tsx` files | 7: 5 on `bg-slate-950`, 2 on the gradient |
| Unused member components | 7 (plex-link-card, discord/link-panel, ui/service-icons, ui/styled-select, wrapped/user-wrapped-viewer, wrapped/wrapped-home-button, generator/wrapped-generator), plus the orphaned generator status and prompt; `discord/link-callout` is imported only for a type |
| Forced animation time | 15 s across setup (8 × 1.5 s + 3 s); about 9.5 s across onboarding (4 × 1.5 s + 3 s + a 500 ms sleep) |
| Home infinite animations | about 12 concurrent |
| Toast call sites | about 105 `showError`/`showToast` calls |

## Appendix: Investigated and ruled out

No finding was refuted outright. These specific claims were checked during verification and ruled out or corrected:

**Accessibility**
- **Keyboard users can't navigate the Rewind viewer (DS-07):** ruled out. Previous and Next are native buttons; only shortcuts and focus management are missing (UI-09).
- **Rewind slide headings are empty to screen readers (DS-07):** overstated. Chromium computes the name; the defect is a prohibited, unreliable ARIA pattern (UI-09).
- **Keyboard users can't operate StyledDropdown (DS-05, ADM-05):** ruled out. Tab plus Enter works; listbox semantics, expanded state and arrow keys are missing (UI-14).
- **About 45 admin controls have no accessible name (ADM-05):** overstated. Most fall back to a placeholder or current value, which is a weak name rather than no name; only the 4 date inputs have none (UI-13).
- **The desktop Sign Out button has no focus ring (ADM-05):** ruled out. `globals.css` doesn't remove outlines, so the browser default ring shows.
- **StyledCheckbox's `Math.random()` id causes a hydration mismatch at the cited site (DS-08):** ruled out. The announcement modal renders only on the client; the effect is an unstable id per render (UI-13).
- **Inline SVGs without `aria-hidden` are announced, and the icon set looks inconsistent (DS-14):** mostly ruled out. Unlabeled inline SVG without `role=img` is generally skipped, axe flagged no SVG rule, and the icons are almost all Heroicons v1 (UI-26, lowered to low).
- **The Regenerate icon button is unlabelled (ADM-15):** only visually. It has `aria-label="Regenerate wrapped"`.
- **The announcement eye toggle is ambiguous to assistive tech (ADM-21):** ruled out. It has `aria-label` and `title` "Deactivate"/"Activate"; only the visual reading is unclear.
- **The watchlist toggle lacks switch semantics (UX-19):** ruled out. It already has `role=switch` and `aria-checked`; replacing it is a consistency fix.

**Layout and theming**
- **The toast `min-w-[300px]` overflows 320px screens (DS-18, UX-11):** ruled out. 300px plus the 16px `right-4` offset fits, and the fixed container shrinks to fit.
- **App Router scroll-to-top is broken by the body scroll container (UX-08):** ruled out. Next's layout-router falls back to `scrollIntoView`; only `window.scrollTo`, scroll restoration and iOS tap-to-top are affected.
- **The white 404 is caused by the missing body background (UX-08):** ruled out. Next's default fallback injects `body{background:#fff}` itself; the fix is `app/not-found.tsx` (UI-19).
- **The date-input calendar glyph is nearly invisible (DS-09):** overstated. It is low-contrast but visible in `admin-cost-analysis--desktop.png`.
- **Adding `className="dark"` to `<html>` would help (DS-09):** ruled out. Tailwind v4's `dark:` variant is media-based unless a `@custom-variant` is declared; `color-scheme` is what matters.
- **The chat FAB sits at `bottom-6` on mobile (DS-13):** corrected. It is `bottom-24 md:bottom-6`; the overlap comes from the shell's `pb-20 md:pb-6` (UI-04).
- **The queue status row scrolls the page sideways on mobile (ADM-16):** partly a capture artifact. In the real app the row is clipped, because body has `overflow-x:hidden` (UI-08).
- **The admin "More" grid truncates labels (ADM-17):** ruled out. Only the bottom bar truncates to the first word.
- **The desktop admin aside has no landmark (ADM-17):** corrected. It contains a `<nav>`, which is unlabelled.

**Data and behavior**
- **"Total Requests 5 above 4 rows" on LLM usage is a miscount (ADM-03):** ruled out. It is the intended conversation grouping; the real defects are grouping after pagination and the ungrouped "Showing X to Y of N" count (UI-23).
- **Dropped `conversationId` affects normal paging (ADM-03):** limited. No UI sets that param today; only hand-typed URLs hit it.
- **Queues shows "Page 1+" (ADM-03):** corrected. It shows "Page {page}" with no total.
- **gpt-4o-mini renders as an empty $0.00 bar (ADM-12):** corrected. It is a thin sliver, though Top Models does show "$0.00".
- **The "Success Rate 0.0%" in the screenshot shows a silent load failure (ADM-07):** ruled out. It came from a successful load with zero commands; the failure path renders the same value, which is the real issue (UI-19).
- **The "Processing" chip contradicts the queue headline (ADM-16):** corrected. The headline correctly says "Worker Stopped"; only the chip is wrong.
- **Integration cards show "Feature Enabled" for closed ports (ADM-10):** a seed artifact. The save path tests connectivity first; what's missing is ongoing health (UI-31).
- **"LLM Disabled" next to "Wrapped Generation Enabled" is a contradiction (ADM-10):** ruled out. They are independent flags; the real issue is the silent mock-data fallback (UI-31).
- **Discord "Feature Enabled" next to "Bot Disabled" is a contradiction (ADM-10):** ruled out. They are different flags (Linked Roles vs bot) with vague labels.
- **Stuck generation can't be recovered anywhere (ADM-06):** ruled out. The user detail page's Regenerate works whatever the status, and members can self-generate (UI-29).
- **Changing fetch strategy fixes the admin 429s (ADM-08):** ruled out. The cause is rate-limit keying without `x-forwarded-for`; it needs its own fix.
- **Moving client-driven reads into server actions (ADM-08 original recommendation):** rejected. Server actions are POST, run one at a time per client, and are for mutations; use TanStack Query (UI-41).
- **WatchlistSyncCard renders null until loaded (UX-19, UX-20):** ruled out. It shows a skeleton and returns null only on fetch failure.
- **Toasts are the only channel for Rewind generation failures (UX-11):** ruled out. WrappedCard renders an inline failed card with Retry; checkout, billing portal and onboarding completion really are toast-only (UI-10).
- **Error toasts last 3 s (UX-11):** corrected. `showError` defaults to 5 s; success and info use 3 s.
- **Error toasts from destructive confirmations are hidden under the modal (ADM-13):** ruled out. ConfirmModal closes first; only form modals that stay open on error are affected (UI-42).
- **The unbranded NextAuth error page is commonly reached (UX-05):** ruled out. Every `signIn()` uses `redirect:false`; only direct navigation or misconfiguration lands there (UI-07).
- **Gated subscribers hit a redirect loop (UX-17):** corrected. "Return home" bounces back to the same page, which is a dead end, not an infinite redirect (UI-37).
- **UNPAID subscribers see a badge without a notice (UX-17):** ruled out as reachable. UNPAID is not an entitling status, so those users are redirected to `/subscribe` first.
- **The subscribe success page has no session check (UX-17):** corrected. It reads the session but doesn't redirect anonymous visitors.

**Counts and code details**
- **Switch lacks a loading prop (DS-04):** ruled out. Switch has one; only Button lacks it (UI-17).
- **Card is imported only by `llm-settings.tsx` (ADM-14):** ruled out. `plan-list.tsx` and `subscription-status-view.tsx` also use it; the claim holds for admin only (UI-22).
- **Admin money uses 6 precisions (ADM-18):** corrected. The 0 and 1 decimal hits are durations; currency uses 4 precisions (UI-28).
- **Every admin page hand-builds its header differently (ADM-02):** overstated. Most of the 20 content pages share one pattern; the outliers are listed in UI-21.
- **Only 3 of 18 primitives are tested (DS-18):** ruled out. 9 of 18 have tests, in `components/__tests__` as well as `components/ui/__tests__` (UI-27).
- **Sonarr and Radarr setup forms differ by 4 lines (DS-08):** corrected. They differ by 2 lines after renaming.
- **An announcement "Scheduled" state should be shown (ADM-21 recommendation):** dropped. The Announcement model has no start date.
- **A `lib/copy.ts` catalog for all strings (UX-21 recommendation):** narrowed. Centralize only labels repeated three or more times, per CLAUDE.md's no-premature-abstraction rule (UI-40).
- **Location corrections:** the users table is at `users-list.tsx:77-111` (the file is 115 lines; :218-248 doesn't exist); `change-user-role-button.tsx` is 170 lines, so its handler is at :28-50 and `confirmButtonClass` at :160-164 (:247-278 and :387-391 don't exist); `card.tsx` is 44 lines (the surface string is at :32; :73 doesn't exist); the wizard's "intentionally different" comment is at `wizard-form-actions.tsx:18-26`.
