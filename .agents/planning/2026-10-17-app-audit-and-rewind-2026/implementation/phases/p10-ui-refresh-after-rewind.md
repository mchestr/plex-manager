> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 10: UI refresh after Rewind

**Goal.** After Rewind ships, finish the design-system refresh (`design/ui-design-system.md` 9.2): the token codemod and the spinner and icon sweeps, the status screens, the admin users and settings pages, the command menu, the home refresh and every member and public page (announcements, help, membership, onboarding, setup, invite, sign-in and subscribe), then the remaining admin pages, the data-loading cleanup, the Overview page, charts on shadcn Chart, the light theme behind its flag and the removal of the adapters.

P10.13 to P10.28 moved here from P3 and P6 (formerly P3.11 to P3.13, P6.2, P6.4, P6.6 to P6.8, P6.10 and P6.12 to P6.18). None of them has a Rewind consumer, and the member-facing ones would otherwise rebuild the sign-in, invite and onboarding screens in the week the season opens. This departs from ui-design-system 9.2 Phases 1 and 3; Appendix C decision 28 records it, as decision 22 does for the remaining admin pages.

**Window.** 2027-01-04 to 2027-02-19. The code freeze ended with the final cut on 2027-01-02. The phase ends at the milestone "UI refresh complete" on 2027-02-19: every member and admin route meets the 9.5 definition of done, the adapters are gone, the guardrails and raw-element bans are errors, and chart.js is uninstalled.

**Tracks.** Every step is on the ui track, while P11 runs beside it. Two ui lanes, at most two open PRs each:
- **member and public:** P10.13, P10.17, P10.21, P10.22, P10.12, P10.23, P10.27, P10.26, P10.28, P10.24, P10.25, P10.15, P10.8 and P10.10;
- **admin:** P10.14, P10.18, P10.19, P10.20, P10.16, P10.1, P10.2, P10.3, P10.4, P10.5, P10.6, P10.7, P10.9 and P10.11.

**Ordering that matters.**
- New shared files, and the step that creates each:
  - `components/ui/status-screen.tsx`: P10.17. It replaces P6.1's interim denial screens, and P10.27's sign-in screens use it.
  - `components/ui/stepper.tsx`, in both orientations: P10.23. P10.25 rebases on it.
  - `components/ui/secret-input.tsx` and `actions/admin/test-connection.ts`: P10.20, reused by P10.25.
  - `components/guides/*`: P10.22, consumed by P10.23.
  - `User.announcementsSeenAt`: migrated in P10.21, its first reader, and reused by P10.22.
  - `components/ui/tabs.tsx`: P10.19. P3 shipped no Tabs primitive.
  - `components/ui/chart-card.tsx` with a declarative chart spec and an interim Chart.js body: P10.2. P10.5 moves the Discord charts onto it, and P10.9 swaps only the body to Recharts.
  - `lib/utils/day-window.ts` (zone-correct, zero-filled day windows): P10.2, reused by P10.5 and P10.8.
  - `hooks/use-live-refresh.ts` and `components/ui/live-status.tsx`: P10.3, reused by P10.5 and P10.8.
  - `lib/admin/can-regenerate.ts`: P10.6, reused by the users list menu and the Overview.
- P10.13's codemod tool runs first; P10.14 and the page rebuilds (P10.1 to P10.6, P10.17, P10.21 to P10.28) run it over their own folders as their first commit.
- P11.31 cleans up duplicate service rows before P10.24's setup model, and P11.32's setup claim lands before P10.24 and P10.25.
- `typedRoutes` (P3.2): the step that ships a route adds its nav entry, for example Help and Membership (P10.22) and the home card's "View all" (P10.22).
- P11.3 (worker role, from 2027-02-08) and P10.3 both touch the worker-state read; P10.3 lands first and reads workers through Redis, so the page stays right when P11.3 moves the workers out of the web process.
- P11.5 (admin actions on the helper) and P10.7 both move read helpers out of `'use server'` modules. The new reads in P10.1 to P10.6 go straight into `server-only` modules, so P11.5 has less to move.
- P10.11 runs last: it deletes the adapters only after every page in P10.1 to P10.10 and P10.12 to P10.28 has moved off them.
- Every styling PR regenerates its P1.6 visual baselines through the workflow and lowers `design-debt.json` and `e2e/a11y/axe-baseline.json` where counts fell.

### Step P10.1: Invites list and detail pages

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-21 to 2027-01-25. **Depends on:** P6.5, P10.18.
- **Findings addressed:** UI-41, UI-43, UI-23, UI-21, UI-28, BP-29, BP-30

**Objective.** `/admin/invites` and `/admin/invites/[inviteId]` load on the server and render on the admin composites, with the users page (P10.18) as the reference. The 644-line `invites-page-client.tsx` and the 308-line `invite-details-client.tsx` are replaced by small components and a clipboard hook.

**Guidance.**
- **Token codemod first** (the former P3.12 area for invites): run P10.13's tool over `app/admin/invites` and `components/admin/invites` as the first commit of this PR, with P10.14's panel and Button rules, so the rebuild starts from tokenised files.
- Reads: new `lib/admin/invites/queries.ts` (`server-only`) with `listInvites({ page, pageSize, status, server, q, sort })` and `getInviteDetail(id)`. Both use P0.18's `publicUserSelect` and `InviteWithUsages`, never `include: { user: true }`.
  - Status filters: expired is `expiresAt < now`; used up is `useCount: { gte: prisma.invite.fields.maxUses }`, a Prisma field reference, because a plain `where` can't compare two columns; active is neither.
  - `app/admin/invites/page.tsx` parses `searchParams` with P6.5's `parseTableParams` and Zod, awaits the list and passes it down. `[inviteId]/page.tsx` calls `notFound()` instead of today's client `router.push` (`invite-details-client.tsx:38-56`).
- Writes (BP-30): move `createInvite` and `deleteInvite` out of the 937-line `actions/invite.ts` into new `actions/admin/invites.ts`, as `adminAction`s (P4.3) with Zod: code `^[A-Z0-9-]{4,32}$` (optional), `maxUses` 1 to 100, `expiresIn` an enum, and library id arrays. Each calls `revalidatePath('/admin/invites')` and the detail path, which removes the manual `loadInvites()` re-fetches (`:168`, `:202`). Redemption (`processInvite`, `processJellyfinInvite`, `validateInvite`) stays in `actions/invite.ts`. Note in the PR that P11.21 can skip this file.
- Libraries: start `getAvailableLibraries()` and P0.6's server-only Jellyfin library read on the server and pass them to the dialog as promises, read with React 19 `use()` inside a Suspense boundary. The list then never waits for Plex or Jellyfin, and the mount-time `getJellyfinLibraries` probe (`:62-77`) goes. A failed Jellyfin read disables the Jellyfin option and says why.
- New components in `components/admin/invites/`:
  - `invites-table.tsx`: DataTable columns: code as the first-cell link to `invite(id)` from `lib/admin/routes.ts`; server as plain text; uses as "3 of 5"; status as `StatusBadge` domain `invite`; expires and created through `formatDate`. Row actions: Copy link, then "Delete..." (ConfirmDialog "Delete invite AUDIT2026?", destructive, with a pending state).
  - `create-invite-dialog.tsx`: a 640px Dialog with a SegmentedControl for Plex or Jellyfin, FormFields for code, uses and expiry (Select), and an "Allow downloads" Switch for Plex only. It is a `<form action>` with `useActionState`; errors render inside the dialog (UI-42), and success shows the code with Copy link.
  - `library-picker.tsx`: one picker for both server types, replacing the two copies at `:507-570`. "All libraries" is the default, then a Checkbox list.
  - `invite-usage-table.tsx`, and `hooks/admin/use-copy-invite-link.ts` for the clipboard write and toast. The URL comes from a new `publicInviteUrl(code)` builder in `lib/admin/routes.ts`.
- List page: PageHeader "Invites" with the primary "Create invite"; FilterBar with search, Status and Server (both default All); EmptyState `first-use` ("No invites yet", primary "Create invite") and `filtered` ("No invites match these filters", "Clear filters"); pagination only past one page.
- Detail page: breadcrumbs "Invites / AUDIT2026"; the code as h1 with the status badge in `meta`; actions Copy link and Delete. It previews P10.26's `InvitePass` with this invite's real state, libraries and uses left, so the admin sees what the invitee sees. The usage table links each member to `userDetail(id)` (UI-06) and shows `formatDateTime(d, { zoneLabel: true })` in `Config.timezone`.
- Test ids: keep `generate-invite-button`, `invite-server-type-plex`, `invite-server-type-jellyfin` and `create-invite-submit`; add `admin-invites-row-<id>`, `admin-invites-actions-<id>`, `admin-invites-create-dialog` and `admin-invite-delete`.

