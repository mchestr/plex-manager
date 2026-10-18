# Code Duplication and Dead Code

Generated 2026-10-17 · 1 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

## Executive summary

- **Unreachable code is a bigger problem than copy-paste.** jscpd measures a moderate 4.43% line duplication (187 clones, 3,808 lines). `knip --production`, checked by grepping importers, finds 26 files (3,107 LOC) and 4 API routes (191 LOC) that the shipped app never reaches. About 6,400 LOC of Jest tests keep them alive. Another ~1,150 LOC of exported functions in live modules are dead. Most of this is left over from the removed library-maintenance feature (DUP-12, DUP-13). Roughly 8,000-8,500 production LOC (~12%) plus ~6,400 test LOC can be removed or consolidated.
- **One duplicated lookup leaks PII (DUP-01).** When Tautulli has no matching user, the error string lists every Tautulli user's username and email. That string is saved to `PlexWrapped.error`, rendered on the requester's `/wrapped` page and shown in a toast. The trigger is narrow, but the fix is an S-sized change.
- **The Rewind statistics pipeline exists twice, and the copies have drifted (DUP-02).** The admin playground route copies the production stats collection but drops `derived` and `percentile`, so playground previews skip the v2 streaks/patterns and percentile slides. Extract one `collectWrappedStatistics()` before adding any 2026 stats.
- **No shared HTTP client for external services (DUP-03).** There are three separate Tautulli HTTP layers. None of the 13 Tautulli data fetches has an app-level timeout, no response is checked with Zod, and the test-mode bypass is copied 11 times. The Rewind depends on this layer, so consolidate it first.
- **The WrappedData contract is declared three times and never validated (DUP-10).** It is parsed with `JSON.parse` and a type cast at 12 sites, and `WrappedSectionData` ends in a `Record<string, unknown>` catch-all that forces casts in 14 section components. For Rewind 2026, add a version-discriminated schema and extend the cinematic renderer. Don't build a third parallel section set (DUP-08).
- **Two hand-written OpenAI clients have conflicting model-capability checks (DUP-04).** `o4` is missing from `requiresMaxCompletionTokens`, and the form's default temperature (0.7/0.8) breaks GPT-5 and o-series models. Both get in the way of the owner's request to try newer models for the Rewind.
- **Duplication has already caused a data bug (DUP-05).** Setup-wizard saves copy the admin server-update logic but skip the step that deactivates the old row. Going Back and re-saving leaves two active configs, and `findFirst` without `orderBy` may pick the stale one.
- **The UI refresh depends on adopting primitives first (DUP-14).** `Card` has 3 importers against 108-115 hand-copied panel literals. `LoadingSpinner` has 3 importers against 32-34 inline spinners. `lucide-react` is used in 1 file against 243 inline `<svg>`. Without consolidation, restyling means editing dozens of literals.
- **Server actions repeat auth/try-catch boilerplate about 130 times (DUP-06).** They use three result shapes, and the admin guard throws errors that production Next.js strips. As a result, a non-admin visiting `/admin` in production sees a generic error page, not the Unauthorized view.
- **Tooling gaps let these issues build up (DUP-15).** `eslint-config-next` is installed but not wired into the flat config, so `react-hooks` and `@next/next` rules never run. `@next-auth/prisma-adapter` is unused, `autoprefixer` is redundant under Tailwind 4, and `zlib-sync` forces a native toolchain into the Docker build.

## Severity summary

Counts cover non-refuted findings only. No finding was refuted in full; refuted sub-claims are listed in the appendix. Four findings were proposed at high and downgraded to medium by the verifier: DUP-01, DUP-02, DUP-03 and DUP-12.

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 12 | DUP-01 to DUP-07, DUP-10, DUP-12 to DUP-15 |
| Low | 4 | DUP-08, DUP-09, DUP-11, DUP-16 |
| Info | 0 | - |
| **Total** | **16** | |

## Findings

### Security

#### DUP-01 Duplicated Tautulli user lookup puts every user's username and email into an error string shown to the end user

- **Severity:** Medium (proposed High, downgraded on verification)
- **Status:** adjusted
- **Where:**
  - `lib/wrapped/tautulli-user-statistics.ts:105-111` (builds the string)
  - `actions/wrapped-generation.ts:188` (throws it), `:348` and `:381` (saves it to `PlexWrapped.error`), `:392` (returns it)
  - `app/(app)/wrapped/page.tsx:75-76` (renders it)
  - `components/dashboard/wrapped-card.tsx:141` (toasts it)
- **Evidence:**
  ```ts
  // lib/wrapped/tautulli-user-statistics.ts:105-111
  const availableUsers = users.map((u: TautulliUser) =>
    `${u.username || u.friendly_name || "Unknown"} (${u.email || "no email"})`
  ).join(", ")
  return {
    success: false,
    error: `User not found in Tautulli. Plex User ID: ${plexUserId}, Email: ${userEmail || "none"}. Available users: ${availableUsers || "none"}`
  }
  ```
  ```ts
  // actions/wrapped-generation.ts:188 and :348
  throw new Error(tautulliStats.error || "Failed to fetch Tautulli statistics")
  error: error instanceof Error ? error.message : "Failed to generate wrapped",
  ```
  ```tsx
  // app/(app)/wrapped/page.tsx:75-76
  {wrapped.error && (
    <p className="text-red-300 mb-4">{wrapped.error}</p>
  ```
- **Impact:** Non-admins can start generation of their own Wrapped (`actions/wrapped-generation.ts:118-122`). If Tautulli's user list doesn't include the requester at all, for example before Tautulli refreshes its users, the requester sees every server member's username and email on `/wrapped` and in a dashboard toast. The string is also stored in the database. The trigger is narrow:
  - Jellyfin-auth users fail earlier at `:173` ("User does not have a Plex user ID").
  - The fallback at `tautulli-user-statistics.ts:95-101` matches on Tautulli `user_id`, which is the plex.tv account id.
  - The eligibility gate (`wrapped-card.tsx:46-51`, `MIN_MEMBERSHIP_MONTHS`) narrows it further.

  This is one instance of a wider pattern that passes raw `error.message` through: `error instanceof Error ? error.message` appears 82 times in 36 non-test files (verifier count; the auditor counted 67 in 30).
- **Recommendation:** Log the Tautulli user list on the server only (`logger.debug`). Return a fixed message such as "We couldn't match your account in Tautulli; ask the admin to link it." and save that same text to `PlexWrapped.error`. As part of DUP-06, route action errors through `lib/security/error-handler` `createSafeError`, and keep raw messages for logs and admin-only views.
- **Effort:** S

### Duplication

#### DUP-02 Wrapped statistics pipeline copied into the playground route and already drifted (missing derived and percentile data that v2 needs)

- **Severity:** Medium (proposed High, downgraded on verification)
- **Status:** adjusted
- **Where:**
  - `actions/wrapped-generation.ts:177-299` (production pipeline; `:281`, `:293`, `:298`)
  - `app/api/admin/playground/statistics/route.ts:79-206` (copy; `:86`, statistics object at `:192-204`)
  - Downstream: `lib/wrapped/assemble-wrapped.ts:143` (streaks-patterns), `:163` (percentile), `lib/wrapped/prompt-template.ts:67-79`
- **Evidence:** jscpd clone pairs `route.ts:106-133` / `wrapped-generation.ts:195-222`, `route.ts:173-191` / `262-280`, `route.ts:192-204` / `281-293`. Both files run the same sequence: `fetchTautulliStatistics`, then `prisma.plexServer.findFirst({ where: { isActive: true } })`, `fetchPlexServerStatistics`, `prisma.overseerr.findFirst`, `fetchOverseerrStatistics`, `fetchTopContentLeaderboards` + `fetchWatchTimeLeaderboard`, and the userIndex/leaderboards assembly. Only production has the tail:
  ```ts
  // actions/wrapped-generation.ts:293-300
  derived: tautulliStatsData.derived,
  ...
  ...(leaderboards?.watchTime.userPosition && {
    percentile: computePercentile(
  ```
  The playground's `const statistics: WrappedStatistics = {...}` (`route.ts:192-204`) has neither field.
- **Impact:** `assemble-wrapped.ts` skips the streaks-patterns and percentile sections when those fields are missing, and `prompt-template.ts:67-79` renders "unknown"/"none" for the derived placeholders. The playground exists to preview and tune the Rewind, but its previews don't match production. Every new Rewind 2026 stat has to be added in two places. Only an admin preview tool is affected, which is why the verifier set this to medium.
- **Recommendation:** Extract `collectWrappedStatistics({ user, year })` into `lib/wrapped/collect-statistics.ts`, covering config lookups, parallel fetches, `derived` and `percentile`. Call it from both `generatePlexWrapped` and the playground route. Add a test that both produce the same keys. Do this before adding Rewind 2026 statistics.
- **Effort:** S

#### DUP-03 No shared HTTP client for external services: three Tautulli layers, timeout-less fetches, unvalidated responses, copied connection tests and test-mode bypasses

