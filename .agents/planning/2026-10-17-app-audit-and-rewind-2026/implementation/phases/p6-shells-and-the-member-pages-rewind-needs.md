> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 6: Shells and the member pages Rewind needs

**Goal.** The parts of design-system Phases 2 and 3 (`design/ui-design-system.md` 9.2) that the season uses. The phase delivers:
- the AppShell and PublicShell, which carry the RewindCard and the ready notice;
- the admin composites, whose DataTable and StatGrid the season console builds on;
- the home RewindCard by 2026-11-20, and the account page with the member's time zone and notification switch;
- the AdminShell with its navigation config, route builders and assistant Sheet, in the ship window.

**Moved to January.** The command menu, the status screens, the admin users and settings pages, the home refresh, announcements, help and membership, onboarding, setup, invite, sign-in and subscribe become P10.16 to P10.28. None of them has a Rewind consumer, and the sign-in, invite and onboarding screens would otherwise change in the week the season opens and every member signs in. This departs from ui-design-system 9.2 Phase 3, which schedules them by 2026-12-04; Appendix C decision 28 records it, as decision 22 does for the remaining admin pages. Through the season those pages keep today's design on the new tokens.

**Window.** 2026-11-06 to 2026-12-04. Two milestones fall inside it:
- "Core experience done and default model chosen" (2026-11-20) needs P6.9 merged, with its before-season state live.
- "Hardening track done" (2026-12-04) needs P6.1's AdminShell merged in the ship window.

**Tracks.** Every step runs in the UI lane, at most two PRs open: P6.5 and P6.3 from 2026-11-06, then P6.9 and P6.11 from 2026-11-17, then P6.1 from 2026-12-03. Between them the lane takes the Rewind UI steps P5.4, P5.3, P7.12, P5.12, P7.4 and P7.5.

**Rewind-critical steps and fallbacks.**
- **P6.5** is the one hard UI dependency of the season console (P7.8 needs its DataTable and StatGrid), and it has P3.7's priority: it merges by 2026-11-09, ahead of every other UI step. If it slips past 2026-11-11, P7.8 renders its member table with today's table markup and its tiles as plain Cards, and swaps to DataTable and StatGrid when P6.5 lands.
- **P6.3** feeds P6.9 (the card renders inside AppShell) and P7.14 (the notice slot). If it slips, P6.9 renders on today's home layout and P7.14's notice waits for it.
- **P6.1** is no longer a dependency of anything before the season. The season console (P7.8) sits under today's admin layout and gains its nav item when P6.1 lands; the Rewind settings section (P7.12) goes on today's settings page, and P10.19 moves it into the new layout in January. P6.1 lands in the ship window, before the holidays, because its mobile chrome and closable assistant (UI-04) help the owner run the season from a phone.

**Ordering that matters.**
- New shared files, and the step that creates each:
  - `components/shell/`: P6.3 creates `app-shell.tsx`, `public-shell.tsx` and `components/ui/wordmark.tsx` first, and P6.1 adds the admin shell on top, rebased on it.
  - `components/ui/tabs.tsx`: P10.19 in January. P3 shipped no Tabs primitive.
- `typedRoutes` (P3.2) rejects links to routes that do not exist yet. So the step that ships a route also adds its nav entry: Account settings (P6.11), the admin items Season (P7.8) and Gallery (P7.11), the playground move (P8.8) and, in January, Help and Membership (P10.22) and Evals (P11.30).
- `app/dev/ui/page.tsx` (P3.4) gains the composites in P6.5 and the eight RewindCard states in P6.9.
- No sign-in-path change merges between 2026-11-25 and 2026-12-10 except a security fix (P8 header). P6.1 changes only admin chrome.
- Every styling PR regenerates its P1.6 visual baselines through the workflow. Where counts fell, it also lowers `design-debt.json` (P1.8, `npm run design:update`) and `e2e/a11y/axe-baseline.json` (P1.7, `UPDATE_AXE_BASELINE=1`).

### Step P6.1: AdminShell, navigation config and route builders

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-12-03 to 2026-12-04. **Depends on:** P3.4, P3.6, P3.7, P3.9.
- **Findings addressed:** UI-04, UI-32, UI-06, UI-21, UI-19

**Objective.** Replace `admin-nav.tsx`, its pasted SVGs and the floating chatbot with one AdminShell built from `lib/admin/nav.ts`. The shell has a sidebar, a mobile top bar and tab bar, and the assistant as a closable right Sheet. Every admin link goes through `lib/admin/routes.ts`, which always passes the year. It lands in the ship window, after the season console, and nothing before the season depends on it.