**Tests.**
- `lib/admin/invites/__tests__/queries.test.ts`: each status filter builds the expected `where` (the field reference for used up), and the serialized DTO holds no token field (P0.18's assertion).
- `actions/admin/__tests__/invites.test.ts`: non-admins refused, Zod rejections, a duplicate code, and the `revalidatePath` calls.
- `components/admin/invites/__tests__/`: `create-invite-dialog.test.tsx` (labels wired, the server switch swaps the picker and hides Allow downloads for Jellyfin, the pending state, an inline error, success with Copy link); `library-picker.test.tsx` (keyboard, All versus a subset); `invites-table.test.tsx` (both EmptyState kinds, the row link, the actions menu named for the code); `use-copy-invite-link.test.ts`.
- E2E: new `e2e/admin/invites.spec.ts` creates a Plex invite, finds it in the list, opens the detail page, checks the pass preview and deletes it through the confirm. Move `e2e/jellyfin-invite.spec.ts` and `e2e/accessibility.spec.ts:110` (`button[aria-label*="Delete invite"]`) onto test ids.
- Visual: the list (seeded and empty) and the detail page at 1440x900 and 390x844 in `e2e/visual/admin.visual.spec.ts`; axe with the dialog open.

**Integration.** Delete `invites-page-client.tsx` and `invite-details-client.tsx` once knip shows no importer. P6.1's `getAdminNavCounts()` badge ("3 active") and the command-menu invite lookup (P10.16) use the same active filter and `invite(id)`. `app/admin/invites/loading.tsx` renders `PageHeaderSkeleton` and `TableSkeleton`.

**Demo.** Open `/admin/invites` with network throttling: the list arrives in the first response, with no spinner. Create a Jellyfin invite and copy its link from the success state. Open the detail page and compare the pass preview with `/invite/<code>` in a private window. Delete it and land on the list with a toast.

**Done when.**
- [ ] Both routes load on the server, with no `useEffect` data loading and no `@ts-ignore` in the invite components.
- [ ] Create and delete run through `actions/admin/invites.ts` with Zod and `revalidatePath`, and errors show inside the dialog.
- [ ] One LibraryPicker serves Plex and Jellyfin, and no invite component is over 200 lines.
- [ ] Both pages meet the 9.5 definition of done: PageHeader, DataTable, FilterBar, EmptyState kinds, `lib/utils/format.ts` and test ids.
- [ ] Jest, E2E, axe and the updated visual baselines pass.

### Step P10.2: Analytics pages: shares, LLM usage and cost

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-25 to 2027-01-27. **Depends on:** P6.5, P3.10.
- **Findings addressed:** UI-24, GAP-42, UI-13, UI-28, UI-23, UI-06

**Objective.** Share analytics, LLM usage and cost analysis show honest numbers bucketed in `Config.timezone`, on the admin composites and the first ChartCard, in time for the season success review on 2027-01-15.

**Guidance.**
- **Token codemod first** (the former P3.12 area for LLM usage, cost analysis and shares): run P10.13's tool over `app/admin/llm-usage`, `app/admin/cost-analysis`, `app/admin/shares` and their components as the first commit. The white-on-cyan `text-xs` row actions (`app/admin/llm-usage/page.tsx:308` and their copies) become `Button size="sm"` or `Badge` (UI-12), and today's four `/admin/llm-usage` `color-contrast` violations should drop. The charts move onto `registerCharts()` and `chartTheme('dark')` from P3.9: series take `chart-1` to `chart-5` in a fixed order, the hex literals `#94a3b8`, `#1e293b` and friends go, and a test snapshots each chart's options object to assert its colours come from `chartTheme`.
- Day windows: new `lib/utils/day-window.ts` on P2.2's `zoned-time.ts` and `serverZone()`, with no second zone implementation.
  - `dayWindow({ from, to }, zone)` gives the UTC bounds (start inclusive, end exclusive) and the inclusive list of `YYYY-MM-DD` keys. `defaultWindow(days, zone)` counts back from today in the zone and includes today. `zeroFill(keys, rows)` fills the gaps.
  - Labels use P3.10's `formatDayKey`, never `new Date('YYYY-MM-DD')`.
  - Move `toDateKey` in `lib/discord/audit/query-helpers.ts:34` onto `dayKey(ms, zone)`, and zero-fill `getDailyActivity` (`metrics/activity.ts:44-64`) and `errorTrend` (`metrics/errors.ts:95`). Both Discord charts then label one day one way; P10.5 renders them.
- ChartCard: new `components/ui/chart-card.tsx` with `title`, `description`, `summary` (the chart's `aria-label`) and a "View as table" toggle, a real `<table>` with `scope="col"` (3.5).
  - It takes a declarative `spec`: `kind` (`bar`, `line`, `stacked-bar` or `ranked-bar`), day keys or categories, series in fixed slot order, and a value format. Pages never pass Chart.js options, so P10.9 changes only the body.
  - The interim body, `components/ui/chart-card/chartjs-body.tsx`, is one client island loaded with `next/dynamic`. It holds the app's only `ChartJS.register` and takes colours from P3.9's `chartTheme(mode)`.
  - Daily series are bars over every day key, with no `tension` and no invented curve (UI-24). Fewer than two categories render a StatTile or a ranked list instead of a donut. Money ticks use `formatMoney`.
- Cost (`app/admin/cost-analysis/page.tsx`):
  - DateRangeFilter (P6.5) writes `from` and `to`; map the old `startDate` and `endDate` params on read so bookmarks survive. Delete `cost-date-filter.tsx` (UI-13).
  - The header reads "Period: Oct 1 – Oct 17, 2026" from the inclusive end, never the exclusive bound that `toEndOfDayExclusive` returns (`:19`, `:53`).
  - StatGrid: total cost, requests, cost per 1M tokens, and projected 30 days. The projection is the period's cost divided by its calendar days, times 30, with the hint "At this period's daily average". Today's code divides by active days only (`:29-37`).
  - ChartCards: daily cost (bars), cost by model and by user (ranked bars), and provider (a StatTile while there is one).
  - Totals come from P7.8's `groupBy` queries (BP-28). The daily series selects only `createdAt` and `cost` and buckets with `dayKey`, because Prisma can't truncate dates in a zone and CLAUDE.md rules out raw SQL.
- Shares (`app/admin/shares/page.tsx`): new `lib/admin/analytics/shares.ts` (`server-only`) replaces `actions/share-analytics.ts` and reads `RewindShare` and `RewindShareVisitDay` (Rewind 6.2, 7.10).
  - v2 tokens keep their `WrappedShareVisit` rows (P0.11 writes one per view with only the Rewind id, and P0.20 scrubbed the older ones), but they appear only as a count in a tile hint until P11.18 removes them.
  - StatGrid: public links on, visits in the period, links created in the period, and average visits per link.
  - One ChartCard: links created and visits per day, zero-filled through today.
  - DataTable of links: member (the first-cell link goes to `userRewind(userId, year)`, keeping the year, UI-06), year, pages published, created, expires, status (Active, Expired or Stopped) and visits. No token or URL is ever shown.
- LLM usage (`app/admin/llm-usage/page.tsx` and `[usageId]/page.tsx`):
  - The title is "LLM usage", the nav label.
  - FilterBar: member, purpose (Rewind, assistant, Discord), model, plus DateRangeFilter.
  - The DataTable links user cells to `userDetail(id)`, shows money through `formatMoney`, and pages through `tableHref`, which keeps every param. Today's Prev and Next drop `conversationId` (`:331`, `:339`).
  - Group before paginating (UI-23): add `LLMUsage.groupKey`, `chatConversationId ?? id`, written by `lib/llm/usage.ts`, backfilled in the migration and indexed with `createdAt`. Page with `prisma.lLMUsage.groupBy({ by: ['groupKey'], orderBy: { _max: { createdAt: 'desc' } }, skip, take })`, then load that page's rows. The count is the number of groups.
  - The detail page's "View all" goes to `llmUsage({ userId, year })` and "View Rewind" to `userRewind(userId, year)` (`:172`, `:205`).
- Delete the local `formatDate` and `$${n.toFixed(p)}` sites on these pages (UI-28).

**Tests.**
- `lib/utils/__tests__/day-window.test.ts`: 2026-10-17T18:00Z under UTC, Los Angeles, Berlin and Sydney; both DST changes; the window includes today; the end is inclusive.
- `lib/discord/audit/metrics/__tests__/activity.test.ts`: zero-filled days keyed in the server zone.
- `components/ui/__tests__/chart-card.test.tsx`: the chart has an accessible name, the table shows the same values, and a single category falls back to a tile.
- `lib/admin/analytics/__tests__/`: the seeded $0.0874 over 4 active days in a 30-day window projects about $0.09, not $0.66; share stats come from `RewindShareVisitDay`; no conversation splits across pages, and the total counts groups.
- E2E `e2e/admin/analytics.spec.ts`: `?from=2026-10-01&to=2026-10-17` shows that period; a shares row opens the right member and year; page 2 of LLM usage keeps the member filter. axe on all three pages, which clears today's `role-img-alt` and the date-input `label` failures.
- Visual: the three pages at both sizes.

**Integration.** Delete `share-time-chart.tsx` and the four `components/admin/cost-analysis/cost-*-chart.tsx` files, with their tests in `components/__tests__/`. Add the `llm_usage_group_key` migration with its backfill. `lib/admin/routes.ts` gains `from` and `to` on `llmUsage()`. The 2027-01-15 review reads the shares page.

**Demo.** With `Config.timezone` set to `America/Los_Angeles`, open cost analysis after 17:00 Pacific: today's bar carries today's label, the period header matches the picker, and the projection hint states its method. On a quiet day the shares chart still shows today at zero. A row opens that member's year.

**Done when.**
- [ ] All three pages bucket and label days in `Config.timezone`, include today and show an inclusive period.
- [ ] Projections divide by calendar days, and every amount goes through `formatMoney`.
- [ ] ChartCard is the only chart wrapper on these pages, and one Chart.js registration serves them.
- [ ] LLM usage groups before paginating, keeps every param and links members; share rows keep the year.
- [ ] axe passes and the visual baselines are updated.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P10.3: Queues page with live status

- **Track:** ui. **Lane:** admin. **Effort:** S. **Window:** 2027-01-28 to 2027-01-28. **Depends on:** P6.5.
- **Findings addressed:** UI-08, UI-22, UI-23

**Objective.** `/admin/queues` shows the real worker and queue state in words, refreshes itself while it is visible, and fits a phone.

**Guidance.**
- **Token codemod first** (the former P3.12 area for queues): run P10.13's tool over `app/admin/queues` and `components/admin/queues`. Pause Queue (`components/admin/queues/queue-controls.tsx:64`, 2.93:1 today) becomes `secondary` with a `pause` icon, because warning is never a fill, and the `/admin/queues` contrast entries leave the axe baseline.
- Live refresh, shared with P10.5 and P10.8:
  - new `hooks/use-live-refresh.ts`: while `document.visibilityState === 'visible'`, it calls `router.refresh()` inside `startTransition` every `intervalMs`, 10 s here (6.3's monitoring pages). It refreshes once on return to the tab and stops while `paused`. The Server Component re-reads its data, so no API route or polling action is added (BP-33).
  - new `components/ui/live-status.tsx`: "Updated 3s ago" from a `renderedAt` prop the server sets, ticking each second with no live announcement, and a Toggle "Pause live updates" (`aria-pressed`).
  - The page pauses the refresh while a dialog, a menu or a row action is open, so rows never move under the pointer.
- Worker state: read it from BullMQ's `queue.getWorkers()` (the worker connections registered in Redis) in `getQueueDashboardData()` (`actions/admin/queue.ts:119`), instead of the in-process `isWorkerRunning()` (`lib/queue/worker.ts:174`). It stays right when P11.3 moves the workers into their own process.
- The status row replaces `queue-status.tsx`. It has three dot-and-word items from `lib/ui/status.ts`: "Worker running" or "Worker stopped" (destructive), "Redis connected" or "Redis unreachable", and "Queue running" or "Queue paused". It never says "Processing" while the worker is stopped (`:88-95`), it drops `animate-ping`, and `flex flex-wrap gap-x-4 gap-y-2` wraps it at 390px.
- StatGrid replaces `queue-stats.tsx`: Waiting, Running, Failed, Delayed and Completed, two tiles per row on mobile. Failed links to `?status=failed`.
- Pause: `queue-controls.tsx` becomes PageHeader actions. "Pause queue" and "Resume queue" are Buttons with a stable label for each state and `loading` while pending, behind a ConfirmDialog that names the consequence: "Waiting jobs, including Stripe access changes and Rewind generations, won't run until you resume." The actions call `revalidatePath('/admin/queues')`, so the two `window.location.reload()` calls go and no `router.refresh()` is added (BP-31).
- Jobs: a DataTable replaces `job-table.tsx`. Columns: the job type from a label map in `lib/queue/types.ts` (replacing the regex in `formatJobType`), a `StatusBadge` in the queue-job domain, attempts, created as `<Time>`, duration through `formatDuration`, and the error, truncated with a Tooltip. Row actions: Retry (failed jobs only), then "Remove..." with a ConfirmDialog. The page total comes from `getJobCounts` for the filtered status, so the footer reads "Page 2 of 7" instead of "Page 2+" (UI-23). FilterBar (status, job type) replaces `queue-filters.tsx`.
- The scheduler list becomes a Card with a definition list, without `'use client'`.
- The title is "Job queues", the nav label. Without Redis the page shows an Alert, "Scheduled jobs and Rewind need Redis (REDIS_URL)", and the tiles show a dash with `aria-label="Not available"`.

**Tests.**
- `hooks/__tests__/use-live-refresh.test.ts` with fake timers: a refresh every 10 s while visible, none while hidden, one on return, none while paused, and cleanup on unmount.
- `components/ui/__tests__/live-status.test.tsx`: the relative text advances, and the Toggle's pressed state.
- `components/admin/queues/__tests__/queue-status-row.test.tsx`: every combination of Redis, worker and paused maps to the right words, and a stopped worker never reads as running.
- `actions/admin/__tests__/queue.test.ts`: the worker state follows a mocked `getWorkers()`; pause and resume revalidate.
- E2E `e2e/admin/queues.spec.ts`: pause through the confirm and read "Queue paused", then resume; retry a seeded failed job; at 390px `scrollWidth` is 390.
- Visual: queues at both sizes, with LiveStatus masked.

**Integration.** Delete `queue-status.tsx`, `queue-stats.tsx`, `queue-filters.tsx`, `queue-controls.tsx` and `job-table.tsx` after the move. P6.1's nav badge ("2 failed") reads the same counts. `/dev/ui` shows LiveStatus.

**Demo.** Run the web process without workers: within 10 s the row reads "Worker stopped", with no reload. Trigger a watchlist sync from another tab and watch the job appear. Pause and resume through the confirm, and open the page at 390px.

**Done when.**
- [x] Worker, Redis and queue state are words with dots, and the worker state is read from Redis.
- [x] The page refreshes every 10 s while visible, shows "Updated Ns ago" and can be paused.
- [x] Pause and Resume are labelled Buttons with a confirm, and no `window.location.reload()` remains.
- [x] Jobs are in a DataTable with Retry, a page total and FilterBar, and the page meets 9.5 at 390px.

(as merged: the reads moved out of `actions/admin/queue.ts` into `lib/admin/queues.ts` (`server-only`: `getQueueDashboard`, `listQueueJobs`), so the worker-state test is `lib/admin/__tests__/queues.test.ts`; the actions file keeps only the mutations, each revalidating `/admin/queues`. Shared API for P10.5 and P10.8: `useLiveRefresh({ intervalMs, paused })` in `hooks/use-live-refresh.ts`; `components/ui/live-status.tsx` exports `LiveStatus` (presentational), `LiveRefreshProvider` (`renderedAt`, `intervalMs`), `LiveRefreshStatus` and `useHoldLiveRefresh(open)`, which dialogs and menus call to hold the refresh. `RowActions` and `DataTable` gained `onOpenChange` / `onRowActionsOpenChange` for that. `formatDuration` takes `smallestUnit: "second"`. `lib/ui/status.ts` gained the `redis` and `queue` domains (`queue.unknown` when Redis does not answer). `lib/queue/client.ts`'s `getJobs` became `getJobPage` (page plus total) and `getWorkerCount`; `isWorkerRunning` and `isRedisHealthy` are gone. The token codemod was not run (P10.13 owns it); the files were written on tokens. Visual and axe baselines for `/admin/queues` are left to the owner's workflow; `e2e/admin/queues.spec.ts` was written but not run.)

### Step P10.4: Prompts pages and the split editor

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-28 to 2027-02-01. **Depends on:** P6.5.
- **Findings addressed:** UI-43, BP-30, UI-21, UI-23

**Objective.** The prompts list becomes a DataTable with status badges. The 853-line editor becomes a 960px page of small components and hooks that edits what Rewind v3 reads: the appended style-guide block.

**Guidance.**
- **Token codemod first** (the prompts part of the former P3.12 area 4; the playground and admin Rewind views in that area are skipped): run P10.13's tool over `app/admin/prompts` and `components/admin/prompts`. The gradient Link at `app/admin/prompts/page.tsx:32-36` becomes `<Button render={<Link />}>`.
- What the pages now edit. Since P5.9 the system prompt is frozen in code (`lib/wrapped/prompt/rewind-2026.ts`, `rewind-2026.1`). `PromptTemplate.kind` is `v2-full` or `rewind-style-guide`; a style guide is at most 1,200 characters with no placeholders, read by `findRewindStyleGuide()` (`lib/wrapped/prompt/store.ts`) and audited as `PROMPT_TEMPLATE_CHANGED` (Rewind 8.3, RWP-13).
- The v2 machinery in `prompt-template-editor.tsx` goes with the split: the placeholder catalogue and search modal (`:26-121`), the 125-line example-statistics fixture (`:124-250`) and the client-side "simplified" replacement (`:258-322`). If knip still finds a production caller of v2's `replacePlaceholders` (`lib/wrapped/prompt-template.ts:27`), move it and the catalogue into a pure `lib/wrapped/prompt-placeholders.ts` that returns unknown `{{tokens}}` (UI-43); otherwise delete them.
- Move the schema into `lib/validations/prompt.ts` (name 1 to 80 characters, description up to 280, the style guide up to 1,200, `kind`), shared by `actions/prompts.ts`, the form and P8.8's playground input.
- `v2-full` rows open read-only, with the Alert "This is a v2 template. Rewind 2026 only appends a style guide, so this text isn't used." They offer "Copy into a new style guide" (the first 1,200 characters, with a visible note when text was cut) and Delete.
- List (`app/admin/prompts/page.tsx`): PageHeader "Prompts" with "New style guide" as the primary.
  - DataTable columns: name (the first-cell link), status through a new `prompt` domain in `lib/ui/status.ts` ("In use" success, "Not in use" neutral, "v2, not used" outline), version, length ("820 of 1,200"), updated (`formatDate`) and updated by (a name).
  - Row actions: Edit, "Use for Rewind..." (a ConfirmDialog naming both the new and the current style guide), then "Delete..." (disabled for the one in use). EmptyState `first-use`.
- Editor pages (`new/page.tsx`, `[promptId]/edit/page.tsx`): `max-w-[960px]`, a PageHeader with breadcrumbs "Prompts / {name} / Edit", and Save as the only primary, in the footer. Drop the `getUserPlexWrapped(session.user.id, new Date().getFullYear())` example fetch, which finds nothing in January.
- Split the editor into `components/admin/prompts/editor/`, each file under 200 lines:
  - `prompt-details-fields.tsx`: name, description and the "Use for Rewind" Switch, as FormFields;
  - `style-guide-field.tsx`: a Textarea in a FormField with the counter "820 of 1,200 characters", announced politely at 90% and at the limit, and the error wired through `aria-describedby`;
  - `prompt-preview.tsx`: the assembled prompt from the same `systemPrompt(styleGuide)` the pipeline calls, with the style-guide block highlighted. If `rewind-2026.ts` imports anything server-only, split the pure builder into its own module rather than copying it, so the preview can't drift;
  - `editor-toolbar.tsx`: Undo and Redo with `aria-keyshortcuts`, and Kbd hints under `pointer-fine:`.
- Hooks: `hooks/admin/use-undo-redo.ts` (a generic 100-step history that coalesces keystrokes within 500ms, replacing `:36-38` and `:361-412`), and `hooks/admin/use-prompt-editor.ts` (`useActionState` around the save, the states idle, dirty, saving, saved and error, and a guard against leaving with unsaved changes).
- While the 2026 season is open (until `Config.rewindSeasonCloses`), the "Use for Rewind" confirm adds: "Rewinds regenerated before Jan 31 will use this voice."
- Detail page (`[promptId]/page.tsx`): the name as h1 with the StatusBadge in `meta`; actions Edit, Use for Rewind and Delete; the text through `ExpandablePrompt`; times through `formatDateTime(d, { zoneLabel: true })`.
- Test ids: `admin-prompts-row-<id>`, `admin-prompts-actions-<id>`, and `admin-prompt-editor-name`, `-style-guide`, `-preview`, `-undo`, `-redo` and `-save`.

**Tests.**
- `hooks/admin/__tests__/use-undo-redo.test.ts`: push, coalescing, the undo and redo bounds, and reset on save. `use-prompt-editor.test.ts`: the transitions; an error keeps the text.
- `components/admin/prompts/editor/__tests__/`: the counter and the 1,201-character error are wired to the field; the preview equals `systemPrompt(text)`, the function P5.9's snapshot test covers; a `v2-full` row is read-only.
- `__tests__/actions/prompts.test.ts`: 1,201 characters are refused, the audit entry is written, and activation swaps the active row in one transaction.
- E2E `e2e/admin/prompts.spec.ts`: create a style guide, see it in the preview, activate it through the confirm, and read "In use" on the list.
- Visual: the list and the editor at both sizes.

**Integration.** Delete `prompt-template-editor.tsx`, and the v2 placeholder exports when nothing uses them. P8.8's playground lists the same `rewind-style-guide` rows and validates with the same schema. The Rewind nav group (6.2) keeps Prompts.

**Demo.** Open a v2 template and see the read-only notice. Copy it into a style guide, edit it with Undo and Redo, and watch the preview. Activate it, then run a playground dry run and find the same block in the prompt.

**Done when.**
- [x] The list is a DataTable with the `prompt` status badges, an EmptyState and test ids.
- [x] The editor is a 960px page with breadcrumbs; its files are each under 200 lines, and its state lives in two tested hooks.
- [x] The preview is built by the pipeline's own `systemPrompt()`, and the 1,200-character rule is shared with the actions and the playground.
- [x] No client copy of placeholder replacement remains.

(as merged: P8.8 had already deleted `lib/wrapped/prompt-template.ts`, so there was no `replacePlaceholders` to move; the editor's last v2 leftover, `lib/wrapped/prompt-text.ts` (the placeholder catalogue), and the now-unused `legacyWrappedData` were deleted. `styleGuideSchema` and `STYLE_GUIDE_MAX_CHARS` moved from `rewind-2026.ts` to `lib/validations/prompt.ts`, beside `styleGuideFormSchema`; the dry-run input imports them from there. `rewind-2026.ts` needed no split: it imports nothing server-only. Reads moved out of `actions/prompts.ts` into `server-only` `lib/admin/prompts/queries.ts` (`getPromptTemplates`/`getPromptTemplate` are gone). Create and update take style guides only; editing or activating a v2 row is refused (`CONFLICT`), and a v2 row may be deleted even when its legacy `isActive` is set. "Copy into a new style guide" is `/admin/prompts/new?from=<id>`, which prefills the first 1,200 characters with a note; the admin removes its placeholders before saving. `RowAction` gained `disabled`. The token codemod was not run (Phase 10 rules); `expandable-prompt.tsx` and `prompt-scrollspy.tsx` are untouched.)

### Step P10.5: Announcements and Discord admin pages

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-02-01 to 2027-02-03. **Depends on:** P6.5, P3.8.
- **Findings addressed:** UI-25, UI-08, UI-24, UI-42, UI-22

**Objective.** Admins manage announcements in a DataTable with rendered previews and a Dialog form with a live preview. The Discord page shows two honest status rows, a DateRangeFilter, ChartCards and a StatGrid, and all of them refresh.

**Guidance.**
- **Token codemod first** (the former P3.12 areas for announcements and Discord): run P10.13's tool over `app/admin/announcements`, `app/admin/discord` and their components, and move `components/admin/discord/*` charts onto `chartTheme('dark')` with the same options snapshot test as P10.2.
- Announcements (`app/admin/announcements/page.tsx`): drop the `max-w-5xl` wrapper so the page lines up with the other admin pages, and add a PageHeader "Announcements" with the primary "New announcement".
  - DataTable columns: title (the first cell opens the edit Dialog); a preview through `MarkdownBody` clamped to three lines, never raw Markdown (`announcement-list-item.tsx:54-56`); status as Badges (Active success, Hidden neutral, Expired destructive, plus a Priority info badge); a Switch "Visible on home page" replacing the eye icon (`:65-83`), with `useOptimistic` and a rollback on error; expires and created through `formatDate` in `Config.timezone`.
  - Row actions: Edit, then "Delete..." (ConfirmDialog "Delete the announcement 'Storage upgrade'?").
  - The form is a 640px Dialog, a `<form action>` with `useActionState`. Fields: Title, Content (Textarea, with the description "Markdown: lists, links and bold"), Priority, Expires (P2.2's `wallTimeToInstant` with "Times in {zone}") and Visible. Errors render inside the Dialog (UI-42). On success the Dialog closes, a toast confirms, and the action revalidates `/admin/announcements`, `/` and `/announcements`.
  - The live preview sits under the content field and renders the item exactly as home does: the same component, `MarkdownBody` with bullets and `SafeLink`, and the "New" pip from P10.21's `announcementsSeenAt` rule, shown as a member who hasn't visited since it was published would see it. Nothing on any page draws a permanent "NEW".
  - Keep the test ids `create-announcement-button`, `announcement-title-input`, `announcement-content-input`, `announcement-priority-input`, `announcement-submit-button`, `announcement-active-checkbox`, `announcements-empty-state` and the per-row `toggle-`, `edit-` and `delete-announcement-<id>`.
- Discord (`app/admin/discord/page.tsx`): PageHeader "Discord bot" (the nav label) with LiveStatus in `meta`.
  - Two status rows, "Linked roles" and "Support bot", each a dot and a word with a sub-line ("Online, lease renewed 12s ago" or "Offline since 2:14 PM CST"). They use the mapping P10.20 built for settings, `isEnabled` plus credentials and `botEnabled` plus a `DiscordBotLock` heartbeat within 90 s; move it into `lib/ui/status.ts` if it lives in a settings component. "Bot status: Disabled" can no longer sit next to "Feature enabled".
  - DateRangeFilter (`from`, `to`, default the last 30 days including today) replaces `discord-date-filter.tsx` (`:16-19`, `:50-58`). The period header comes from P10.2's `dayWindow`, which also ends the one-day shift at `:79-88`.
  - StatGrid: commands, success rate, active members and linked members, two per row on mobile (UI-22).
  - ChartCards replace the eight chart components: daily commands as success and failed stacked bars, zero-filled; commands by type and help usage as ranked bars; errors per day from P10.2's zero-filled `errorTrend`, now rendered; linking, marking breakdown, context and selection stats. An empty period shows one in-card EmptyState, "No commands in this period", instead of today's three treatments.
  - Recent commands become a DataTable: member (a link to `userDetail`), command, a status badge, response time and `<Time>`.
  - P10.3's `useLiveRefresh` runs every 30 s, because the status rows and the last-hour figures move while past windows don't, and it pauses while a dialog is open.

**Tests.**
- `components/admin/announcements/__tests__/`: the table renders previews with bullets; the dialog keeps an error inside; the Switch rolls back when the action fails; the preview matches the home item's markup; an injected image and a `javascript:` link render no `<img>` and no `href`.
- `__tests__/actions/announcements.test.ts`: the three paths are revalidated, and expiry converts in the server zone.
- `lib/ui/__tests__/status.test.ts`: the Discord rows for each combination of enabled flag, credentials and lease age.
- `components/admin/discord/__tests__/specs.test.ts`: the spec builders turn zero-filled metrics into ChartCard specs with stable day keys.
- E2E: update `e2e/announcements.spec.ts` (create one with a list, see bullets in the preview and on home, toggle visibility, delete through the confirm), and add `e2e/admin/discord.spec.ts` (both status rows, a filter change moves the period). axe on both pages clears the two date-input `label` failures.
- Visual: both pages at both sizes.

**Integration.** Delete `announcements-page-client.tsx`, `announcement-list-item.tsx`, `announcement-form-modal.tsx`, `discord-date-filter.tsx` and the eight `components/admin/discord/*-chart` and metrics components once they are replaced. The 13 admin charts are now ChartCard specs, ready for P10.9.

**Demo.** Write an announcement with a bulleted list and a link, and watch the preview render them as home will. Save it, open home in another tab, then hide it with the Switch. On the Discord page, stop the bot: within 30 s "Support bot" reads offline while "Linked roles" stays on.

**Done when.**
- [ ] Announcements render through `MarkdownBody` in the table, the preview and home, and "New" follows read state everywhere.
- [ ] The announcement form is a Dialog with a live preview and inline errors.
- [ ] The Discord page has two status rows, a DateRangeFilter, a StatGrid and ChartCards, all refreshed while visible.
- [ ] No Discord or announcement component hand-builds a panel, a badge, an empty state or a chart, and the baselines are updated.

### Step P10.6: User detail, Rewind history and conversation pages

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-02-03 to 2027-02-05. **Depends on:** P6.5, P7.9.
- **Findings addressed:** GAP-38, UI-06, UI-21, UI-29, GAP-43

**Objective.** The user detail page becomes an entity page: the member's name, status badges and four tabs, with Regenerate for stuck rows and keyboard-reachable tables. The history and conversation pages get breadcrumbs and zone-labelled times, and the activity timeline pages correctly at any depth.

**Guidance.**
- **Token codemod first** (the chatbot part of the former P3.12 area 6): run P10.13's tool over the conversation pages and `components/admin/chatbot`, keeping P6.1's assistant Sheet as it is.
- Split the 419-line `app/admin/users/[userId]/page.tsx` into a thin page plus server components in `components/admin/users/detail/`: `user-detail-header.tsx`, `overview-tab.tsx`, `rewind-tab.tsx`, `usage-tab.tsx` and `billing-tab.tsx`.
  - `?tab=overview|rewind|usage|billing` is parsed with Zod (default `overview`), and the page loads only the active tab's data. A small client `DetailTabs` on Base UI Tabs calls `router.replace` with the param inside a transition, and the panel is the server-rendered child. Add `userDetail(id, { tab })` to `lib/admin/routes.ts`.
- Header: PageHeader breadcrumbs "Users / Morgan Lee", the member's name as h1 (then the Plex username, then the email), and `meta` badges: role (Owner or Admin outline, Member plain text), Plex access (Shared, Not shared or Unknown), the subscription when Stripe is on, and Rewind {season year}. Actions: secondary "View Rewind {year}" (`userRewind(id, getSeasonYear())`), and the same row-actions menu as P10.18's users table, so the confirms and the typed removal are shared.
- Overview tab: a definition list of email, service, joined, last sign-in and Discord, with `formatDateTime(d, { zoneLabel: true })`, then the activity timeline.
- Rewind tab: a DataTable of years from `PlexWrapped` and the latest `RewindGeneration`: year, `StatusBadge` (rewind domain), edition, generated (zone-labelled), share on or off, and visits.
  - Row actions: Preview (`userRewind`), "Roll back..." (P7.9's `rollbackRewind`, when `previousData` exists) and "Regenerate..." (P2.17's `adminRegenerateRewind`, with P7.8's cost estimate in the ConfirmDialog), plus a link to each version's history page.
  - New pure `lib/admin/can-regenerate.ts`: `canRegenerate(row, now)` is true for failed, completed or missing rows, and for generating rows whose run started more than 15 minutes ago (P2.5's stale rule). The P10.18 users-table menu switches to it, so stuck rows can be retried from the list too (UI-29).
- Usage tab: a StatGrid of requests, tokens and cost (`formatMoney`) from a `groupBy` on `userId` (P7.8's pattern), the ten latest requests, and "View all in LLM usage" to `llmUsage({ userId })`.
- Billing tab: shown when `Config.stripeEnabled` is on or the member has a subscription row: the subscription badge with its sub-line, the exemption, and the P10.18 Grant, Toggle exempt and Cancel ConfirmDialogs.
- Keyboard (UI-23): no `tr onClick`; first cells are links; row buttons are named ("Actions for 2026").
- Timeline (GAP-38): `getUserActivityTimeline(userId, { cursor, pageSize })` in `actions/user-queries.ts` becomes keyset-paged.
  - The order is `(timestamp desc, source asc, id desc)`. The cursor is base64url JSON `{ ts, source, id }`, parsed with Zod.
  - Each source (`DiscordCommandLog` by `createdAt`, `UserMediaMark` by `markedAt`) is read with `orderBy: [{ <time>: 'desc' }, { id: 'desc' }]`, `take: pageSize + 1`, and a `where` that keeps only rows after the cursor in that order, including the tie-break on equal timestamps. Merge, take `pageSize`, and build the next cursor from the last item. The total still comes from the two counts.
  - Add `@@index([userId, createdAt])` on `DiscordCommandLog` and `@@index([userId, markedAt])` on `UserMediaMark` in a migration.
  - `user-activity-timeline.tsx` moves to `useInfiniteQuery` with "Show older activity" and "Showing 30 of 47".
- History page (`app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx`, on P7.13's legacy renderer): a detail page inside the shell, with breadcrumbs "Users / {name} / Rewind {year} / Version of Oct 12, 2026, 2:26 PM CDT", replacing the two copied fixed headers and the nested `<main>` (UI-21). The version picker gets its versions as props, which lets P10.7 delete the versions route.
- Conversation page (`app/admin/llm-usage/conversation/[conversationId]/page.tsx`): breadcrumbs "LLM usage / {name} / Conversation", and every time, the summary (`:12-20`) and each row alike, formatted on the server in `Config.timezone` with the zone name. `conversation-usage-row.tsx:20` stops calling `toLocaleString` in the browser, which ends the mix of UTC and local times on one page (GAP-43). The transcript renders through `MarkdownBody`.

**Tests.**
- `actions/__tests__/user-activity-timeline.test.ts` on the Postgres test database (P0.4's guard): seed 47 interleaved events, four of them sharing timestamps across the two sources. With `pageSize` 10, walk the cursor to page 3 and page 5 and compare each page's ids with the reference sort; across all pages there are no duplicates or gaps; the last page has no cursor; a malformed cursor is refused.
- `lib/admin/__tests__/can-regenerate.test.ts`: generating for 14 and for 16 minutes, failed, completed and missing.
- `components/admin/users/detail/__tests__/`: the h1 is the name; the badges render; the tabs follow the URL and arrow keys; Billing hides with Stripe off; Regenerate appears only on eligible rows.
- `lib/utils/__tests__/format.test.ts`: `zoneLabel` prints "CDT" for Chicago in October and "CST" in January.
- E2E `e2e/admin/user-detail.spec.ts`: from the users list by keyboard only (Tab to the name, Enter), switch tabs, regenerate the seeded stuck `audit-user-1` through the confirm, open a history page and follow its breadcrumb back.
- Visual: each tab at 1440x900, Overview at 390x844, and the conversation page with times masked.

**Integration.** Delete `user-status-badge.tsx` (now `StatusBadge`) and the old page sections. The command menu's user results (P10.16) and every `userDetail` link land on the Overview tab. The users nav item stays lit on `/admin/users/*` (P6.1).

**Demo.** From the users list, use only the keyboard to open Morgan Lee. The Rewind tab shows 2026 "Generating" for 20 minutes, with Regenerate; run it. Open a history page and read the breadcrumb. On the conversation page, the summary and every row show the same zone name ("CDT" for October turns, "CST" for January ones).

**Done when.**
- [ ] User detail has the name as h1, status badges and four URL-driven tabs, and no file is over 200 lines.
- [ ] Stuck rows can be regenerated from the detail page and from the users list through `canRegenerate`.
- [ ] The timeline is keyset-paged, and the Postgres test for pages 3 and 5 passes.
- [ ] The history and conversation pages have breadcrumbs, and every server-rendered time carries its zone.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P10.7: Client data-loading and boundary sweep

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-02-08 to 2027-02-10. **Depends on:** P10.1, P10.2, P10.5.
- **Findings addressed:** BP-29, UI-41, BP-32, BP-33

**Objective.** No client component loads its first data in an effect, the command-menu search is the only admin API route left, unneeded `'use client'` markers are gone, and the remaining forms that mutate use React 19 form actions.

**Guidance.**
- Inventory first, and list the result in the PR:
  - `rg -l "useEffect" app components hooks | xargs rg -l "@/actions|fetch\("` and `rg -n "preventDefault\(\)" app components`.
  - After P1.1, P6, P8.8, P11.29 and P10.1 to P10.5, expect roughly: `LLMProviderForm.tsx` and setup's `llm-provider-form.tsx` (models), `watchlist-sync-settings.tsx`, `StripeSettingsForm.tsx`, `components/watchlist/sync-settings-card.tsx` and `sync-history-table.tsx`, the setup forms' mount-time `getDevDefaults()` (9 files), `historical-wrapped-selector-header.tsx` (versions), and whatever P10.23 and P10.26 left in onboarding and the invite page. Verify each one rather than trusting this list.
- Treat each case by UI-41's split:
  - First data goes in as Server Component props: dev defaults load once in `app/setup/page.tsx`; watchlist settings and history load on home and `/account`; Stripe settings on the settings page; versions on the history page (P10.6).
  - Client-driven reads become TanStack Query hooks in `hooks/` or `hooks/admin/`, seeded with `initialData`, keyed from one `hooks/query-keys.ts`, and invalidated after mutations.
  - The model list needs no request at all: pass `listModels()` from P2.11's static catalogue in `lib/llm/models.ts` as props. That also ends the fetch on every keystroke in the custom-model field (`LLMProviderForm.tsx:45-78`).
  - Real effects stay with a one-line comment: the Plex PIN poll in `callback-client.tsx`, assistant streaming and the Rewind status hook.
- API routes (BP-33): delete `app/api/admin/models/route.ts`, `app/api/admin/plex/users/route.ts` (the playground's member picker gets its list as props) and `app/api/admin/wrapped/[wrappedId]/versions/route.ts` once their last callers are gone. `playground/statistics` went in P8.8. Keep `app/api/admin/search/route.ts`, which P10.16 made a GET on purpose for typeahead.
- `'use client'` (BP-32): remove it from leaves with no hooks, handlers, browser APIs or motion. Start with the seven BP-32 names that survive the earlier rewrites (`scheduler-info.tsx`, `discord-activity-table.tsx`, `discord-bot-status.tsx`, `discord-active-users.tsx`, `queue-status.tsx`, `queue-stats.tsx`, `subscription-banners.tsx`) and any render-only primitive in `components/ui`.
  - Add the heuristic as a rule in `scripts/check-design-system.mjs`: a `'use client'` file with no `use[A-Z]`, no `on[A-Z]\w*=`, no `window.` or `document.` and no `motion`. Its count then ratchets like the others.
  - Stop converting Dates to ISO strings for RSC props (`actions/discord-activity.ts:62-68`); React 19 serializes `Date`.
- Forms (BP-32): convert each remaining `onSubmit` plus `preventDefault` mutation to `<form action={formAction}>` with `useActionState`.
  - Add one `components/ui/submit-button.tsx` that reads `useFormStatus` and drives Button's `loading`. Use `useOptimistic` for toggles.
  - Actions take `(prevState, formData)` through a FormData adapter on P4.3's `defineAction`, parse with Zod, and return `{ error, fieldErrors, values }`.
  - Pitfall: React 19 resets an uncontrolled form after its action completes. On an error, re-seed the fields from the returned `values` through `defaultValue`, so nothing typed is lost (WCAG 3.3.7).
- Delete the `router.refresh()` calls that follow actions which already call `revalidatePath` (BP-31's 22 sites).
- Once the sweep leaves no hits, raise the react-hooks rules that P1.3 wired as warnings to errors for `app/`, `components/` and `hooks/`.

**Tests.**
- A unit test for each new query hook: it uses `initialData`, and a mocked mutation invalidates its key.
- New `__tests__/app/admin-api-routes.test.ts` globs `app/api/admin/**/route.ts` and expects only `search/route.ts`.
- `scripts/__tests__/check-design-system.test.ts` gains fixtures for the client-marker rule.
- `components/ui/__tests__/submit-button.test.tsx`, plus a converted form's test: the pending state, field errors with `aria-invalid`, and values kept after an error.
- The existing setup-wizard, settings, watchlist and invite E2E suites stay green. A throttled run of `/setup` shows no second loading pass.

**Integration.** CLAUDE.md's data-fetching section gains one line naming `hooks/query-keys.ts`. P11.5 moves the remaining read helpers out of `'use server'` modules on this footing, and P11.19's Cache Components work starts from the smaller client surface.

**Demo.** In the network panel, `/admin/settings` and `/setup` make no action POST on mount. `ls app/api/admin` shows only `search`. `node scripts/check-design-system.mjs --check` reports no unneeded client markers.

**Done when.**
- [ ] No client component loads its first data in a `useEffect`; the inventory is attached to the PR.
- [ ] `app/api/admin/` holds only the search route, and a test enforces it.
- [ ] The client-marker rule is in the ratchet, with a count at or near zero.
- [ ] Every remaining mutation form uses `<form action>` with `useActionState`, and the react-hooks rules are errors.

### Step P10.8: Admin Overview page

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-02-08 to 2027-02-09. **Depends on:** P6.5, P7.8.
- **Findings addressed:** UI-29

**Objective.** `/admin` stops redirecting to Users and becomes an Overview: a StatGrid of service health, job queues, Rewind progress and LLM spend, each tile linking to the page that fixes it (ui-design-system 9.2 phase 5, 6.2).

**Guidance.**
- `app/admin/page.tsx` replaces `redirect("/admin/users")` with a Server Component: PageHeader "Overview" (description "{serverName} at a glance") with LiveStatus, then four StatTiles in a StatGrid. Each tile is a presenter in `components/admin/overview/`, and the page stays under 150 lines.
- New `lib/admin/overview.ts` (`server-only`): `getAdminOverview()` runs the four sources with `Promise.allSettled`. A failed source shows a dash with `aria-label="Not available"` and an `ErrorState` line, never 0 (5.5).
  1. Services: "5 of 6 working", with the worst status as `meta` ("Tautulli can't connect") and a meter by category, linking to that section of `/admin/settings`. It reads P10.19's cached `getConnectionHealth()`, plus the database and Redis checks behind P4.17's `/api/health`. It never runs live upstream tests on a poll.
  2. Job queues: the failed count or "All clear", with `meta` "Worker running, 3 waiting", linking to `/admin/queues?status=failed` when anything failed. It reuses P10.3's loader and the Redis worker read.
  3. Rewind {year}: "64 of 70 ready", with a meter of ready, generating, failed and not started, and `meta` "Opened by 51 members" (distinct `RewindView`, the Rewind 1.4 measure). It links to `/admin/rewind` and reads P7.8's `getRewindSeasonStatus(year)`. Outside the season it shows "Opens Dec 1" from `getSeasonState()`, with last season's totals as the unit.
  4. LLM spend: this month in `Config.timezone` through `formatMoney`, with the unit "of $10.00 season budget" (season to date against `rewindLlmBudgetUsd`). It links to cost analysis with this month's range and uses `aggregate()` over windows from P10.2's `day-window.ts`, plus P7.8's `getRewindSeasonSpend(year)`.
- Live: P10.3's `useLiveRefresh` every 10 s while visible (6.3's monitoring pages).
- Navigation (6.2): in `lib/admin/nav.ts`, unhide Overview (`match: 'exact'`, `mobile: 'tab'`). `mobileTabs()` becomes Overview, Users, Rewind, Settings and More, so Invites returns under More, and the Rewind tab opens Season. The command menu lists Overview, and Users no longer lights on `/admin`.
- `app/admin/loading.tsx` renders `PageHeaderSkeleton` and `StatGridSkeleton({ count: 4 })`.

**Tests.**
- `lib/admin/__tests__/overview.test.ts`: each source failing alone; the month window on the 1st under Los Angeles and UTC; the budget unit; the out-of-season tile.
- `components/admin/overview/__tests__/`: the words never depend on colour, each `href`, and the dash path.
- `lib/admin/__tests__/nav.test.ts`: Overview first, the mobile tabs, and Users not active on `/admin`.
- E2E `e2e/admin/overview.spec.ts`: `/admin` renders the Overview, each tile's link opens its page, and the tiles work by keyboard. Update `e2e/admin-protection.spec.ts`, which lists `/admin`.
- axe, and visual at both sizes with LiveStatus masked.

**Integration.** P6.1's hidden Overview item and the Invites stand-in in the tab bar go. Links that mean "back to admin" point at `/admin`. Decision UI Q6 (Overview after Rewind) is closed.

**Demo.** Stop the workers: within 10 s the queues tile reads "Worker stopped". The spend tile matches cost analysis for this month, and the Rewind tile matches the season dashboard. On a phone the tab bar starts with Overview.

**Done when.**
- [ ] `/admin` renders the four-tile Overview, and each tile links to its page.
- [ ] Every source fails on its own with a dash, and no poll runs a live upstream test.
- [ ] The Overview refreshes while visible, and the nav and mobile tab bar include it.
- [ ] It meets the 9.5 definition of done, with E2E, axe and a visual baseline.

### Step P10.9: Charts on shadcn Chart; chart.js removed

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-02-10 to 2027-02-12. **Depends on:** P10.2, P10.5.
- **Findings addressed:** UI-24, BP-34

**Objective.** ChartCard renders through shadcn Chart on Recharts 3, with its accessibility layer, CSS-variable colours and generated text summaries. The last Chart.js registration goes, chart.js and react-chartjs-2 are uninstalled, and the bundle budget is checked.

**Guidance.**
- Add shadcn Chart with the Base UI registry (`npx shadcn@latest add chart --diff`), giving `components/ui/chart.tsx` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartConfig`), and pin `recharts` to an exact 3.x release at least two weeks old (3.10.1 was current at research time).
- Replace P10.2's `chartjs-body.tsx` with `components/ui/chart-card/recharts-body.tsx`, rendering the same spec kinds (`bar`, `line`, `stacked-bar`, `ranked-bar`). Follow the v3 checklist from `research/modern-ui-stack-2026.md` 2.1: colours as `var(--chart-1)`, never `hsl(var(...))`; a height or `aspect-*` on `ChartContainer`; `defaultIndex` is initial state only. Set `accessibilityLayer`, the Recharts 3 default, explicitly.
- Theme (3.5 rules): `lib/charts/theme.ts` becomes the slot map. Series take `var(--chart-1)` to `var(--chart-5)` in fixed order and are never recoloured by rank, a sixth series or more folds into "Other" (`var(--muted-foreground)`), the grid uses `var(--border)`, ticks `var(--muted-foreground)`, and tooltips the popover tokens. SVG reads oklch variables directly, so delete `chartTheme(mode)`'s hex hand-off and its `@kurkle/color` test. The colours now follow the theme class, which P10.10 relies on.
- Text summaries: new `lib/charts/summary.ts`. `summarize(spec, format)` returns one or two sentences (the range, total, peak and change, or "No activity in this period"). ChartCard renders it as the chart's `aria-describedby` text and an sr-only caption; "View as table" stays.
- Ticks: `formatMoney`, `formatTokens` and `formatDayKey`, with `allowDecimals={false}` for counts and a bounded tick count, so no axis repeats a label (UI-24).
- Removal: delete `chartjs-body.tsx` and its registration, run `npm uninstall chart.js react-chartjs-2`, delete the remaining Chart.js tests and mocks, and add `no-restricted-imports` entries for both packages in `eslint.config.mjs`. `rg "chart.js|react-chartjs-2|ChartJS.register"` returns nothing.
- Bundle (BP-34): the chart body stays a `next/dynamic` island. Add `e2e/perf/admin-charts-budget.perf.spec.ts`, on the pattern of P5.4's `rewind-budget.perf.spec.ts`, recording the script bytes of `/admin/cost-analysis`, `/admin/discord` and `/admin/shares`. Record the before and after numbers in the PR and set the budget at the measured size plus 10%. A `no-restricted-imports` rule keeps `recharts` out of everything except `components/ui/chart*`, and P5.4's 110 KB Rewind first-page budget must still pass.
- Jest: Recharts' `ResponsiveContainer` needs `ResizeObserver`, so add a stub and a fixed container size in `jest.setup.js`.

**Tests.**
- `lib/charts/__tests__/summary.test.ts`: empty, a single day, rising, a peak, and money formatting. `theme.test.ts`: slot order and the "Other" fold.
- `components/ui/__tests__/chart-card.test.tsx` on the Recharts body: the accessible name, the description id, and the table matching the series.
- E2E `e2e/admin/charts.spec.ts` on chromium and webkit: Tab reaches the cost chart, ArrowRight moves the active point, and the tooltip shows its value. axe on cost analysis, shares and Discord.
- Visual: the three pages' diffs are expected and reviewed against 3.5's palette; the perf spec runs in CI.

**Integration.** `/dev/ui` shows each chart kind in both themes. DUP-14's chart line closes. P10.10 takes its light baselines with these charts.

**Demo.** Open cost analysis, Tab into the daily chart and step through the days with the arrow keys while a screen reader reads the summary. Switch the theme class in devtools and watch the series recolour with no reload. `npm ls chart.js` finds nothing.

**Done when.**
- [ ] Every chart is a ChartCard on shadcn Chart and Recharts 3, with `accessibilityLayer`, CSS-variable colours and a generated summary.
- [ ] chart.js and react-chartjs-2 are uninstalled, and lint blocks their return.
- [ ] The admin chart budget is recorded and enforced, and the Rewind budget still passes.
- [ ] Jest, E2E, axe and the reviewed visual baselines pass.

### Step P10.10: Light theme behind its flag

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-02-15 to 2027-02-17. **Depends on:** P10.9.
- **Findings addressed:** none (design or research item)

**Objective.** Take light baselines for every page, add the server-side theme resolver and the Appearance picker, and ship light behind `Config.lightThemeEnabled`, off by default (ui-design-system 3.3, 4.1, open question 2).

**Guidance.**
- Flag: a migration adds `Config.lightThemeEnabled Boolean @default(false)` (P6.11 only reserved the Appearance slot). The settings System section gets a Switch "Light theme for members", audited with `CONFIG_CHANGED` (P4.6).
- Resolver (4.1 "Theme resolution"): new `lib/design/theme.ts` (`server-only`). `resolveTheme()` returns `'dark'` unless the flag is on and the `pm-theme` cookie is `light`. Add the flag to P3.10's cached `getAppSettings()` (React `cache()` over the `app-settings` tag, revalidated when the Switch saves), so the root layout adds no database read. `app/layout.tsx` renders `<html className={cn(theme === 'dark' && 'dark', ...fonts)}>`; light is the `:root` block, with no class. `generateViewport()` sets `themeColor` to `#f9fafb` in light and `#1a1c1e` in dark.
- Action: new `actions/appearance.ts`, a `memberAction` taking `z.enum(['dark', 'light'])`, refuses while the flag is off. It sets `pm-theme` (`Path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` in production, one year) and revalidates the layout, and the client calls `router.refresh()`.
- Picker: an "Appearance" RadioGroup (Dark, Light) fills P6.11's slot on `/account`, and also sits in the AppShell account menu (P6.3) and the AdminShell user menu, only while the flag is on. There is no "System" choice until the nonce CSP (P11.20) can run a pre-paint script (4.1).
- Rewind needs no change: every `data-field` element re-declares the tokens (4.4), so Rewind pages, the RewindCard strip, share pages and their popups look the same in both themes. The bounded `dark:` variant never fires on light pages.
- Baselines: add `visual-light-desktop` and `visual-light-mobile` projects to the P1.6 config (a storage state with `pm-theme=light`, and a seed with the flag on). They run every screen in the visual specs plus every route in the section 10 checklist. Review them against `home--desktop-light.png` and `admin-users--desktop-light.png`.
  - A separate `visual-light-rewind` project runs the Rewind visual specs with the dark projects' `snapshotPathTemplate`, which proves the scope is theme-independent.
  - Run `e2e/accessibility.spec.ts` under a light project too (section 8).
- Pitfalls:
  - A file with a non-zero design-debt count shows up as a light-mode bug; burn its counts to zero before its baseline.
  - `cookies()` in the root layout makes every route dynamic. That matches today's force-dynamic, but P11.19 must keep the resolver inside a dynamic boundary when it adopts Cache Components.
  - Stripe Checkout and the Plex PIN page are external and stay as they are.
- The flag stays off. Turning it on is the owner's call, recorded under decision UI Q2.

**Tests.**
- `lib/design/__tests__/theme.test.ts`: flag off with a light cookie gives dark; flag on with a light cookie gives light; a garbage or missing cookie gives dark.
- `actions/__tests__/appearance.test.ts`: Zod, the session check, refusal while the flag is off, and the cookie attributes.
- `components/account/__tests__/appearance-picker.test.tsx`: hidden while the flag is off, radio semantics and keyboard.
- P3.3's token and contrast test already covers the light pairs; it must stay green.
- E2E `e2e/appearance.spec.ts`: with the flag on, a member picks Light on `/account` and reloads. `<html>` has no `dark` class, the first paint is light, the account menu shows the choice, and a Rewind page is unchanged.

**Integration.** The settings Switch, the account menu, the admin user menu and `/account` share one picker component. The light baselines are committed beside the dark ones. P11.26 adds the theme to the README feature list.

**Demo.** As the owner, turn the flag on. As a member, choose Light, then walk home, `/account`, the admin users page next to its mockup, and a Rewind story, which looks exactly as it did in dark. Turn the flag off: everyone is dark again, cookies or not.

**Done when.**
- [ ] Every page has light baselines at both sizes, and the Rewind pages match their dark baselines.
- [ ] `resolveTheme()` decides on the server from the flag and the cookie, with no flash and no extra database read.
- [ ] The Appearance picker appears only behind the flag, in the menus and on `/account`.
- [ ] axe passes in light, and the flag ships off.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P10.11: Remove adapters and enforce the guardrails

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-02-17 to 2027-02-19. **Depends on:** P10.7, P10.9.
- **Findings addressed:** UI-17, UI-46, DUP-14

**Objective.** Move every call site off the 9.4 adapters and delete them, make the raw-element ESLint bans and the design-system check fail CI, and give every interactive admin element a `data-testid` that the E2E specs use.

**Guidance.**
- Inventory from `design-debt.json` and 9.4: Button's deprecated values (`danger`, `success`, `md`), Card's `padding`, Badge's `tone`, Alert's `tone="danger"`, `StyledInput`, `StyledTextarea`, `StyledCheckbox`, `StyledDropdown`, `ModalShell`, `ConfirmModal` (`components/admin/shared/confirm-modal.tsx`), `LoadingSpinner`, `LoadingScreen` and the `Pagination` adapter. Switch and ErrorState need nothing, and `useToast` stays as the public facade (5.5), so only its deprecated internals go.
- New codemod `scripts/codemods/adapters.ts` on the ts-morph harness of P10.13's `tokens.ts`:
  - automatic: `variant="danger"` to `destructive`, `success` to `secondary`, `size="md"` to `default`; Badge `tone` to `variant`; Alert `danger` to `destructive`; Card `padding` to `CardContent` classes; `LoadingSpinner` sizes to Spinner; `StyledCheckbox` `onChange` to `onCheckedChange`; `ModalShell` `isOpen` and `onClose` to Dialog `open` and `onOpenChange`;
  - written to `codemod-review.md` for hand edits: `StyledDropdown` options to the composed Select, `ConfirmModal` to ConfirmDialog with an async `action`, and `LoadingScreen` to route skeletons.
  - One PR per area (member, setup, admin), each with its screenshot diff. Expect no visual change, because the adapters already render the new primitives.
- Then delete the adapter files, their tests and the deprecated prop values. Narrowing the TypeScript unions makes any reintroduction fail the typecheck. Every `data-testid` stays on its call site.
- Guardrails to errors:
  - In `eslint.config.mjs`, change the P3.4 `no-restricted-syntax` bans on JSX `button`, `input`, `select`, `textarea` and inline `svg` outside `components/ui/**` from warn to error. The allowlist is `components/rewind/**`, `lib/rewind/viz/**`, the `next/og` routes, `app/icon.tsx` and `app/dev/**`. The `no-restricted-imports` entries for `styled-*`, `modal-shell` and the admin `confirm-modal` become errors too.
  - Give `scripts/check-design-system.mjs` a `--strict` mode that fails on any match outside a documented allowlist, run that in CI, and delete `design-debt.json` with the ratchet path. A count that can't reach zero gets an allowlist entry with its reason, reviewed in the PR.
- Test ids (UI-46), following 6.3's `admin-<area>-<element>[-<id>]` with primitives forwarding `data-testid`: cover what P10.1 to P10.8 didn't, such as the chat window, the settings forms, the Overview tiles and the command menu.
  - New `e2e/admin/testid-coverage.spec.ts` visits every admin route in `lib/admin/nav.ts`, plus one seeded detail route per area. It collects `button`, `a[href]`, `input`, `select`, `textarea` and `[role=switch]`, `[role=tab]`, `[role=menuitem]` and `[role=checkbox]` in the shell and `main`, and fails on any element without a `data-testid` on itself or its primitive root (closed portals excluded).
- E2E selectors: replace `locator('aside')` and `locator('main')` (`e2e/admin-functionality.spec.ts:14`, `:46`, `:53`, `:57`, `:61`, and `e2e/accessibility.spec.ts:35`, `:52`, `:104`, `:146`) and any remaining CSS or text selector in the admin specs with `getByTestId`. Add the UI-46 coverage still missing: a settings edit and a role change.
- DUP-14 closes when the strict check finds no hand-copied panel, inline spinner, inline icon SVG, or duplicated filter, chart, modal or status panel.

**Tests.**
- `scripts/codemods/__tests__/adapters.test.ts`: a before and after fixture for each automatic mapping, and the review list for each structural one.
- ESLint fixture tests: a raw `<button>` in `components/admin` fails, while one in `components/ui` and an SVG in `components/rewind` pass.
- `scripts/__tests__/check-design-system.test.ts`: `--strict` fails on one match and passes on an allowlisted path.
- The test-id coverage spec, and the full Jest, typecheck, E2E, axe and visual suites with no visual diffs.

**Integration.** knip reports no adapter leftovers. The PR template's design checkbox stays. CLAUDE.md's "Always Use Existing UI Components" section names the primitives and the lint rule; P11.26 re-checks the rest.

**Demo.** Add a raw `<button>` to an admin component: lint fails in the editor and CI. Add `bg-slate-800` to a page: the design-system check fails. Run the test-id coverage spec across the admin routes and see it pass.

**Done when.**
- [ ] No adapter file or deprecated prop value remains, and typecheck proves it.
- [ ] The raw-element bans and the restricted imports are errors, and `check-design-system.mjs --strict` gates CI with `design-debt.json` deleted.
- [ ] Every interactive admin element has a `data-testid`, enforced by the coverage spec.
- [ ] No admin E2E spec selects by DOM structure, CSS class or text.

### Step P10.12: 'New on' poster row on home

- **Track:** ui. **Lane:** member. **Effort:** S. **Window:** 2027-01-15 to 2027-01-15. **Depends on:** P10.21, P0.16.
- **Findings addressed:** none (design or research item)

**Objective.** Home gains the "New on {server name}" row of `home.html`: recently added titles from the member's own libraries, served through the poster proxy's library-access check and linking to each title in Plex web (ui-design-system 3.11, open question 3).

**Guidance.**
- Data: new `lib/member/new-on.ts` (`server-only`), beside P10.21's `lib/member/home-data.ts`.
  - Sections come from P0.16's `getSharedSectionKeys(server, plexUserId)` (`'all'` for the owner and admins, cached for 10 minutes), limited to movie and show sections.
  - Add `getPlexSectionRecent(config, sectionId, { type, size })` to `lib/connections/plex-sessions.ts`. It calls `/library/sections/{id}/all?sort=addedAt:desc&type=1` (or `type=2` for shows) with `X-Plex-Container-Start: 0` and `X-Plex-Container-Size: 12`, through P2.3's HTTP client with a Zod schema, the container paging P11.8 adopts for the rest.
  - Merge by `addedAt`, take 12, and map each to `{ ratingKey, title, year, kind, seasons }`; the caption meta reads "Film, 2026" or "Series, season 1". Cache per sorted section set for 10 minutes in process.
  - The line "37 titles were added this week" uses the same query limited to the last 7 days with `X-Plex-Container-Size: 0`, reading `totalSize`. If a server doesn't return it, drop the line rather than page through the library.
- Component: new `components/dashboard/new-on-row.tsx`, a Server Component placed after announcements in P10.21's `home-page.tsx`:
  - an h2 "New on {serverName()}", the count line, and a ghost "Browse in Plex" to P10.21's Watch on Plex URL;
  - a `<ul>` of `components/ui/poster.tsx` (P5.6) at size `md`, each with `href` set to the item in Plex web (`https://app.plex.tv/desktop/#!/server/{machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F{ratingKey}`, from P10.21's cached `getPlexServerIdentity`, with its `{publicUrl}/web` fallback). Add `plexItemUrl(ratingKey)` next to P10.21's helper;
  - the title and meta are HTML under each image, never only in the artwork; images load lazily and fall back to the `poster-palette` title card;
  - the list scrolls sideways inside itself with scroll snap, so the page never scrolls sideways at 390px; links open in a new tab with `rel="noopener noreferrer"` and an sr-only "opens Plex".
- Wrap it in its own Suspense boundary with a poster-row skeleton, so a slow Plex never delays home. The row hides with no empty state when the member is Jellyfin-only, Plex is unreachable (the UptimeStrip carries outages), or there is nothing to show.
- Security: the list offers only keys from the viewer's sections, and the poster route checks the same rule on every request (filtering the list alone doesn't close SEC-21, 3.11). Confirm that P0.10's `poster` limit allows a 12-poster row on each home load.
- Test ids: `home-new-on-row`, `home-new-on-item-<ratingKey>` and `home-new-on-browse`.

**Tests.**
- `lib/member/__tests__/new-on.test.ts` on recorded Plex JSON fixtures with real field names: only shared sections are read, items merge by `addedAt`, the cap is 12, the meta strings are right, a cache hit makes no request, and a Plex error gives an empty list.
- `components/dashboard/__tests__/new-on-row.test.tsx`: the heading carries the server name, the hrefs have the Plex web shape, titles are text, the row hides when empty, and a broken image shows the title card.
- `app/api/rewind/poster/__tests__/route.test.ts`: a key from the row returns 200 with `private`, and a key from an unshared section returns 404.
- E2E on the Plex test-mode fixture: the row and its links render for a Plex member, and a Jellyfin member sees no row. Update the home visual baselines at both sizes.

**Integration.** Decision UI Q3 closes. P10.10's light baselines include the row, and P11.8 moves the other Plex calls to the same paging.

**Demo.** As a member restricted to two libraries, open home: the row shows only titles from those libraries. Click one and land on its Plex web page. Stop Plex and reload: home renders at once without the row.

**Done when.**
- [ ] Home shows up to 12 recently added titles from the member's own sections, linking to Plex web.
- [ ] The row never delays home and hides when it can't work.
- [ ] Posters come through the proxy's library-access check, with tests on both sides.
- [ ] The home baselines and E2E are updated.
### Step P10.13: Token codemod: the tool and the member slices

- **Track:** ui. **Lane:** member. **Effort:** L, 2 PRs. **Window:** 2027-01-04 to 2027-01-07. **Depends on:** P3.1, P3.4.
- **Findings addressed:** UI-16, UI-17, UI-12

**Objective.** Build `scripts/codemods/tokens.ts` on ts-morph, apply the automatic pairs of `design/ui-design-system.md` 9.3, and write every other match to `codemod-review.md`. Run it over the member slices that no January rebuild replaces, each with its screenshot diff and lower design-debt counts. This was P3.11; it moved to January with the page rebuilds (decision 28), and its other slices fold into the steps that rebuild those pages.

**Guidance.**
- Add exact `ts-morph`. The pair table lives in `scripts/codemods/token-pairs.ts` as data: `{ match, replace, mode: 'auto' | 'review', note }` for every 9.3 row.
  - Add two auto rows: remove `focus:outline-none`, and remove `focus:ring-*` and `focus:ring-offset-*`, because the base-layer ring replaces them (UI-27).
  - `font-serif` belongs to the Rewind phase and is skipped.
- The class tokenizer keeps variant prefixes (`hover:`, `sm:`, `group-hover:`, `disabled:`), the `!` modifier and opacity suffixes, so `border-slate-700/50` becomes `border-border/50`. Arbitrary values go to review.
- Sources:
  - JSX `className` string literals and templates, and string arguments of `cn()`, `clsx()`, `twMerge()` and `cva()`;
  - object literals whose name ends in `Classes`, `ClassName` or `classes`, and `cva` variant maps. These go to review only, because their keys pair with fills elsewhere.
- Context rule: if a class string holds any review-mode class (a gradient, the `bg-slate-800/50` panel, `bg-cyan-600`, a brand hex), nothing in that string is auto-rewritten, and the whole string goes to review. That way `text-white` on a coloured fill never becomes `text-foreground` on amber.
- `codemod-review.md` (git-ignored, at the repo root) lists file, line, original, suggestion and rule. The PR description carries it, and the PR resolves every item: apply it, or keep it with a reason. Typical resolutions:
  - remove page wrappers, because `body` is the canvas;
  - turn panels into `<Card>`;
  - turn gradient and tri-colour CTAs into one `<Button variant="primary">` per view;
  - turn status text into `text-{tone}` or `<StatusBadge>`;
  - map `z-[9999]` to the `--z-*` tokens;
  - turn gradient text into `text-foreground` plus `text-h1` or `text-h2`.
- Skip `components/ui/**`, the v2 Rewind code that P11.29 deletes (`components/wrapped/**`, `app/(app)/wrapped/**`, `components/generator/**`, `components/shared/formatted-text.tsx`), `app/api/wrapped/og-image/**` and tests.
- CLI: `--slice <globs>`, a dry run by default with counts per rule, and `--write`. Running it twice is a no-op. Use the repo's TypeScript script runner (the one P0.1 and P1.3 settled on).
- Slices, one PR each:
  1. the tool, plus `app/(app)` and the member folders `components/subscription`, `components/subscribe`, `components/discord` and `components/watchlist`;
  2. `components/dashboard` (183 raw palette classes), ahead of P10.21's home refresh.
- The other four slices of the former P3.11 run inside the steps that rebuild those pages, with the same tool and the same review rules: auth in P10.27, invite and subscribe in P10.26 and P10.28 (with the root `app/error.tsx` and `app/loading.tsx` in P10.17), onboarding in P10.23 and setup in P10.25.
- Each PR runs `npm run design:update` (the counts only fall), regenerates its baselines through the P1.6 workflow, and lowers the axe baseline where contrast improved (UI-12). Component tests that assert raw classes move to behaviour or token assertions.

**Tests.**
- New `scripts/codemods/__tests__/tokens.test.ts` (node environment, an in-memory ts-morph project):
  - every auto pair, including prefixes, `!` and opacity;
  - review routing, and the context rule (`bg-cyan-600 text-white` is left untouched);
  - `cn()`, `clsx()`, template and `cva` sources;
  - strings outside class contexts, such as a placeholder "text-white", stay unchanged;
  - the skip list, idempotence, and the review-file format.
- Per slice: the visual diff, `design:check` and the E2E suite.

**Integration.**
- P10.14 reuses the tool for the admin users and settings slices, and P10.17 and P10.21 to P10.28 run it over the pages they rebuild.
- Review items deferred to a page rebuild are listed in the PR under that P10 step.

**Demo.** Run `--slice components/dashboard` as a dry run: it prints the auto and review counts. Then open the slice PR, showing its screenshot diff and the `design-debt.json` totals before and after.

**Done when.**
- [x] The tool implements every 9.3 pair, with tests, and is idempotent.
- [ ] The two slice PRs are merged, each with a reviewed screenshot diff and resolved review items, and the tool is ready for P10.14 and the page rebuilds.
- [x] `design-debt.json` counts are lower for every file in those slices.

(as merged: run the tool over any folders, files or globs with `npm run codemod:tokens -- --slice <folder|file|glob> [...more]` for a dry run (counts per rule; it writes only the git-ignored `codemod-review.md`), then add `--write` to rewrite; `--review-file <path>` moves the review list. Rerunning is a no-op, so it is safe over folders already done. Built on the `typescript` compiler API the design check already uses (`scripts/design-system/ast.mjs`) instead of a new `ts-morph` dependency, so P10.11's `adapters.ts` builds on the same API. Beyond 9.3: neutral rows also take `gray-` and `zinc-`; `text-cyan-400` is always review (link, label and stat value can't be told apart); any palette class with no pair goes to review (`raw-palette`), which holds its whole unit under the context rule; the context unit is the whole className or class-function call, not one string; and `text-white` goes to review (`on-fill`) inside a `<Button>`, under a `style` background or within three elements of a coloured fill. The skip list already holds P10.14's admin entries. Class strings returned from plain helper functions are not class contexts and stay hand work. Both slices are tokenised with every review item resolved by hand, and every file in them leaves `design-debt.json`; screenshot diffs and axe baselines are left to the owner's Visual Baselines workflow.)

### Step P10.14: Token codemod: admin users and settings slices

- **Track:** ui. **Lane:** admin. **Effort:** M, 2 PRs. **Window:** 2027-01-07 to 2027-01-11. **Depends on:** P10.13.
- **Findings addressed:** UI-17, UI-12, DUP-14

**Objective.** Run the token codemod over the admin users and settings areas, one PR each with screenshot diffs, converting the hand-copied panels to `Card`, so P10.18's users page and P10.19's settings layout start from tokenised files. This was P3.12. Its other areas no longer run as codemod slices: invites and announcements fold into P10.1 and P10.5; LLM usage, cost analysis and shares, with the chart theme, into P10.2; Discord, queues and the chatbot into P10.5, P10.3 and P10.6; prompts into P10.4. The playground and admin Rewind views are skipped, because P8.8 replaced the playground and P11.29 deletes the v2 viewer code.

**Guidance.**
- Areas, one PR each, in this order:
  1. users (`app/admin/users`, `components/admin/users`), ahead of P10.18;
  2. settings, ahead of P10.19.
- Add to the skip list: `components/admin/wrapped/**`, `app/admin/wrapped/**`, `app/admin/users/[userId]/wrapped/**` and `components/admin/playground/**`, which P8.8 and P11.29 replace or delete.
- Panels (DUP-14): the review list catches the `bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6` literal (most of the 108 to 115 copies are in admin). Convert each one to `<Card>` with `CardHeader`, `CardTitle` and `CardContent`, or `<Card padding>` where the inner layout must not change. Keep every `data-testid` on the new root.
- Buttons (UI-17): resolve the review items into Button variants.
  - The cyan-600 and purple-600 actions become `primary` or `secondary`, with one primary per view.
  - Red deletes become `destructive`.
  - The same rules apply in the areas that fold into P10.1 to P10.6, which carry the specific items: the prompts gradient Link (P10.4), Pause Queue (P10.3) and the white-on-cyan LLM usage row actions (P10.2).
- Charts are not in these two areas; P10.2 and P10.5 move them onto `registerCharts()` and `chartTheme('dark')`.
- Stat values coloured by position become `text-foreground` (9.3). Status text becomes `text-{tone}`, or `StatusBadge` with `lib/ui/status.ts` where a domain fits.
- Each PR: run `design:update`, the P1.6 workflow, and axe baseline updates for the entries that disappear. Fix the admin component tests in `components/__tests__/` that assert old classes.
- P6.1's AdminShell has already merged, so these PRs touch page bodies only.

**Tests.**
- Per PR: the admin visual baselines for the users default and the Plex-down pair, and settings; the admin E2E specs; and the updated component tests.

**Integration.**
- P10.18's users page and P10.19's settings page build on these files.
- Deferred review items are listed under P10.18 or P10.19 in each PR.

**Demo.** Show `/admin/users` and `/admin/settings` before and after: one primary action per view and graphite cards without blur, with the axe baseline diff.

**Done when.**
- [ ] The users and settings areas are tokenised in their own PRs, with reviewed diffs.
- [ ] The users and settings panels render through `Card`.
- [ ] Those areas' `design-debt.json` counts and contrast violations are lower.

### Step P10.15: Spinner and icon sweeps

- **Track:** ui. **Lane:** member. **Effort:** M, 2 PRs. **Window:** 2027-02-02 to 2027-02-04. **Depends on:** P3.4, P3.9.
- **Findings addressed:** DUP-14, UI-26

**Objective.** Script the replacement of the 32 to 34 inline spinners with `Spinner` or `Button loading`, and of the repeated check, chevron, close and warning SVGs with lucide components through `Icon`. Add both counts to the design-debt ratchet so they can only go down.

**Guidance.**
- Ratchet first:
  - add `inline-spinner` (`/M4 12a8 8 0 018-8V0C5\.373/`) and `inline-svg` (`/<svg\b/` outside the chart and Rewind art allowlist) to `scripts/design-system/rules.mjs`;
  - give `--update` an `--add-rule <id>` flag that records a rule new to the baseline and still refuses any other rise;
  - commit the starting counts in the first commit of the PR.
- `scripts/codemods/spinners.ts` (ts-morph) finds `<svg>` elements whose `path d` starts with the spinner path (the `circle` plus `path` pair included). It replaces each with `<Spinner className={...} />`, mapping the size classes (`w-4 h-4` to `size-4`).
  - When the spinner sits in a `button` or `Button` beside an `isLoading`-style condition, as in `components/admin/users/unshare-user-button.tsx:66-83`, it writes a review item suggesting `<Button loading loadingLabel="...">` instead.
- `scripts/codemods/icons.ts` maps exact paths to lucide components through `<Icon icon={...} size={...} />` (P3.4):
  - `M5 13l4 4L19 7` to `Check` (16 copies), `M19 9l-7 7-7-7` to `ChevronDown` (8), `M9 5l7 7-7 7` to `ChevronRight`, `M15 19l-7-7 7-7` to `ChevronLeft`, `M6 18L18 6M6 6l12 12` to `X` (7), and the warning triangle to `TriangleAlert` (6).
  - Sizes snap from `w-3` to 12, `w-3.5` to 14, `w-4` to 16, and `w-5` and `w-6` to 20.
  - The icon is `aria-hidden` unless the SVG carried `aria-label` or `title`, which becomes `label`.
  - Every other path goes to a review list grouped by path, with a suggested concept from `lib/ui/icons.ts`. The Discord and Plex marks (`admin-nav.tsx:83`, `settings/page.tsx:193`, `invite/[code]/page.tsx:156-159`, `media-server-link-card.tsx:59`) become `MessagesSquare` and `Tv` (UI Q9).
- Scope: `app/**` and `components/**`, using P10.13's skip list. Skip the admin shell files if P6.1 has not merged yet, because it deletes them. Use two PRs, spinners then icons, each with screenshot diffs.
- Resolve the review items in the same PRs where the change is mechanical, and leave the rest listed for the P10 page steps.
- Component tests that query `svg path[d=...]` move to role or test-id queries.

**Tests.**
- New `scripts/codemods/__tests__/spinners.test.ts` and `icons.test.ts`: exact matches only, the size mapping, label retention, `Button loading` routed to review, non-matching paths untouched, and idempotence.
- `scripts/__tests__/check-design-system.test.ts` gains cases for the two rules and `--add-rule`.
- Per PR: the visual diff, the E2E suite, and the ESLint raw-`svg` warning count recorded before and after.

**Integration.**
- lucide through `Icon` becomes the only icon source, and the remaining inline SVGs are listed for the P10 page steps.
- P10.11 turns the ESLint `svg` ban into an error.

**Demo.** Run both scripts as dry runs: they print their counts. Show `npm run design:report` with `inline-spinner` at zero outside the skipped v2 code, and the check, chevron, close and warning paths gone. Then show the users page row actions, now with lucide icons and the same test ids.

**Done when.**
- [ ] `inline-spinner` and `inline-svg` are in the ratchet, with counts that have fallen.
- [ ] No inline spinner remains outside the skipped v2 code; each became `Spinner` or `Button loading`.
- [ ] The repeated check, chevron, close and warning SVGs render through lucide.
- [ ] Both codemods have tests and are idempotent.

### Step P10.16: Admin command menu

- **Track:** ui. **Lane:** admin. **Effort:** S. **Window:** 2027-01-21 to 2027-01-21. **Depends on:** P6.1.
- **Findings addressed:** UI-32, UI-41

**Objective.** Ctrl or Cmd K opens a Command dialog that lists destinations, finds users and invite codes, and offers quick actions. Search runs through a GET route and TanStack Query, never a server action (UI-41).

**Guidance.**
- Add an exact-pinned `cmdk`. `components/ui/command.tsx` is the shadcn Command, restyled to the 5.4 menu recipe and rendered inside P3.6's Dialog.
- `components/admin/command-menu.tsx` (client):
  - a document `keydown` listener opens it on Ctrl or Cmd K, as do the sidebar's "Search or jump to" button (`admin-command-trigger`) and the mobile search button;
  - Destinations come from `lib/admin/nav.ts` and filter locally;
  - Users and Invites come from the route below, with `shouldFilter={false}` on those groups;
  - Quick actions: Create invite and New announcement go to `/admin/invites?create=1` and `/admin/announcements?new=1`, and the two clients open their dialog from that param. P7.8 adds "Generate all Rewinds" with its route.
- New `app/api/admin/search/route.ts`, a `GET` handler:
  - It calls `limitRequest('admin:search', request)`, with a new `LIMITS` entry of 120 per minute. P0.10's `admin` limit of 50 per 15 minutes would throttle search-as-you-type.
  - Then `requireAdminAPI(request)` (`lib/security/api-helpers.ts:10`) and P4.3's `parseSearchParams` with `z.object({ q: z.string().trim().min(1).max(64), kind: z.enum(['users', 'invites']) })`.
  - Users: `findMany` on `name` or `email` (`contains`, `mode: 'insensitive'`), `take: 8`, selecting only `id`, `name`, `email` and `isAdmin`.
  - Invites: `code` `startsWith` the upper-cased query, selecting `id`, `code`, `serverType`, `useCount`, `maxUses` and `expiresAt`.
  - It returns `{ results: [{ id, label, sub, href }] }`, with `href` from P6.1's builders, and errors as codes.
- `hooks/admin/use-admin-search.ts`:
  - `useQuery({ queryKey: ['admin-search', kind, q], queryFn, enabled: q.length > 0, placeholderData: keepPreviousData, staleTime: 30_000 })`;
  - `q` comes from a 180ms `useDebouncedValue`, and `queryFn` passes the query's `signal` to `fetch`;
  - the response is parsed with a Zod schema, because the client treats it as external data.
- Keyboard: cmdk provides the arrows and `aria-activedescendant`. Enter navigates with `router.push`, and Escape closes and returns focus to the trigger.

**Tests.**
- `__tests__/api/admin-search-route.test.ts`:
  - a signed-out caller gets 401 and a member 403;
  - an empty `q`, 65 characters or an unknown `kind` gets 400;
  - the Prisma `select` holds only the listed fields, so no token can be returned, and the 121st call in a minute gets 429.
- `hooks/admin/__tests__/use-admin-search.test.tsx` with fake timers: typing "mor" one character every 100ms sends one request, and the earlier results stay visible while the next request runs.
- `components/admin/__tests__/command-menu.test.tsx` with user-event and `jest-axe`: Ctrl K opens; "set" shows Settings; ArrowDown and Enter navigate; Escape closes and restores focus.
- New `e2e/admin-command-menu.spec.ts`: Ctrl K, then "Regular" and Enter, lands on the user's detail page; the seeded `VISUALOK` code finds its invite.

**Integration.** P6.1's shell mounts the menu once. `/dev/ui` shows it open, and the result shape is the one P10.1's invite lookup reuses.

**Demo.** Press Cmd K on any admin page, type part of a member's name and press Enter: the detail page opens. Type an invite code and open it. The network panel shows debounced GETs, and the list never flashes empty.

**Done when.**
- [x] The dialog opens from the keyboard and both triggers, and it covers destinations, users, invites and quick actions.
- [x] The search route is admin-only, Zod-validated and rate-limited, and returns only public fields.
- [x] The hook debounces, keeps previous results and validates responses.
- [ ] Keyboard tests and the E2E spec pass. (Jest keyboard tests pass; the E2E spec is written and collects, not yet run.)

(as merged: cmdk 1.1.1 is pinned exactly. cmdk has no per-group `shouldFilter`, so the root sets `shouldFilter={false}` and the menu filters destinations and quick actions itself (label or group substring). The query and response schemas live client-safe in `lib/admin/search.ts` (`adminSearchQuerySchema`, `adminSearchResponseSchema`, `adminSearchUrl`); result `href`s must start with `/admin/`. The menu is `CommandMenuProvider` (mounted once in `AdminShell`, owns the Ctrl or Cmd K listener and the Dialog), `CommandMenuTrigger` (sidebar `admin-command-trigger`, mobile bar `admin-command-trigger-mobile`) and `CommandMenuKeyHint`; items are `admin-command-{page,user,invite,action}-<id>` and the input `admin-command-input`. New shared hooks: `hooks/use-debounced-value.ts` and `hooks/use-open-from-param.ts` (reads `?create=1` / `?new=1`, then drops the param). "Generate all Rewinds" opens the Season page, where its confirm stays; it does not auto-open the confirm. `icons.search` was added. The `/dev/ui` Command specimen shows the content open inline, not the live dialog.)

### Step P10.17: Status screens, 404, global error and route skeletons

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-05 to 2027-01-07. **Depends on:** P6.3, P3.8.
- **Findings addressed:** UI-19, BP-35, UI-44, SEC-20

**Objective.** One StatusScreen design and one in-card ErrorState, driven by error codes and digests, never by `error.message`. Add a branded 404 and a global error, and replace the full-screen and brand-text loaders with skeletons shaped like their pages.

**Guidance.**
- New `components/ui/status-screen.tsx` takes the 5.5 props: a 40px tile with a 20px icon, the code or digest in muted mono, an h1, one sentence, a primary action and an optional secondary one (`data-testid="status-screen"`). Pages compose it inside a shell.
- Restyle `components/ui/error-state.tsx`, which P3.8 already made copy-safe, as a Card. It shows the title and description from `errorCopy()`, the digest in mono, and Try again as a `Button`.
- `lib/ui/error-copy.ts` gains `boundaryCopy(error)`. It uses P4.3's `authErrorKind` and digests, and falls back to "Something went wrong on our side".
- The routes in the 6.7 table:
  - New `app/not-found.tsx` renders PublicShell with "This page doesn't exist", the code 404, "Go to home", and "Ask for help on Discord" when `DiscordIntegration.serverInviteCode` is set (BP-35).
  - `app/error.tsx` shows "Something went wrong on our side" with the digest, Try again and Go to home, and routes auth digests through `authErrorKind`.
  - New `app/global-error.tsx` (client) renders its own `<html lang="en" className="dark"><body>`. It uses inline styles from `themes.dark` in `lib/design/tokens.ts`, no Tailwind classes, and no components that need providers.
  - `app/admin/error.tsx` becomes an in-shell ErrorState that calls `reset`, which today is ignored (`reset: _reset`, `:11`), and links back to Users.
  - Admin denial: StatusScreens "Sign in to continue" (Continue with Plex, to `/?callbackUrl=/admin`) and "Admins only" (Back to home) replace `components/admin/shared/unauthenticated-error.tsx` and `unauthorized-error.tsx`, keeping the test ids `unauthenticated-error-page` and `unauthorized-error-page`. Delete both files.
  - `app/onboarding/error.tsx`, `app/setup/error.tsx`, `app/invite/[code]/error.tsx` and `app/auth/callback/plex/error.tsx` move onto ErrorState or StatusScreen. The Rewind boundaries belong to P5.1.
- Skeletons (UI-44), each a `role="status"` region with an sr-only "Loading" label:
  - `app/loading.tsx` becomes a neutral page skeleton, and new `app/(app)/loading.tsx` draws the home cards with the RewindCard strip;
  - `app/admin/loading.tsx` becomes `PageHeaderSkeleton` and `TableSkeleton` inside the shell, without its own `min-h-screen` gradient;
  - new route loaders for `app/admin/users` (four stat tiles and a table), `app/admin/settings` (the nav and two sections), `app/admin/llm-usage`, `app/admin/cost-analysis` and `app/admin/discord`;
  - a step card for `app/onboarding/loading.tsx`, a form for `app/setup/loading.tsx`, and a pass for `app/invite/[code]/loading.tsx`, which P10.26 refines.
  - The Plex callback keeps the one full-screen spinner (P10.27). Delete `LoadingScreen` once knip reports no importer.
- SEC-20: add a check to the tests below that no `error.tsx`, `global-error.tsx` or `not-found.tsx` under `app/` reads `error.message`.

**Tests.**
- `components/ui/__tests__/status-screen.test.tsx` with `jest-axe`: one h1, the code in mono, the action order.
- `error-state.test.tsx`: an `Error("Can't reach database server at db:5432")` with the digest `abc123` shows `abc123` and never the message.
- `app/__tests__/global-error.test.tsx`: it renders `html` and `body`, and the inline background equals `themes.dark.background.hex`.
- `app/__tests__/not-found.test.tsx`: the Discord action appears only when an invite code exists.
- `app/__tests__/error-boundaries.test.tsx` (P4.3) is extended: `PM_FORBIDDEN` renders `unauthorized-error-page` as a StatusScreen, and a source scan finds no `error.message` in any boundary.
- New `e2e/status-screens.spec.ts` under `E2E_SERVER=prod`:
  - `/visual-missing-page` returns 404 and shows `status-screen`;
  - a member on `/admin` sees `unauthorized-error-page`, and a signed-out visitor sees `unauthenticated-error-page`;
  - the dev-only `app/dev/ui/throw/page.tsx` (behind `ENABLE_DEV_UI`) shows a digest and no message.
- Update the 404 and error baselines, and add the "home loading" frame of `screens.html`.

**Integration.** P10.26 and P10.27 build their failure states on StatusScreen. P6.5's StatTile shows a dash for failed values. P10.x pages inherit the admin skeletons.

**Demo.** Open `/does-not-exist`: a branded 404 with Go to home. Throw from the dev route in a production build: the screen shows a digest, and `docker logs` shows the full error. Click between admin pages on a throttled connection: header and table skeletons appear inside the shell.

**Done when.**
- [x] StatusScreen and ErrorState exist with tests, and no boundary renders `error.message`.
- [x] `app/not-found.tsx` and `app/global-error.tsx` exist, and the admin denial screens are StatusScreens.
- [x] Every `loading.tsx` in scope is a shaped skeleton, and the brand-text loaders are gone.
- [ ] The production-mode E2E spec and the baselines pass.

(as merged: the denials are `components/shell/admin-denial.tsx` (`AdminDenial`, codes 401 and 403, ids `unauthenticated-error-page` and `unauthorized-error-page`, buttons `admin-denial-sign-in` and `go-home-button`); copy comes from `authCopy` and `boundaryCopy` in `lib/ui/error-copy.ts`. Client boundaries get the server name from `useServerName()` (`lib/brand-context.tsx`, which the root layout fills through `Providers`). `app/(app)/loading.tsx` was NOT added: a loader at the `(app)` level becomes the prefetched fallback for `/rewind/<year>` and replaces the story loader's `rewind-field` layer that the morph needs. The home skeleton is `components/dashboard/home-skeleton.tsx`, drawn on `/dev/ui` for the "home loading" frame; P10.21 wires it once the home page has its own segment. The callback loader is "Finishing sign-in" with a Spinner inside the auth PublicShell; P10.27 finishes it. `LoadingScreen`, both P6.1 denial files and `RexDinosaur` are deleted. `global-error.tsx` keeps a raw `<button>` (no Tailwind, no providers): P10.11 must allow it when the raw-element ban becomes an error. The admin sign-in link is `/?callbackUrl=/admin`, which nothing reads yet; P10.27's sign-in should honour it. E2E, visual and axe baselines were not run here.)

### Step P10.18: Admin users page as the reference list page

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-11 to 2027-01-13. **Depends on:** P6.1, P6.5, P10.14.
- **Findings addressed:** UI-05, UI-23, UI-42, UI-46, UI-28, UI-12

**Objective.** Rebuild `/admin/users` as the 6.3 reference list page (`admin-users.html`). It never hides members when Plex is down, shows its filters, lets keyboard and mobile users reach every action, and is covered by `admin-users-*` test ids that the whole admin E2E suite moves onto.

**Guidance.**
- Data: `getAllUsersWithWrapped(year)` (`actions/user-queries.ts:186`) returns `{ users, plexCheck: { status: 'ok' | 'unreachable' | 'not-configured', checkedAt } }`. Today `buildPlexAccessMap` (`:359`) silently sets everyone to null.
- New `lib/admin/users-filter.ts` holds the pure functions:
  - `filterUsers(users, { q, plexAccess, role, subscription })` and `sortUsers`;
  - `usersStats(users, plexCheck)`.
  - The page parses `searchParams` with Zod, defaulting every filter to `all` (UI-05), and filters, sorts and paginates on the server.
- `app/admin/users/page.tsx`:
  - PageHeader "Users" with Import from Plex. Then a StatGrid above the table: members, Plex access ("5 of 7 shared", or "2 not verified"), subscriptions and this season's LLM spend. It replaces `users-stats-summary.tsx`, which sits below the table today.
  - When `plexCheck.status` is `unreachable`, a warning Alert (`admin-users-plex-alert`) carries the exact 6.3 copy with the count and "Last checked ...". Its "Check again" calls `router.refresh()`, which re-runs the uncached check.
  - Then FilterBar (search, Role, Plex access, Subscription) and the DataTable.
- `components/admin/users/users-table.tsx` (client) defines the columns:
  - member: initials avatar, the name as a `userDetail` link, the email;
  - role: an outline Badge for Owner (with `shield`) and Admin, plain text for Member;
  - Plex access: a StatusDot from the `plexAccess` domain, with Unknown and its sub-line;
  - subscription: a StatusBadge; Rewind status;
  - LLM cost through `formatMoney(v, 'table')` (UI-28) and the join date through `formatDate(d, 'short')`.
- Row actions, headed with the member's name:
  - View details, View Rewind (`userRewind` with the season year), Regenerate, Change role, and with Stripe on: Grant access, Toggle exempt and Cancel subscription;
  - then P4.7's Disable, and last "Remove Plex access...", a ConfirmDialog with `typeToConfirm` set to the member's name.
  - The six buttons `regenerate-wrapped-button.tsx`, `change-user-role-button.tsx`, `unshare-user-button.tsx`, `toggle-exempt-button.tsx`, `grant-access-button.tsx` and `cancel-subscription-button.tsx` become ConfirmDialog with `useActionDialog` (P3.6). They lose their own loading state, spinner SVG and `confirmButtonClass` (UI-42), and their dialogs name the target. Keep the trigger test ids, plus `admin-user-disable-button`.
- Delete `users-list.tsx`, `users-filter.tsx`, `user-table-row.tsx`, `users-stats-summary.tsx` and `user-status-badge.tsx`, and rebuild `user-actions-menu.tsx` as `rowActions`.
- Test ids follow `admin-users-<element>[-<id>]` (UI-46): `-header`, `-stats`, `-plex-alert`, `-filter-<param>`, `-table`, `-row-<id>`, `-actions-<id>` and `-footer`.
- E2E selectors move onto test ids (UI-46):
  - in `admin-functionality.spec.ts`, `accessibility.spec.ts`, `announcements.spec.ts`, `jellyfin-invite.spec.ts` and `stripe-subscription.spec.ts`, `locator('aside')` becomes `getByTestId('admin-sidebar')`;
  - heading and text waits become `admin-<area>-header`;
  - the "click All first" workaround at `admin-functionality.spec.ts:30-34` goes;
  - `button[aria-label*="Delete invite"]` (`accessibility.spec.ts:110`) becomes a new `admin-invites-delete-<code>` id on `invites-page-client.tsx:335`.
- UI-12: with the gradient gone, axe at `wcag22aa` reports no incomplete contrast on this page.

**Tests.**
- `lib/admin/__tests__/users-filter.test.ts`: with Plex unreachable the defaults list every member; each filter, the search and the sorts; `usersStats` gives "2 not verified".
- `app/admin/users/__tests__/page.test.tsx`: the Alert appears only when unreachable, its copy carries the count, and the footer reads "Showing all 7 members".
- `components/admin/users/__tests__/users-table.test.tsx`: each ConfirmDialog shows its pending label and keeps an error inside the dialog; typed confirmation gates removal; the stacked rows keep the actions.
- New `e2e/admin/users.spec.ts`:
  - with the seeded server at `http://127.0.0.1:9`, every member shows Unknown, and `admin-users-plex-alert` appears;
  - a filter change updates the URL and shows a chip;
  - Disable on a seeded member runs through the dialog.
- The two users baselines now differ, as P1.6 predicted. Add the mobile stacked view, and axe passes.

**Integration.** This page is the pattern for P7.8's per-member table and P10.1 to P10.6. The user detail page (P10.6) reuses the action dialogs, and P10.11 finishes the test-id sweep.

**Demo.** Point Plex at a dead address and open Users: all seven members are listed with Unknown access, the Alert explains why, and Check again recovers once Plex returns. Remove access for a test member: the dialog asks for the name and shows "Removing".

**Done when.**
- [ ] The page matches `admin-users.html`: StatGrid above, the Plex-down Alert, filters defaulting to All, and no pager on a single page.
- [ ] Every row action is reachable by keyboard and on mobile, through ConfirmDialogs with pending and error states.
- [ ] Money and dates use `lib/utils/format.ts`, and axe passes `wcag22aa`.
- [ ] The admin E2E specs select only by `data-testid`.

### Step P10.19: Settings layout and connection status

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-13 to 2027-01-15. **Depends on:** P6.5, P10.14.
- **Findings addressed:** UI-31, UI-17, UI-27

**Objective.** Turn the 3,200px settings page into the 6.4 layout: a sticky section nav with tone glyphs and a legend, and `SettingsSection`s that show live connection health from `lib/ui/status.ts`. Every form uses one always-open editing pattern, and mobile gets a "Jump to" Select.

**Guidance.**
- `app/admin/settings/page.tsx` (448 lines) becomes a thin page. It composes `components/admin/settings/settings-layout.tsx` (a 200px sticky nav beside a `max-w-[760px]` column) and one file per section in `components/admin/settings/sections/`. The groups of 6.4:
  - Media: Plex server, Tautulli, Overseerr.
  - Features:
    - AI provider: P2.12's form, plus the master Switch relabelled "AI features" with "Rewind then uses template copy", and Tabs for Admin assistant and Rewind generation;
    - Discord, Stripe billing and Watchlist sync;
    - Rewind, holding today's `WrappedSettingsForm` until P7.12 replaces it.
  - More:
    - Other integrations: Sonarr, Radarr, Jellyfin with `JellyfinLoginToggle`, and Prometheus, as one list card whose Edit or Set up opens the form in a Sheet;
    - System information, holding today's base URL, environment, Node and database rows.
- Page actions: "Test all connections" (secondary) and the Assistant.
- New `components/ui/tabs.tsx`, on Base UI Tabs with the 5.4 underline recipe; P3 shipped none.
- New `components/ui/settings-section.tsx` takes the 5.5 props:
  - the header shows a StatusBadge in the `connection` domain with "Checked {relative}" from `<Time>`;
  - the footer has `footerMeta` on the left, and Test connection and Save changes on the right;
  - Save stays disabled until the form is dirty; a dirty form shows the "Unsaved changes" pip and Discard;
  - `blockedReason` disables Test and Save, and P10.20 wires it;
  - the test result renders inline with `role="status"`, and `id` is the anchor, with `scroll-margin-top`.
- Connection health: new `lib/settings/connection-health.ts` (`server-only`).
  - `getConnectionHealth()` runs the existing testers in `lib/connections/*` (`testPlexConnection`, `testTautulliConnection`, `testOverseerrConnection` and so on) in parallel, each with P2.3's 5 s timeout.
  - It maps each result to a `ConnectionStatus` and a code, never a message. It is cached for 5 minutes under the tag `connection-health`, and the new `recheckConnections()` `adminAction` revalidates the tag.
  - The AI section is `degraded` ("Template copy") while `llmDisabled` is on (UI-31). Discord takes the worst category among its enabled features. Stripe reads `getStripeConfig()`.
- The nav (`settings-nav.tsx`):
  - each item carries a 12px glyph from `settingsCategory(status)` (P3.9), with `role="img"` and an `aria-label`, plus the dirty pip; the legend below uses the same glyphs (5.6);
  - an IntersectionObserver sets `aria-current="true"` on the visible section;
  - below `md` the nav becomes a sticky "Jump to" Select that scrolls to the anchor; fields go to one column and footers stack.
- One editing pattern (UI-31):
  - remove the read-only and Edit toggles (`isEditing`) from the forms that P1.2 renamed: `server-form.tsx`, `llm-provider-form.tsx` and `discord-integration-form.tsx`;
  - each form reports `isDirty`, `isPending` and `onDiscard` through new `hooks/admin/use-settings-form.ts`.
- Delete the page's own `StatusBadge`, `toneClasses` and `FeatureStatusBadge` (`page.tsx:11-52`). Every control is a `components/ui` primitive (UI-17, UI-27).
- Keep `stripe-settings-form`, `stripe-enabled-toggle`, `stripe-enable-requirements` and `jellyfin-login-toggle`. Sections use `settings-<id>-section`, `-test` and `-save`.

**Tests.**
- `components/ui/__tests__/settings-section.test.tsx`: Save is disabled until dirty; the pip and Discard; an inline `role="status"` result; `blockedReason` disables both buttons.
- `lib/settings/__tests__/connection-health.test.ts` with mocked testers: a timeout maps to `unreachable`, an error message never appears in the output, the AI section is degraded while `llmDisabled` is on, and the cache tag is set.
- `components/admin/settings/__tests__/settings-nav.test.tsx`: the glyph labels follow the 5.6 table, the dirty pip shows, and Jump to scrolls. `components/ui/__tests__/tabs.test.tsx` covers arrow keys and `aria-selected`.
- New `e2e/admin/settings-layout.spec.ts`: nav links reach their sections; Test all connections turns the badges to "Checked just now"; `scrollWidth` is 390 at mobile width.
- The settings baselines at 1440 and 390 are reviewed against `admin-settings.html`.

**Integration.** P10.20 fills the sections with FormFields and SecretInput, P7.12 replaces the Rewind section, and P7.8's preflight reuses `getConnectionHealth()`.

**Demo.** Open Settings: the nav shows glyphs and a legend, Tautulli reads "Connected, checked 2 minutes ago", and Turn AI features off turns its glyph to Needs attention with "Template copy". On a phone, Jump to reaches Stripe.

**Done when.**
- [ ] One page with the grouped glyph nav, the legend and the mobile Jump to Select.
- [ ] Every section is a `SettingsSection` with a status and a "Checked" time.
- [ ] No form has an Edit toggle, and the local badge helpers are deleted.
- [ ] Health checks are cached and never expose error text, and the baselines are reviewed.

### Step P10.20: Settings sections with SecretInput and audited saves

- **Track:** ui. **Lane:** admin. **Effort:** M. **Window:** 2027-01-18 to 2027-01-20. **Depends on:** P10.19, P4.6.
- **Findings addressed:** UI-31, UI-13, SEC-31, SEC-55

**Objective.** Every service form uses FormFields and a SecretInput. A changed address demands the secret again before Test or Save can run (SEC-31), and each section shows who last saved it, from the persisted audit log (SEC-55). Discord shows two status rows, and Stripe states its prerequisites without premature errors.

**Guidance.**
- New `components/ui/secret-input.tsx` (5.5) has four states:
  - `saved`: a masked mono value ending in `saved.last4`, with a 12px lock and "Saved";
  - `empty` and `entered`: Show and Hide act only on the typed value;
  - `reenter-required`: when `currentOrigin !== saved.origin`, an empty required field with "Re-enter to use with the new address".
  - `onReveal` stays unwired, because sending a stored secret to the browser would undo what SEC-31 protects.
- Server data: `omitSecret` (`actions/admin/admin-settings.ts:68-97`) returns `secret: { last4, origin } | null` instead of `hasToken` and `hasApiKey`. `last4` comes from the decrypted value, and `origin` from `new URL(row.url).origin`.
- `components/admin/settings/server-form.tsx`:
  - the fields are Name, URL, Public URL (optional, "Shown to members") and the Token or API key as SecretInput, in a two-column FormField grid (UI-13);
  - `currentOrigin` comes from the live URL field through `safeOrigin()`;
  - `blockedReason` is "Enter the API key to test or save" while re-entry is required.
- New `actions/admin/test-connection.ts`:
  - `testServiceConnection({ service, url, secret? })` is an `adminAction` with a Zod input and a new `admin:test` limit of 30 per 10 minutes;
  - it resolves the secret through P4.6's `resolveSecretForOrigin`, returning `SECRET_REQUIRED` before any fetch;
  - it runs the tester with a timeout and returns `{ status, code }`;
  - `lib/ui/error-copy.ts` maps the codes to field copy ("Nothing answered at this address") and to an inline Alert with the fix.
  - A successful save calls `revalidateTag('connection-health')`.
- Saves: P4.6's update actions return `SECRET_REQUIRED` with `fieldErrors`, and forms render them on the field, never as toasts only.
- `footerMeta`: new `getSettingsAuditMeta()` reads the newest `CONFIG_CHANGED` row per `details.section` from `AuditLog` (P4.6) in one query, and renders "Last saved {date} by {name}".
- AI provider: P2.12's form adopts FormField and SecretInput. Its base-URL rule is P4.6's function, so the re-enter state appears there too.
- Discord: two status rows, "Linked roles" and "Support bot" (5.6):
  - each has a Switch with a stable label and its own connection badge, from `isEnabled` plus the client credentials, and from `botEnabled` plus a `DiscordBotLock` heartbeat within 90 s;
  - there is no section badge;
  - the client secret and bot token are SecretInputs in the saved state only, because their destination is fixed (P4.6's exception);
  - the Portal URL is read-only with a copy button.
- Stripe: the Subscriptions switch stays disabled until the secrets exist. One warning Alert (`stripe-enable-requirements`) and the field descriptions state the prerequisite, and fields turn to the error state only after a save attempt. The keys use the saved state (fixed destination).
- Remove every raw input from these forms; each field goes through FormField, with `htmlFor` and `aria-describedby`.

**Tests.**
- `components/ui/__tests__/secret-input.test.tsx` with `jest-axe`: all four states, the re-enter hint linked by `aria-describedby`, and Show never rendering `last4` as an editable value.
- `server-form.test.tsx`: a host change disables Test and Save until a key is typed; the same origin with a new path does not.
- `actions/__tests__/test-connection.test.ts`: a blank key with a new origin returns `SECRET_REQUIRED` and the mocked `fetch` never sees the stored key; codes map to copy; no message is echoed.
- `actions/__tests__/admin-settings.test.ts`: `omitSecret` returns `last4` and `origin`, and the serialised result contains no secret.
- `discord-section.test.tsx` covers the two rows and their badges, and `stripe-section.test.tsx` shows no error before submit.
- New `e2e/admin/settings-secret-origin.spec.ts` (6.4):
  - change Overseerr's host: the key field is empty and required, and `settings-overseerr-test` and `-save` are disabled;
  - type a key: both enable;
  - then remove the `disabled` attribute with `page.evaluate`, submit with a blank key, and see `SECRET_REQUIRED` on the field.
- The settings baselines match the dirty Overseerr state of `admin-settings.html`.

**Integration.** P10.25 reuses SecretInput, `server-form.tsx` and `testServiceConnection` in setup, and P7.12's Rewind section uses the same footer meta. CLAUDE.md's Stripe section mentions the saved-state keys.

**Demo.** Change Tautulli's URL to a netcat listener: the key field asks for re-entry, Test and Save are disabled, and the listener receives nothing. Save the original URL: the footer reads "Last saved just now by Dana Whitfield".

**Done when.**
- [ ] Every service form uses FormFields and SecretInput, with field-level errors.
- [ ] A changed origin blocks Test and Save in the browser, and the server refuses it too.
- [ ] Footers show the last audited save, and Discord shows two status rows.
- [ ] The Stripe prerequisites show without premature errors, and the origin E2E spec passes.

### Step P10.21: Home page refresh

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-08 to 2027-01-12. **Depends on:** P6.9, P3.8, P6.3.
- **Findings addressed:** UI-38, UI-34, UI-15, UI-16, UI-25, UI-28, UI-07, GAP-29

**Objective.** Rebuild signed-in home as a Server Component page in the order of `home.html`: greeting, RewindCard, announcements with pips, quick links that go to the right places, a watchlist card only where it works, membership and help cards, and an UptimeStrip. Nothing animates forever. The "New on" poster row waits for P10.12.

**Guidance.**
- `app/(app)/page.tsx`, signed in, renders new `components/dashboard/home-page.tsx`. Loaders live in `lib/member/home-data.ts`, and `user-dashboard.tsx` (a client component today) is deleted.
- The greeting: an h1 "Good evening, {first name}", by the hour in `User.timezone ?? serverZone()`, computed on the server, with "You've been watching on {serverName} since {month year}". Headings run h1 then h2 (UI-10).
- Announcements (UI-25):
  - the latest three, rendered through `MarkdownBody` (P3.8), with no clipped scroll box;
  - migration `user_announcements_seen` adds `User.announcementsSeenAt DateTime?`;
  - an item is new when its `createdAt` is later than that; the pip is the indicator square with an sr-only "New", replacing the permanent pinging badge;
  - the `MarkAnnouncementsSeen` island calls the new `markAnnouncementsSeen({ through })` `memberAction` after mount, with the newest `createdAt`, so the current view still shows its pips;
  - keep `announcements-card`. P10.22 adds "View all".
- `components/dashboard/quick-links.tsx` renders a filtered array in an auto-fit grid with no placeholders (UI-38):
  - Watch on Plex goes to `https://app.plex.tv/desktop/#!/media/{machineIdentifier}/com.plexapp.plugins.library`. The id comes from `getPlexServerIdentity` (`lib/connections/plex-connection.ts`), cached for 24 hours under the tag `plex-identity`, with a fallback to `{publicUrl}/web`.
  - Jellyfin members get the Jellyfin row's `publicUrl ?? url` and its own name. The lookup drops the `enabledForLogin` filter (`page.tsx:32-34`), and there is no jellyfin.org fallback, so the tile hides without a URL (GAP-29).
  - "Request a title" uses Overseerr's `publicUrl` only (P4.3), through `safeHref`, and never names Overseerr (7.1).
  - Discord shows "Linked as {handle}" or "Link Discord", both to `/discord/link`, plus Join when an invite code exists.
  - These replace `media-server-link-card.tsx`, `requests-card.tsx` and `discord-card.tsx`.
- The watchlist card (`components/watchlist/sync-settings-card.tsx`) receives `initialSettings` from the page instead of loading in an effect (UI-41). It renders only for a Plex primary service with `globalSyncEnabled`, Overseerr configured and a stored token, and its toggle becomes `Switch`. Its copy follows P11.28.
- The membership card, when a subscription exists: the plan name (not the price id), a status badge, the renewal date through `formatDate`, and Manage billing. P10.22 moves the detail to `/membership`.
- The help card: "Playback trouble?" with the support channel. P10.22 adds the guide link.
- New `components/ui/uptime-strip.tsx` (5.5):
  - it folds `getPrometheusStatus()`'s 168 hourly segments into 84 worst-of pairs, which differ by height and hatching;
  - the strip is `aria-hidden`, and the summary sentence and an sr-only incident list carry the meaning;
  - it hides when `!isConfigured` (UI Q8), and it replaces `StatusFooter` and its hover-only detail (`status-background.tsx`), which is deleted.
- No infinite animation (UI-15): remove `framer-motion` from the dashboard cards, the bell wiggle, the ping dots and `gradient-shift`. Every value goes through `lib/utils/format.ts` (UI-28).
- `metadata = { title: 'Home' }`. UI-07's flash codes keep arriving through P3.2's `FlashFromQuery`.
- UI-34's onboarding copy goes in P10.23; on home, no tile promises a feature that is not configured.

**Tests.**
- `lib/member/__tests__/home-data.test.ts`: the identity cache and its fallback; the Jellyfin name and URL without `enabledForLogin`; Requests with no public URL gives null; the greeting by zone.
- `components/dashboard/__tests__/quick-links.test.tsx`: the Plex web URL with the machine id; no `jellyfin.org` anywhere; each Discord state; no placeholder cells.
- `announcements-card.test.tsx`: the pips follow `announcementsSeenAt`, and the action receives the newest `createdAt`.
- `actions/__tests__/announcements-seen.test.ts`: session required, Zod on the date.
- `uptime-strip.test.tsx`: the folding, the summary text, `aria-hidden`, and hidden when unconfigured. `sync-settings-card.test.tsx` covers each hidden case.
- New `e2e/home.spec.ts`:
  - the heading order;
  - `document.getAnimations()` has no infinite iteration after load;
  - the quick-link hrefs;
  - a pip disappears after a reload.
- `announcements.spec.ts` keeps passing. The home baselines are reviewed against `home.html` without the poster row, and axe reports no `scrollable-region-focusable`.

**Integration.** P6.11 and P10.22 add the account, Help and "View all" links. P7.14 adds the Rewind notice on other pages, and P10.12 adds the "New on" row under the RewindCard.

**Demo.** Sign in as a Jellyfin member: the tile names the Jellyfin server and opens its public URL. As a Plex member, Watch on Plex opens the server in Plex Web. Post an announcement: its pip shows once, and is gone after a reload. With reduced motion off, nothing on the page keeps moving.

**Done when.**
- [ ] Home follows `home.html` (minus "New on") as a Server Component page with no client fetch waterfall.
- [ ] The quick links go to the server's own Plex Web, the public Requests URL, `/discord/link`, and Jellyfin with the right name.
- [ ] Announcements render through MarkdownBody with seen-based pips, and the UptimeStrip hides without Prometheus.
- [ ] No infinite animation remains, and the E2E, visual and axe checks pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P10.22: Announcements, help and membership pages

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-12 to 2027-01-14. **Depends on:** P6.3, P3.8.
- **Findings addressed:** UI-25, UI-30, UI-37

**Objective.** Add the three member destinations that home and the shell point to: `/announcements` with seen-based pips, `/help` with the onboarding guides and the support link, and `/membership` (Stripe on), which takes the plan, renewal and Manage billing off home.

**Guidance.**
- New `app/(app)/announcements/page.tsx` (UI-25):
  - every active announcement from `getActiveAnnouncements()`, each an `article` with an h2, a `<Time>` date and `MarkdownBody`;
  - the "New" pip from P10.21's `announcementsSeenAt`, and the same `MarkAnnouncementsSeen` island;
  - EmptyState `first-use` with "No announcements yet";
  - home's announcements card gains "View all", and `metadata = { title: 'Announcements' }`.
- New `app/(app)/help/page.tsx` re-hosts the guides (6.1):
  - extract `components/guides/playback-guide.tsx` (service-aware, from `plex-configuration-step.tsx` and `jellyfin-configuration-step.tsx`), `requests-guide.tsx` (only with a public Overseerr URL, from `media-request-step.tsx`) and `support-guide.tsx` (reporting issues and the Discord support channel, from `discord-support-step.tsx`);
  - sections with anchors `#playback`, `#requests` and `#support`, which the home help card links to;
  - no admin hints such as "Admin > Settings > Overseerr" (`media-request-step.tsx:70`), and service names from props (UI-34, finished in P10.23).
- New `app/(app)/membership/page.tsx` (UI-37):
  - `notFound()` unless `stripeEnabled` is on or a subscription row exists (6.1);
  - the plan name from new `getPlanName(priceId)` in `lib/stripe/prices.ts`: the offered price's `productName`, else `stripe.prices.retrieve(priceId, { expand: ['product'] })` cached for an hour, else "Membership". Never the raw id (`subscription-status-view.tsx:104-106`);
  - a StatusBadge in the `subscription` domain with "Renews {date}" or "Retrying {date}", the price through `formatMoney`, and exemption states ("Comp", "Not required");
  - Manage billing (`ManageSubscriptionButton`, "Opens Stripe"), with portal errors shown in an inline Alert as well as the toast (UI-10).
  - Move `SubscriptionStatusView` here as `components/subscription/membership-details.tsx`, keeping `subscription-status-view`, `subscription-plan`, `subscription-status-badge`, `subscription-period` and `subscription-past-due-notice`. Home's membership card links here.
- Navigation (UI-30): `lib/member/nav.ts` adds Help (always) and Membership (conditional), and the account menu adds Membership.

**Tests.**
- `app/(app)/announcements/__tests__/page.test.tsx`: lists render bullets, the pips follow the seen date, and the empty state shows.
- `app/(app)/help/__tests__/page.test.tsx`:
  - a Jellyfin member's guide never says Plex;
  - the requests guide is hidden without a public URL;
  - no text matches `/Admin\s*>/`.
- `app/(app)/membership/__tests__/page.test.tsx`: `notFound` with Stripe off and no row; the plan name and not `price_`; the renewal line; Manage billing.
- `lib/stripe/__tests__/prices.test.ts`: `getPlanName` for an offered price, a retrieved price and the fallback, and its cache.
- New `e2e/member-pages.spec.ts`: each page has `aria-current` in the nav and passes axe; `/membership` returns 404 with Stripe off. `stripe-subscription.spec.ts` covers `/membership` with Stripe on.
- Visual baselines for all three pages at both sizes.

**Integration.** P10.23 builds onboarding on the guides, and its last step points to Help. P11.15's export and P11.16's disclosures can link from Help.

**Demo.** Follow "View all" from home: every announcement renders with real bullets, and the pips clear on the next visit. Open Help as a Jellyfin member: Jellyfin settings only. With Stripe on, Membership shows "Supporter plan, Active, Renews November 6, 2026" and opens Stripe.

**Done when.**
- [x] `/announcements`, `/help` and `/membership` exist with metadata, nav entries and tests.
- [x] The guides are shared components with service-aware copy and no admin hints.
- [x] `/membership` never shows a raw price id, and the subscription section is gone from home.
- [ ] E2E, visual and axe checks pass.

(as merged: P10.21 was not on the start point, so this step ships the pieces it shares: migration `20270112000000_p1022_user_announcements_seen` (`User.announcementsSeenAt`), `markAnnouncementsSeen` in `actions/announcements-seen.ts` (moves forward only, never past now), `components/announcements/mark-announcements-seen.tsx`, `components/announcements/new-pip.tsx` and `lib/member/announcements.ts`; P10.21 reuses them instead of adding its own. Guides render no heading (`PlaybackGuide({ service, serverName })`, `RequestsGuide({ requestsUrl })`, `SupportGuide({ discord, linkHref?, instructions? })`, with `linkHref` for onboarding's `/discord/connect?redirect=/onboarding`); `getHelpData(userId)` in `lib/member/help.ts` loads their props. `memberNav({ rewindYear, membership })` orders Home, Rewind, Membership, Help (6.1); `hasMembershipPage` in `lib/member/membership.ts` feeds the nav, the account menu (`ShellUser.membership`) and the page's `notFound()`. `getPlanName` sits beside `getPlanPrice` in `lib/stripe/prices.ts`; their tests are in `__tests__/lib/stripe/prices.test.ts`. Pre-P10.21 home keeps its layout: the announcements card gains "View all" and `MembershipLinkCard` replaces the subscription view; P10.21's help card links `/help#playback` and `#support`. The three visual captures are added to `e2e/visual/member.visual.spec.ts` for the owner's baseline workflow.)

### Step P10.23: Onboarding refresh

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-15 to 2027-01-19. **Depends on:** P6.5, P3.5, P10.22.
- **Findings addressed:** UI-33, UI-34, UI-10, UI-15

**Objective.** Rebuild member onboarding on the shared Stepper (6.5, `onboarding.html`): five illustrated steps in a minimal shell, no space background and no timed interstitials, focus on each step's h1, and copy that fits Plex and Jellyfin and promises only what the dashboard offers. Discord links through `/discord/connect?redirect=/onboarding`.

**Guidance.**
- New `components/ui/stepper.tsx` (5.5 `StepperProps`):
  - an `<ol>` with `aria-current="step"`, the text "Step 2 of 5" and "About a minute";
  - horizontal: 4px segments with every label visible; done segments are `muted-foreground`, the current one `primary-indicator`, upcoming ones `secondary`;
  - vertical: a grouped list with group headings and "Optional" captions, for P10.25;
  - P3.3's recipe test now covers this file.
- `app/onboarding/layout.tsx` uses PublicShell with `account` (Wordmark plus Sign out) and drops `SpaceBackground` (UI-15, UI-16).
- `app/onboarding/page.tsx` loads `getOnboardingInfo()` on the server and passes the service, `serverName` (or the Jellyfin name for Jellyfin members), the public Requests URL, the Discord state and the support link as props. This replaces the client effect at `onboarding-wizard.tsx:30-38`.
- Rewrite `components/onboarding/onboarding-wizard.tsx` (under 250 lines) as a 560px column with one Card per step:
  - Welcome, Playback, Requests, Support and Done. Requests is dropped when no public URL exists, and the count becomes "Step 3 of 4".
  - The content comes from P10.22's `components/guides/*`, with illustrations built from real UI pieces: the mock Plex settings panel with "720p" struck through and "Maximum" checked, the changed row marked by a 3px `border-strong` strip on `muted` and never amber, and the Requested, Processing and Available lifecycle on poster-palette title cards.
- No timed interstitials (UI-33): remove `SuccessAnimation`, `FinalSuccessAnimation` and the 500ms sleep (`:60`). Continue advances at once, and a `useEffect` focuses the new step's h1 (`tabIndex={-1}`, UI-10).
- Below `md`, a sticky bottom action bar holds a ghost Back and a large primary ("Continue", or "Finish" on Done), with `pb-[env(safe-area-inset-bottom)]`.
- Copy (UI-34, UI-40):
  - service names come from props, and admin hints are removed;
  - "What's next" lists only configured features: Rewind, Requests, Discord and "You can find this guide again under Help";
  - no "Great!", "Got it!" or "Perfect!" titles.
- The Support step: "Link Discord" goes inline to `/discord/connect?redirect=/onboarding`, which P4.9 allows (UI-01). When Discord is disabled, only the Discord block hides and the reporting guidance stays; there is no "coming soon". Done names `/discord/link` for later.
- Finish: `completeOnboarding(service)` errors render an inline Alert as well as the toast, and success navigates to `/`.
- Keep `onboarding-wizard-heading`, `onboarding-wizard-subheading`, `onboarding-<step>-heading`, `-continue` and `onboarding-final-complete`, and add `onboarding-stepper` and `onboarding-back`. Delete the step files that the guides replace.

**Tests.**
- `components/ui/__tests__/stepper.test.tsx` with `jest-axe`: `aria-current="step"`, the indicator token on the current segment, and vertical groups with Optional captions.
- `components/onboarding/__tests__/onboarding-wizard.test.tsx`:
  - after Continue, `document.activeElement` is the new h1, with no timers involved;
  - the Jellyfin flow contains no "Plex", and the Requests step is skipped without a public URL;
  - the Discord href is `/discord/connect?redirect=%2Fonboarding`;
  - a completion error shows inline.
- `e2e/onboarding-flow.spec.ts`: its `waitForTimeout` calls are removed, it checks the focus after each step, it adds a Jellyfin member run, and axe runs on every step.
- The onboarding step 2 baseline is reviewed against `onboarding.html` at 390.

**Integration.** P10.25 reuses the Stepper's vertical mode. Once P10.25 deletes them, nothing imports the setup animations, and knip enforces that.

**Demo.** Complete onboarding on a phone in under 20 seconds: no overlays, a sticky Continue, and VoiceOver announcing each step's heading. A Jellyfin member sees Jellyfin instructions, and Link Discord returns to the Support step with "Discord linked".

**Done when.**
- [x] The Stepper exists in both orientations with tests.
- [x] Onboarding has no space background, no interstitials and no infinite animation, and focus lands on each h1.
- [x] The copy is service-aware, has no admin hints and promises only configured features.
- [ ] Discord goes through `/discord/connect?redirect=/onboarding`, and the E2E and visual checks pass.

(as merged: `Stepper({ steps, orientation, label?, meta?, showCurrentLabel?, onSelect? })` in `components/ui/stepper.tsx`; steps are `{ id, label, state, optional?, group? }` with `state` `done | current | upcoming | skipped`. Horizontal hides the labels visually above five steps; `showCurrentLabel` gives "Step 3 of 9, Overseerr" for setup below `lg`; `onSelect` makes done and skipped steps buttons (setup's Back). The page reads `getOnboardingData(userId)` (`lib/member/onboarding.ts`: P10.22's `getHelpData` plus `Config.rewindEnabled`) instead of `getOnboardingInfo()`, which is deleted. Step ids are `welcome | playback | requests | support | final` (`types/onboarding.ts`), so the test ids are `onboarding-<id>-heading` and `-continue`. The Discord flow returns with a `discord_*` flash, which reopens the Support step. `SupportGuide`'s `linkHref` is now a plain `<a>` string, because the connect route is a route handler. Illustrations live in `components/guides/playback-illustration.tsx` and `requests-illustration.tsx`, so Help can reuse them. `space-background`, `success-animation` and `final-success-animation` stay until P10.25, since setup still imports them. The E2E spec is written but has not been run, and the step 2 baseline belongs to the owner.)

### Step P10.24: Setup wizard model: string step ids and Skip

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-26 to 2027-01-28. **Depends on:** P11.32, P11.31.
- **Findings addressed:** UI-03, DUP-05

**Objective.** Give setup string step ids with `group` and `optional`, migrate `Setup.currentStep` to `currentStepId`, fix the step-10 write and add Skip for now on optional steps. Setup and admin saves share one service-save helper that deactivates earlier rows, so going Back and saving again never leaves two active configs. The rows that are already duplicated are cleaned up by P11.31 first, through a reviewed audit rather than inside this migration.

**Guidance.**
- `types/setup.ts`:
  - `SetupStepId` is `'plex' | 'tautulli' | 'overseerr' | 'sonarr' | 'radarr' | 'llm-rewind' | 'llm-chat' | 'discord' | 'prometheus'`, and the wizard's position is `SetupStepId | 'summary'`;
  - `SETUP_STEPS` lists them in the 6.5 order with `group` (Core, Requests, Automation, AI, Community and monitoring) and `optional`. Only `plex` and `tautulli` are required;
  - add `nextStepId`, `previousStepId` and `stepIndex`.
- Migration `setup_step_ids`:
  - add `currentStepId String @default("plex")`;
  - map today's numbers by today's order: 1 `plex`, 2 `tautulli`, 3 `overseerr`, 4 `sonarr`, 5 `radarr`, 6 `discord`, 7 `llm-chat`, 8 `llm-rewind`, 9 `prometheus`, and 10 `prometheus`, because 10 is written both by the buggy wrapped save and by Prometheus;
  - drop `currentStep`;
  - nothing else: the migration changes only these columns and step ids. Deactivating duplicate service rows is irreversible and could switch the live Plex or Tautulli config, because today's runtime reads them with `findFirst({ where: { isActive: true } })` and no order; P11.31 does it as a reviewed apply.
- `actions/setup.ts`:
  - `getSetupStatus()` returns `currentStepId`;
  - every save advances through `advanceSetup(tx, fromId)`, which sets `currentStepId` to the later of the current id and `nextStepId(fromId)`, so a re-save after Back never moves progress backwards;
  - that removes the hard-coded numbers (`:76`, `:132`, `:187`, `:242`, `:297`, `:354`, `:427` and `:497`) and the step-10 write (`saveLLMProvider`, `:471`).
  - New `skipSetupStep({ stepId })`, with `auth: 'setup'` (P11.32) and a Zod enum of the optional ids, refuses required steps with `VALIDATION`, advances without writing a service row, and logs `SETUP_STEP_SKIPPED`.
  - Back stays a client navigation (`?step=`), limited to steps at or before `currentStepId`.
- Shared save logic (DUP-05):
  - new `lib/services/descriptors.ts` maps `plex`, `jellyfin`, `tautulli`, `overseerr`, `sonarr`, `radarr` and `prometheus` to their Prisma delegate, Zod schema (`lib/validations/*`), tester (`lib/connections/*`), secret field and labels;
  - new `lib/services/service-config.ts` (`server-only`) has `saveActiveService(kind, input, { tx })`: it deactivates the kind's active rows, updates the row with the same URL or creates one, activates it and returns it;
  - both `actions/setup.ts` (`savePlexServer` to `savePrometheus`) and `actions/admin/admin-servers.ts` (`updatePlexServer` to `updateJellyfinServer`) run P4.6's `resolveSecretForOrigin`, then the tester, then `saveActiveService`, then P4.6's `CONFIG_CHANGED` diff, inside one transaction;
  - Plex setup still writes `adminPlexUserId`, and the LLM saves keep their per-purpose deactivation (`setup.ts:438`);
  - the duplicated blocks, about 450 lines, go, and each new file stays under about 150 lines.

**Tests.**
- `types/__tests__/setup-steps.test.ts`: the order, the groups, `optional` only off for Plex and Tautulli, and `next` and `previous` at both ends.
- `lib/services/__tests__/service-config.test.ts`:
  - re-saving the same URL updates one row and leaves exactly one active;
  - a new URL deactivates the old row;
  - a tester failure rolls back with nothing changed.
- `actions/__tests__/setup.test.ts`:
  - each save advances to the right next id, and the Rewind LLM save leads to `prometheus`, never `summary`;
  - Skip refuses `plex` and `tautulli` and advances optional steps;
  - Back then save keeps `currentStepId`;
  - unclaimed calls return `SETUP_UNCLAIMED`, and the P11.32 suite still iterates over every export.
- New `prisma/__tests__/setup-step-ids.pg.test.ts` (P1.5's `describePg`) maps 1 to 10 and leaves every service row's `isActive` unchanged.
- The existing admin-servers and secret-reuse tests stay green on the shared helper.

**Integration.** P10.25 renders from `currentStepId` and calls `skipSetupStep`. P1.5's drift check covers the migration, and the upgrade note names the step-id migration for P11.25's changelog.

**Demo.** On a test database, save Tautulli with a wrong URL, go Back, fix it and save again: `SELECT count(*) FROM "Tautulli" WHERE "isActive"` returns 1. Skip Sonarr: the wizard moves to Radarr, and no Sonarr row exists.

**Done when.**
- [ ] Steps have string ids with `group` and `optional`, and the migration maps every stored number.
- [ ] The step-10 write is gone, and optional steps can be skipped through a claim-gated action.
- [ ] Setup and admin saves share `saveActiveService`, and Back and re-save leaves one active row.
- [ ] Action, migration and helper tests pass, and the migration touches no service row.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P10.25: Setup wizard UI

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-28 to 2027-02-01. **Depends on:** P10.24, P6.5, P10.20.
- **Findings addressed:** UI-03, UI-13, UI-33, SEC-30, UI-15, UI-16

**Objective.** Rebuild first-run setup as `setup.html` draws it:
- the claim step, then Connect with Plex through the PIN flow, with an owned-server picker and a token fallback;
- a grouped vertical Stepper, and the same FormFields, SecretInput and inline test results as settings;
- Skip on optional steps, and a summary that signs the owner in.

No confetti and no space background.

**Guidance.**
- `app/setup/layout.tsx` is a setup shell: the Wordmark with `productName` ("Plex Manager Setup"), `<main id="main">`, and no `SpaceBackground` (UI-15, UI-16).
- `app/setup/page.tsx` checks P11.32's `requireSetupClaim()`. Without a claim it renders `SetupClaimStep`, which rebuilds `components/setup/setup-claim-form.tsx` on Card and FormField: a key tile, a mono field with `autocomplete="one-time-code"`, "Claim and continue" and the "What happens next" list. Keep P11.32's test ids (SEC-30).
- `components/setup/setup-wizard/setup-wizard.tsx` (under 250 lines) and new `setup-step-frame.tsx`:
  - P10.23's vertical grouped Stepper at `lg` and up; below `lg`, the horizontal segments with "Step 3 of 9, Overseerr", so the 1,300px card wall is gone (UI-33). Each step is a Card whose h1 takes focus;
  - the footer has a ghost Back, Skip for now (optional steps only, calling `skipSetupStep`) and the primary Save and continue; it is a sticky bar on mobile.
- The Plex step, `plex-connect-step.tsx` (UI-03):
  - "Connect with Plex" runs the PIN flow on P4.8's `lib/connections/plex-pin.ts` through new claim-gated actions in `actions/setup-plex.ts`:
    - `startSetupPlexConnect()` sets the PIN cookie under the purpose `setup-plex-pin`;
    - `pollSetupPlexConnect()` returns `{ status, account?, servers? }`. The servers come from plex.tv `/api/v2/resources?includeHttps=1&includeRelay=1`, filtered to `provides` containing `server`, with every token stripped;
    - `chooseSetupPlexServer({ machineIdentifier, uri })` re-reads the resources on the server, requires `owned`, takes that server's `accessToken`, saves through P10.24's `saveActiveService('plex')` with `adminPlexUserId` set to the PIN account, and advances.
  - The picker uses radio cards: owned servers are selectable, an offline one says "Not reachable since {date}", and shared ones are disabled with "Only its owner can set it up". "Address Plex Manager uses" is a Select, local first, and "Use a different account" restarts.
  - "Enter a token instead" is a disclosure that keeps today's URL and token form (`plex-server-form.tsx:182-212`).
  - The confirmation card shows "{name} is connected" with library and title counts. The poster proxy needs a session, so the six tiles are poster-palette title cards with real titles.
- Every other service step is one `service-connection-form.tsx`, driven by P10.24's descriptors, replacing `tautulli-form.tsx`, `overseerr-form.tsx`, `sonarr-form.tsx`, `radarr-form.tsx` and `prometheus-form.tsx`, five 218-line near-copies (DUP-05):
  - it uses FormField (UI-13) and P10.20's SecretInput;
  - a step revisited with Back shows "Saved" with the last four characters, and a changed host demands re-entry;
  - Test connection calls P10.20's `testServiceConnection` and renders an inline `role="status"` Alert.
  - The LLM and Discord steps reuse P10.20's settings forms.
- The summary step lists configured and skipped integrations, with "Set up later in Admin, Settings". "Open admin" calls `completeSetup()`, which clears the claim (P11.32), then P4.8's `startPlexSignIn({ callbackUrl: '/admin' })`; plex.tv usually approves at once, because this browser approved in step 1.
  - In `lib/auth.ts`, the Plex user created for `adminPlexUserId` gets `onboardingStatus: { plex: true, jellyfin: false }`, so the owner lands on `/admin` and not in member onboarding (UI-03).
- Delete `space-background.tsx`, `success-animation.tsx` and `final-success-animation.tsx` (the confetti) once knip shows no importer; P10.23 and P11.29 removed the others.
- Remove the `setup-input-*` default test ids from the StyledInput and StyledDropdown adapters (6.3, item 7), and move the spec to `setup-<step>-<field>`.

**Tests.**
- `components/setup/__tests__/setup-claim-step.test.tsx`: the field attributes, and the error state.
- `plex-connect-step.test.tsx` with mocked actions: owned is selectable, shared is disabled, the offline label shows, and the token fallback is reachable by keyboard.
- `actions/__tests__/setup-plex.test.ts`: unclaimed calls are refused; no `accessToken` key appears at any depth of the poll result; `choose` refuses a non-owned server and an unknown `machineIdentifier`, and sets `adminPlexUserId`.
- `service-connection-form.test.tsx`: the origin rule, and Skip only on optional steps.
- `e2e/setup-wizard.spec.ts`, rewritten on the guarded test database (P0.4) with `SETUP_TOKEN`:
  - claim, then the token fallback, because CI cannot reach plex.tv and `SKIP_CONNECTION_TESTS` keeps its mock;
  - save Tautulli, then Skip Overseerr to Prometheus; the summary lists the skips;
  - Back to Tautulli and save again leaves one active row;
  - at 390, the first input sits inside the first viewport.
- Visual baselines for the claim, Plex and step 3 screens, against `setup.html`.

**Integration.** P1.10's README install steps gain the claim and the Plex connect flow. Setup and settings now share forms, testers and the save helper.

**Demo.** On a fresh install, paste the setup code from `docker logs`. Connect with Plex, pick the owned server, skip every optional step, and press Open admin: the owner lands on `/admin` with no member onboarding.

**Done when.**
- [ ] The claim, Plex connect, service, Skip and summary steps match `setup.html` on the shared primitives.
- [ ] No plex.tv token reaches the browser, and the token fallback still works.
- [ ] The confetti, the space background and the five copied forms are deleted.
- [ ] The E2E spec passes on the test database, and the baselines are reviewed.

### Step P10.26: Invite page as a server-rendered pass

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-21 to 2027-01-25. **Depends on:** P6.3, P3.9.
- **Findings addressed:** UI-36, UI-39, UI-40

**Objective.** Make `/invite/[code]` a Server Component that renders the InvitePass with metadata for link unfurls, the right server name and marks, and its own copy for expired, used-up and unknown invites. It gets a pass-shaped skeleton and a StatusScreen error.

**Guidance.**
- New `lib/invites/pass.ts` (`server-only`): `getInvitePass(code)`, wrapped in React `cache()` so that `generateMetadata` and the page cost one lookup and one limiter point.
  - It validates the code with P4.3's `inviteCodeSchema` and applies `consume('invite:validate', ip)` (P0.10) through `actionClientIp()`.
  - It returns the 5.5 `InvitePassProps`, with the state `valid`, `expired`, `used-up` or `unknown`:
    - `serverName` is `serverName()` for Plex invites and the active Jellyfin row's name for Jellyfin invites;
    - a Jellyfin invite with no active Jellyfin server is `unknown` (UI-36);
    - `inviter` is the `createdBy` user's name, never an email;
    - `libraries` are the names behind `librarySectionIds` or `jellyfinLibraryIds` from a cached section listing, or "All libraries";
    - `usesLeft` and `expiresOn` come from the row.
  - There is no revoked column, and a deleted invite reads as `unknown`, so `revoked` stays out of the union until one exists.
- `app/invite/[code]/page.tsx` drops `'use client'`, the client fetch at `:25-86`, `getServerName()` and the "Invalid Invite" catch-all (`:117`).
  - `generateMetadata` returns `{ title: "You're invited to {serverName}" }`, or "Invite unavailable", plus one description and `robots: { index: false }`. The image is P3.9's default OG card, and no code appears in the metadata.
  - A rate-limited lookup renders a StatusScreen "Too many attempts", with the code `RATE_LIMITED`.
- New `components/invite/invite-pass.tsx` follows 6.6:
  - the main part shows the inviter, the h1 "You're invited to {name}", one sentence and the libraries as neutral Badges;
  - the primary "Accept with Plex" is the client island `PlexSignInButton`, which calls P4.8's `startPlexSignIn({ inviteCode })`;
  - for Jellyfin, `JellyfinSignInForm` shows "Creates an account on {jellyfin name}";
  - the stub shows the code in mono, the uses left, the expiry through `formatDate`, and `monogramFor(serverName)` with "Good for one Plex account".
  - Voided states strike through the code and mute the stub, with the headlines "This invite has expired", "This invite has been used up" and "We couldn't find that invite" (UI-40). They show the inviter's name and "Ask on Discord" when an invite code exists, and no "Go Home" to a sign-in the invitee cannot use.
- Sign-in failures after Accept belong to P10.27's callback StatusScreen, never to the invite's error copy (UI-36).
- `app/invite/[code]/loading.tsx` draws the pass skeleton, and `error.tsx` is P10.17's StatusScreen. The layout is P6.3's PublicShell.
- Keep `valid-invite-heading`; `invalid-invite-heading` goes on every voided headline, with `data-state`. Keep `plex-invite-sign-in` and `jellyfin-invite-form`, and add `invite-pass` with `data-state`. Delete the client `validateInvite` call path once knip shows no caller.

**Tests.**
- `lib/invites/__tests__/pass.test.ts`:
  - every state, and a Jellyfin invite without a server reads `unknown`;
  - the inviter is a name, never an email, and the library names resolve;
  - the limiter is consumed once across `generateMetadata` and the page.
- `app/invite/[code]/__tests__/page.test.tsx`: the metadata titles per state, the voided copy per state, and no client directive in the page.
- `components/invite/__tests__/invite-pass.test.tsx` with `jest-axe`: the stub fields and the Accept island.
- `jellyfin-invite.spec.ts` and `public-flows.spec.ts`:
  - `VISUALOK` shows `valid-invite-heading`, and `VISUALEXP` shows "This invite has expired";
  - `request.get('/invite/VISUALOK')` returns HTML with `og:title` set to "You're invited to ...", which proves the unfurl without JavaScript.
- The valid and expired invite baselines are reviewed against `invite.html` and `screens.html`.

**Integration.** P4.12's Jellyfin type check runs inside the redemption path that this page calls. P10.1's invite detail page previews the same `InvitePass`.

**Demo.** Paste an invite link into Discord: it unfurls as "You're invited to Northfield Plex". Open an expired code: a voided pass, the inviter's name and "Ask on Discord". Open a Jellyfin invite with Jellyfin disabled: "We couldn't find that invite".

**Done when.**
- [ ] The invite page is a Server Component with `generateMetadata` and no client validation.
- [ ] The server name and marks are correct for Plex and Jellyfin invites.
- [ ] Expired, used-up and unknown invites each have their own headline.
- [ ] The skeleton, the StatusScreen and the tests pass.

### Step P10.27: Sign-in, callback and denied screens

- **Track:** ui. **Lane:** member. **Effort:** M. **Window:** 2027-01-19 to 2027-01-21. **Depends on:** P6.3, P10.17.
- **Findings addressed:** UI-35, UI-19, UI-40, GAP-34

**Objective.** Rebuild the signed-out `/` as the member pass: one click on "Continue with Plex" with no forced wait, Jellyfin as the secondary option, and accurate copy about the stored Plex token with a short privacy notice. "Finishing sign-in" is the one full-screen spinner, and failed sign-ins and non-members get StatusScreens.

**Guidance.**
- New `components/auth/member-pass.tsx` (6.6):
  - a 48px monogram and the `text-display` "Sign in to {serverName}", with one line of context;
  - a full-width large primary "Continue with Plex" (`sign-in-button`), which calls P4.8's `startPlexSignIn()` and navigates at once, removing the `warningDelay` path (`plex-sign-in-button.tsx:89-96`, UI-35);
  - an "or" divider and the secondary "Use Jellyfin instead" (`toggle-jellyfin`, `aria-expanded`), which reveals `JellyfinSignInForm` in place, only when Jellyfin login is enabled;
  - the stub "Member pass", "Good for every account on the share" and "Not a member yet? Ask the server owner for an invite link.", with no counts and no art (UI Q4).
- Copy under the button (GAP-34): "You'll approve access on plex.tv. {serverName} keeps your Plex sign-in token to sync your watchlist and accept invites for you." Then the short privacy notice: "Server admins can see your watch activity and your Rewind. Some Rewind text is written by an AI service."
- `app/(app)/page.tsx`, signed out: P6.3's PublicShell with MemberPass. This replaces the `fixed inset-0` main and the gradient h1. With no server configured, it renders a StatusScreen. Delete `service-sign-in-toggle.tsx`, and strip the warning state from `plex-sign-in-button.tsx`.
- The callback:
  - `app/auth/callback/plex/loading.tsx` and the waiting state of `callback-client.tsx` (`plex-callback-waiting`, P4.8) are the one full-screen spinner: a Spinner and "Finishing sign-in" with `role="status"` (6.7);
  - failures render a StatusScreen "Sign-in didn't finish", whose Try again restarts `startPlexSignIn`;
  - P4.8's codes `plex_pin_expired`, `invite_invalid` and `rate_limited` map to copy; `access_denied` goes to `/auth/denied`, and `gated` to `/subscribe`;
  - developer strings such as "No PIN ID received from Plex" (`callback-client.tsx:90`, `:216`) never render.
- `/auth/denied`: a StatusScreen "You're not a member of {serverName} yet", with the invite explanation. The primary "Ask for an invite" links to Discord when an invite code exists, and the secondary is "Sign out" (`denied-sign-out`). Delete the particles, rings and pulsing heading in `denied-client.tsx` (UI-15). Keep `access-denied-heading`, and update `e2e/helpers/test-utils.ts:88` and `:108` and `public-flows.spec.ts:50`.
- NextAuth errors (UI-07 extra, P3.2):
  - set `pages.error: '/auth/error'` in `lib/auth.ts:434`;
  - new `app/auth/error/page.tsx` maps `Configuration`, `AccessDenied`, `Verification`, P0.10's `RateLimited` and `Default` through `lib/ui/flash-codes.ts`, and never renders the query text.
- Labels follow 7.2 (UI-40): "Sign in", "Sign out", "Try again", "Go to home". Titles: "Sign in", "Finishing sign-in", "Not a member yet".

**Tests.**
- `components/auth/__tests__/member-pass.test.tsx` with fake timers and `jest-axe`:
  - one click calls `startPlexSignIn` once and navigates with no `setTimeout` scheduled;
  - the Jellyfin option appears only when enabled, with `aria-expanded`;
  - the copy names the stored token.
- `components/__tests__/auth/plex-callback.test.tsx` (P4.8) is extended: each code's copy, Try again restarting, no raw text.
- `app/auth/denied/__tests__/page.test.tsx`: the StatusScreen and no animation imports.
- `app/auth/error/__tests__/page.test.tsx`: an unknown or scripted `error` shows the generic copy, and the text is absent from the DOM.
- `e2e/public-flows.spec.ts`:
  - one click on `sign-in-button` reaches the intercepted app.plex.tv URL within 1 s;
  - `/auth/denied` shows `access-denied-heading` and `denied-sign-out`;
  - `/api/auth/error?error=AccessDenied` lands on the branded page.
- Baselines for sign-in at both sizes, denied and the callback failure.

**Integration.** P10.26's Accept and P10.25's "Open admin" use the same `startPlexSignIn` path. P11.16 adds the conversation disclosure to the notice, and P11.23's auth spike keeps these screens.

**Demo.** Open `/` signed out: one click on Continue with Plex reaches plex.tv immediately. Paste a stale callback URL: "Sign-in didn't finish" with Try again. Sign in as a non-member: "You're not a member of Northfield Plex yet", with Sign out.

**Done when.**
- [x] Sign-in is one click with no forced wait, and Jellyfin is the secondary option.
- [x] The copy says the token is stored and reused, and the short privacy notice is present.
- [x] "Finishing sign-in" is the only full-screen spinner, and the failure, denied and NextAuth error screens are StatusScreens.
- [ ] The E2E, axe and visual checks pass.

(as merged: `/?callbackUrl=` is honoured. `safeCallbackPath` (`lib/validations/callback-path.ts`) keeps only a same-origin relative path. The member pass passes it to `startPlexSignIn({ callbackPath })`, which keeps it in the signed PIN cookie (an off-site value is dropped), and `finishPlexSignIn` returns it as `next` after the access and onboarding checks. Jellyfin goes back to `/?callbackUrl=`, and the signed-in `/` redirects there once onboarding is done. The action input is named `callbackPath` because the SEC-35 surface test flags inputs ending in `url`. The Jellyfin option reveals `JellyfinSignInButton`, the sign-in form; `JellyfinSignInForm` is the invite account form. `PlexSignInButton` is now invite-only, with no warning and no disclaimer, for P10.26. `StatusScreen` gained `titleTestId` (`plex-callback-error-heading`, `access-denied-heading`, `auth-error-heading`). `/auth/error` reads `nextAuthError()` from `flash-codes.ts`, which gained `RateLimited`, and `FlashFromQuery` skips that page. E2E, axe and visual checks were not run here.)

### Step P10.28: Subscribe pages

- **Track:** ui. **Lane:** member. **Effort:** S. **Window:** 2027-01-26 to 2027-01-26. **Depends on:** P6.3.
- **Findings addressed:** UI-37, UI-10, UI-40

**Objective.** Entitled members on `/subscribe` see "You already have access" with Manage billing. Everyone else sees plan cards with names and prices, never raw price ids, one primary action and a Sign out escape. The success page shows a live checklist.

**Guidance.**
- `app/subscribe/page.tsx`, inside P6.3's PublicShell with `account`, so Sign out is always present:
  - P4.5's `getAccessLevel(userId)` returning `full` renders a StatusScreen "You already have access" (`subscribe-already-entitled`) with "Manage billing" when a Stripe customer exists, and "Go to home" (UI-37);
  - `lapsed` shows the plans with a note that completed Rewinds stay readable (FR-51);
  - otherwise the h1 is "Join {serverName}", with "You're signed in as {name}, but you aren't on the server yet."
- New `components/subscribe/plan-card.tsx`, used by `plan-list.tsx`:
  - `productName`, the price through `formatMoney` in `text-h1` tabular figures, and "per month" or "per year" from `interval`;
  - up to three benefit lines with `check` icons, from a new `features: string[]` on `OfferedPrice` in `lib/stripe/prices.ts`, read from the Stripe product's `marketing_features`;
  - one primary per page, on the price with `metadata.recommended === 'true'` or else the first plan, and the rest secondary (7.5);
  - price ids may stay in test ids, never in visible text.
- Checkout errors from `startCheckout`, including P4.10's `ALREADY_SUBSCRIBED`, render an inline Alert in the card as well as the toast (UI-10). `ALREADY_SUBSCRIBED` also calls `router.refresh()`, which shows the entitled screen.
- Unavailable: EmptyState `unavailable`, "Subscriptions aren't open right now", with the owner's Discord link when an invite code exists. Keep `subscribe-unavailable`, and drop "Return home", which loops for gated members.
- `app/subscribe/success/page.tsx`:
  - an anonymous visitor is redirected to `/`;
  - the h1 "You're in" replaces "Thanks for subscribing!" (UI-40);
  - the live checklist reads Payment confirmed, then "Sharing {n} libraries with your Plex account" or "Check your email to accept the invite". It is polled by TanStack Query every 3 s for up to 2 minutes, through a new `getSubscriptionProvisioning()` `memberAction` in `actions/subscription.ts` that returns status fields only;
  - a stub shows the member-since and renewal dates, and "Go to home" follows;
  - keep `subscribe-success-page`, `-accepted`, `-pending`, `-provisioning` and `-home-link`.
- Titles: "Join" and "You're in".

**Tests.**
- `app/subscribe/__tests__/page.test.tsx`: `full` gives the entitled screen, `none` the plans, `lapsed` the plans with the note, and no prices the unavailable state.
- `components/subscribe/__tests__/plan-card.test.tsx`: the name and price; the features; exactly one primary per list; no `price_` in `textContent`.
- `lib/stripe/__tests__/prices.test.ts`: `features` comes from `marketing_features`, capped at three.
- `app/subscribe/success/__tests__/page.test.tsx`: the anonymous redirect; the checklist updates as the mocked action changes; polling stops at 2 minutes (fake timers).
- `actions/__tests__/subscription.test.ts`: `getSubscriptionProvisioning` needs a session and reads only the caller's row.
- `stripe-subscription.spec.ts`:
  - a gated member sees exactly one primary plan button and no `price_` text;
  - an admin visiting `/subscribe` sees `subscribe-already-entitled`;
  - Sign out returns to `/`.
- The subscribe and success baselines are reviewed against `screens.html`.

**Integration.** P4.10's checkout guards back the entitled screen. P10.22's `/membership` is where Manage billing leads afterwards, and P11.11 extends the checklist to Jellyfin members.

**Demo.** As an entitled member, open `/subscribe`: "You already have access" with Manage billing. As a gated member: "Join Northfield Plex" with the Supporter plan at $5.00 per month and one primary button. After a test checkout, the success checklist ticks Payment confirmed, then Sharing.

**Done when.**
- [ ] Entitled members get the "You already have access" screen.
- [ ] The plan cards show names, prices and benefits, never raw ids, with one primary action.
- [ ] Sign out is always present, and checkout errors render inline.
- [ ] The success page polls a live checklist, and the tests pass.