- **Severity:** Medium (proposed High, downgraded on verification)
- **Status:** adjusted
- **Where:**
  - Tautulli layer 1: `lib/connections/tautulli.ts:50` (13 data fetches, `:54-273`)
  - Tautulli layer 2: `lib/wrapped/tautulli-user-statistics.ts:43`, `lib/wrapped/tautulli-leaderboards.ts:44`, `:124`, `lib/wrapped/tautulli-library.ts:33`
  - Tautulli layer 3: `actions/user-queries.ts:539`, `:552-590` (`getUserFirstWatchDate`)
  - `lib/connections/arr-client.ts:26`, `:34` (`arrGet`, no timeout)
  - testConnection copies: `lib/connections/sonarr.ts:6`, `radarr.ts:6`, `tautulli.ts:5`, `overseerr.ts:7-8`, `prometheus.ts:15-16`, `plex-connection.ts:10-11`, `jellyfin-connection.ts:14-15`, `openai.ts:18`
  - `lib/connections/plex-user-info.ts:30` (bypass with no production backstop)
  - `lib/validations/tautulli.ts:24-137` (interfaces only, no Zod)
- **Evidence:** `lib/connections/tautulli.ts` has 14 hand-copied `api/v2?apikey=` blocks of this shape (jscpd: `:56-64` repeated 8x):
  ```ts
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_activity`
  const response = await fetch(url)
  if (!response.ok) { ... }
  ... catch (error) { if (error instanceof Error) return { success: false, error: `Connection error: ...` }
  ```
  Only `testTautulliConnection` (`:15`) uses `fetchWithTimeout`. `lib/wrapped/tautulli-*.ts` build their own `${baseUrl}?apikey=${apiKey}&cmd=...` URLs with raw `fetch`, and so do `server-statistics.ts` and `overseerr-statistics.ts`. `actions/user-queries.ts:552-590` copies the `get_users` lookup but omits the `usersData.response?.result === "error"` check (`tautulli-user-statistics.ts:63`). jscpd also pairs `radarr.ts:6-29` with `sonarr.ts:6-29`, and `tautulli.ts:36-47` matches 5 other files. The `// TEST MODE BYPASS ... process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'` block appears 11 times in `lib/connections`. `lib/validations/tautulli.ts:24-137` declares only TS interfaces (`TautulliHistoryItem`, `TautulliUser`, ...), with fields such as `plays?: string | number` and `total_duration?: number | string`. This breaks the CLAUDE.md rule "Don't skip Zod validation on ... external API responses".
- **Impact:** The Rewind depends entirely on Tautulli data. Fixes to user matching, pagination, error handling or timeouts have to be made in three places. Node's undici defaults to 300 s header and body timeouts, so a hung Tautulli request stalls generation for minutes. Unvalidated JSON pushes type ambiguity into the statistics. `plex-user-info.ts:30` has no production backstop: with `SKIP_CONNECTION_TESTS=true` in production, `getPlexUserInfo` (used at `lib/auth.ts:120`) returns a mock user. `checkUserServerAccess` still gates login. The divergence in user matching is minor, because the extra fallback at `tautulli-user-statistics.ts:86-91` compares username/friendly_name against the user's email.
- **Recommendation:**
  - Add one service HTTP helper that wraps `fetchWithTimeout`, runs Zod `safeParse` and returns `ConnectionResult<T>`.
  - Build `tautulliCommand(cmd, params, schema)` and a single `resolveTautulliUser()` on top of it.
  - Move `lib/connections/tautulli.ts`, `lib/wrapped/tautulli-*.ts` and `actions/user-queries.ts` onto these helpers.
  - Convert the `lib/validations/tautulli.ts` interfaces to Zod schemas.
  - Replace the 11 bypass copies with one `isConnectionTestBypassed()` that always returns false in production.
  - Give `arrGet` the same timeout.
- **Effort:** M

#### DUP-04 Two hand-written OpenAI chat clients with copy-pasted, disagreeing model-capability checks

- **Severity:** Medium
- **Status:** confirmed
- **Where:**
  - `lib/llm/chat.ts:61-69`, `:121`
  - `lib/wrapped/api-calls.ts:49-57`, `:63-72`, `:147`
  - `lib/connections/openai.ts:17`, `:64`, `:107`
  - `lib/connections/llm-provider.ts:4-5`
  - `lib/wrapped/llm.ts:97`, `prisma/schema.prisma:161`
  - `components/admin/settings/LLMProviderForm.tsx:35`, `:251`
- **Evidence:**
  ```ts
  // lib/llm/chat.ts:61-68 (identical copy at lib/wrapped/api-calls.ts:49-57)
  function requiresMaxCompletionTokens(model: string): boolean {
    const modelLower = model.toLowerCase()
    return (
      modelLower.startsWith("gpt-5") ||
      modelLower.startsWith("o1") ||
      modelLower.startsWith("o3")
    )
  }
  ```
  The adjacent `supportsStructuredOutputs` (`api-calls.ts:63-72`) also lists `o4`. Both clients POST to `https://api.openai.com/v1/chat/completions` with copied request building and error parsing (jscpd `chat.ts:131-148` / `api-calls.ts:161-178`). They use different timeout mechanisms (AbortController vs `fetchWithTimeout`). `openai.ts` duplicates the `/v1/models` request in `testOpenAIConnection` (`:17`) and `fetchOpenAIModels` (`:64`) (jscpd `:21-46` / `:72-97`). The provider switch is OpenAI-only (`llm-provider.ts:5`, `if (config.provider === "openai")`).
  ```tsx
  // components/admin/settings/LLMProviderForm.tsx:35 and :251
  temperature: provider?.temperature ?? (purpose === "chat" ? 0.7 : 0.8),
  Note: GPT-5 models only support temperature 1 (default)
  ```
- **Impact:**
  - An `o4-*` model can only be entered as a custom model, because `fetchOpenAIModels` filters to `id.startsWith("gpt-")` (`openai.ts:107`). With the admin-configurable `maxTokens` set (`schema.prisma:161`, passed at `lib/wrapped/llm.ts:97`), such a model is sent `max_tokens`, which OpenAI reasoning models reject.
  - The verifier found a related problem: both clients send `temperature` whenever it is set, and the form defaults it to 0.7/0.8. Picking a GPT-5 or o-series model with default form values breaks generation unless the admin sets temperature to 1.
  - Trying newer models for Rewind 2026, as the owner asked, means editing hard-coded prefix lists in several files. A model can work in chat and fail in Wrapped generation, or the reverse.
- **Recommendation:**
  - Create one `lib/llm/client.ts` exposing `complete({ messages, tools?, responseSchema?, maxTokens?, model })`.
  - Back it with a single model-capabilities registry that owns the token parameter name, structured-output support and temperature constraints.
  - Prefer the official `openai` SDK or a provider-agnostic SDK, so swapping model or provider becomes a configuration change.
  - Have `lib/llm/chat.ts`, `lib/wrapped/api-calls.ts` and `lib/connections/openai.ts` delegate to the new client.
  - Estimated ~120 LOC removed.
- **Effort:** M

#### DUP-05 Setup-wizard saves duplicate the admin server-update logic but never deactivate old rows, so Back + re-save leaves two active configs

- **Severity:** Medium
- **Status:** confirmed
- **Where:**
  - `actions/setup.ts:88` (Plex), `:144` (Tautulli), `:199` (Overseerr), `:254` (Sonarr), `:309` (Radarr), `:509` (Prometheus); compare `:438` (LLM provider, correct)
  - `actions/admin/admin-servers.ts:104`, `:155`, `:179`, `:252`, `:325`, `:398`, `:475`, `:556`
  - `components/setup/setup-wizard/setup-wizard.tsx:67-71`
  - `components/setup/setup-wizard/tautulli-form.tsx:93`, `sonarr-form.tsx:93`, `radarr-form.tsx:93`, `overseerr-form.tsx:93`, `plex-server-form.tsx:94`
  - `components/admin/settings/ServerForm.tsx:11`
  - `prisma/schema.prisma:90-101`
- **Evidence:**
  ```ts
  // actions/setup.ts:143-150 (same pattern for Plex, Overseerr, Sonarr, Radarr, Prometheus)
  // Create Tautulli configuration
  await tx.tautulli.create({
    data: { name: validated.name, url: validated.url, apiKey: validated.apiKey,
            publicUrl: validated.publicUrl, isActive: true,
  ```
  `saveLLMProvider` (`:438`) and every admin `update*` action first run `tx.<model>.updateMany({ where: { isActive: true }, data: { isActive: false } })`. That makes 7 admin copies of a ~70-line upsert block (jscpd `admin-servers.ts:203-221` repeated 3x) and 6 setup copies (jscpd `setup.ts:144-161` repeated 3x, `:119-132` repeated 4x). The wizard lets the admin go back (`setup-wizard.tsx:67-68`, `if (currentStep > 1) { setCurrentStep(currentStep - 1)`), and each step's form calls its save action again. The Tautulli model has no uniqueness constraint on `isActive`, and readers use `findFirst({ where: { isActive: true } })` with no `orderBy` at 48 call sites. On the UI side, the sonarr/radarr/overseerr/tautulli forms are 218-line near-copies (jscpd clones 1-4, 122 lines each). Sonarr and radarr differ in only 46 diff lines. Admin already has a generic `ServerForm` with `type: "plex" | "jellyfin" | "tautulli" | ...` (`ServerForm.tsx:11`).
- **Impact:** An admin who enters a wrong URL, goes Back and corrects it ends up with two active rows. Which one `findFirst` returns is undefined, and Postgres often returns the older, wrong row. Rewind generation and the Discord bot can then silently ignore the corrected config. A later admin edit deactivates the extras. Every service-config change needs about 4 edits: setup action, admin action, setup form and admin form.
- **Recommendation:**
  - Create `lib/services/service-config.ts` with `upsertActiveService(kind, data, tx)`, which deactivates, upserts by URL and activates.
  - Add a per-service descriptor table: Prisma delegate, Zod schema, connection tester, default port and labels.
  - Use both from `actions/setup.ts` and `actions/admin/admin-servers.ts`.
  - Replace the setup form files with one `ServiceConnectionForm` driven by the descriptor, sharing field components with the admin `ServerForm`.
  - Add `orderBy: { updatedAt: 'desc' }` to active lookups, or a partial unique index on `isActive`.
  - Estimated ~450 action LOC and ~650 form LOC removed.
- **Effort:** M

#### DUP-06 Server-action auth, try/catch and result-shape boilerplate repeated about 130 times with three result shapes and throw-based guards

- **Severity:** Medium
- **Status:** adjusted
- **Where:**
  - `lib/admin.ts:30-42`
  - `app/admin/layout.tsx:12`
  - `actions/discord-activity.ts:86`, `:227-236`
  - `actions/admin/queue.ts:48-63`, `:322-347`, `:364-389`
  - `actions/announcements.ts:74`, `actions/playground-wrapped.ts:44`, `actions/prompt-test.ts:39`, `actions/chatbot/index.ts:23`
  - `actions/admin/subscriptions.ts:19`
  - `app/error.tsx:14-36`, `app/admin/error.tsx:20-42`
  - `lib/security/rate-limit.ts:108`
- **Evidence:**
  ```ts
  // lib/admin.ts:30-39
  export async function requireAdmin() {
    const session = await getServerSession(authOptions)
    if (!session) {
      throw new UnauthenticatedError("UNAUTHENTICATED")
    }
    if (!session.user.isAdmin) {
      throw new UnauthorizedAdminError("UNAUTHORIZED")
  ```
  - This guard throws, which contradicts the CLAUDE.md rule "Return errors, don't throw in Server Actions". actions/ has about 88 `await requireAdmin` calls (105 references in total) and 131 `catch (error)` blocks.
  - In `discord-activity.ts` the guard is called outside `try` (`:86-87`). `getDiscordDashboardData` (`:227-236`) fans out to 5 exported wrappers that each call `requireAdmin` again, which means 6 session lookups per page load.
  - About 10 sites hand-roll `getServerSession(authOptions)` + `isAdmin` with different behaviour: `announcements.ts:74` silently returns `[]`, `playground-wrapped.ts:44` and `prompt-test.ts:39` return custom messages, and `chatbot/index.ts:23` returns 'Unauthorized'.
  - `queue.ts` repeats the same preamble (`requireAdmin`, `isRateLimited`, safeParse, `isRedisConfigured()`) 6 times. Its own `isRateLimited` (`:48-63`) copies `checkRateLimit` (`rate-limit.ts:108`).
  - Result shapes: `{ success: false, error }` (314 occurrences), `{ success: true } | { error: string }` (`AdminActionResult`, `subscriptions.ts:19`) and `ConnectionResult`, plus 23 inline `Promise<{ success: boolean; error?: string }>` declarations.
  - `app/error.tsx` and `app/admin/error.tsx` (a jscpd clone pair) string-match `error.message === "UNAUTHENTICATED"`.
- **Impact:** Auth semantics differ per action: a non-admin caller may get an error, an empty list or an exception. The throw comes from `app/admin/layout.tsx:12`, and a segment's `error.tsx` doesn't wrap its own layout, so the root `app/error.tsx` catches it. In production, Next.js strips Server Component error messages down to a digest, so a non-admin gets the generic ErrorState instead of the Unauthorized view. This is a UX defect, not an auth bypass: access is still denied. Every new action copies 15-30 lines of preamble, which makes auth regressions easy to introduce.
- **Recommendation:**
  - In `app/admin/layout.tsx`, check the session and `redirect()` or render `<UnauthorizedError/>` directly instead of throwing. Next's `forbidden()`/`unauthorized()` need `experimental.authInterrupts`.
  - Delete the string matching in both `error.tsx` files.
  - Add `adminAction`/`userAction` wrappers that return one `ActionResult<T>`, reuse `checkRateLimit` and map errors safely (see DUP-01).
  - Collapse the discord-activity wrappers into internal helpers that `getDiscordDashboardData` calls after a single auth check.
- **Effort:** L

#### DUP-07 Watchlist distributed lock is a 395-line module-global copy of DistributedLock, and its no-Redis fallback runs sync only once

- **Severity:** Medium
- **Status:** adjusted
- **Where:**
  - `lib/watchlist/lock.ts:65-171`, `:128`, `:293-297`, `:310`, `:333-345`
  - `lib/discord/lock/lease.ts:50-53`, `:84-153`
  - `lib/discord/lock.ts:56-140`
  - `lib/instrumentation/node.ts:101-104`, `:127-135`, `:177`, `:196-205`
  - `README.md:274`
- **Evidence:** `acquireWatchlistSyncLock` (`lib/watchlist/lock.ts:65-171`) repeats the `DistributedLock.acquire` transaction (`lease.ts:84-153`) almost line for line: delete expired rows, `findUnique`, then create/update when the lock is expired or owned. It keeps module-global `lockState`, a renewal `setInterval` (`:128`) and a separate polling `setInterval` (`:310`). The `lib/discord/lock.ts` facade (142 LOC) exports acquire/release/has/WithRetry/start/stop (`:56-140`), and none of them has a caller. `lib/instrumentation/node.ts` imports only `isDiscordBotEnabled` from it and uses `DistributedLock`/`BotLockPoller` directly. The poll tick returns early once sync is initialised:
  ```ts
  // lib/watchlist/lock.ts:333-345
  if (pollingState.syncInitialized) {
    const stillHoldsLock = hasWatchlistSyncLock()
    if (!stillHoldsLock) { ... return }
    // Lock renewal is handled by the renewal interval in acquireWatchlistSyncLock
    return
  }
  ```
- **Impact:**
  - Lock fixes have to be made twice.
  - The auditor's "divergent held flag" race doesn't apply here, because both timers share one `lockState`. The poller can notice a lost lease up to one poll interval (60 s) late.
  - The bigger defect the verifier found: `onLockAcquired` (`node.ts:127-135`) runs `syncAllEnabledUsers()` once. On the no-Redis fallback, watchlist sync therefore runs once per lock acquisition (in practice once per process start) and never again on the configured interval. README.md:274 documents this fallback as supported ("Without it, background jobs fall back to PostgreSQL polling").
  - `startWatchlistSyncPolling` also sets `isPolling=true` and then returns when sync is disabled (`:293-297`), so polling can never start later in that process.
- **Recommendation:**
  - Generalise `DistributedLock` and `BotLockPoller` into `lib/locks/`: inject the Prisma lock delegate and lock id, and make the Discord-only `getConfigVersion` bounce optional.
  - Rebuild the watchlist fallback on them, with a tick that re-runs `syncAllEnabledUsers` every interval while the lock is held.
  - Move `isWatchlistSyncEnabled`/`getWatchlistSyncInterval` to a config module.
  - Delete the rest of `lib/watchlist/lock.ts` and the dead `lib/discord/lock.ts` facade functions (also listed in DUP-13).
  - Drop the no-Redis fallback only together with making `REDIS_URL` required for watchlist sync and updating README.md:274 and `example.env`.
- **Effort:** M

#### DUP-08 Legacy v1 "classic" wrapped section set and chart stack are kept only for stored pre-2026 records

- **Severity:** Low
- **Status:** adjusted
- **Where:**
  - `components/wrapped/wrapped-sections/index.tsx:38-42`, `:44-98`
  - `lib/wrapped/assemble-wrapped.ts:30`, `:226`
  - `components/wrapped/wrapped-charts.tsx:17`
  - `components/wrapped/wrapped-sections/cinematic/index.tsx`
  - `types/wrapped.ts:221`, `:233`
  - `app/(app)/wrapped/page.tsx:19-20`
- **Evidence:**
  ```tsx
  // components/wrapped/wrapped-sections/index.tsx:38-42
  if (wrappedData.version === 2) {
    return <CinematicSectionRenderer section={section} wrappedData={wrappedData} shareToken={shareToken} />
  }
  return <LegacySectionRenderer section={section} wrappedData={wrappedData} sectionIndex={sectionIndex} />
  ```
  New generation always writes v2 (`assemble-wrapped.ts:30`, `export const WRAPPED_DATA_VERSION = 2`), and `types/wrapped.ts:221` notes `undefined = v1 (pre-2026 revamp)`. The classic set comprises fun-facts, hero, insights, movies/shows-breakdown, overseerr-stats, server-stats, top-movies/shows, total-watch-time, section-header and utils (about 1,067 LOC). It is the only consumer of `wrapped-charts.tsx` (464 LOC, `ChartJS.register(...)` at `:17`), and the only consumer of `react-countup` outside `cinematic/gold-count-up.tsx`. Everything is statically imported, so chart.js and react-chartjs-2 ship in the wrapped viewer bundle. The cinematic set duplicates the section catalogue (the same 10 types plus 5 v2-only ones) under different names.
- **Impact:** The legacy chart stack ships to every viewer of a new Rewind. Rewind 2026 risks adding a third parallel set (v3) instead of evolving one. Per the verifier, the legacy set is frozen v1 compatibility code that doesn't need to track `WrappedSectionType`. It only renders for old share links and admin history views, because `/wrapped` loads only the current year (`page.tsx:19-20`). Keeping read-only rendering of historical records is a deliberate choice. `adaptV1ToV2` can't recreate v2-only sections or narratives because v1 lacks `derived` and archetype data.
- **Recommendation:** Load `LegacySectionRenderer` with `next/dynamic`, so chart.js and the v1 sections leave the v2 bundle (S on its own). For Rewind 2026, evolve the cinematic renderer behind a version switch instead of adding a third section set. Delete the legacy set only if the owner accepts that old-year share links render in a reduced form.
- **Effort:** M (code-splitting alone is S)

#### DUP-09 Formatter sprawl: two byte formatters, 9 local formatDate copies, divergent watch-time rounding across Rewind surfaces

- **Severity:** Low
- **Status:** confirmed
- **Where:**
  - `lib/utils/formatters.ts:51`, `lib/utils/time-formatting.ts:18`, `:72`
  - `components/wrapped/wrapped-sections/utils.ts:1-2`, `lib/wrapped/statistics.ts:41-42` (compat shims)
  - Local `formatDate`: `app/admin/users/[userId]/page.tsx:24`, `app/admin/llm-usage/[usageId]/page.tsx:17`, `app/admin/prompts/[promptId]/page.tsx:22`, `app/admin/prompts/page.tsx:10`, `history/[llmUsageId]/page.tsx:81`, `components/admin/wrapped/historical-wrapped-selector-header.tsx:89`, `historical-versions-inline.tsx:113`, `components/watchlist/sync-history-table.tsx:79`
  - `components/dashboard/announcements-card.tsx:114`
  - `actions/chatbot/executors/plex-sanitizer.ts:188`, `lib/discord/commands/watching.ts:182`
  - `components/admin/playground/statistics-viewer.tsx:55`, `components/wrapped/wrapped-sections/cinematic/total-watch-time-section.tsx:29`, `lib/wrapped/assemble-wrapped.ts:53`, `:87`
- **Evidence:**
  - `formatFileSize` (`formatters.ts:51`, '0 B', units up to TB) duplicates `formatBytes` (`time-formatting.ts:72`, '0 Bytes', units up to PB). `formatFileSize`, `getMediaTypeLabel` and `formatDate` in `formatters.ts` have only test importers; the only live export is `toEndOfDayExclusive`.
  - 9 files define a local `const formatDate = (date) => new Date(date).toLocaleString(...)`. They mix `"en-US"` and `undefined` locales, short and long months, and with/without seconds.
  - `formatCost` (`` `$${cost.toFixed(4)}` ``) is copied twice (`historical-wrapped-selector-header.tsx:98`, `historical-wrapped-selector.tsx:117`).
  - `announcements-card.tsx:114` `formatRelativeDate` re-implements `formatRelativeTime`.
  - `formatResolution` is copied at `plex-sanitizer.ts:188` and `watching.ts:182`.
  - Hours rounding differs: the playground uses `Math.round(.../60)h` (`statistics-viewer.tsx:55`), while the cinematic slide and `assemble-wrapped.ts` use `Math.floor(.../60)`.
- **Impact:** Admins see the same stat rounded differently in the playground and in the final Rewind, and dates are formatted inconsistently across admin pages. The re-export shims are labelled "backward compatibility", which goes against the CLAUDE.md "no backwards-compatibility hacks" rule.
- **Recommendation:** Create one `lib/utils/format.ts` covering duration (`formatWatchTime`, `formatHours` with an explicit rounding policy), bytes, date/dateTime/relative (Intl with the app locale), currency/cost and resolution. Delete the duplicates in `formatters.ts`, the local `formatDate` copies and the shims. Estimated ~150 LOC removed.
- **Effort:** S

### Types and validation

#### DUP-10 WrappedData has no runtime schema: 12 unchecked JSON.parse sites and types declared three times

- **Severity:** Medium
- **Status:** adjusted
- **Where:**
  - Type copies: `types/wrapped.ts:10-85`, `:151-167`, `:174`, `:221`; `lib/wrapped/statistics-types.ts:22`, `:92`; `lib/wrapped/tautulli-leaderboards.ts:236-273`
  - Parse sites: `app/(app)/wrapped/page.tsx:27`, `app/admin/users/[userId]/wrapped/page.tsx:98`, `app/api/wrapped/poster/[ratingKey]/route.ts:36`, `app/api/wrapped/share/[token]/route.ts:74`, `app/api/wrapped/og-image/route.tsx:74`, `actions/admin/admin-llm-history.ts:36`, `:74`, `:190`, `components/admin/prompts/prompt-template-editor.tsx:249`, plus two dead viewers (DUP-12)
  - Section casts: e.g. `components/wrapped/wrapped-sections/cinematic/monthly-journey-section.tsx:15-19` (14 files)
  - `prisma/schema.prisma:176` (`PlexWrapped.data` is a String column)
- **Evidence:** `JSON.parse(wrapped.data)` with a type annotation or cast (`as WrappedData` at the poster route `:36`) and no validation. `types/wrapped.ts:10-85` restates inline the shapes that `statistics-types.ts` already names: `TopMedia`, `TopShow`, `LeaderboardEntry`, `WatchTimeLeaderboardEntry`, `ContentLeaderboard`, `ShowContentLeaderboard`. `tautulli-leaderboards.ts:236-273` restates them a third time in its return type (jscpd clone with `types/wrapped.ts:43-72`). `MovieData`/`ShowData` (`types/wrapped.ts:151-167`) duplicate `TopMedia`/`TopShow`. `WrappedSectionData` ends in `| Record<string, unknown>`, so section components resort to:
  ```ts
  (section.data && "x" in section.data ? section.data.x : []) as MonthEntry[]
  ```
  The only discriminator is `version?: number` (`types/wrapped.ts:221`).
- **Impact:** Adding Rewind 2026 sections means editing three type copies plus the cast sites, and the compiler can't check section data. Runtime failures are less likely than the auditor claimed. Every parse site is guarded: the user and admin pages use try/catch, the poster route catches and returns false (`:35-44`), and the share and og-image routes sit inside try blocks that return handled 404/500 responses. og-image also reads fields defensively (`stats.totalWatchTime?.total || 0`). The JSON is written only by the app (`assemble-wrapped.ts`). Following CLAUDE.md's "validate at boundaries", the missing schema is debt rather than a live defect, but it matters before a v3 Rewind format lands.
- **Recommendation:** Make `lib/wrapped/statistics-types.ts`, or a new Zod schema module, the single source. Derive `WrappedStatistics` and a discriminated union of section data keyed by `type` from it. Delete the inline copies in `types/wrapped.ts` and the `tautulli-leaderboards` return type. Add one `parseWrappedData(raw)` helper with a version switch for the Rewind 2026 format. Migrating `PlexWrapped.data` to `Json` and `status` to an enum is optional.
- **Effort:** M

#### DUP-11 Zod schema and type duplication: per-service schemas differ only by port, duplicate year validators, unused shared schemas, repeated config types

- **Severity:** Low
- **Status:** adjusted
- **Where:**
  - `lib/validations/sonarr.ts:5`, `:16`; `radarr.ts:5`, `:16`; `tautulli.ts:5`; `overseerr.ts`
  - `lib/validations/shared-schemas.ts:30`, `:36`
  - `lib/security/api-helpers.ts:84`
  - `actions/setup.ts:551-553`
  - `actions/announcements.ts:118`, `:188`
  - `types/admin.ts:3`, `lib/utils.ts:137-154`
  - `lib/wrapped/statistics-types.ts:7`, `:17`; `lib/connections/arr-client.ts:13`
- **Evidence:**
  - With names normalised, the sonarr/radarr/tautulli/overseerr schemas differ only in `createServerUrlSchema("8989"|"7878"|"8181"|"5055")` and, for Overseerr, the publicUrl example.
  - `sonarrServerListSchema`/`radarrServerListSchema` are unused; their only consumers were the dead API routes.
  - `apiKeySchema = z.string().min(10).max(500)` (`shared-schemas.ts:36`) is unused, while `setup.ts:553` re-declares the same rule inline.
  - Year bounds differ: `yearSchema ... min(2010).max(2100)` (`shared-schemas.ts:30`, used at `wrapped-generation.ts:28`, `:410`) vs `validateYear` `parsed < 2000 || parsed > 2100` (`api-helpers.ts:84`). `validateYear` is used once, in a dead route, and silently falls back to the current year.
  - `createAnnouncementSchema` (`:118`) and `updateAnnouncementSchema` (`:188`) repeat 5 fields.
  - `LlmUsageStats` (`types/admin.ts:3`) mirrors the inline return type of `aggregateLlmUsage` field for field.
  - Parallel `{url, apiKey}` config types: `TautulliConfig`/`OverseerrConfig`, `ArrConfig` and the Zod `*Parsed` outputs.
- **Impact:** Every new service needs another copied schema file, and the year rules disagree between the API helper and the actions. The verifier narrowed the impact: `setup.ts:553` matches `apiKeySchema` exactly, so it is duplication, not drift. The *arr/Tautulli schemas use `apiKey: z.string().min(1)` for a different kind of key.
- **Recommendation:**
  - Add a `createServiceSchema({ defaultPort, publicExample })` factory and delete the unused ServerList schemas.
  - Use `apiKeySchema` in `setup.ts`.
  - Pick one year range. If `validateYear` becomes `yearSchema.safeParse`, keep its fall-back behaviour or change the route deliberately.
  - Build the announcement schemas from a shared base with no defaults: create = base plus defaults, update = base `.extend({ id })`. `updateAnnouncementSchema` intentionally omits `.default()` on `priority`/`isActive`, so a naive derivation from create would inject defaults into updates.
  - Make `aggregateLlmUsage` return `LlmUsageStats`, and collapse the parallel config interfaces into the `*Parsed` types.
- **Effort:** S

### Dead code

#### DUP-12 26 files (3,107 LOC) that the shipped app never imports, kept alive only by ~6,400 LOC of tests, plus 4 API routes nothing live calls

- **Severity:** Medium (proposed High, downgraded on verification)
- **Status:** adjusted
- **Where:** see the dead-file inventory under "Metrics and inventories" (26 files, 4 routes).
- **Evidence:** `npx knip --production` lists the files as unused. The verifier grepped each one for non-test importers, including dynamic imports and barrels.
  - `components/generator/wrapped-generator.tsx` is imported only by `components/__tests__/wrapped-generator.test.tsx`.
  - `components/admin/wrapped/historical-wrapped-selector.tsx` is imported only by `components/__tests__/historical-wrapped-selector.test.tsx`.
  - `components/admin/wrapped/wrapped-viewer.tsx` is imported only by `components/__tests__/admin-wrapped-viewer.test.tsx`.
  - `components/shared/admin-footer.tsx` is imported only by its test. `admin-footer-client.tsx` is the only non-test importer of `llm-toggle.tsx`; the live toggle is `LLMToggle.tsx` via `settings-edit-forms.tsx:14`.
  - The barrels `lib/security/index.ts` and `components/setup/setup-wizard/index.ts` have no importers.
  - `grep api/admin/radarr` matches only `__tests__/api/admin-radarr-route.test.ts`.
  - `/api/admin/wrapped/by-user` and `/api/admin/wrapped/[wrappedId]/user` are fetched only by the dead `historical-versions-inline.tsx:49`, `:92`.

  The live replacements are `components/dashboard/wrapped-card.tsx` (jscpd pair 12 with `wrapped-home-button.tsx`), `historical-wrapped-selector-header.tsx` (pair 13) and `components/wrapped/wrapped-viewer.tsx`.
- **Impact:** Three WrappedViewer variants and two history selectors are tested and look maintained, but only one of each ships. Contributors, and agents doing the UI refresh, may update the wrong copy. Tests spend time on unreachable code and inflate coverage. The dead routes still go through `requireAdminAPI` and `adminRateLimiter`, so their attack surface is minimal.
- **Recommendation:**
  - Delete the 26 files, their tests and the 4 routes in one PR.
  - Keep `components/generator/wrapped-generating-animation.tsx`. It is live (imported by `components/wrapped/wrapped-page-client.tsx:4`). Either keep `generator/` in the CLAUDE.md tree, or move the file to `components/wrapped/` and update the tree to match.
  - Add a `knip --production` CI check once `knip.json` is configured.
- **Effort:** S

#### DUP-13 ~1,150 LOC of dead exported functions in live modules, an orphaned Prisma model, and stale CLAUDE.md references from the removed maintenance feature

- **Severity:** Medium
- **Status:** adjusted
- **Where:**
  - `lib/connections/sonarr.ts:130`, `:168`, `:200`; `radarr.ts:118`, `:122`, `:155`; `tautulli.ts:85`, `:253`, `:270`; `overseerr.ts:124`, `:181`; `plex-sessions.ts:83-128`; `plex-connection.ts:96`; `plex-marking.ts:61`
  - `lib/wrapped/usage.ts:186`, `:240`
  - `actions/admin/queue.ts:175`, `:549`; `actions/admin/watchlist.ts:140`; `actions/admin/admin-servers.ts:607`
  - `lib/discord/lock.ts:56`
  - `lib/validations/user-media.ts:15`, `:41`, `:54`, `:56`
  - `prisma/schema.prisma:470`
  - `CLAUDE.md:335`, `:343`, `:354`
  - `lib/discord/commands/mark/__tests__/mark-command.test.ts:130`
- **Evidence:** Each declaration was measured with the TypeScript AST, and grep finds no non-test references to any of them. The full list is in the dead-export inventory below. Highlights:
  - Destructive helpers with no callers: `deleteSonarrSeries`, `bulkDeleteSonarrEpisodeFiles`, `deleteRadarrMovie`, `bulkDeleteRadarrMovies`.
  - `getTautulliUnwatchedMedia` and `batchGetOverseerrMediaStatus`.
  - `lib/wrapped/usage.ts` `getLLMUsageRecords`/`getCostSummary`: the pages import the `actions/admin/admin-llm-usage.ts` versions.
  - Four queue actions.
  - `model UserWatchIntent` (`schema.prisma:470`) has no `prisma.userWatchIntent` usage. It was created in `20251127045626_add_library_maintenance` and not dropped by `20251206172926_remove_maintenance_tables`.
  - `lib/maintenance/` no longer exists, but CLAUDE.md still points to `lib/maintenance/rule-evaluator.ts` and `lib/maintenance/__tests__/jsdoc-examples.test.ts`.
  - `mark-command.test.ts:130` `import type { InteractionContext } from "../registry"` is stale (should be `../../registry`; it is type-only, so it is erased at runtime).
- **Impact:** Destructive delete helpers with no callers invite accidental reuse and inflate the code agents read when planning. An unused table stays in the schema. CLAUDE.md sends readers and agents to files that don't exist.
- **Recommendation:**
  - Delete the listed functions, components and tests.
  - Drop `UserWatchIntent` and the `IntentType` enum in a migration, and delete the matching Zod schemas in `lib/validations/user-media.ts`.
  - Fix only the `mark-command.test.ts` type import. Keep the `bot-intents.test.ts` assertion, which checks that the module was removed.
  - Point CLAUDE.md's JSDoc reference at a module that exists.
  - Mark test-only exports `@internal` so knip ignores them.
  - The discord lock facade overlaps DUP-07, and the formatter exports overlap DUP-09.
- **Effort:** S

### UI duplication

#### DUP-14 UI primitives exist but are rarely adopted: 108-115 hand-copied panels, 32-34 inline spinners, 243 inline SVGs, duplicated filters, charts, modals and status panels

- **Severity:** Medium
- **Status:** confirmed
- **Where:**
  - `components/ui/card.tsx:21-26`, `components/ui/loading-spinner.tsx:8`, `components/ui/modal-shell.tsx`, `components/ui/date-range-picker.tsx`
  - `components/admin/cost-analysis/cost-date-filter.tsx:8`, `components/admin/discord/discord-date-filter.tsx:8`
  - `components/admin/cost-analysis/cost-model-chart.tsx:33`, `cost-user-chart.tsx:34`
  - `app/(app)/wrapped/page.tsx:24-115`, `app/admin/users/[userId]/wrapped/page.tsx:94-180`
  - `components/onboarding/onboarding-steps/welcome-step.tsx:11`, `jellyfin-welcome-step.tsx:11`
  - `components/admin/users/unshare-user-button.tsx:66-83`
  - `components/admin/playground/preview-modal.tsx`
  - `app/admin/users/page.tsx:22`
- **Evidence:** The adoption numbers are in the UI primitive adoption table under "Metrics and inventories".
  - `Card`'s JSDoc says it "Replaces the hand-copied `bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6` container", yet `Card` has 3 importers.
  - The spinner path `M4 12a8 8 0 018-8V0C5.373` is inlined 32-34 times (e.g. `unshare-user-button.tsx:66-83`).
  - There are 16 copies of the checkmark path `d="M5 13l4 4L19 7"`.
  - `preview-modal.tsx`, `user-actions-menu.tsx`, `historical-wrapped-selector-header.tsx` and `app/(app)/page.tsx` hand-roll `fixed inset-0` overlays instead of using `ModalShell`.
  - 15 files hand-roll `<table>`, and there is no DataTable.
  - 13 admin pages repeat `text-2xl sm:text-3xl font-bold text-white mb-2`, and there is no PageHeader.
  - `CostDateFilter` and `DiscordDateFilter` differ only in route, default range and a clear button (jscpd `:31-52` / `:37-61`).
  - `cost-model-chart.tsx` and `cost-user-chart.tsx` (both 137 lines) differ only in labels and colours, and 14 files each call `ChartJS.register`.
  - The wrapped status panels (parse error / failed / not found) are duplicated between the user and admin wrapped pages.
  - The Plex and Jellyfin onboarding steps are copies (73 and 68 lines), and the onboarding-wizard and setup-wizard shells share 37 lines.
- **Impact:** The requested "consistent, modern, clean" refresh can't be done by restyling primitives, because most surfaces bypass them. Every look-and-feel change has to be applied to dozens of literals, and icons and spinners already render inconsistently.
- **Recommendation:** Make `components/ui` the single source and migrate to it. Do this before the visual refresh.
  - `Card`, plus a `Panel` variant.
  - `Spinner`/`LoadingSpinner`.
  - An `Icon` built on `lucide-react`, deleting the inline SVGs.
  - `ModalShell` for all overlays.
  - `DataTable` plus `EmptyState`.
  - `PageHeader` for admin pages.
  - A URL-synced `DateRangeFilter`, with route and default range as props.
  - One chart module with a central `ChartJS.register` and BarChart/LineChart presets.
  - `components/wrapped/wrapped-status-panel.tsx`, with variants generating/failed/empty/error and a back-link prop.
  - Onboarding steps parameterised by auth service.

  Estimated ~1,200 LOC removed.
- **Effort:** L

### Dependencies

#### DUP-15 Unused, redundant and miswired dependencies: unwired eslint-config-next, unused prisma-adapter, redundant autoprefixer, and zlib-sync's native-toolchain cost

- **Severity:** Medium
- **Status:** adjusted
- **Where:**
  - `package.json:29-30`, `:33`
  - `lib/auth.ts:20`
  - `next.config.js:5`, `:76`
  - `Dockerfile:6-7`
  - `lib/discord/bot.ts:25-31`
  - `postcss.config.js:4`
  - `eslint.config.mjs:1-2`
  - `lib/utils/logger.ts:66`, `:254`
  - `lib/plex-auth.ts:5`
- **Evidence:**
  ```js
  // eslint.config.mjs:1-2 (no eslint-config-next import anywhere)
  import js from "@eslint/js";
  import tseslint from "typescript-eslint";
  ```
  ```js
  // postcss.config.js:2-5
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
  ```
  - `@next-auth/prisma-adapter` has no importer. `lib/auth.ts:20` even notes that `PrismaAdapter is not compatible with CredentialsProvider`.
  - `eslint-config-next` and `@eslint/eslintrc` are installed but unused.
  - `zlib-sync` is referenced in `next.config.js:5` and `:76` (externals), and `Dockerfile:6-7` installs `python3 make g++` "for native modules (zlib-sync, etc.)". The verifier showed that discord.js 14.25.1 auto-loads it (`node_modules/discord.js/src/client/websocket/WebSocketManager.js:24-26`, `try { zlib = require('zlib-sync') } catch {}`) and enables `CompressionMethod.ZlibStream` when it is present (`:160`). It is therefore in use, not dead. It is also the only dependency that ships `binding.gyp` without prebuilds; sharp and msgpackr-extract ship prebuilds.
  - `chalk` (`logger.ts:66`, inside a try/catch with a JSON fallback at `:254`) and `tsconfig-paths/register` (`register-discord-*` scripts, `package.json:29-30`) are not declared and resolve only transitively. `tsconfig-paths` comes in via `eslint-config-next` and `eslint-plugin-import`.
  - `qs` has one user (`lib/plex-auth.ts:5`), plus `@types/qs`.
  - Verified as in use, so keep: chart.js/react-chartjs-2, react-countup, dotenv, fast-xml-parser, react-markdown, `@prisma/client`.
- **Impact:**
  - The main debt is the lint gap: `react-hooks` (rules-of-hooks, exhaustive-deps), `@next/next` and `jsx-a11y` rules never run in a React 19 / Next 16 app.
  - Docker builds carry a native toolchain only for gateway compression, which saves little for a bot that only uses the Guilds and DirectMessages intents.
  - Scripts depend on transitive packages that may vanish when the lint setup changes.
- **Recommendation:**
  - Remove `@next-auth/prisma-adapter`, `autoprefixer` and `@eslint/eslintrc`.
  - Wire `eslint-config-next/core-web-vitals` and its TypeScript preset into the flat config, fix the react-hooks findings that surface, and drop the `react/no-unescaped-entities: off` override if the Next config covers it.
  - Make `zlib-sync` an explicit choice: keep it for compression, or remove it together with its `next.config.js` entries and the Dockerfile toolchain line.
  - Declare `tsconfig-paths` explicitly, and declare `chalk` or drop it.
  - Replace `qs` with `URLSearchParams`.
- **Effort:** S

### Structure

#### DUP-16 Barrel and re-export chains, backwards-compat shims, duplicate component names and needless dynamic imports blur the module structure

- **Severity:** Low
- **Status:** confirmed
- **Where:**
  - `actions/admin.ts:9`, `actions/admin/index.ts`, `actions/admin/admin-llm.ts:1`
  - `actions/users.ts:3`
  - `lib/connections/plex.ts`, `lib/connections/plex-users.ts:1`, `lib/wrapped/statistics.ts`, `lib/wrapped/tautulli-statistics.ts:1`
  - `actions/chatbot/tools.ts:2`, `components/admin/settings/settings-edit-forms.tsx:2`, `types/onboarding.ts:65-66`
  - `components/admin/settings/LLMToggle.tsx:13`, `components/admin/settings/llm-toggle.tsx:11`
  - `actions/admin/admin-servers.ts:75-78`, `:159-161`, `:232-234`
  - `lib/utils.ts:2`
- **Evidence:**
  - Three-level barrel: `actions/admin.ts:9` (`export * from "./admin/index"`), then `actions/admin/index.ts`, then `actions/admin/admin-llm.ts`, itself a "barrel file" re-exporting admin-llm-usage/-providers/-history.
  - More chains: `lib/connections/plex.ts` re-exports `plex-users.ts`, which re-exports `plex-user-info.ts` and `plex-user-access.ts`. `lib/wrapped/statistics.ts` re-exports `tautulli-statistics.ts`.
  - Barrels are bypassed inconsistently: `lib/connections/jellyfin.ts` has 1 importer, while `jellyfin-users` is imported directly.
  - Shims explicitly labelled backwards-compatible: `actions/chatbot/tools.ts:2` (still imported by `scrub.ts:48` and `lib/chatbot/assistant.ts:7`), `settings-edit-forms.tsx:2` (imported by `app/admin/settings/page.tsx:3`) and `types/onboarding.ts:65-66` `ONBOARDING_STEPS = PLEX_ONBOARDING_STEPS`. knip also reports `ALL_TOOLS`/`TOOLS` as a duplicate export.
  - Duplicate exported component names: `LLMToggle` (two files in one directory), `LLMProviderForm`, `DiscordIntegrationForm`, `WrappedViewer`. File names in `components/admin/settings` mix PascalCase and kebab-case.
  - actions/ has 53 `await import(` calls, 26 of them in `admin-servers.ts`, for example `const { overseerrSchema } = await import("@/lib/validations/overseerr")` and `const { revalidatePath } = await import("next/cache")`.
  - `lib/utils.ts:2` imports `randomBytes` from `crypto` next to the client-side `cn` helper, and 14 `'use client'` files import it.
- **Impact:** Import paths don't show where code lives. Same-named components lead to edits in the wrong file: the admin and setup `LLMProviderForm` duplicate model-loading logic over different transports (`/api/admin/models` vs the `fetchLLMModels` action). Node-only code sits in a module that client code imports. `getBaseUrl` reads only `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL`, so no secret leaks; the cost is module hygiene and bundle weight. Some lazy imports (queue/Redis, heavy connection modules) may be deliberate, but dynamic imports of Zod validators and `next/cache` are clearly needless.
- **Recommendation:**
  - Import modules directly, and delete the nested barrels (keep at most one public entry per domain), the shims and the alias exports.
  - Rename files to kebab-case, and give the setup and admin forms distinct names, or merge them per DUP-05.
  - Use static imports in server actions.
  - Split `lib/utils.ts` into a client-safe `lib/utils/cn.ts` and server-only helpers (share-token, base-url) marked with `import "server-only"`.
- **Effort:** S

## Strengths to preserve

- **Consolidation already works where it was done.** `lib/connections/arr-client.ts` (`arrGet`) absorbed the Sonarr/Radarr read boilerplate, `lib/connections/plex-config.ts` centralises the active-Plex lookup, and `components/ui/card.tsx` documents the panel it replaces. These are the templates for DUP-03 and DUP-14.
- **The Discord lock is well designed.** `lib/discord/lock/lease.ts` `DistributedLock` and `lib/discord/lock/poller.ts` `BotLockPoller` take an injectable Prisma client, clock and instanceId, and keep instance state instead of module globals. They are the right base for generalising the watchlist lock (DUP-07).
- **The v1/v2 dispatcher is clean.** It lives in `components/wrapped/wrapped-sections/index.tsx` and isolates legacy rendering. The cinematic sections are small (23-114 lines) and built from shared primitives (`SlideFrame`, `GoldCountUp`, `PosterImage`), which is a good base to evolve for Rewind 2026.
- **The target result type already exists.** `types/connection.ts` `ConnectionResult<T>` is a proper discriminated union and can be the return type of a unified HTTP client.
- **Duplication is concentrated.** Overall duplication is moderate (4.43% of lines), and the heavy clusters sit in a few places: setup-wizard forms, onboarding steps, admin charts and admin-servers/setup actions. Cleanup can be targeted.
- **Most live server actions follow the conventions.** They validate input with Zod and use Prisma transactions for multi-step writes.

## Metrics and inventories

### Scope and duplication rate

| Metric | Value |
|---|---|
| In-scope source files (app, actions, components, lib, hooks, types) | 475 |
| In-scope LOC | 70,247 |
| jscpd clones (min-tokens 60; tests and generated code ignored) | 187 |
| Duplicated lines | 3,808 (4.43%) |
| Duplicated tokens | 32,198 (4.84%) |
| Estimated removable or consolidatable production LOC | ~8,000-8,500 (~12%) |
| Estimated removable test LOC (dead-file tests) | ~6,400 |

jscpd by format:

| Format | Clones | Duplicated lines | Rate |
|---|---|---|---|
| tsx | 108 | 1,943 | 5.68% |
| typescript | 63 | 875 | 2.44% |
| "javascript" (JSX blocks inside .tsx; no hand-written .js in scope) | 16 | 990 | 6.25% |

jscpd's own source count (709 sources, 86,033 lines) double-counts .tsx because of the "javascript" bucket. The real scope is 475 files and 70,247 LOC.

### Top 20 clone pairs

| # | Lines | Pair |
|---|---|---|
| 1 | 122 | `components/setup/setup-wizard/sonarr-form.tsx:93-214` / `tautulli-form.tsx:93-214` |
| 2 | 122 | `radarr-form.tsx:93-214` / `tautulli-form.tsx:93-214` |
| 3 | 122 | `overseerr-form.tsx:93-214` / `tautulli-form.tsx:93-214` |
| 4 | 101 | `plex-server-form.tsx:94-194` / `tautulli-form.tsx:93-193` |
| 5 | 73 | `components/onboarding/onboarding-steps/jellyfin-welcome-step.tsx:15-87` / `welcome-step.tsx:15-87` |
| 6 | 68 | `jellyfin-configuration-step.tsx:16-83` / `plex-configuration-step.tsx:16-77` |
| 7 | 54 | `final-step.tsx:18-71` / `welcome-step.tsx:17-56` |
| 8 | 54 | `components/dashboard/wrapped-card.tsx:165-218` / `components/watchlist/sync-settings-card.tsx:118-195` |
| 9 | 52 | `wrapped-card.tsx:167-218` / `wrapped-card.tsx:31-172` (self) |
| 10 | 51 | `jellyfin-welcome-step.tsx:11-61` / `welcome-step.tsx:11-61` |
| 11 | 50 | `components/admin/cost-analysis/cost-model-chart.tsx:87-136` / `cost-user-chart.tsx:87-136` |
| 12 | 47 | `components/dashboard/wrapped-card.tsx:65-111` / `components/wrapped/wrapped-home-button.tsx:28-72` (dead copy) |
| 13 | 42 | `components/admin/wrapped/historical-wrapped-selector-header.tsx:24-65` / `historical-wrapped-selector.tsx:24-65` (dead copy) |
| 14 | 41 | `discord-support-step.tsx:17-57` / `plex-configuration-step.tsx:16-64` |
| 15 | 41 | `app/admin/llm-usage/[usageId]/page.tsx:59-99` / `app/admin/llm-usage/conversation/[conversationId]/page.tsx:116-156` |
| 16 | 40 | `app/invite/[code]/page.tsx:55-94` / `components/setup/setup-wizard/setup-wizard.tsx:130-147` |
| 17 | 39 | `components/wrapped/wrapped-sections/fun-facts-section.tsx:37-75` / `server-stats-section.tsx:17-50` |
| 18 | 37 | `media-request-step.tsx:17-53` / `plex-configuration-step.tsx:16-64` |
| 19 | 37 | `components/onboarding/onboarding-wizard.tsx:130-166` / `setup-wizard.tsx:121-175` |
| 20 | 35 | `components/admin/cost-analysis/cost-trend-chart.tsx:68-102` / `components/admin/discord/discord-trend-chart.tsx:94-128` |

Backend clones of note:

- `lib/wrapped/tautulli-leaderboards.ts:244-273` / `types/wrapped.ts:43-72` (30 lines; DUP-10)
- `app/api/admin/playground/statistics/route.ts:106-133`, `:173-191`, `:192-204` / `actions/wrapped-generation.ts:195-222`, `:262-280`, `:281-293` (DUP-02)
- `actions/admin/admin-servers.ts:203-221` repeated 3 more times; `actions/setup.ts:144-161` repeated 3 more times (DUP-05)
- `lib/connections/openai.ts:21-46` / `:72-97`; `lib/llm/chat.ts:131-148` / `lib/wrapped/api-calls.ts:161-178` (DUP-04)
- `lib/connections/tautulli.ts:56-64` repeated 8 times (DUP-03)

### knip results

| Mode | Result |
|---|---|
| Default (exit 2; prisma plugin failed because `DATABASE_URL` was unset) | 14 unused files; 3 unused deps (`@next-auth/prisma-adapter`, `@prisma/client` [false positive], `zlib-sync` [false positive, see DUP-15]); 2 unused devDeps (`@eslint/eslintrc`, `eslint-config-next`); 1 unlisted (`chalk`); 3 unresolved imports (`bot-intents.test.ts` [deliberate], `mark-command.test.ts` [stale], `tsconfig-paths/register`); 46 unused exports; 27 unused exported types; 1 unused enum-member group; 2 duplicate exports (`ALL_TOOLS`/`TOOLS`, `PLEX_ONBOARDING_STEPS`/`ONBOARDING_STEPS`) |
| `--production` (tests are not entry points) | 37 unused files, of which 26 are app code (3,107 LOC, all confirmed by grepping importers; their tests total ~6,385-6,460 LOC); 76 unused exports |

### Dead-file inventory (DUP-12)

LOC measured with `wc -l`.

| Area | File | LOC |
|---|---|---|
| Generator UI | `components/generator/wrapped-generator.tsx` | 141 |
| Generator UI | `components/generator/wrapped-generator-prompt.tsx` | 50 |
| Generator UI | `components/generator/wrapped-generator-status.tsx` | 101 |
| Generator UI | `hooks/use-wrapped-polling.ts` | 53 |
| Wrapped viewers | `components/wrapped/user-wrapped-viewer.tsx` | 208 |
| Wrapped viewers | `components/wrapped/wrapped-home-button.tsx` | 262 |
| Wrapped viewers | `components/admin/wrapped/wrapped-viewer.tsx` | 203 |
| Wrapped history | `components/admin/wrapped/historical-wrapped-selector.tsx` | 203 |
| Wrapped history | `components/admin/wrapped/historical-versions-inline.tsx` | 144 |
| Admin footer / LLM | `components/shared/admin-footer.tsx` | 38 |
| Admin footer / LLM | `components/shared/admin-footer-client.tsx` | 324 |
| Admin footer / LLM | `components/admin/settings/llm-toggle.tsx` | 85 |
| Admin footer / LLM | `components/admin/settings/llm-settings.tsx` | 134 |
| Admin misc | `components/admin/playground/cost-display.tsx` | 78 |
| Admin misc | `components/admin/users/user-management.tsx` | 97 |
| Admin misc | `components/admin/llm-usage/scrollspy-nav.tsx` | 135 |
| Admin misc | `components/admin/shared/sign-out-button.tsx` | 22 |
| User-facing misc | `components/dashboard/plex-link-card.tsx` | 57 |
| User-facing misc | `components/discord/link-panel.tsx` | 217 |
| User-facing misc | `components/watchlist/sync-history-table.tsx` | 187 |
| UI primitives | `components/ui/styled-select.tsx` | 91 |
| UI primitives | `components/ui/service-icons.tsx` | 44 |
| Barrels | `components/setup/setup-wizard/index.ts` | 12 |
| Barrels | `lib/security/index.ts` | 11 |
| Maintenance leftovers | `actions/user-marks.ts` | 154 |
| Maintenance leftovers | `lib/validations/user-media.ts` | 56 |
| **Total (26 files)** | | **3,107** |
| Dead route | `app/api/admin/sonarr/route.ts` | 49 |
| Dead route | `app/api/admin/radarr/route.ts` | 49 |
| Dead route | `app/api/admin/wrapped/by-user/[userId]/route.ts` | 43 |
| Dead route | `app/api/admin/wrapped/[wrappedId]/user/route.ts` | 50 |
| **Total (4 routes)** | | **191** |

### Dead exported functions in live modules (DUP-13)

Measured with the TypeScript AST (span of each declaration); none has a non-test reference. Total ~1,150 LOC.

| Module | Dead exports | LOC |
|---|---|---|
| `lib/connections/sonarr.ts` | `deleteSonarrSeries` (:130, 39), `bulkDeleteSonarrEpisodeFiles` (:168, 33), `getSonarrSeriesStatistics` (:200) | 72+ |
| `lib/connections/radarr.ts` | `getRadarrMovieFile`, `deleteRadarrMovie`, `bulkDeleteRadarrMovies` (:118/:122/:155) | 86 |
| `lib/connections/tautulli.ts` | `getTautulliLibraryMediaInfo`, `getTautulliMediaWatchStats`, `getTautulliUnwatchedMedia` (:85/:253/:270) | 67 |
| `lib/connections/overseerr.ts` | `getOverseerrMediaByTmdbId`, `batchGetOverseerrMediaStatus` (:124/:181) | 120 |
| `lib/connections/plex-sessions.ts` | `getPlexLibraryItems`, `getPlexPlaylists`, `getPlexPlaylistItems` (:83-128) | 42 |
| `lib/connections/plex-connection.ts` | `getLibrarySectionIDs` (:96) | 48 |
| `lib/connections/plex-marking.ts` | `markPlexItemUnwatched` (:61) | 49 |
| `lib/wrapped/usage.ts` | `getLLMUsageRecords`, `getCostSummary` (:186/:240) | 81 |
| `actions/admin/queue.ts` | `getQueueHealth`, `getQueueJob`, `updateWatchlistSyncSchedule`, `getWatchlistSyncSchedulerStatus` | 204 |
| `actions/admin/watchlist.ts` | `forceUserWatchlistSync` (:140) | 69 |
| `actions/admin/admin-servers.ts` | `deleteJellyfinServer`, `deletePrometheus` (:607) | 51 |
| `lib/utils/formatters.ts` | `formatFileSize`, `getMediaTypeLabel`, `formatDate` | 50 |
| Various | `constructServerUrl`, `processWrappedContent`, `verifyPlexAuthToken`, `requireAuthAPI`, `getDiscordStats` | 124 |
| `lib/discord/lock.ts` | acquire/release/has/WithRetry/start/stop facade (:56-140) | ~85 |
| Used only by dead components | `getWatchlistSyncHistory`, `resyncDiscordRole` | - |
| `lib/validations/user-media.ts` | `IntentTypeEnum`, `CreateUserWatchIntentSchema` and types (:15/:41/:54/:56) | (in file total) |
| `prisma/schema.prisma:470` | `model UserWatchIntent` (+ `IntentType` enum), no Prisma usage | - |

### UI primitive adoption (DUP-14)

| Primitive | Importers | Hand-rolled equivalents |
|---|---|---|
| `components/ui/card.tsx` | 3 | Panel class literal 108 times in 31 non-test files (verifier) / 115 in 36 (auditor) |
| `components/ui/loading-spinner.tsx` | 3 | Inline spinner path 32 times in 26 files (auditor) / 34 in 28 (verifier) |
| `lucide-react` | 1 (`components/ui/pagination.tsx`) | 243 inline `<svg>` in 82 files; 16 copies of the checkmark path |
| `components/ui/modal-shell.tsx` | 4 | 4+ hand-rolled `fixed inset-0` overlays |
| `components/ui/date-range-picker.tsx` | 1 | 2 copied date filters (cost, discord) |
| DataTable | does not exist | 15 files hand-roll `<table>` |
| PageHeader | does not exist | 13 admin pages repeat the heading classes |
| Central chart setup | does not exist | 14 files call `ChartJS.register` |

### Server-action boilerplate counts (DUP-06)

| Pattern | Count |
|---|---|
| `requireAdmin` in actions/ | ~88 `await requireAdmin` / 105 references (verifier); auditor counted 104 calls |
| `catch (error)` blocks in actions/ | 131 |
| `{ success: false, error }` returns | 314 |
| Inline `Promise<{ success: boolean; error?: string }>` declarations | 23 |
| Hand-rolled `getServerSession` + `isAdmin` checks | ~10 |
| `error instanceof Error ? error.message` passthrough (DUP-01) | 82 in 36 non-test files (verifier) / 67 in 30 (auditor) |
| `await import(` in actions/ | 53 (26 in `admin-servers.ts`) |
| `findFirst({ where: { isActive: true } })` without `orderBy` | 48 |
| `SKIP_CONNECTION_TESTS` bypass copies in `lib/connections` | 11 |

### Consolidation estimates

| Workstream | Estimated LOC removed | Finding |
|---|---|---|
| Legacy v1 sections (only if migrated or dropped) | ~1,460 | DUP-08 |
| UI primitive adoption | ~1,200 | DUP-14 |
| Setup forms + actions | ~1,100 (~450 action, ~650 form) | DUP-05 |
| Server-action wrappers | ~600-800 | DUP-06 |
| Locks | ~300 | DUP-07 |
| Tautulli / HTTP layer | ~300 | DUP-03 |
| Formatters | ~150 | DUP-09 |
| Types | ~150 | DUP-10 |
| LLM clients | ~120 | DUP-04 |
| Stats pipeline | ~110 | DUP-02 |
| Dead files + routes (delete) | 3,298 (+ ~6,400 test LOC) | DUP-12 |
| Dead exports (delete) | ~1,150 | DUP-13 |

### Dependency verdicts (DUP-15)

| Package | Verdict |
|---|---|
| `@next-auth/prisma-adapter` | Unused; remove |
| `autoprefixer` | Redundant with `@tailwindcss/postcss` v4; remove |
| `@eslint/eslintrc` | Unused; remove |
| `eslint-config-next` | Installed but not wired; wire into flat config |
| `zlib-sync` | In use (auto-loaded by discord.js for gateway compression); optional, but requires native toolchain in Docker |
| `chalk` | Used, undeclared (transitive via jest); declare or drop |
| `tsconfig-paths` | Used by scripts, undeclared (transitive via eslint-config-next); declare |
| `qs` (+ `@types/qs`) | One user; replace with `URLSearchParams` |
| `lucide-react` | One importer; adopt broadly (DUP-14) |
| chart.js, react-chartjs-2, react-countup, dotenv, fast-xml-parser, react-markdown, `@prisma/client` | In use; keep |

## Appendix: Investigated and ruled out

No finding was refuted in full. The verifier rejected the following sub-claims, and the findings above reflect the corrections.

- **zlib-sync is unused (DUP-15):** ruled out. discord.js 14.25.1 does `require('zlib-sync')` in a try/catch and turns on zlib-stream compression when the package is present.
- **@prisma/client is unused (knip):** false positive. The prisma-client-js generator needs it.
- **Non-admins see the "Rex" 500 page on /admin (DUP-06):** ruled out. `app/admin/error.tsx` doesn't wrap its own layout, so root `app/error.tsx` shows the generic ErrorState. Access is still denied.
- **The PII leak is common for Jellyfin-auth users (DUP-01):** ruled out. Jellyfin users have no `plexUserId` and fail earlier at `wrapped-generation.ts:173`.
- **The watchlist lock timers hold divergent copies of the held flag (DUP-07):** ruled out. Both timers share the module-global `lockState`. The real defect is that sync runs only once per acquisition.
- **`lib/auth.ts:33` is an 11th test-mode bypass (DUP-03):** ruled out. It uses `ENABLE_TEST_AUTH` with a `NODE_ENV !== 'production'` backstop.
- **The Tautulli user-matching divergence is material (DUP-03):** largely ruled out. The extra fallback compares usernames against an email, and the missing error check only produces "User not found".
- **A hung Tautulli request stalls generation indefinitely (DUP-03):** ruled out. undici's 300 s default timeouts apply, so the stall lasts minutes.
- **`bot-intents.test.ts` has a stale import (DUP-13):** false positive. The test deliberately asserts that `require("../commands/media-marking")` throws.
- **`generator/` should be removed from the CLAUDE.md tree (DUP-12):** ruled out. `wrapped-generating-animation.tsx` is live.
- **The dead admin routes are meaningful attack surface (DUP-12):** ruled out. They still go through `requireAdminAPI` and `adminRateLimiter`.
- **Malformed WrappedData makes the share, OG and poster routes return 500 (DUP-10):** ruled out. Every parse site is guarded by try/catch with handled responses.
- **The legacy v1 set must track `WrappedSectionType` changes (DUP-08):** ruled out. It is frozen compatibility code for historical records.
- **An API key valid in setup may fail validation elsewhere (DUP-11):** ruled out. `setup.ts:553` is identical to `apiKeySchema`, and the *arr/Tautulli key schemas validate a different kind of key.
- **`lib/utils.ts` `getBaseUrl` leaks server env to the client (DUP-16):** ruled out. It reads only `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL`.
