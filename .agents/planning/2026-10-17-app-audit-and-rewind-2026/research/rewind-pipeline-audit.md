# Rewind (Wrapped) Pipeline Audit

Generated 2026-10-17 · 1 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

**Scope.** This audit covers the whole Rewind (Wrapped v2) pipeline:

- the dashboard entry point and the `generatePlexWrapped` server action
- the Tautulli, Plex and Overseerr fetchers
- derived statistics and archetype scoring
- the OpenAI call, the Zod parse and the deterministic assembly
- the `PlexWrapped` row and the polling loops
- the viewer and the public share API

Claims about upstream APIs were checked against the Tautulli source (`plexpy/webserve.py`, `plexpy/datafactory.py`, `plexpy/api2.py`) and the Overseerr source (`server/routes/*`, `server/constants/media.ts`).

## Executive summary

- **Public share links leak the server's user list (RWP-01, high).** Every Rewind stores `statistics.leaderboards`. That holds every Tautulli user's ID, username, friendly name and yearly watch minutes, plus lists of who watched each of the user's top titles. The share API needs no login and returns this blob unfiltered. Existing rows already contain the data, so the fix needs a cleanup script. A separate error path shows the end user every Tautulli username and email (RWP-02).
- **The viewing-pattern stats are wrong for most viewers (RWP-03, high).** The year window is cut in UTC, but hours, weekdays, months and streaks use the server's local time, and the shipped Docker image runs in UTC. A viewer in US Pacific time who watches at 9 PM is told their peak hour is 4 AM, and their archetype evidence is skewed too.
- **In January users cannot open their Rewind (RWP-04, high).** Generation uses the configured `wrappedYear`, but `/wrapped` always loads the calendar year. With the standard Nov 20 to Jan 31 window, a user who generates in January lands on "You haven't generated your 2027 Plex Wrapped yet" and cannot open the recap in the app. In the same month, the admin Regenerate button creates nearly empty 2027 Rewinds that still cost an LLM call.
- **Several upstream API contracts are misread (RWP-05, RWP-06, RWP-07, RWP-10).**
  - Tautulli: the per-title leaderboards read fields that do not exist, so they are always 0, and they cover all time instead of the year. The percentile for a past year includes later plays.
  - Overseerr: declined requests count as approved and completed ones are excluded. Genres are never found. Only the first 10 Overseerr users are searched.
  - No upstream response is validated with Zod (RWP-20), which is why none of this was caught.
- **The execution model will not hold up for the 2026 rebuild (RWP-11, RWP-12, RWP-14, RWP-17).**
  - Generation runs synchronously inside one server action, with no timeouts on upstream calls and no queue.
  - There is no protection against duplicate runs, no rate limit, and no recovery for rows stuck after a restart.
  - Status polls queue up behind the running action.
  - Each user's run rescans the whole Plex library.
  - Regeneration takes share links offline while it runs, and a failed run replaces a good Rewind with "failed".
- **The LLM integration is narrow and fragile (RWP-15, RWP-16, RWP-22).**
  - It supports OpenAI only, through raw fetch. Model capabilities are guessed from name prefixes; that logic is duplicated in two modules and misses `o4`.
  - The form defaults (temperature 0.8, 6000 tokens) conflict with GPT-5 reasoning models.
  - There is no retry, no second attempt after a schema failure, and no deterministic fallback.
  - LLM-written text is never checked against the stats.
  - Cost tracking skips failed calls that were still billed, and prices models missing from the table (such as `gpt-5.1` and `gpt-5.2`) at GPT-4 rates.
- **The data for "better stats" is already downloaded and then discarded (RWP-18).** The history rows include completion, watched status, release date, session timing, platform and transcode fields. The Plex scan includes genres and credits. Two of the 12 archetypes are hard-coded to score 0. Users with an empty history still get a full, paid generation (RWP-19).
- **Coverage gaps.** Jellyfin users see a Rewind card that always fails (RWP-08). The share page fetches its own API from the server, so all visitors share one rate-limit bucket of 100 requests per 15 minutes (RWP-09).
- **The v2 design is worth keeping.** The LLM only writes text and picks from a deterministic archetype shortlist; the numbers come from code; the output is schema-enforced and checked with Zod; the derived stats are pure and tested; and BullMQ is already in place. The 2026 work is a rewrite of the data layer and the execution model on top of this design, not a redesign.

## Severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 3 |
| Medium | 13 |
| Low | 6 |
| Info | 0 |
| **Total** | **22** |

No finding was refuted. By status: 4 verified (including all 3 high findings, which also survived a refutation attempt), 12 confirmed, 6 adjusted, 0 disputed, 0 unverified.

### Findings index

| ID | Title | Severity | Category | Effort | Status | Source ID |
|---|---|---|---|---|---|---|
| RWP-01 | Stored and shared Rewind JSON exposes every server user's name and watch time | high | Privacy | M | verified | REWIND-01 |
| RWP-02 | Failed Tautulli match shows the user every Tautulli username and email | medium | Privacy | S | adjusted | REWIND-02 |
| RWP-03 | Bucketing ignores the viewer's timezone; UTC window vs server-local buckets | high | Correctness | M | verified | REWIND-05 |
| RWP-04 | Year rollover broken: viewer loads the calendar year, generation uses wrappedYear | high | Correctness | S | verified | REWIND-06 |
| RWP-05 | Tautulli leaderboard calls use non-existent params/fields | medium | Correctness | M | adjusted | REWIND-04 |
| RWP-06 | Overseerr stats misread statuses, genres and user paging | medium | Correctness | M | confirmed | REWIND-07 |
| RWP-07 | Stat definitions are inconsistent and lossy | medium | Correctness | M | confirmed | REWIND-12 |
| RWP-08 | Jellyfin users are offered a Rewind that always fails | medium | Correctness | S | confirmed | REWIND-16 |
| RWP-09 | Share page self-fetch puts all visitors in one rate-limit bucket | medium | Correctness | S | confirmed | REWIND-17 |
| RWP-10 | Shared Tautulli client wraps non-existent commands; Rewind bypasses it | low | Correctness | S | adjusted | REWIND-21 |
| RWP-11 | Synchronous generation: no queue, upstream timeouts or restart recovery | medium | Robustness | L | verified | REWIND-03 |
| RWP-12 | No rate limit or single-flight on paid generation | medium | Security | S | confirmed | REWIND-08 |
| RWP-13 | Prompt template read via an unauthenticated exported server action | low | Security | S | confirmed | REWIND-22 |
| RWP-14 | Regeneration is not atomic and real versioning is missing | medium | Data integrity | M | confirmed | REWIND-09 |
| RWP-15 | OpenAI-only raw fetch, brittle model heuristics, GPT-5-hostile defaults, no fallback | medium | LLM integration | M | adjusted | REWIND-10 |
| RWP-16 | LLM text and leftover LLM-computed fields are never checked against the stats | low | LLM integration | M | adjusted | REWIND-11 |
| RWP-17 | No caching of server-wide data across users | medium | Performance | M | confirmed | REWIND-14 |
| RWP-18 | Already-downloaded data is discarded; two archetypes can never win | medium | Product gap | M | confirmed | REWIND-13 |
| RWP-19 | Users with little or no viewing still trigger a full paid generation | low | Product gap | S | confirmed | REWIND-19 |
| RWP-20 | Duplicated, drifted pipeline; unvalidated upstreams; four polling loops | medium | Maintainability | M | confirmed | REWIND-15 |
| RWP-21 | Viewer data contract untyped and unvalidated | low | Maintainability | M | confirmed | REWIND-20 |
| RWP-22 | Cost tracking misses billed failures and over-prices unknown models | low | Observability | S | adjusted | REWIND-18 |

## Findings

### Privacy

#### RWP-01 Stored and publicly shared Rewind JSON exposes every server user's name and watch time

- **Severity:** high
- **Status:** verified. It survived an independent refutation attempt. The claim that the owner's email leaks through the `user.name || user.email` fallback was downgraded to hardening, because every account-creation path sets `name`.
- **Where:**
  - `actions/wrapped-generation.ts:269-276` (leaderboards built), `:296` (spread into statistics), `:307` (`user.name || user.email` sent to the LLM), `:335` (persisted with `JSON.stringify(wrappedData)`)
  - `lib/wrapped/tautulli-leaderboards.ts:124` (`stats_count=1000`), `:188-214` (roster mapping), `:306-349` (per-title watcher lists)
  - `lib/wrapped/assemble-wrapped.ts:237` (`statistics,` persisted unchanged)
  - `app/api/wrapped/share/[token]/route.ts:18` (rate limit is the only guard), `:74`, `:85`, `:87`
  - `app/(app)/wrapped/share/[token]/page.tsx` (passes the whole blob to the client `WrappedShareSummary`)
  - `types/wrapped.ts:41-85` (leaderboard entry shape)
- **Evidence:**

  ```ts
  // actions/wrapped-generation.ts:269-276, :296
  leaderboards = {
    topContent: topContentLeaderboards.data,
    watchTime: {
      leaderboard: watchTimeLeaderboard.data,
      userPosition: userIndex >= 0 ? userIndex + 1 : undefined,
      totalUsers: watchTimeLeaderboard.data.length,
    },
  }
  ...(leaderboards && { leaderboards }),

  // app/api/wrapped/share/[token]/route.ts:85-87 (no session check)
  userName: wrapped.user.name || wrapped.user.email || "User",
  data: wrappedData,
  ```

  Each roster entry carries `userId, username, friendlyName, totalWatchTime, moviesWatchTime, showsWatchTime`. Every completed generation gets a share token automatically (`wrapped-generation.ts:324-328`). `proxy.ts` only logs requests and sets a request ID; it does no auth. No component under `components/wrapped` reads `leaderboards`. Only the prompt (`lib/wrapped/prompt-template.ts:88-130`) and the admin prompt editor and playground use it.