**Guidance.**
- `lib/admin/nav.ts` holds the `AdminNavItem` config of `design/ui-design-system.md` 5.5 and the IA of 6.2:
  - The groups, in order: Overview (hidden until P10.8); Community (Users, Invites, Announcements, Discord bot); Rewind (Season and Gallery, which P7.8 and P7.11 added to today's nav and this step carries over; Playground, still at `/admin/playground` until P8.8 moves it; then Prompts and Share analytics); Usage and cost (LLM usage, Cost analysis); System (Job queues, Settings).
  - Icons come from `lib/ui/icons.ts`. Labels are sentence case and equal the page titles (UI-21), and the copy says Rewind, never Wrapped (UI-32).
  - `isActive(item, pathname)` follows `match`. Users is `prefix`, so `/admin/users/<id>` lights it (UI-06, `admin-nav.tsx:191-193`). Prompts is `prefix` and never lights for the playground.
  - `mobileTabs()` returns Overview, Users, Rewind, Settings and More. Invites stands in for Overview until P10.8. The Rewind tab opens Season.
  - `titleFor(pathname)` feeds PageHeader (P6.5) and the command menu (P10.16). `ASSISTANT_HIDDEN` lists `^/admin/users/[^/]+/(wrapped|rewind)` and `^/admin/wrapped/[^/]+/history/`. P8.8 adds the playground's story preview.
- `lib/admin/nav-counts.ts` (`server-only`): `getAdminNavCounts()` returns the user count, active invites and failed jobs, cached for 30 s under the tag `admin-nav-counts`. Failed jobs are read through P2.5's fail-fast request-path Redis with a 2 s timeout, and they are `null` when Redis is down.
- `lib/admin/routes.ts`, which P7.9 created with `userRewind` and `userDetail`, gains the remaining typed `Route`s:
  - `llmUsage({ userId, year })`, `llmUsageDetail(id)`, `invite(id)` and `rewindHistory(wrappedId, usageId)`, beside P7.9's `userDetail(id)` and `userRewind(id, year)`, which already returns `/admin/users/${id}/rewind/${year}`.
  - Repoint the UI-06 sites: `app/admin/shares/page.tsx:192`, `app/admin/llm-usage/[usageId]/page.tsx:172` (to `userDetail`) and `:205`, `app/admin/users/[userId]/page.tsx:42`, `:239` and `:329`, and `components/admin/users/user-actions-menu.tsx:122`.
  - Turn the names in `invite-details-client.tsx:279` and the user cells in `app/admin/llm-usage/page.tsx:245-273` into `userDetail` links. `app/admin/users/[userId]/wrapped/page.tsx:23` falls back to P0.14's `getSeasonYear()`, never the calendar year.
- `components/shell/admin-shell.tsx` is a Server Component with three client islands, `admin-sidebar.tsx`, `admin-mobile-bar.tsx` and `admin-tab-bar.tsx`. It follows 6.2:
  - `lg` and up: a 248px sticky `bg-sidebar`. The active item gets `bg-sidebar-accent`, a 3px indicator strip and `aria-current="page"`, inside `<nav aria-label="Admin">`. At `md`: a 56px icon rail with Tooltips.
  - Below `md`: a 56px top bar (menu, Wordmark, "Admin" badge, assistant and search buttons) and a 64px tab bar. More opens a grouped bottom Sheet, and More carries a destructive dot when jobs have failed.
  - The footer holds Back to home, the user's name and role, and Sign out.
  - The Wordmark is P6.3's `components/ui/wordmark.tsx`.
  - The shell owns the one `<main id="main" tabIndex={-1}>` from P3.2. Below `md` it pads `pb-[calc(4rem+env(safe-area-inset-bottom))]`, so no content hides under the tab bar.
  - Keep every `admin-nav-<id>` test id that the specs use. Add `admin-sidebar`, `admin-tab-bar`, `admin-tab-<id>`, `admin-more-sheet`, `admin-back-home` and `admin-sign-out`.
- The assistant (UI-04) is new `components/admin/chatbot/assistant-sheet.tsx`, on `Sheet side="right"` (420px) that becomes a full-height bottom sheet below `md`:
  - It is a dialog labelled "Assistant", with a close button and Escape. The transcript is `role="log" aria-live="polite"`, the input has the sr-only label "Message the assistant", and send is `aria-label="Send"`. Test ids: `admin-chat-toggle`, `admin-chat-close` and `admin-chat-input`.
  - The trigger is a ghost "Assistant" button with `aria-expanded`. It sits under the sidebar's search slot until P6.5's PageHeader takes it, and in the mobile top bar. Delete the fixed button and panel at `chat-window.tsx:97-162`, and move the list and composer into the Sheet body.
  - The sheet renders only when `!config.llmDisabled` and a chat provider exists; today only the provider is checked (`app/admin/layout.tsx:14`). It is hidden on `ASSISTANT_HIDDEN` routes and closes on navigation to one.
- `app/admin/layout.tsx` keeps P4.3's `getAdminGate()`. A refusal renders the denial outside the shell, so non-admins never see the sidebar, and no `error.name` or `error.message` check remains (UI-19). P10.17 swaps the two denial components for StatusScreens.
- Delete `admin-layout-shell.tsx`, `admin-nav.tsx` and `mobile-nav/`. P7.9 has already moved the two legacy v2 viewer routes into the admin preview.

**Tests.**
- `lib/admin/__tests__/nav.test.ts`:
  - ids and test ids are unique, labels are sentence case, and none matches `/Wrapped/`;
  - an `isActive` table, with user detail lighting Users and `/admin/playground` not lighting Prompts;
  - `mobileTabs` with and without Season and Overview, and the hidden-route patterns.
- `lib/admin/__tests__/routes.test.ts`: every builder carries the year it is given, and ids are encoded.
- `components/shell/__tests__/admin-shell.test.tsx` with `jest-axe`: `aria-current`; More opens grouped items, and Escape restores focus; the failed-jobs dot; no assistant when `llmDisabled` is on, when no provider exists, or on a hidden route.
- `components/admin/chatbot/__tests__/assistant-sheet.test.tsx`: the dialog name, close and Escape returning focus to `admin-chat-toggle`, the log role, the input label and the send name.
- New `e2e/admin-shell.spec.ts`: at 390x844, open and close the assistant, `document.elementFromPoint` on each tab hits that tab, and `scrollWidth` is 390; at 1440x900, each `admin-nav-*` link opens its page with `aria-current`.
- Regenerate the admin baselines, and add the mobile shell with the More sheet open.

**Integration.**
- Every admin page renders in the shell's `main`. P10.16 mounts the command menu in the search slots, and P6.5's PageHeader reads `titleFor`.
- P8.8 moves the playground item to `/admin/rewind/playground`, P11.30 adds Evals, P7.9's preview route uses `userRewind`, and P10.8 shows Overview.
- The E2E specs scope with `getByTestId('admin-sidebar')` instead of `locator('aside')`; P10.18 completes that move.

**Demo.** On a phone, open the assistant from the top bar and close it with its close button. The tab bar shows Invites, Users, Rewind, Settings and More, and Rewind opens Season. On desktop, `/admin/users/<id>` lights Users. The Admin link of a 2025 row in Share analytics opens 2025.

**Done when.**
- [ ] `lib/admin/nav.ts`, `nav-counts.ts` and `routes.ts` exist with tests, and the UI-06 links use the builders.
- [ ] The sidebar, rail, top bar and tab bar match 6.2 at every breakpoint, with `aria-current` and the test ids above.
- [ ] The assistant is a closable Sheet, gated on `llmDisabled`, and hidden on immersive routes; nothing floats over content.
- [ ] The admin gate uses no error names, and the old nav files are deleted.

### Step P6.3: AppShell and PublicShell

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-06 to 2026-11-09. **Depends on:** P3.4, P3.6, P3.9.
- **Findings addressed:** UI-30, UI-16

**Objective.** Give member pages one top bar with nav, an account menu and a single notice slot, and give auth, invite and subscribe one PublicShell. The `(app)` layout keeps sending gated members to `/subscribe`, and that page now has a Sign out escape.

**Guidance.**
- New `components/ui/wordmark.tsx` (moved here from P6.1, because P6.3 now lands first) follows 7.5: the pip plus `serverName()`, `font-stretch-85%` past 22 characters, then truncation with the full name in `title`. The server name is UI Q1 (Appendix C decision 12, due 2026-11-05); until it is answered the Plex server's name is used.
- `components/shell/app-shell.tsx` takes the 5.5 `AppShellProps` and follows 6.1:
  - A 60px sticky top bar (`bg-background border-b`, no blur) holds the Wordmark, then the nav from `lib/member/nav.ts`, an "Admin" ghost link for admins, and the account menu (avatar and first name).
  - The active link gets a 2px underline and `aria-current="page"`, set in the client island `member-nav.tsx`.
  - Below `md`, a 56px bar holds the Wordmark, the avatar and a menu button that opens a right Sheet with the same links. There is no bottom bar.
  - `account-menu.tsx` is a DropdownMenu with:
    - a name and email header;
    - "Discord: linked as {handle}" or "Link Discord", which opens `/discord/link` (UI-01);
    - Admin for admins, then Sign out as a normal menu item, replacing the red text link.
  - Keep `admin-dashboard-link` and `sign-out-button` on those items. P6.11 and P10.22 add Account settings and Membership.
- `lib/member/nav.ts`: `memberNav()` starts with Home (`/`, exact) and Rewind 2026 (`/rewind`, prefix). `/rewind` comes from P5.1 (due 2026-11-09), so this PR merges after it.
  - Rewind appears when the member can open something there: `rewindEnabled` with the member in `rewindAudience`, or at least one completed Rewind. P6.9 swaps in its card resolver.
  - P10.22 adds Help, and Membership only when Stripe is on or the member has a subscription row.
- The notice slot: `lib/member/notice.ts` `getMemberNotice(userId)` returns at most one notice, in this priority:
  1. payment past due, only while `stripeEnabled` is on (the banner ignores the toggle today, UI-37);
  2. the pending Plex invite;
  3. a service outage, when Prometheus reports `down`;
  4. P7.14 adds "Your Rewind 2026 is ready", which home suppresses.

  It renders as one `Alert` under the top bar (`data-testid="app-notice"`). `SubscriptionBanners` becomes the renderer for the two subscription notices and keeps `subscription-banners`, `past-due-banner` and `past-due-manage-payment`.
- `app/(app)/layout.tsx`:
  - It keeps `ensureSetupComplete`, `ensureOnboardingComplete` and P4.5's level-aware `ensureSubscriptionOrAccess`, so gated members go to `/subscribe`.
  - With no session it returns `children`, because the signed-out `/` renders its own PublicShell (P10.27).
  - Otherwise it renders `AppShell` with the notice and `<main id="main">`.
  - Remove the header, the gradient wrapper and the nested `main` from `components/dashboard/user-dashboard.tsx`.
- `components/shell/public-shell.tsx`:
  - the Wordmark top-left on `bg-background`, a centred column (`width: 'narrow' | 'wide'` gives 440 or 560px) and `<main id="main">`;
  - an optional `account` prop shows the signed-in name and a ghost "Sign out" (`public-shell-sign-out`). The same prop gives onboarding its minimal variant in P10.23.
  - Adopt it in `app/auth/layout.tsx`, in `app/invite/layout.tsx` (which drops `SpaceBackground`), and in `app/subscribe/page.tsx` and `success/page.tsx` with `account`, so a gated member can always sign out (UI-37).
- UI-16: these two shells become the only chrome. Delete the gradient page wrappers in the files touched here, and leave the content restyles to P10.21, P10.26 and P10.28.

**Tests.**
- `components/shell/__tests__/app-shell.test.tsx` with `jest-axe`:
  - `aria-current` on Home and Rewind;
  - the account menu for admin, member, linked and unlinked cases, opened and navigated by keyboard;
  - the mobile Sheet.
- `lib/member/__tests__/notice.test.ts`: the priority order, nothing while Stripe is off, and the Rewind notice suppressed on home.
- `app/(app)/__tests__/layout.test.tsx`: signed out renders bare children, and a gated member is redirected.
- `components/shell/__tests__/public-shell.test.tsx`: Sign out appears only with `account`.
- New `e2e/member-shell.spec.ts`: the skip link reaches `main#main`, the account menu works by keyboard, and the mobile Sheet opens.
- `stripe-subscription.spec.ts`: a gated member on `/subscribe` sees `public-shell-sign-out`, and signing out lands on `/`.
- Regenerate the home, `/discord/link`, subscribe, invite and sign-in baselines.

**Integration.** P10.17's StatusScreens and P10.26 to P10.28 render inside PublicShell. P6.9 and P10.21 render inside AppShell, P6.11 and P10.22 add their nav entries, and P7.14 adds the Rewind notice.

**Demo.** Sign in as a member: the top bar shows Home and Rewind 2026, and the account menu offers Link Discord. With Stripe on and a lapsed subscription, the member lands on `/subscribe`, signs out from the shell and returns to `/`.

**Done when.**
- [x] AppShell has the top bar, the account menu, the mobile Sheet and one notice slot, with `aria-current`.
- [x] PublicShell wraps auth, invite and subscribe, with a Sign out escape when signed in.
- [x] The `(app)` layout gates as before, with no nested `main`s or gradient wrappers.
- [ ] The visual baselines are updated with reviewed diffs.

(as merged: the bar and the notice step aside on every `/rewind` page, which draws its own Close (`isImmersiveRoute` in `lib/member/nav.ts`, applied by the client island `components/shell/shell-chrome.tsx`, since the layout does not re-render on client navigation). The notice kinds, `pickNotice` and the home rule `noticeShownOn` live in the pure `lib/member/notice-rules.ts`; the kind `rewind-ready` already exists there, and P7.14 adds its producer in `getMemberNotice` and its body in `components/shell/app-notice.tsx`. Both subscription notices, the pending invite included, show only while `stripeEnabled` is on. The signed-out `/` already sits in a bare `PublicShell` so it keeps its one `main`; P10.27 restyles it. Shared for P6.1: `components/shell/use-sign-out.ts`, `DropdownMenuLinkItem` in `components/ui/dropdown-menu.tsx`, and `icons.menu` and `icons.signOut`. `ShellUser.discordHandle` is absent when Discord is off, `null` when unlinked. The avatar is an initials tile. Visual baselines are left to the coordinator's E2E pass.)

### Step P6.5: Admin composites

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-06 to 2026-11-09. **Depends on:** P3.5, P3.6, P3.9.
- **Findings addressed:** UI-21, UI-22, UI-23, UI-13

**Objective.** Add the admin composites of 5.5: PageHeader, StatTile and StatGrid, a URL-driven DataTable, FilterBar with FilterSelect and DateRangeFilter, and EmptyState. Each has component tests and a panel on `/dev/ui`, so P10.18, P7.8 and P10 build pages from parts rather than copies.

**Guidance.**
- `components/ui/page-header.tsx` (UI-21):
  - breadcrumbs in `<nav aria-label="Breadcrumb">`, a `text-h1` title (the nav label, or the entity name on detail pages), `description`, `meta` and `actions` (secondary first, primary last);
  - it renders P6.1's Assistant button in its actions when inside AdminShell, and `data-testid` is forwarded, `admin-<area>-header` by convention.
- `components/ui/stat-tile.tsx` and `StatGrid` (UI-22):
  - the grid is `grid-cols-2 lg:grid-cols-4`, never one tile per row;
  - the value is tabular and `text-foreground`, never coloured, with an optional `unit`, a `meta` dot and word, a segmented `meter` with an `aria-label`, and an optional `href`;
  - a failed value renders a dash with `aria-label="Not available"`, never 0 (5.5, UI-19).
- `components/ui/data-table/` holds `data-table.tsx`, `pagination.tsx`, `stacked-list.tsx` and `row-actions.tsx`, on an exact-pinned `@tanstack/react-table` (UI-23):
  - `manualSorting` and `manualPagination`, because the URL drives both;
  - headers are `<th scope="col">` with `aria-sort`, and their sort buttons replace `?sort=`;
  - the first cell renders a real `Link` from `getRowHref`, with no `tr onClick`;
  - `rowActions` gives a ghost icon button, "Actions for {name}", that opens a DropdownMenu headed with the name;
  - below `md`, the same column defs render `stacked-list.tsx` from `meta.mobile`, with the actions button in each row and no sideways scroll;
  - `empty` takes an EmptyState, `loading` shows `TableSkeleton` rows, and rows emit `${testId}-row-${id}`;
  - pagination renders only when `total > pageSize`. Otherwise the footer reads "Showing all {n} {noun}" (6.3, item 6).
- `lib/ui/table-params.ts`:
  - `parseTableParams(searchParams, { sortable, defaultSort, pageSizes: [25, 50, 100] })` with Zod;
  - `tableHref(pathname, current, patch)` keeps every other param, which is the LLM usage bug of UI-23.
- `components/ui/filter-bar.tsx`:
  - search updates `?q=` after a 250ms debounce through `router.replace(..., { scroll: false })`;
  - `FilterSelect` is P3.5's Select bound to one param, with `defaultValue` "all" and a `FieldLabel` (UI-13);
  - chips appear only for values that differ from their defaults, with "Clear filters", and the result count is `aria-live="polite"`;
  - below `md`: search, then "Filters" (a bottom Sheet holding the same Selects, with a count Badge) and "Sort".
- `components/ui/date-range-filter.tsx`: a preset Select (Last 7 days, 30 days, 90 days, This season) and two labelled date Inputs. They write `from` and `to` as day keys with an inclusive end, which the page turns into instants in `serverZone()` with P2.2's `wallTimeToInstant` and formats with P3.10's `formatDayKey`. P10.2 and P10.5 replace the two date filters with it.
- `components/ui/empty-state.tsx`: the kinds `first-use`, `filtered` and `unavailable`, with the props of 5.5.
- `components/ui/pagination.tsx` becomes the deprecated adapter of 9.4 over DataTable's pagination, keeping `activity-pagination` for `user-activity-timeline.tsx:240`.
- `/dev/ui` gains a composites panel with fixtures (7 users and 120 rows) and `dev-ui-<composite>` ids.

**Tests.**
- `components/ui/__tests__/page-header.test.tsx`: the breadcrumb landmark, one h1, the action order.
- `stat-tile.test.tsx`: two columns below `lg`, the dash with its label, the meter label.
- `data-table/__tests__/data-table.test.tsx` with a mocked router and `jest-axe`:
  - `scope="col"` on every header, and `aria-sort` cycling;
  - sorting keeps the other params, and the first cell is a link;
  - row actions work by keyboard;
  - with a `matchMedia` mock, the stacked list keeps the actions;
  - no pager on one page, and the footer string.
- `filter-bar.test.tsx`: the defaults show no chips, a change adds one, Clear filters resets, and the count is announced.
- `date-range-filter.test.tsx`: an end before the start is refused, and the end is inclusive. `empty-state.test.tsx` covers each kind.
- `lib/ui/__tests__/table-params.test.ts`: the defaults, bad input falling back, and `tableHref` keeping `conversationId`.
- Visual and axe runs on the `/dev/ui` composites at both sizes.

**Integration.** P7.8's season console is the first page built on these (the DataTable and StatGrid), and P7.12's settings section uses the form composites. In January P10.18 rebuilds the users page on them, P10.19 uses PageHeader and EmptyState, and P10.1 to P10.6 the rest. P10.11 deletes the Pagination adapter.

**Demo.** On `/dev/ui`, sort the 120-row table, page through it and watch the URL change. Narrow to 390px: rows stack with their actions. Filter to zero rows: the filtered EmptyState offers Clear filters.

(as merged: `@tanstack/react-table` is pinned at 8.21.3, the last v8; 9.x is a new API and was days old. DataTable also takes `getRowId`, `label` (the table's accessible name), `noun` (the footer) and `getRowName` (the actions menu heading); a column sorts only with `enableSorting: true`, and `?sort=` is `name` or `-name`. `meta` types come from `components/ui/data-table/column-meta.ts`. URL writes go through `hooks/use-replace-params.ts`; `parseDateRange` and `dateRangeToInstants` live in `lib/ui/date-range.ts`. DateRangeFilter takes `zone` (pass `serverZone()`) and an optional `season`, and adds "Any time". `FilterSelect` is not exported until a page needs it alone. PageHeader has no Assistant slot yet: P6.1 adds it with the AdminShell. Jest tests drive the URL through `__tests__/helpers/url-router.ts`. The composite screenshots are in `e2e/visual/primitives.visual.spec.ts` and the demo in `e2e/admin-composites.spec.ts`; neither was run and their baselines are not taken.)

**Done when.**
- [x] The five composites follow 5.5, each with component tests and axe.
- [x] DataTable's sorting and pagination live in the URL, the first cell is a link, row actions work on mobile, and headers have `scope`.
- [x] FilterBar defaults to All and shows active chips; DateRangeFilter reads the server zone.
- [ ] `/dev/ui` shows every composite and has a visual baseline. (Every composite is there; the baseline is left to the coordinator.)

### Step P6.9: Home RewindCard

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-17 to 2026-11-18. **Depends on:** P3.1, P3.7, P6.3, P2.17, P5.5.
- **Findings addressed:** UI-02, RWV-07, RWP-08

**Objective.** Replace `wrapped-card.tsx` with `components/dashboard/rewind-card.tsx`: an app Card whose in-scope field strip prints the member's soundtrack, resolved on the server into one of the eight 5.5 states, with past years as an archive. It merges by 2026-11-20, when its before-season state starts (Rewind 4.4).

**Guidance.**
- New `lib/rewind/home-card-state.ts` holds the pure `resolveCardState(input)`, and `lib/rewind/home-card.ts` (`server-only`) gathers its input in `getRewindCardModel(user, now)`:
  - `getSeasonState(now)` (P2.2), the flags, `checkRewindInfra()` (P2.5), P0.17's `getRewindEligibility`, and the season row with its latest `RewindGeneration`;
  - the newest `RewindView` (unread), the active `RewindShare` (P5.11), and the archive of earlier completed years, each with its ink and `watched` from `RewindView`.
- The states, in resolution order:
  1. `null` while `rewindEnabled` is off, the member is outside `rewindAudience`, or the member is an excluded managed account (FR-45). The exception is the before-season teaser, described below.
  2. `unavailable` when the infrastructure check fails, with "Rewind needs Redis (REDIS_URL)" for admins (FR-50).
  3. `not-eligible`: `jellyfin-only` with the full FR-48 copy and no action, or `joined-late` with "Your first Rewind arrives next year" when the member joined after 1 October of the season year (Rewind 4.5). This replaces the 6-month rule (`wrapped-card.tsx:41-50`, which P3.10 moved server-side) and uses P3.10's calendar helpers in `serverZone()`.
  4. `before-season` from `opensAt` minus 11 days (20 November).
  5. `generating`, from a queued or running generation.
  6. `failed`, when no completed row exists, with copy from a code and never the stored message.
  7. `ready`, or `closed` after `closesAt`; otherwise 8. `not-started`.
- Teaser visibility: Rewind 13.2 hides the card while `rewindEnabled` is off, and P7.16 turns it on only on 2026-11-27, for admins. So the before-season state is exempt from both flags. It reveals nothing and starts nothing.
- `rewind-card.tsx` is a Server Component:
  - Strip: 112px (80px below `md`), `<div data-theme="rewind" {...inkProps(ink)}>`.
    - `ready` and `closed` use `archetypeInks[archetype].field` (P3.3) and an `aria-hidden` SVG of P5.5's `soundtrack(..., { variant: 'weekly' })`.
    - Every other state is paper: a dotted centre line before the season, or a CSS printing-progress bar while generating. No posters.
  - Body: the unread pip and `rewindName(year)` as "Your ... is ready", one lead line, and the meta items, separated by a gap, not a middle dot (7.3):
    - "{n} pages, about {d}", from `data.pages.length` and `formatApproxDuration(issueDurationMs(pages))` (P2.13);
    - the lock "Private. Server admins can view it." (FR-36), or the globe "Public link on until {date}".
  - Actions: "Open Rewind" (`/rewind/{year}?from=/`) and "Share" (`/rewind/{year}?sheet=share&from=/`). The card never creates a link. A lapsed member sees "Sharing needs an active membership", linking to `/subscribe` (FR-51).
  - Footer: archive links and "Data through November 30" (FR-34).
  - Copy lives in `lib/rewind/home-card-copy.ts`, from 5.5. Test ids: `rewind-card` with `data-state`, `rewind-card-open`, `rewind-card-share` and `rewind-card-archive-<year>`.
- The client island `rewind-card-generating.tsx` uses P2.17's `useRewindStatus(year)` and refreshes the route when the run completes. Unread is true until a `RewindView` exists for this row since `generatedAt`; P7.14 writes those views.
- View transition: wrap the strip in `<ViewTransition name="rewind-field">`, and add the matching wrapper around the field layer of P5.5's `components/rewind/pages/cover.tsx`, because no P5 step owns that side.
  - If React 19.3.1 exports it only as `unstable_ViewTransition`, enable `experimental.viewTransition`. Reduced motion gives a plain navigation, and the P1.9 skill `vercel-react-view-transitions` applies.
- Delete `wrapped-card.tsx`, its `Sparkle` loops and its client fetch waterfall (UI-41), with their tests. `user-dashboard.tsx:97` renders the new card until P10.21.

**Tests.**
- `lib/rewind/__tests__/home-card-state.test.ts`, a table over every state and `null` case:
  - in America/Chicago, nothing at 23:59 on 19 November and `before-season` at 00:00 on 20 November, with the flags off;
  - joined 1 October is eligible, and 2 October is late;
  - Jellyfin-only, Redis down, `closed` after 31 January, and unread true and false.
- `components/dashboard/__tests__/rewind-card.test.tsx`:
  - each state's copy, and no Generate button anywhere; the registry meta, the Share href and the lapsed share copy;
  - a failed row never shows `error`; the strip carries `data-theme="rewind"`, and `expectNoDarkInsideLight` (P3.3) holds on paper.
- New `e2e/rewind-card.spec.ts`: a seeded v3 row shows the ready state with the pip, and Open reaches `/rewind/2026` with a `rewind-field` view transition on chromium and webkit; with `page.clock` at 2026-11-21, the card reads "Your Rewind arrives on December 1".
- `/dev/ui` gains the eight states, matching `components.html`, with visual baselines.

**Integration.** P10.21 places the card first on home. P7.14 drives `unread` and the notice, and P8.2's audience switch moves members from `before-season` to `ready`. P3.10's 6-month helper is replaced, and P7.3 reuses the `joined-late` rule.

**Demo.** On 21 November, a member sees a paper strip with "Your Rewind arrives on December 1". An admin with a generated issue sees the ink strip and the pip, and opening it morphs the strip into the cover.

**Done when.**
- [ ] All eight states resolve on the server from data, with tests, and none offers a generate action.
- [ ] The strip prints the soundtrack in the archetype ink, and the meta line comes from the registry.
- [ ] Share links to `?sheet=share`, and the archive lists past years.
- [ ] The view transition runs on chromium and webkit, and the card is merged by 2026-11-20.

### Step P6.11: Account page and Discord link page

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-11-17 to 2026-11-18. **Depends on:** P6.3, P3.5, P2.1.
- **Findings addressed:** UI-01, UI-07, UI-30

**Objective.** Add `/account` with Discord, Rewind notifications, time zone and a reserved Appearance section. Turn `/discord/link` into the 6.6 checklist, reachable from the account menu, home and onboarding, with every Discord result arriving as a short code that `FlashFromQuery` shows on the page the member came from.

**Guidance.**
- New `app/(app)/account/page.tsx` is a 560px column of Cards (6.1), with `metadata = { title: 'Account' }`:
  - Discord: "Linked as {username}" with Manage, or "Link Discord", both to `/discord/link`.
  - Notifications: a Switch, "Tell me when my Rewind is ready", stored as `RewindPrefs.notify` for `getSeasonState().seasonYear` (Rewind 9.7). Its description says it governs the Discord DM and the notice on other pages, and that the home card shows the ready state either way.
  - Time zone, in the client island `timezone-field.tsx`:
    - a Select whose first option is "Server time zone ({serverZone()})", stored as null, followed by P2.2's `timeZoneOptions()` (`lib/utils/zoned-time.ts`), which adds the `UTC` that Node 22's list lacks;
    - while `User.timezone` is null and the browser's zone differs, the field is pre-filled with the browser's zone and the section shows "Unsaved changes" until Save;
    - the hint reads "Used for times in your Rewind. A change applies the next time your Rewind is made."
  - Appearance renders nothing until P10.10 adds the light-theme flag and resolver. Reserve its place after Time zone.
- New `actions/account.ts`, with P4.3 `memberAction`s:
  - `setRewindNotify({ notify: z.boolean() })` upserts on (`userId`, `year`);
  - `setUserTimezone({ timeZone })`, where `timeZone` is a nullable string that must be in `timeZoneOptions()`, stored after P2.2's `normalizeTimeZone`, so `US/Pacific` becomes `America/Los_Angeles`;
  - both revalidate `/account`.
- `/discord/link`: P1.1's Server Component page renders new `components/discord/link-checklist.tsx`, rebuilt from `link-panel.tsx` (6.6):
  - three items: Plex account (from `plexUserId`), Discord account (linked as) and Member role (`metadataSyncedAt` and `isOnServer`);
  - one primary for the next missing item ("Link Discord" to `/discord/connect?redirect=/discord/link`, or "Join the {serverName} Discord"), and Join as the secondary;
  - the privacy line "We keep your Discord ID and name to give you the member role. Unlink any time.";
  - Disconnect and Resync call `router.refresh()` instead of "Refresh the page";
  - keep P1.1's `discord-link-*` ids, and add `discord-link-step-<item>` with `data-done`.
- Codes (UI-07): P3.2 already sends `flash=` codes, and P4.9 validates `redirect` with `safeRedirectPath`. This step makes every redirect out of `app/(app)/discord/connect/route.ts` and `app/api/discord/callback/route.ts`, success or failure, land on that safe target (default `/discord/link`) instead of `/`. The flash then shows where the member started.
- Links: the account menu (P6.3) gains Account settings and keeps the Discord line; home's quick link (P10.21) already points here; onboarding (P10.23) starts OAuth directly and names this page for later.

**Tests.**
- `app/(app)/account/__tests__/page.test.tsx`: the sections render, Appearance is absent, and both Discord states render.
- `actions/__tests__/account.test.ts`:
  - "Mars/Olympus" is refused, "US/Pacific" is stored as "America/Los_Angeles", and null stores null;
  - the notify upsert is keyed by the season year, and another member's prefs are untouched;
  - a call without a session is refused.
- `timezone-field.test.tsx` with a mocked `Intl`: the pre-fill and the dirty state, and the server option saving null.
- `components/discord/__tests__/link-checklist.test.tsx`: exactly one primary, the next missing item, and the privacy line.
- Route tests: a rate-limited connect redirects to `/discord/link?flash=discord_rate_limited`, and `redirect=/admin` falls back to `/discord/link`.
- New `e2e/account.spec.ts`:
  - a saved zone persists after a reload, and the notify switch persists;
  - `/discord/link?flash=discord_linked` shows the toast and strips the param;
  - the account menu reaches `/account`.
- Visual baselines for `/account` and `/discord/link`, the latter against the `screens.html` frame.

**Integration.** P2.2's westernmost-zone rule and the stats read `User.timezone`. P7.14's notification job reads `RewindPrefs.notify`. P10.10 fills Appearance, and P11.15 adds the export to `/account`.

**Demo.** Open `/account` in a browser set to Europe/London on a Chicago server: the field suggests Europe/London; save it, and it persists. From `/discord/link`, link Discord and return to the same page with "Discord linked" and the checklist's second item done.

**Done when.**
- [ ] `/account` stores `RewindPrefs.notify` and `User.timezone` through Zod-validated member actions.
- [ ] `/discord/link` is the checklist with one primary action, linked from the account menu and home.
- [ ] Every Discord redirect lands on the safe origin page with a code, and `FlashFromQuery` shows it.
- [ ] The E2E and visual checks pass.