- **Impact:** Share links are designed to be posted publicly, with OG metadata. Anyone holding one can run `curl /api/wrapped/share/<token>` and read the full server roster: user IDs, Plex usernames, friendly names (often real names) and yearly watch minutes. They also get the list of who watched each of the user's top 5 movies and top 5 shows, with play counts. Browser visitors receive the same data in the RSC payload. Some Plex usernames are themselves emails, and Tautulli's own API docs show `"username": "jsnow@..."`, so the roster can expose emails directly. Logged-in members viewing their own `/wrapped` page also receive every other member's watch time, because the client `WrappedViewer` gets the whole parsed blob. This affects every Tautulli-backed Rewind where both leaderboard calls succeeded, and existing rows already hold the data.
- **Recommendation:**
  - Keep computing the leaderboards in memory for the prompt. The prompt only needs the user's own position, `totalUsers` and `leaderboard[0].watchTime`.
  - Persist only the viewer's own position, `totalUsers` and percentile. Strip `statistics.leaderboards` before `assembleWrappedData` and persistence.
  - Make the share API return an allow-listed, Zod-parsed public projection instead of the raw `data` blob.
  - Write a one-off script that removes `statistics.leaderboards` from existing `PlexWrapped.data` rows.
  - As hardening, drop the email fallback for display and LLM input: use the name, otherwise "Viewer".
- **Effort:** M

#### RWP-02 A failed Tautulli user match shows the end user every Tautulli username and email, and the message is stored

- **Severity:** medium
- **Status:** adjusted. The mechanics are accurate, but the trigger is rarer than first stated. Matching already falls back to `plex_id`/`user_id`, Tautulli's `user_id` is the Plex account ID, and managed users cannot sign in with a PIN. So the error fires only when the user is missing from Tautulli's user list entirely, for example a new user before Tautulli refreshes. A user cannot force this condition.
- **Where:**
  - `lib/wrapped/tautulli-user-statistics.ts:85-92` (username/friendly_name compared against the email), `:94-100`, `:103-112`
  - `actions/wrapped-generation.ts:187-188` (throws), `:344-349` and `:377-382` (persist to `PlexWrapped.error`), `:392` (returned)
  - `components/dashboard/wrapped-card.tsx:118`, `:141` (toast)
  - `app/(app)/wrapped/page.tsx:75-76` (rendered)
- **Evidence:**

  ```ts
  // lib/wrapped/tautulli-user-statistics.ts:103-112
  const availableUsers = users.map((u: TautulliUser) =>
    `${u.username || u.friendly_name || "Unknown"} (${u.email || "no email"})`
  ).join(", ")
  return {
    success: false,
    error: `User not found in Tautulli. Plex User ID: ${plexUserId}, Email: ${userEmail || "none"}. Available users: ${availableUsers || "none"}`
  }
  ```

  ```tsx
  // app/(app)/wrapped/page.tsx:75-76
  {wrapped.error && (
    <p className="text-red-300 mb-4">{wrapped.error}</p>
  ```
- **Impact:** When it fires, a non-admin sees every server user's username and email, and the list stays in the database in `PlexWrapped.error`.
- **Recommendation:**
  - Log the user list on the server only.
  - Persist and return a stable code (`TAUTULLI_USER_NOT_FOUND`) with a generic message, such as "Your account isn't linked in Tautulli yet; ask the server admin."
  - Reorder matching so `plexUserId`/`user_id` is tried first and email second.
  - Remove the username/friendly_name-equals-email comparison at `:85-92`, which makes no sense.
- **Effort:** S

### Correctness

#### RWP-03 Hour, day, month and year bucketing ignores the viewer's timezone; the year window is UTC while the buckets use server-local time

- **Severity:** high
- **Status:** verified. It survived an independent refutation attempt, which reproduced the behaviour in Node.
- **Where:**
  - `lib/wrapped/tautulli-user-statistics.ts:122-133` (UTC window), `:196-200` (filter), `:224-226` (local `getMonth`/`getFullYear`)
  - `lib/wrapped/derived-statistics.ts:15` (JSDoc admits it), `:61-66` (local `toDateKey`), `:85-93`
  - `lib/wrapped/overseerr-statistics.ts:101-102` (UTC window)
  - `lib/wrapped/tautulli-leaderboards.ts:118-120` (UTC year start)
  - `lib/wrapped/archetype-scoring.ts` (midnight-marathoner uses hours 22-3; golden-hour-viewer needs a peak hour of 18-21)
  - `components/wrapped/wrapped-sections/cinematic/streaks-patterns-section.tsx` (renders peak hour, hour and day histograms, longest streak)
  - `Dockerfile:1` (`FROM node:25.8-alpine`; no `TZ` in the Dockerfile, `docker-compose.yml`, `docker-entrypoint.sh`, `example.env` or the README's Docker section)
- **Evidence:**

  ```ts
  // lib/wrapped/tautulli-user-statistics.ts:122, :126
  const startDate = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000
  endDate = new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000
  // :224-226
  const month = date.getMonth() + 1
  const itemYear = date.getFullYear()

  // lib/wrapped/derived-statistics.ts:15, :88-93
  //  * - Timestamps are bucketed in the server's local timezone via `Date`.
  if (when.getFullYear() !== year) continue
  hourHistogram[when.getHours()] += minutes
  dayOfWeekMinutes[when.getDay()] += minutes
  ```

  Searching `lib`, `actions`, `app` and `components` for timezone, `Intl`, `date-fns-tz`, `Temporal` or `process.env.TZ` finds only display formatters, plus a comment in `formatters.ts` that calls timezone support future work.
- **Impact:** The shipped image runs in UTC.
  - Node reproduction: a 9 PM Pacific play on a Tuesday buckets as hour 4 on Wednesday with `TZ=UTC`, and as hour 21 on Tuesday with `TZ=America/Los_Angeles`.
  - Peak hour, the hour and weekday histograms, the weekend share, streaks and the most active day are all shifted by the viewer's UTC offset.
  - The late-night share is inflated, so "The Midnight Marathoner" is wrongly awarded and "Golden Hour" gets 0.
  - Plays after 4 PM PT on New Year's Eve fall out of the year entirely.
  - If an operator does set `TZ`, the hour buckets become correct, but plays on the evening of Dec 31 of the previous year fall inside the UTC window and count toward the yearly totals while the monthly and derived stats skip them. The totals and the breakdowns then disagree.
  - Total watch time, top titles and counts are not affected.
- **Recommendation:**
  - Minimum fix: add a single server-level `Config.timezone` (IANA name, admin-editable, defaulting from `TZ`) and apply it to both windowing and bucketing.
  - Optional: a per-user timezone captured from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
  - Put all windowing and bucketing behind one timezone-aware helper (Temporal polyfill or `date-fns-tz`).
  - Request history with a padded `after`/`before` window, then filter exactly.
  - Add fixed-timezone tests that cover DST and New Year's Eve.
- **Effort:** M

#### RWP-04 Year rollover is broken: the viewer always loads the calendar year while generation uses the configured wrappedYear

- **Severity:** high
- **Status:** verified. It survived an independent refutation attempt, with one correction: the cited admin bulk path (`user-management.tsx`) is dead code, because `UserManagement` is not imported anywhere. The admin side is still affected through `RegenerateWrappedButton`.
- **Where:**
  - `actions/admin/admin-config.ts:50-66` (cross-year windows supported), `:73-77` (`wrappedYear` taken from the start date's year)
  - `components/admin/settings/wrapped-settings-form.tsx:31-35`, `:123-124` (both dates saved in the current calendar year)
  - `components/dashboard/wrapped-card.tsx:75`, `:82`, `:114` (`router.push("/wrapped")`), `:137`
  - `app/(app)/wrapped/page.tsx:19-20`, `:108`
  - `components/admin/users/regenerate-wrapped-button.tsx:18` (defaults `year = new Date().getFullYear()`), used without a year at `components/admin/users/user-actions-menu.tsx:156-160`
  - `app/admin/users/page.tsx:10`, `app/admin/users/[userId]/page.tsx:34` (calendar year)
  - `components/admin/users/user-management.tsx:16-17` (calendar year; not rendered anywhere)
  - `actions/wrapped-generation.ts:38` (action defaults to the calendar year)
- **Evidence:**

  ```ts
  // actions/admin/admin-config.ts:74-77
  let wrappedYear = new Date().getFullYear()
  if (config.wrappedGenerationStartDate) {
    wrappedYear = new Date(config.wrappedGenerationStartDate).getFullYear()
  }

  // app/(app)/wrapped/page.tsx:19-20
  const currentYear = new Date().getFullYear()
  const wrapped = await getUserPlexWrapped(session.user.id, currentYear)
  ```
- **Impact:**
  - With the standard Nov 20 to Jan 31 window, saved in 2026, a member on Jan 10, 2027 generates their 2026 Rewind and is redirected to "You haven't generated your 2027 Plex Wrapped yet."
  - The "Generate Your Wrapped" link goes back to the dashboard, which links back to `/wrapped`. The loop never ends, so the 2026 recap can only be opened through a share URL.
  - Admin Regenerate in January creates a 2027 Rewind with about 10 days of data and pays for the LLM call.
  - The admin users list shows 2027 status instead of the active year.
  - A second trigger: window dates saved in an earlier year and never re-saved keep the card on that year, while `/wrapped` loads the current one.
  - With no window configured, both code paths use the calendar year and agree.
  - No data is lost, but every user is locked out of the in-app viewer during the January end of the window, which is prime viewing time.
- **Recommendation:**
  - Add one server-side `getActiveRewindYear()` and use it in the page, the card, the admin screens and the share flow.
  - Use year-scoped routes (`/rewind/[year]`).
  - Reject `year != active year` for non-admins.
  - After Jan 1, schedule a final "year closed" regeneration for Rewinds generated before the year ended.
- **Effort:** S

#### RWP-05 Tautulli leaderboard calls use parameters and fields the API does not have

The per-title stats are all-time and always zero, and the percentile for a past year includes later data.

- **Severity:** medium
- **Status:** adjusted. The API facts were verified against the Tautulli source. Severity is lower because the per-title data is never rendered; it only feeds the prompt. `prompt-template.ts:115-118` drops the top-watcher line when `watchTime` is 0, which leaves only an all-time "Your position" line. The percentile is correct for current-year runs and skewed only for past-year or January runs. `type=duration` is ignored but harmless, because all rows are fetched and re-sorted.
- **Where:**
  - `lib/wrapped/tautulli-leaderboards.ts:40-44` (`get_item_user_stats` with `time_range`), `:72`, `:80-81` (non-existent fields), `:118-124` (`get_home_stats` with `type=` and relative `time_range`)
  - `lib/validations/tautulli.ts:88-103` (`TautulliItemUserStat` uses `total_duration`/`plays`)
  - `__tests__/lib/wrapped/statistics.test.ts:2239-2240` (fixtures encode the wrong contract)
  - `lib/wrapped/prompt-template.ts:115-118`, `:127-130`
- **Evidence:**

  ```ts
  // lib/wrapped/tautulli-leaderboards.ts:44, :72, :80, :124
  `...&cmd=get_item_user_stats&rating_key=${ratingKey}&time_range=${startDate},${endDate}`
  const durationSeconds = stat.total_duration || stat.duration || stat.time || 0
  playCount: parseInt(String(stat.plays || "0"), 10),
  `...&cmd=get_home_stats&time_range=${daysSinceYearStart}&type=duration&stats_count=1000`
  ```

  In Tautulli, `webserve.py:4609` is `get_item_user_stats(self, rating_key=None, media_type=None, grouping=None, **kwargs)`. It returns `total_plays`/`total_time`, and `datafactory.get_user_stats` has no time filter (`ORDER BY total_plays DESC, total_time DESC`). `get_home_stats` takes `stats_type`, `stat_id`, `before` and `after` (`webserve.py:6416-6437`). Without `before`/`after` it uses `timestamp() - time_range*86400` with `stopped >= ?`, so the window always ends now.
- **Impact:**
  - Every per-title leaderboard entry has `watchTime` 0 and `playCount` 0 and is ranked by all-time plays, yet the prompt presents "Your position: #N out of M watchers" as if it were this year's.
  - A past-year or January generation computes the percentile slide from plays made after the year ended.
  - Each call computes all of Tautulli's roughly 11 home-stat cards at 1000 rows, when only one is needed.
- **Recommendation:**
  - Watch-time leaderboard: call `get_home_stats&stat_id=top_users&stats_type=duration&after=YYYY-01-01&before=YYYY-12-31&stats_count=1000`, computed once per year and cached.
  - Per-title stats: either derive them from the year-filtered `get_history` (by `rating_key`/`grandparent_rating_key`) or drop them from the prompt.
  - Change `TautulliItemUserStat` to `total_plays`/`total_time`, add Zod schemas, and replace the fixtures with real captured responses.
- **Effort:** M

#### RWP-06 Overseerr stats misread the API

Declined requests count as approved, completed ones are excluded, genres are always empty, and only the first 10 Overseerr users are searched.

- **Severity:** medium
- **Status:** confirmed against the Overseerr source.
- **Where:**
  - `lib/wrapped/overseerr-statistics.ts:32-33` (`/user` with no `take`), `:47`, `:61` (`any`), `:66-98` (pages through every server request), `:101-102` (UTC window), `:123-126` (email fallback), `:128-131` (status filter), `:141` (genres)
  - `lib/connections/overseerr.ts:93` (`getOverseerrMediaDetails`, already exists), `:102` (`getOverseerrUsers`, same `/user` default)
  - `components/wrapped/wrapped-sections/cinematic/overseerr-stats-section.tsx:30` (Favored Genres block), `:104`, `:110` (renders `approvedRequests`)
- **Evidence:**

  ```ts
  // lib/wrapped/overseerr-statistics.ts:125, :128-131, :141
  return !reqEmail || reqEmail.toLowerCase() === userEmail.toLowerCase()
  // Status codes: 1 = Pending, 2 = Approved, 3 = Available
  const approvedRequests = yearRequests.filter((req: any) =>
    req.status === 2 || req.status === 3
  ).length
  if (req.media?.genres && Array.isArray(req.media.genres)) {
  ```

  In Overseerr, `server/routes/user/index.ts:31` has `const pageSize = req.query.take ? Number(req.query.take) : 10;`. `server/constants/media.ts` defines `enum MediaRequestStatus { PENDING = 1, APPROVED, DECLINED, FAILED, COMPLETED }`. The `Media` entity has no genres column. `server/routes/request.ts:34-35` supports a `requestedBy` filter.
- **Impact:**
  - "Approved" includes declined requests (3) and excludes completed ones (5).
  - The Favored Genres slide never renders.
  - Users outside the first 10 Overseerr accounts rely on a loose email fallback, and that fallback credits requests with no requester (from deleted users) to everyone.
  - Every generation pages through the server's entire request history.
- **Recommendation:**
  - Resolve the Overseerr user by plexId or email across all pages, cached per run, then query `/request?requestedBy={id}`.
  - Use enums for statuses.
  - Fetch genres through `/api/v1/{movie|tv}/{tmdbId}` (`getOverseerrMediaDetails`), cached per tmdbId.
  - Add request-to-available latency from `media.mediaAddedAt`.
  - Validate the responses with Zod.
- **Effort:** M

#### RWP-07 Stat definitions are inconsistent and lossy

This covers episode counts, what counts as "watched", merging by title, and fields that do not exist.

- **Severity:** medium
- **Status:** confirmed against `lib/wrapped/tautulli-user-statistics.ts` and Tautulli's `plexpy/datafactory.py`. Clarification: Tautulli's `'duration': item['play_duration']` means the `viewed_duration || duration` fallback really does give the watched seconds without pauses, so the watch-time totals are correct. Only the comments and types are wrong.
- **Where:**
  - `lib/wrapped/tautulli-user-statistics.ts:196` (filters by `item.date || item.started`), `:212-213` (wrong comment), `:214-221` (skips sub-minute rows), `:224` (dates rows by `item.date`), `:239-243` (rating fields; `moviesMap` keyed by title), `:291` (`showsMap` keyed by show title), `:337-339` (movies sorted by play count), `:397` (episode count)
  - `lib/wrapped/derived-statistics.ts:85` (`item.started || item.date`)
  - `lib/validations/tautulli.ts:29-32` (wrong JSDoc)
  - `lib/wrapped/prompt-template.ts:274` (says "by watch time")
- **Evidence:**

  ```ts
  // lib/wrapped/tautulli-user-statistics.ts:212-215, :221, :240, :397
  // viewed_duration is the actual time watched, duration is the total media length
  const duration = item.duration || 0
  const watchedDuration = item.viewed_duration || duration
  if (watchTimeMinutes <= 0) continue
  const rating = item.rating || item.user_rating || undefined
  episodesWatched: history.filter((item: TautulliHistoryItem) => item.media_type === "episode").length,

  // lib/wrapped/prompt-template.ts:274
  **Top Movies (by watch time - all times in minutes):**
  ```

  Tautulli's `get_history` SQL uses `MAX(started) AS date` and `MIN(started) AS started`. Its row dict has no `viewed_duration`, `rating`, `user_rating` or `original_year`.
- **Impact:**
  - The headline episode count includes sub-minute rows that every other stat skips, so it disagrees with the per-show sums.
  - Remakes and shows with the same name are merged (Dune 1984 and 2021, The Office US and UK).
  - A movie sampled for 2 minutes counts as watched.
  - `rating` is always undefined.
  - The prompt label contradicts the actual sort order.
  - The main loop and the derived stats use different timestamps.
  - Misleading comments and types hide the real Tautulli contract.
- **Recommendation:**
  - Define one Zod-parsed `PlayEvent` (ratingKey, grandparentRatingKey, startedAt, stoppedAt, playSeconds, percentComplete, watchedStatus, platform, and so on) and pure aggregators keyed by `ratingKey`.
  - Distinguish plays that were started, finished (`watched_status >= 1`) and abandoned.
  - Use one timestamp policy everywhere.
  - Make the prompt labels match the sort order.
- **Effort:** M

#### RWP-08 Jellyfin users are offered a Rewind that always fails

- **Severity:** medium
- **Status:** confirmed. It is broken for 100% of an optional user segment.
- **Where:**
  - `components/dashboard/user-dashboard.tsx:97` (rendered for every user)
  - `components/dashboard/wrapped-card.tsx:150-158` (hidden only when the feature is disabled or membership is under 6 months)
  - `actions/wrapped-generation.ts:139-159` (row set to "generating" first), `:173-175` (then throws), `:435` (bulk skips these users)
  - `prisma/schema.prisma:22` (`primaryAuthService`)
  - `lib/connections/jellyfin-*.ts` (no playback-history functions)
- **Evidence:**

  ```ts
  // components/dashboard/user-dashboard.tsx:97
  <WrappedCard userId={userId} memberSince={memberSince} />
  // actions/wrapped-generation.ts:173-174
  if (!user.plexUserId) {
    throw new Error("User does not have a Plex user ID")
  ```
- **Impact:** Every Jellyfin-only user who clicks the card creates a failed row and sees the internal error in a toast. These users cannot get a Rewind at all.
- **Recommendation:**
  - Now: hide or disable the card, with an explanation, when the user has no Plex identity.
  - Later: add a `WatchHistorySource` interface with a Tautulli implementation and a Jellyfin one (Playback Reporting plugin `/user_usage_stats/*`, or `/Users/{id}/Items?IsPlayed=true&Fields=UserData`). Both should emit the same `PlayEvent` (RWP-07).
- **Effort:** S for hiding or disabling the card; L for a Jellyfin history source.

#### RWP-09 The share page fetches its own API server-side, so all visitors share one rate-limit bucket and analytics record the server instead of the visitor

- **Severity:** medium
- **Status:** confirmed. One adjustment: `generateMetadata` and the page make the same GET, and React request memoization should collapse them, so the limit is hit at about 100 page views (unfurl bots included), not 50.
- **Where:**
  - `app/(app)/wrapped/share/[token]/page.tsx:10-30` (fetch at `:13`)
  - `lib/utils.ts:33-37` (`getBaseUrl` returns `NEXT_PUBLIC_APP_URL`)
  - `app/api/wrapped/share/[token]/route.ts:18`, `:55-67` (visit row)
  - `lib/security/rate-limit.ts:37-43` (key), `:127-130` (`shareRateLimiter`, in-memory)
- **Evidence:**

  ```ts
  // app/(app)/wrapped/share/[token]/page.tsx:13
  const response = await fetch(`${baseUrl}/api/wrapped/share/${token}`, {
  // lib/security/rate-limit.ts:127-129
  export const shareRateLimiter = rateLimit({
    max: 100, // 100 requests per window
  ```

  The limiter key is `x-forwarded-for || x-real-ip || "unknown"`. The server-side fetch forwards no client headers, so it either loops back through the reverse proxy (and the forwarded IP becomes the server's own) or carries no forwarded IP at all (bucket "unknown"). Any non-OK response, including a 429, makes `getSharedWrapped` return null, and the page then calls `notFound()`.
- **Impact:**
  - About 100 share-page views in 15 minutes, across all visitors combined, make every shared Rewind return 404. This hits exactly when a share goes viral.
  - Visit analytics store the server's IP hash and user-agent, and no referer.
  - If the container cannot reach its own public URL (hairpin NAT), every share is a 404.
- **Recommendation:**
  - Have the page read through a shared `getPublicRewind(token)` helper (wrapped in React `cache()`) that queries Prisma directly.
  - Record visits using `headers()` from the real request.
  - Rate-limit at the route or proxy using the real client IP.
  - Return the public projection from RWP-01.
- **Effort:** S

#### RWP-10 The shared Tautulli client wraps commands that do not exist, and Rewind bypasses the client entirely

- **Severity:** low
- **Status:** adjusted.
  - Confirmed: `get_recently_watched`, `get_most_watched` and `get_top_users` are not exposed API commands in current Tautulli master. The only similar handlers are UI-only routes (`get_user_recently_watched`, `library_recently_watched`), and `top_users`/`last_watched` exist only as `stat_id` values of `get_home_stats`.
  - Corrected: the chatbot gets an explicit error, not an error payload reported as success. For an unknown command, Tautulli's `api2.py` sets HTTP 400, which the client's `!response.ok` check catches. The missing `result === "error"` check only matters for very old Tautulli builds that returned 200 on errors.
- **Where:**
  - `lib/connections/tautulli.ts:186`, `:203`, `:220`
  - `actions/chatbot/executors/tautulli.ts:142-164`, `actions/chatbot/tools/registry.ts:70-72`, `actions/chatbot/executors/index.ts:37-39`
  - Rewind's own URL building: `lib/wrapped/tautulli-library.ts:29`, `lib/wrapped/tautulli-leaderboards.ts:36`, `:114`, `lib/wrapped/tautulli-user-statistics.ts:38`
- **Evidence:**

  ```ts
  // lib/connections/tautulli.ts:186, :203, :220
  `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_recently_watched&length=${limit}`
  `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_most_watched&length=${limit}`
  `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_top_users&length=${limit}`
  ```
- **Impact:** Three default admin chatbot tools always fail. The shared client cannot be reused as-is for the Rewind rewrite, and the wrapped modules duplicate URL building.
- **Recommendation:**
  - Replace the three wrappers with `get_home_stats` and `stat_id=top_movies|top_tv|top_users`. Its paging parameters are `stats_count`/`stats_start` plus `time_range` or `after`/`before`, not `length`.
  - For "recently watched", use `get_history` (default order is date descending) or `get_home_stats` with `stat_id=last_watched`.
  - When consolidating into one typed, Zod-validated Tautulli client (RWP-05, RWP-20), also treat `response.result !== "success"` as a failure, then point the `lib/wrapped/tautulli-*` modules at it.
- **Effort:** S

### Robustness and execution

#### RWP-11 Generation runs synchronously in one server action

There is no queue, no timeouts on upstream calls and no recovery after a restart. Polling waits behind the running action, and bulk generation is a single sequential request.

- **Severity:** medium
- **Status:** verified. The independent refutation pass lowered it from high to medium, and three of the original claims are corrected:
  - "No way to recover from the UI" is false for admins. `app/admin/users/[userId]/page.tsx:245` renders `RegenerateWrappedButton` whatever the status, and the action allows re-running a "generating" row (`:107-117`). Only the end user and the users-table menu are stuck, because the menu's condition at `user-actions-menu.tsx:151-154` leaves out "generating".
  - "Hangs indefinitely" is false. Node's fetch (undici) has default headers and body timeouts of about 300s each.
  - The bulk path has no UI caller today. Its only caller, `components/admin/users/user-management.tsx`, is not imported anywhere, so `generateAllPlexWrapped` can only be invoked directly. Rewind 2026 will need bulk generation re-exposed.
- **Where:**
  - `actions/wrapped-generation.ts:3-5` (header comment only discusses Vercel), `:139-159` (upsert to generating), inline awaits at `:175` (Tautulli), `:201` (Plex), `:229` (Overseerr), `:245` (leaderboards), `:303` (LLM), `:331-341` (completed), `:344`, `:377` (failed), `:401`, `:443-451` (bulk loop)
  - `lib/wrapped/api-calls.ts:147` (the only timed fetch)
  - Plain `fetch` with no signal: `lib/wrapped/overseerr-statistics.ts:32`, `:67`; `lib/wrapped/server-statistics.ts:37`, `:75`, `:108`; `lib/wrapped/tautulli-leaderboards.ts:46`, `:126`; `lib/wrapped/tautulli-library.ts:35`; `lib/wrapped/tautulli-user-statistics.ts:44`, `:146`
  - `components/dashboard/wrapped-card.tsx:100-130` (2s polling), `:181-210` (generating state with no retry)
  - `components/wrapped/wrapped-page-client.tsx:21-26`
  - `components/admin/users/user-actions-menu.tsx:64`, `:151-154`
  - `lib/queue/types.ts:14-20` (no Rewind job), `lib/queue/client.ts:21-23` (`attempts: 3`, exponential backoff)
  - `node_modules/next/dist/client/components/app-router-instance.js:150-158` (server actions queued one at a time)
- **Evidence:**

  ```ts
  // actions/wrapped-generation.ts:443-444
  for (const user of users) {
    const result = await generatePlexWrapped(user.id, validYear)
  ```

  Next's client action queue: "The queue is not empty, so add the action to the end of the queue ... started by runRemainingActions after the previous action finishes." A search for `"generating"` finds only readers and the two writes. Nothing resets stale rows, and `JOB_TYPES` contains only `WATCHLIST_SYNC_*`, `STRIPE_WEBHOOK` and `PLEX_ACCESS_*`.
- **Impact:**
  - A deploy, crash or container auto-update mid-run leaves that user on a spinner that polls every 2s forever, and only an admin can fix it.
  - A stalled Plex or Tautulli server holds each call for up to about 5 minutes.
  - Behind a reverse proxy (nginx 60s, Cloudflare 100s), a long bulk run gets cut off at the client while the server keeps working and re-billing every completed Rewind. There is no progress and no resume.
  - Polls fired during generation run back to back afterwards, each returning the full data blob.
  - No data is corrupted, but the risk grows as Rewind 2026 adds stats and calls.
- **Recommendation:**
  - Add a BullMQ `REWIND_GENERATE_USER` job (jobId `rewind:{userId}:{year}`) and a fan-out `REWIND_GENERATE_ALL` with limited concurrency, following the `WATCHLIST_SYNC_ALL` pattern.
  - Pass an explicit `AbortSignal.timeout` on every Tautulli, Plex and Overseerr call.
  - Add a stale-row sweeper based on a heartbeat or `updatedAt`.
  - Poll a lightweight status endpoint through TanStack Query instead of a server action.
  - Cache the Plex server library stats once per run or per day (RWP-17).
- **Effort:** L

### Security

#### RWP-12 No rate limit or single-flight on generation

Users can start unlimited concurrent paid runs for any year, and concurrent runs race each other.

- **Severity:** medium
- **Status:** confirmed. This is distinct from RWP-11: the root cause here is authorization and quotas, not architecture. Once a row completes, non-admins cannot regenerate it, so the abuse is bounded per year but unbounded while a run is in progress.
- **Where:**
  - `actions/wrapped-generation.ts:101-123` (owner may re-run "generating" or "failed" rows), `:139-159` (upsert with no in-flight check), `:342-351`, `:377-382` (both catches write "failed" with no run identity)
  - `lib/validations/shared-schemas.ts:30`
  - `lib/security/rate-limit.ts:108-123` (`checkRateLimit`; used only in `actions/subscription.ts:67`, `:140`)
  - `components/dashboard/wrapped-card.tsx:41-51` (6-month eligibility checked only on the client)
- **Evidence:**

  ```ts
  // lib/validations/shared-schemas.ts:30
  export const yearSchema = z.number().int().min(2010).max(2100)
  // components/dashboard/wrapped-card.tsx:41
  const MIN_MEMBERSHIP_MONTHS = 6
  ```
- **Impact:**
  - A regular user with several tabs open, or one who calls the action directly, can start any number of concurrent generations. Each one is a full Plex library scan plus an OpenAI call, and this works for any of 91 years.
  - Two overlapping runs are both billed.
  - A late failure can flip a Rewind that just completed to "failed".
- **Recommendation:**
  - Make generation single-flight, either through the BullMQ jobId or a conditional `updateMany` (where status is not "generating", or the run is stale).
  - Add a per-user rate limit and a per-year quota.
  - Enforce eligibility and the active year on the server (RWP-04).
  - Give each run a `runId` and let only the matching run write the final state (compare-and-set).
- **Effort:** S

#### RWP-13 The prompt template is read through an unauthenticated exported server action, so the lib layer depends on a "use server" module

- **Severity:** low
- **Status:** confirmed.
  - The missing guard is deliberate: `__tests__/actions/prompts.test.ts:143-146` asserts "should not require admin access", because generation runs without an admin session.
  - Exploitability is limited. No client component imports the export, so its action ID is not shipped in client JS. But admin pages import the module, so the action is registered and callable.
  - Action IDs are fixed per build, and `.github/workflows/docker-publish.yml` pushes public GHCR images, so the ID can be extracted from a published image.
  - What leaks is low-sensitivity: admin-written prompt text, name, description, version and an `updatedBy` user cuid (`prisma/schema.prisma:376-389`).
- **Where:** `actions/prompts.ts:1`, `:20-48` (guarded siblings), `:53-59`; `lib/wrapped/prompt-template.ts:10`, `:317`; `__tests__/actions/prompts.test.ts:143-146`.
- **Evidence:**

  ```ts
  // actions/prompts.ts:1, :53
  "use server"
  export async function getActivePromptTemplate() {
    const template = await prisma.promptTemplate.findFirst({ where: { isActive: true } })
    return template
  }
  // lib/wrapped/prompt-template.ts:10
  import { getActivePromptTemplate } from "@/actions/prompts"
  ```
- **Impact:** Any client that knows the action ID can read the active prompt template and its metadata. The layering is also inverted: library code imports a public endpoint module, against the CLAUDE.md rule "Always verify session in Server Actions".
- **Recommendation:**
  - Add `lib/wrapped/prompt-store.ts` with `import "server-only"` and a plain `findActivePromptTemplate()` that calls Prisma, and import that from `lib/wrapped/prompt-template.ts`.
  - Remove the export from `actions/prompts.ts`, or guard it with `requireAdmin()` if the UI needs it.
  - Update `__tests__/actions/prompts.test.ts:143` and the mocks in `__tests__/lib/wrapped/prompt-template.test.ts`, `__tests__/lib/wrapped-llm.test.ts` and `lib/wrapped/__tests__/prompt-template.test.ts`.
- **Effort:** S

### Data integrity

#### RWP-14 Regeneration is not atomic and real versioning is missing

Regeneration hides the current Rewind, breaks share links while it runs, and a failure loses the good copy.

- **Severity:** medium
- **Status:** confirmed. Only admins can regenerate completed rows, which limits how often this happens.
- **Where:**
  - `actions/wrapped-generation.ts:153-158` (the update branch flips a completed row to "generating"), `:344-349` (failure sets "failed" while `data` still holds the old copy)
  - `app/api/wrapped/share/[token]/route.ts:47` (404 unless "completed")
  - `lib/wrapped/llm.ts:135` (`LLMUsage.response` stores only `rawResponse`)
  - `actions/admin/admin-llm-history.ts:36-42`, `:96-104`, `:118-128` (versions compared through `parsed.sections`, a v1-only shape)
- **Evidence:**

  ```ts
  // app/api/wrapped/share/[token]/route.ts:47
  if (!wrapped || wrapped.status !== "completed") {
  // actions/admin/admin-llm-history.ts:102
  const versionSections = (parsed.sections || []).map((s: { id: string; type: string }) => ({
  ```

  v2 LLM responses contain only the creative fields, with no `sections` and no statistics.
- **Impact:**
  - An admin regeneration takes the user's Rewind and every share link offline for the whole run, and `/wrapped` shows the generating animation.
  - If the run fails, the user sees "Generation Failed" even though the previous data is still in the row.
  - Previous versions cannot be restored faithfully.
- **Recommendation:**
  - Add an immutable `RewindVersion` table (data, statistics snapshot, model, prompt version, createdAt) and `PlexWrapped.currentVersionId`, swapped only when a run succeeds.
  - Track run status separately from the published version.
  - Resolve share links to the current published version.
- **Effort:** M

### LLM integration

#### RWP-15 The LLM integration is OpenAI-only raw fetch with brittle model-name checks, defaults that conflict with GPT-5, and no retry or deterministic fallback

- **Severity:** medium
- **Status:** adjusted.
  - The substance holds, but several of the auditor's line numbers were wrong. The ones below are the verifier's corrected lines, re-checked for this report.
  - Whether newer GPT-5.x variants reject `temperature` depends on the model and the reasoning-effort setting, so "every generation fails" is plausible but not certain.
  - `mock-data.ts` does not use `suggestArchetypes`; it hard-codes `series-devourer`/`festival-juror`.
- **Where:**
  - `lib/wrapped/llm.ts:41` (mock used only when `llmDisabled`), `:93` (provider cast)
  - `lib/wrapped/api-calls.ts:49-57` (`requiresMaxCompletionTokens`: gpt-5, o1, o3; no o4), `:63-71` (`supportsStructuredOutputs`, which does include o4), `:124-127` (temperature forwarded whenever set), `:194-205` (truncation fails the run), `:207-218` (schema failure fails the run)
  - `lib/llm/chat.ts:8`, `:61-69`, `:106` (duplicate `LLMConfig` and `requiresMaxCompletionTokens`)
  - `lib/validations/llm-provider.ts:4` (`z.enum(["openai"])`)
  - `components/admin/settings/LLMProviderForm.tsx:35-36` (defaults), `:105-106` (always submitted), `:251` (GPT-5 note)
  - `lib/connections/openai.ts:107` (model picker filter)
  - `lib/wrapped/mock-data.ts:18-89` (`generateMockWrappedData`)
- **Evidence:**

  ```ts
  // components/admin/settings/LLMProviderForm.tsx:35-36, :251
  temperature: provider?.temperature ?? (purpose === "chat" ? 0.7 : 0.8),
  maxTokens: provider?.maxTokens ?? (purpose === "chat" ? 1000 : 6000),
  Note: GPT-5 models only support temperature 1 (default)

  // lib/wrapped/api-calls.ts:52-56
  modelLower.startsWith("gpt-5") ||
  modelLower.startsWith("o1") ||
  modelLower.startsWith("o3")

  // lib/connections/openai.ts:107
  .filter((id) => id.startsWith("gpt-"))
  ```

  On reasoning models, `max_completion_tokens` also has to cover the reasoning tokens. When that budget runs out, the run hits the "LLM response was truncated" error. Any non-OK response, truncation or schema failure fails the whole Rewind, with no retry for 429, 5xx or timeouts and no second attempt to repair the output. Separately, `z.toJSONSchema` emits `$schema` and `minLength` under strict mode; a contract test should confirm OpenAI accepts them.
- **Impact:**
  - Saving a GPT-5.x model with the form defaults can make every generation fail (temperature) or get truncated (reasoning budget).
  - A transient OpenAI error becomes a failed Rewind.
  - `o4` models get `max_tokens`.
  - There is no path to Anthropic, Google or local OpenAI-compatible models, and the model picker hides o-series models.
- **Recommendation:**
  - Add one shared model-capability table, used by both `lib/wrapped/api-calls.ts` and `lib/llm/chat.ts`, covering the token parameter, temperature support, structured outputs and reasoning effort. Stop sending `temperature` to models that reject it.
  - Retry 408, 429 and 5xx responses with backoff and jitter, and ask the model once more after a schema failure.
  - On final failure, fall back to deterministic copy in the style of `generateMockWrappedData`, flagged as degraded.
  - Multi-provider step: a provider-agnostic client (Vercel AI SDK `generateObject` with the existing Zod schema, or the official SDKs) plus a configurable OpenAI-compatible base URL.
  - Add a recorded contract test for the `z.toJSONSchema` output under strict mode.
- **Effort:** M

#### RWP-16 LLM-written text and leftover LLM-computed fields are never checked against the stats

- **Severity:** low
- **Status:** adjusted. Half of the original claim does not apply to v2 output. `personality`, `topGenre`, `bingeWatcher` and `discoveryScore` are generated and stored, but nothing in v2 renders them. `InsightsSection` is reached only from `LegacySectionRenderer` (`components/wrapped/wrapped-sections/index.tsx:42`, `:77`), which runs only when `version !== 2`, and the only insight field v2 uses is `funFacts`. The remaining risk is real but no failure has been demonstrated, and the exact values are supplied in the prompt.
- **Where:**
  - `lib/wrapped/prompt-template.ts:173-174` (code already computes `bingeWatcher` and `discoveryScore`), `:219` (rule 6 ACCURACY is the only guard), `:245-247`
  - `lib/wrapped/assemble-wrapped.ts:38-59` (`resolveDedication` checks length and echoes only), `:211`, `:239-240`
  - `app/(app)/wrapped/share/[token]/page.tsx:53-66` (summary used as the public OG/Twitter description)
  - `components/admin/prompts/prompt-template-editor.tsx:294-295` (duplicated placeholders)
- **Evidence:**

  ```text
  // lib/wrapped/prompt-template.ts:245-247 (system prompt)
  - "topGenre": your best inference of their most-watched genre from the titles and request data provided.
  - "bingeWatcher": true if any show has episodesWatched > 20, else false.
  - "discoveryScore": min(100, max(0, floor((moviesWatched + showsWatched) / 10))).
  ```

  ```ts
  // lib/wrapped/assemble-wrapped.ts:239-240
  insights: output.insights,
  summary: output.summary,
  ```
- **Impact:** Numbers the LLM invents in fun facts, narratives, the dedication or the public share summary go undetected. The unused insight fields cost output tokens for nothing. The `discoveryScore` formula also tops out early (70 titles scores 7/100), which would matter if it were ever rendered.
- **Recommendation:**
  - Remove `personality`, `topGenre`, `bingeWatcher` and `discoveryScore` from `wrappedLLMOutputSchema`, the system prompt and the `{{bingeWatcher}}`/`{{discoveryScore}}` placeholders, including the editor copy. If a future slide needs them, compute them in code, with real genres from metadata.
  - For displayed free text (funFacts, narratives, dedication, summary), check every `<highlight>` number against the set of allowed formatted values and fall back to deterministic copy for that field. Alternatively, have the model reference fact IDs that the assembler fills in.
- **Effort:** M

### Performance

#### RWP-17 No caching of server-wide data

Every user's run rescans the whole Plex library, all Overseerr requests and the user's all-time history.

- **Severity:** medium
- **Status:** confirmed. Clarifications:
  - Some steps already run in parallel: the Plex scan with the Tautulli counts at `server-statistics.ts:173`, and the two leaderboard calls at `wrapped-generation.ts:245`. The four stages still run one after another.
  - The bulk path has no UI caller today (see RWP-11).
- **Where:**
  - `lib/wrapped/server-statistics.ts:66-136` (`/all` per section at `:73`, plus `/all?type=4` per show section at `:106`, with no `X-Plex-Container-Size`), `:195` (Plex counts discarded)
  - `lib/wrapped/tautulli-user-statistics.ts:136-191` (all-time history, 1000 rows per page, sequential)
  - `lib/wrapped/overseerr-statistics.ts:66-98` (every server request, for every user)
  - `actions/wrapped-generation.ts:194-220`, `:443-451`
  - `lib/discord/role-metadata.ts:124`, `lib/discord/commands/mystats.ts:148` (same all-time `fetchTautulliStatistics`)
- **Evidence:**

  ```ts
  // lib/wrapped/server-statistics.ts:106, :195
  const episodesUrl = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&type=4` // type=4 is episode
  librarySize: tautulliCountsResult.data!.librarySize,
  // lib/wrapped/tautulli-user-statistics.ts:136
  // Fetch watch history WITHOUT date filters (Tautulli's date filtering seems unreliable)
  ```
- **Impact:** Bulk generation for N users runs N full Plex library scans (multi-MB JSON per show library), N identical home-stats queries and N full Overseerr scans. That loads Plex and Tautulli heavily and stretches runs to hours. Users with many years of history download every row they have ever played, and the Discord commands pay the same cost.
- **Recommendation:**
  - Add a per-year `ServerYearSnapshot` cache (DB or Redis, about 24h TTL) for library counts and storage, the leaderboard, the Overseerr user map and the metadata cache.
  - Fetch history with a padded `after`/`before` window.
  - Run independent stages with `Promise.allSettled`.
  - Fan out bulk runs with a concurrency limit.
- **Effort:** M

### Product gaps

#### RWP-18 Rich data the pipeline already downloads is discarded, so two archetypes can never win and key "better stats" are missing

- **Severity:** medium
- **Status:** confirmed. Line numbers corrected: the hard-coded scores are at `archetype-scoring.ts:88-99`. Because `suggestArchetypes` gives the LLM only the top 3, these two archetypes appear only when fewer than three others score above zero, which in practice means near-empty histories.
- **Where:**
  - `lib/wrapped/archetype-scoring.ts:28-30`, `:88-99`
  - `lib/validations/tautulli.ts:24-57` (`TautulliHistoryItem` declares none of the rich fields)
  - `lib/wrapped/server-statistics.ts:73` (`includeGuids=1` scan used only to sum `Part.size`), `:195`
- **Evidence:**

  ```ts
  // lib/wrapped/archetype-scoring.ts:28-30, :88-99
  //  * Archetypes with no measurable signal (credits-roller, premiere-chaser —
  //  * completion and release-date data are not collected) score 0
  "credits-roller": { score: 0, evidence: "no completion data collected" },
  "premiere-chaser": { score: 0, evidence: "no release-date data collected" },
  ```

  The Tautulli `get_history` row dict already includes `percent_complete`, `watched_status`, `originally_available_at`, `started`, `stopped`, `paused_counter`, `platform`, `player`, `transcode_decision`, `media_index` and `guid`, plus `ip_address` and `location`, which must stay private.
- **Impact:** Two of the twelve archetypes can never be awarded in practice. The Rewind has no genres, devices, completion rates, binge sessions, premieres or first and last watch of the year, even though most of these need no new API calls.
- **Recommendation:**
  - Widen the history schema and add the aggregations listed under "Available but unused data" below.
  - Build a ratingKey-to-metadata cache shared across users, from the existing library scan or from cached Tautulli `get_metadata`.
  - Score credits-roller from `watched_status`/`percent_complete`, and premiere-chaser from `started` minus `originally_available_at`.
  - Keep the [PRIVACY] fields (IP, location, player names) out of the output.
- **Effort:** M

#### RWP-19 Users with little or no viewing still trigger a full paid generation of empty slides

- **Severity:** low
- **Status:** confirmed. Corrections: the casual-critic line is `archetype-scoring.ts:132-135`, and an empty history produces about 8-11 slides rather than 10-14. Top movies, top shows and the monthly journey drop out, but streaks-patterns always appears.
- **Where:** `actions/wrapped-generation.ts:187` (the only gate), `:306` (LLM call); `lib/wrapped/llm-output-schema.ts:108-121`; `lib/wrapped/archetype-scoring.ts:132-135`.
- **Evidence:**

  ```ts
  // actions/wrapped-generation.ts:187
  if (!tautulliStats.success || !tautulliStats.data) {
  // lib/wrapped/llm-output-schema.ts:111-114
  movies: z.string().min(1),
  shows: z.string().min(1),
  topMovies: z.string().min(1),
  topShows: z.string().min(1),
  // lib/wrapped/archetype-scoring.ts:133
  score: clamp(totalHours < 60 ? 90 - totalHours : 0),
  ```

  Tautulli lists every shared Plex user, so a user with no plays gets a successful response full of zeros. Casual-critic then wins at 0 hours.
- **Impact:** A user with 0-2 hours of viewing gets a multi-slide Rewind built around lines like "You screened 0 films", and the LLM call is still billed.
- **Recommendation:**
  - Add a deterministic minimum-data gate (for example, fewer than 5 plays or under 3 hours) that shows a friendly not-enough-data screen without calling the LLM.
  - Make per-slide narratives nullable, and drop empty slides during assembly.
- **Effort:** S

### Maintainability

#### RWP-20 The pipeline is duplicated and has drifted, upstream responses are unvalidated, and there are four polling implementations including dead components

- **Severity:** medium
- **Status:** confirmed. The verifier found one more drifted copy: `components/admin/prompts/prompt-template-editor.tsx:294-298` re-implements the placeholder logic and still emits old animation-delay values that the server now resolves to empty strings. No job exists today, so the shared service would be called from the action, the playground and Discord.
- **Where:**
  - `app/api/admin/playground/statistics/route.ts:192-207` (has no `derived` or `percentile`)
  - `actions/wrapped-generation.ts:126`, `:195` (plexServer queried twice), `:135-136` and `:322-328` (shareToken generated twice; the second block is dead because the upsert always sets one)
  - `lib/wrapped/overseerr-statistics.ts:47`, `:61`, `:105-130` (`any`; raw fetch instead of `lib/connections`)
  - Polling loops: `hooks/use-wrapped-polling.ts:17`, `:32`; `components/dashboard/wrapped-card.tsx:105`; `components/wrapped/wrapped-page-client.tsx:26`; `components/wrapped/wrapped-home-button.tsx:68`
  - Dead code referenced only by tests: `components/generator/wrapped-generator.tsx:46`, `components/wrapped/wrapped-home-button.tsx`, `hooks/use-wrapped-polling.ts`
  - `lib/wrapped/api-calls.ts:24`, `:49` vs `lib/llm/chat.ts:8`, `:61` (duplicated `LLMConfig` and `requiresMaxCompletionTokens`)
  - `components/admin/prompts/prompt-template-editor.tsx:294-298`
- **Evidence:**

  ```ts
  // lib/wrapped/overseerr-statistics.ts:105, :130
  const allYearRequests = allRequests.filter((req: any) => {
  const approvedRequests = yearRequests.filter((req: any) =>
  // hooks/use-wrapped-polling.ts (only tests import it)
  onStatusChange: (wrapped: any)
  ```

  A search of the playground route finds neither `derived` nor `percentile`.
- **Impact:** Admin prompt testing does not match production: the archetype evidence and the percentile are missing. Every fix has to be repeated in two to four places. Upstream contract drift (RWP-05, RWP-06) goes unnoticed. The code breaks the CLAUDE.md rules against `any` and for Zod at boundaries.
- **Recommendation:**
  - Create one `collectRewindStatistics(userId, year, ctx)` service used by the action or job, the playground and Discord.
  - Use typed, Zod-validated upstream clients and one shared LLM module.
  - Replace the polling loops with one `useRewindStatus` TanStack Query hook.
  - Delete the dead components and their tests.
- **Effort:** M

#### RWP-21 The viewer data contract is untyped and unvalidated

The section union collapses to `Record<string, unknown>`, data is stored as TEXT JSON, and status is a free-form string.

- **Severity:** low
- **Status:** confirmed.
- **Where:**
  - `types/wrapped.ts:140-148` (top-level `longestBinge`, `mostActiveDay`, never set), `:176-181`
  - `prisma/schema.prisma:176`, `:178`
  - `app/(app)/wrapped/page.tsx:27`, `app/api/wrapped/share/[token]/route.ts:74` (unchecked `JSON.parse`)
  - `components/wrapped/wrapped-sections/cinematic/streaks-patterns-section.tsx:15-17` (casts)
  - `components/wrapped/user-wrapped-viewer.tsx:71`, `components/admin/wrapped/wrapped-viewer.tsx:48` (branch on "pending", which is never written)
  - `lib/wrapped/tautulli-leaderboards.ts:199-200` (`movies_duration`/`shows_duration` do not exist on top_users rows, so they are always 0)
- **Evidence:**

  ```ts
  // types/wrapped.ts:181
  | Record<string, unknown> // other sections may have various data structures
  ```

  ```prisma
  // prisma/schema.prisma:176, :178
  data        String // JSON string containing wrapped data
  status      String              @default("pending") // "pending", "generating", "completed", "failed"
  ```
- **Impact:** Changes to the assembly break slides silently. Malformed or old rows fail at runtime, and the stats cannot be queried in SQL.
- **Recommendation:**
  - Use a discriminated `RewindSlide` union keyed by `type`, with a Zod schema per type.
  - Store `data` in a `jsonb` column with a `schemaVersion`, parse it on read, and add versioned upgraders.
  - Make status an enum.
  - Remove the dead fields.
- **Effort:** M

### Observability

#### RWP-22 Cost tracking misses billed failures and over-reports unknown models at GPT-4 prices

- **Severity:** low
- **Status:** adjusted. The auditor's `api-calls.ts` line numbers were wrong; the corrected ones are below. Severity was lowered to low because the impact is limited to the accuracy of an admin-facing cost estimate. OpenAI's own billing is authoritative.
- **Where:**
  - `lib/wrapped/api-calls.ts:180-183` (no content or refusal), `:194-205` (truncation), `:207-218` (schema failure). All three return before usage is read at `:221-227`.
  - `lib/wrapped/llm.ts:112-114` (early return), `:127-147` (`LLMUsage` create), `:134` (stores the configured model name, not `responseData.model`)
  - `lib/llm/pricing.ts:80-84` (`normalizeModelName` strips only a `-YYYY-MM-DD` suffix), `:98-100`, `:117-119` (GPT-4 fallback); `cachedInput` is declared in `MODEL_PRICING` but `calculateCost` never uses it
- **Evidence:**

  ```ts
  // lib/llm/pricing.ts:117-119
  // Fallback to GPT-4 pricing if model not found
  console.warn(`[LLM] Unknown model "${model}", using GPT-4 pricing as fallback`)
  return (promptTokens / 1000000) * 30.0 + (completionTokens / 1000000) * 60.0
  ```

  The pricing table lists `gpt-5`, `gpt-5.3-codex`, `gpt-5.4*` and `gpt-5.5*`, but not `gpt-5.1`, `gpt-5.2` or `*-latest` names. `usage.prompt_tokens_details.cached_tokens` is ignored.
- **Impact:** Truncated, invalid or refused responses, which OpenAI still bills, do not show up in the admin cost views. Unlisted models are over-reported by roughly 10-25x on input. The prompt-cache discount is not reflected.
- **Recommendation:**
  - Record usage for every billed attempt, with its status and attempt number.
  - Store the model the API reports serving, and the cached and reasoning token counts.
  - For unknown models, return a null cost with a warning instead of GPT-4 prices.
  - Add model-family prefix matching, and make the pricing table admin-editable.
- **Effort:** S

## Strengths to preserve

- **LLM text is separated from the data.** In v2 (`lib/wrapped/assemble-wrapped.ts`), the headline slide numbers, section order and payloads all come from code. The LLM contributes only narrative text and an archetype ID.
- **LLM output is validated twice.** Strict `json_schema` structured outputs are used where supported (`lib/wrapped/api-calls.ts:63-71`, `:105-117`), and every response goes through a Zod parse with path-level errors (`lib/wrapped/parse-llm-output.ts:43-58`). Truncation is detected through `finish_reason` and an incomplete-JSON check.
- **Archetype choice is bounded.** The LLM chooses from a ranked shortlist with evidence (`lib/wrapped/archetype-scoring.ts`), which fixed the earlier convergence on "series-devourer". The dedication has a deterministic fallback when the LLM's copy is weak (`assemble-wrapped.ts:38-59`).
- **Derived stats are pure, documented and unit-tested.** The streak calculation compares noon to noon so DST does not cause off-by-one errors (`lib/wrapped/derived-statistics.ts:116-122`).
- **Authorization lives inside the server actions.** `generatePlexWrapped` applies ownership and admin rules, and `getUserPlexWrapped` allows only the user or an admin. Share tokens are generated up front and kept across regenerations.
- **Tautulli history pagination is complete** for the real nested response shape: 1000 rows per page until a short page, so heavy users' years are not truncated.
- **Cost and secrets handling is in place.** LLM API keys are in `ENCRYPTED_FIELDS`, and every successful call writes an `LLMUsage` row with tokens and cost. An `llmDisabled` switch produces a valid v2 Rewind from `mock-data.ts` without any network calls.
- **BullMQ is ready to host a Rewind job.** `lib/queue` already has retries with exponential backoff (`attempts: 3`) and a fan-out pattern in `WATCHLIST_SYNC_ALL`, so little new plumbing is needed.

## Metrics and inventories

### Scope size

| Module | LOC | Notes |
|---|---|---|
| `actions/wrapped-generation.ts` | 471 | Single server action holding the whole pipeline |
| `lib/wrapped/*` (19 modules) | 3,436 | See breakdown below |
| `lib/llm/*` | 337 | Parallel LLM client (chat) with duplicated helpers |
| `types/wrapped.ts` | 256 | Section union collapses to `Record<string, unknown>` |
| `hooks/use-wrapped-polling.ts` | 53 | Dead: only tests import it |
| `lib/connections/tautulli.ts` | 285 | Not used by Rewind; wrapped modules build raw-fetch URLs |

`lib/wrapped` breakdown: tautulli-user-statistics 411, tautulli-leaderboards 366, prompt-template 365, api-calls 261, usage 261, assemble-wrapped 246, server-statistics 205, derived-statistics 187, overseerr-statistics 173, llm 162, archetype-scoring 155, llm-output-schema 140, statistics-types 121, tautulli-library 94, mock-data 90, text-processor 78, parse-llm-output 60, statistics 42, tautulli-statistics 19.

No Tautulli, Plex or Overseerr response is validated with Zod. The Tautulli types are plain TS interfaces.

### Execution model

1. **Entry points.**
   - `WrappedCard` (`components/dashboard/wrapped-card.tsx:137`) is the only live user entry point; `WrappedGenerator` and `WrappedHomeButton` are dead code.
   - Admins have `RegenerateWrappedButton`.
   - The bulk `UserManagement` component calls `generateAllPlexWrapped`, but it is not rendered anywhere.
   - All of these call `generatePlexWrapped`, which is re-exported from `actions/users.ts`.
2. **Synchronous pipeline inside the server action:**
   - Zod-validate `userId` and `year` (2010-2100), then check `wrappedEnabled`, the session and the ownership/admin rules.
   - Upsert the row to status "generating" (the shareToken is created up front).
   - Run the stages one after another:
     - Tautulli `get_users`, then all-time `get_history` pages.
     - The Plex section scan, in parallel with Tautulli `get_libraries`.
     - Overseerr `/user`, plus every `/request` page.
     - Up to 10 sequential `get_item_user_stats` calls, in parallel with `get_home_stats`.
   - Build `WrappedStatistics` and compute the percentile.
   - Render the prompt from the active DB `PromptTemplate`, or the default.
   - Call OpenAI `/v1/chat/completions`. Model names starting with gpt-4o, gpt-4.1, gpt-5, o3 or o4 get strict `json_schema`; all others get `json_object`.
   - Run the Zod parse and `assembleWrappedData`, write the `LLMUsage` row, update the row to "completed", and call `revalidatePath` five times.
3. **Timeouts.** Only the OpenAI call has one (300s default, `LLM_REQUEST_TIMEOUT_MS`). No Tautulli, Plex or Overseerr fetch has one, apart from undici's default of about 300s, and the server action itself has none on self-hosted Node.
4. **User navigates away.** The server keeps running (there is no abort) and the row still completes.
5. **Server restart mid-run.** The row stays "generating" forever. The user UI shows a spinner, polls every 2s with no end and offers no retry. Only the admin user-detail page can regenerate it. There is no stale-row sweeper.
6. **Polling.** `getUserPlexWrapped` is itself a server action. Next's client action queue runs non-navigation actions one at a time (`app-router-instance.js:150-158`), so polls queue behind the in-flight generation. Each poll returns the full row, including the data JSON.
7. **Bulk** (`generateAllPlexWrapped`). One server-action request runs a sequential for-loop over every user with a `plexUserId`. It regenerates Rewinds that are already completed, repeats the server-wide fetches for each user, reports no progress and cannot resume.
8. **Retries, idempotency and caching.** There are no retries or backoff, no idempotency or single-flight, and no caching.

### External calls per user generation

| Service | Call | Count |
|---|---|---|
| Tautulli | `get_users` | 1 |
| Tautulli | `get_history` | ceil(all-time rows / 1000), sequential |
| Tautulli | `get_libraries` | 1 |
| Tautulli | `get_item_user_stats` | up to 10, sequential |
| Tautulli | `get_home_stats` | 1 (all ~11 home-stat cards x 1000 rows) |
| Plex | `/library/sections` | 1 |
| Plex | `/library/sections/{id}/all` | 1 per section |
| Plex | `/library/sections/{id}/all?type=4` | 1 per show section (unpaginated, full Media/Part payloads) |
| Overseerr | `/api/v1/user` | 1 (default `take=10`) |
| Overseerr | `/api/v1/request` | ceil(all server requests / 100) |
| OpenAI | `/v1/chat/completions` | 1 |
| Bulk | all of the above | N users x everything |

**LLM payload sizes:**

| Part | Size |
|---|---|
| System prompt | about 3.9 KB (~1k tokens) |
| User prompt template | 1.3 KB, expanding to about 4-7 KB (~1-2k tokens) |
| Output | about 1-1.5k visible tokens, plus reasoning tokens on GPT-5 and o-series models |

On GPT-5 and o-series models the reasoning tokens count against `max_completion_tokens`, which the form defaults to 6000.

### Stat inventory

**Per-user stats from Tautulli `get_history`.** The request uses the matched `user_id`, `start`/`length=1000` and no date filter. Rows are filtered in code by `(item.date || item.started)` between UTC Jan 1 00:00 and min(now, UTC Dec 31 23:59:59). Minutes per row are `floor((viewed_duration || duration) / 60)`. `viewed_duration` does not exist, and `duration` is `play_duration`, so this yields the watched time. Rows under 1 minute are skipped except where noted.

| Field | Computation | Caveats |
|---|---|---|
| `totalWatchTime.total` / `.movies` / `.shows` | Sum of minutes by `media_type` movie / episode | UTC window (RWP-03) |
| `moviesWatched` | Distinct movie `title` with a play of at least 1 minute | Merged by title; a 1-minute sample counts (RWP-07) |
| `showsWatched` | Distinct `grandparent_title` | Merged by title |
| `episodesWatched` | All episode rows in the window | Sub-minute rows counted, unlike every other stat |
| `topMovies` (up to 10) | Keyed by title: watchTime, playCount (= rows), `year`, rating (`rating \|\| user_rating`), `rating_key`; sorted by playCount, then watchTime | Rating is always undefined; the prompt says "by watch time" |
| `topShows` (up to 10) | Keyed by `grandparent_title`: watchTime, playCount, episodesWatched (= rows), year (the episode's year), `grandparent_rating_key`; sorted by watchTime | |
| `watchTimeByMonth` | Per server-local month of `date`: watchTime plus topMovie/topShow by watchTime | Server-local time |
| `derived.hourHistogram[24]` | Minutes by server-local hour of `started \|\| date` | Server-local time |
| `derived.peakHour` | {hour, label, plays}, by play count | Server-local time |
| `derived.dayOfWeekHistogram` | Minutes, Sunday to Saturday | Server-local time |
| `derived.longestStreak` | {days, start, end}: consecutive server-local dates with plays | Compared noon to noon so DST is safe |
| `derived.mostActiveDay` | {date, watchTime} | |
| `derived.weekendVsWeekday.weekendPct` | Weekend share of minutes | |
| `tautulliUserId` | `get_users` matched by email, then username/friendly_name against the email, then `plex_id`/`user_id == plexUserId` | Match order (RWP-02) |

**Server-wide stats:**

| Field | Computation | Caveats |
|---|---|---|
| `serverStats.serverName` | `PlexServer.name` | |
| `serverStats.totalStorage` / `totalStorageFormatted` | Sum of `Media[].Part[].size` from the Plex `/all` scans | Full rescan per user |
| `serverStats.librarySize` {movies, shows, episodes} | Tautulli `get_libraries` count / child_count | Plex counts are computed, then thrown away |
| `leaderboards.watchTime.leaderboard` | `get_home_stats` top_users rows: `user_id, user, friendly_name, total_duration` | `moviesWatchTime`/`showsWatchTime` always 0; the window is now minus days since UTC Jan 1, so past years run up to today |
| `userPosition` / `totalUsers` / percentile | percentile = ceil(pos / total x 100), clamped to 1-100, shown as "Top X%" | Past-year skew (RWP-05) |
| `leaderboards.topContent.movies[5]` / `shows[5]` | `get_item_user_stats`: userId, username, friendlyName, watchTime, playCount, userPosition (Tautulli's all-time order), totalWatchers | watchTime and playCount always 0; prompt only, never rendered; persisted and shared (RWP-01) |

**Overseerr stats** (year by `createdAt`, UTC):

| Field | Computation | Caveats |
|---|---|---|
| `totalRequests`, `totalServerRequests` | The user's requests, and the server's | All server requests paged per run |
| `approvedRequests` | Status 2 or 3 | 3 is DECLINED; COMPLETED (5) is excluded |
| `pendingRequests` | Status 1 | |
| `topRequestedGenres` | From `req.media.genres` | The field does not exist, so always `[]` |

**LLM-written fields** (Zod-validated):

| Field | Notes |
|---|---|
| `archetype.id` | Enum of 12; the prompt offers a deterministic top-3 shortlist |
| `tagline` | |
| `dedication` | Deterministic fallback if under 40 chars or equal to the tagline |
| `narratives` | opening, totalWatchTime, movies, shows, topMovies, topShows, streaksAndPatterns, monthlyJourney, percentile?, serverStats?, overseerr?, finale |
| `insights.personality`, `insights.topGenre` | topGenre is guessed from titles; neither is rendered in v2 |
| `insights.bingeWatcher`, `insights.discoveryScore` | The LLM applies the formulas itself; not rendered in v2 |
| `insights.funFacts[3-7]` | Rendered; not checked against the stats |
| `summary` | Public share/OG text |

**Archetype scoring** is deterministic, and only the chosen ID is persisted. The signals are:

- late-night share (22:00-03:00)
- show vs movie share
- deepest show episode count
- weekendPct
- peak-hour share (18:00-21:00)
- rewatched top-10 movies
- top-3 show share
- titles per 10 hours
- total hours

credits-roller and premiere-chaser are hard-coded to 0.

**Persisted data:**

- `PlexWrapped`:
  - unique on (userId, year)
  - `data` is TEXT JSON (version 2) holding the full statistics, including the leaderboards, plus up to 14 sections
  - also holds a status string, `error`, `shareToken`, `summary`, `archetype` and `generatedAt`
- `LLMUsage`: one row per successful call only, with the prompt, raw response, tokens and cost.

### Available but unused data

Legend: [IN-HAND] means the field is already present in the `get_history` rows the pipeline downloads. [PRIVACY] means it is sensitive: use it only in aggregate or opt-in, or never.

**Tautulli `get_history` row fields:**

| Field(s) | Tag | Enables |
|---|---|---|
| `percent_complete`, `watched_status` (aware of credits markers) | IN-HAND | Finished vs abandoned plays; credits-roller archetype |
| `started`, `stopped`, `paused_counter` | IN-HAND | Session length, longest sitting, binge sessions (3+ consecutive episodes of one show with gaps under 30 min), pause habits |
| `originally_available_at` | IN-HAND | Days from release to watch; premiere-chaser archetype |
| `media_index`, `parent_media_index` | IN-HAND | Seasons and series completed |
| `platform`, `product`, `player` | IN-HAND; player names PRIVACY | Top device or app |
| `transcode_decision` | IN-HAND | Direct play vs transcode share |
| `location` (lan/wan), `relayed`, `secure` | IN-HAND, PRIVACY | Home vs away viewing |
| `ip_address`, `machine_id` | IN-HAND, PRIVACY | Never surface |
| `live` | IN-HAND | Live TV |
| `guid` | IN-HAND | tmdb/imdb IDs for joining with Overseerr and external metadata |
| `thumb`, `grandparent_thumb`, `group_count`, `full_title`, `original_title` | IN-HAND | Artwork and display titles |

Derivable from these fields: the first and last play of the year, rewatches beyond the top 10, distinct days watched, an hour x weekday heatmap, the quietest month, and the ratio of new titles to comfort rewatches.

**Tautulli commands not used by Rewind:**

| Command | Offers | Note |
|---|---|---|
| `get_metadata` | Genres, directors, writers, actors, studio, content_rating, audience_rating, collections; media_info (resolution, HDR/DV, codecs, audio channels, size, bitrate) | Cache per rating_key across users |
| `get_home_stats` with `stat_id` + `after`/`before` | top_platforms, most_concurrent, popular_movies, popular_tv for the year | |
| `get_user_player_stats` | Per-user player stats | All-time only |
| `get_user_watch_time_stats` | Per-user watch time | Takes `query_days` |
| `get_item_watch_time_stats`, `get_library_watch_time_stats` | Per-item and per-library watch time | |
| `get_plays_by_hourofday` / `dayofweek` / `per_month` / `source_resolution` / `stream_resolution` / `stream_type` / `top_10_platforms` | Accept `user_id` | Relative `time_range` only, so exact only for the current year |
| `get_concurrent_streams_by_stream_type` | Concurrency | |
| `get_stream_data` | Per-stream detail | Expensive |
| `get_user_ips`, `get_geoip_lookup` | IPs and geolocation | PRIVACY: do not use |

**Plex** (already scanned in `server-statistics`, then discarded):

- Per item: Genre, Director, Writer, Role and Country tags; `contentRating`, `audienceRating`, `originallyAvailableAt`, `addedAt`; `Media.videoResolution`, codec and bitrate; `Part.size` (per-title size, enabling stats like "you streamed X TB").
- `/library/metadata/{ratingKey}` for full credits.
- `/status/sessions/history/all`: Plex-native history, usable as a fallback when Tautulli is absent.
- `userRating`, through the user's own token.

**Overseerr:**

- Request type, `is4k`, seasons.
- Request-to-available latency (`createdAt` to `media.mediaAddedAt`).
- The status timeline.
- The share of requested titles that were then watched (join tmdbId with the history `guid`).
- Genres, runtime and posters via `/api/v1/{movie|tv}/{tmdbId}` (`getOverseerrMediaDetails` already exists).
- The `/request?requestedBy=` filter.

**Sonarr/Radarr** (the clients exist but are unused): `downloadFolderImported` history events (server additions and TB growth this year), `sizeOnDisk` and quality per title, and new episodes delivered.

**Jellyfin:** no history source is wired up. It would need the Playback Reporting plugin (`/user_usage_stats/*`) or `/Users/{id}/Items?IsPlayed=true&Fields=UserData` (LastPlayedDate, PlayCount).

**Other users' data:** [PRIVACY]. Show only the viewer's rank and percentile, and never persist other users' names or watch time.

### Robustness checklist

| Area | Current state |
|---|---|
| History pagination | Complete, but pulls all-time history. A flat-array response would stop after page 1 (`recordsTotal` undefined, treated as 0). |
| Caps | Top lists 10; content leaderboards 5+5; home stats 1000 users; Overseerr `/user` 10 (this one truncates). |
| Timezone | UTC window vs server-local buckets; the Docker image sets no TZ, so everything is UTC. |
| Year | `/wrapped` uses the calendar year; generation uses the configured `wrappedYear`. |
| Little or no data | No gate; the LLM is always called. |
| Jellyfin | Always fails. |
| Upstream failures | A Tautulli failure aborts the run; Plex, Overseerr and leaderboard failures silently drop sections; no timeouts; no retries. |
| LLM schema failure | Hard fail; billed tokens are not recorded; no repair or deterministic fallback. |
| Concurrency | Concurrent runs both bill and race on the final write. |
| Cost | Unknown models priced at GPT-4 rates ($30/$60 per 1M tokens); cached-token discount ignored; the stored model is the configured name, not the served model. |

## Appendix: Investigated and ruled out

No finding was refuted in full. Each line below is a sub-claim that a verifier or the refutation pass ruled out or corrected. The parent finding stands with the adjustment.

- **RWP-01, owner email leaks via `user.name || user.email`:** ruled out as a live leak. Every user-creation path sets `name` (`lib/auth.ts:206`, `:230`; `actions/invite.ts:334`, `:746`; the Jellyfin path; `import-plex-users.ts:78`). The fallback is kept only as hardening.
- **RWP-02, "a changed Plex email triggers the roster leak":** ruled out. Matching falls back to `plex_id`/`user_id`, which equals the Plex account ID. The error fires only when the user is absent from Tautulli's user list.
- **RWP-04, admin bulk generation in January creates next-year rows:** that path is unreachable. `UserManagement` is not imported anywhere. The same effect still happens through `RegenerateWrappedButton`'s calendar-year default.
- **RWP-05, the per-title leaderboard is shown to users:** ruled out. It is used only in the prompt, which drops the top-watcher line when watchTime is 0. `type=duration` on `get_home_stats` is ignored but harmless.
- **RWP-07, watch-time totals are wrong because `viewed_duration` does not exist:** ruled out. `duration` is Tautulli's `play_duration`, so the totals are correct. Only the comments and types are wrong.
- **RWP-09, the double fetch halves the threshold to about 50 views:** corrected to about 100 views, because React request memoization collapses the `generateMetadata` and page fetches.
- **RWP-10, "the chatbot receives Tautulli error payloads reported as success":** ruled out. For an unknown command Tautulli returns HTTP 400, which the client's `!response.ok` catches.
- **RWP-11, "a hung upstream hangs generation indefinitely":** ruled out. undici's default headers and body timeouts (about 300s) apply.
- **RWP-11, "no way to recover a stuck row from the UI":** ruled out for admins. `app/admin/users/[userId]/page.tsx:245` always renders Regenerate.
- **RWP-11, severity high:** lowered to medium by the refutation pass. The feature works in the normal case and no data is corrupted.
- **RWP-13, the action ID is trivially discoverable from client JS:** ruled out, because no client component imports it. It is still extractable from public GHCR images.
- **RWP-15, "every GPT-5 generation fails on temperature":** downgraded to plausible. It depends on the model variant and the reasoning-effort setting.
- **RWP-16, displayed discoveryScore, bingeWatcher and topGenre contradict the data:** ruled out for v2. Those fields are rendered only by the legacy (v1) section renderer.
- **RWP-19, empty-history deck of 10-14 slides:** corrected to about 8-11 slides. The top movies, top shows and monthly slides drop out.
- **RWP-22, severity medium:** lowered to low. Only an admin-facing cost estimate is affected, and OpenAI billing is authoritative.
