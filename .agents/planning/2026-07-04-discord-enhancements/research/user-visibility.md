# Research: User-Facing Visibility Options

_Goal: "more visibility for users on the server." Today everything is admin-only;
users see only a "Connected as X" card (`components/dashboard/discord-card.tsx`)._

## Per-user data ALREADY captured (reuse, don't rebuild)
| Model | Useful per-user fields | Notes |
|---|---|---|
| **DiscordCommandLog** (`schema:504`) | `userId`, `commandType/Name/Args`, `status`, `responseTimeMs`, timestamps | Indexed on `userId` → cheap per-user queries |
| **UserMediaMark** (`schema:408`) | `title`, `year`, `markType` (6 types), `markedAt`, `markedVia`, `radarr/sonarrTitleSlug` | Indexed `[userId, mediaType]`; slugs deep-link to *arr |
| **UserWatchIntent** (`schema:449`) | watchlist/progress (`PLAN_TO_WATCH`…`COMPLETED`), priority, season/episode | **Exists but surfaced NOWHERE** — latent feature |
| **DiscordConnection** (`schema:297`) | `expiresAt`, `metadataSyncedAt`, `linkedAt`, `lastError` | Linking-health signals; `expiresAt` not shown today |
| **ChatConversation / DiscordChatSession** | count, `lastMessageAt`, `isActive` | Per-user, scoped `[discordUserId, channelId]` |
| **PlexWrapped** (`schema:172`) | full year stats JSON, share token | Existing "Wrapped" feature |

- **Watch stats** are computed on-demand from Tautulli by
  `fetchTautulliStatistics` (`lib/wrapped/tautulli-user-statistics.ts:27`):
  total/movies/shows watch time & counts, `topMovies`/`topShows`,
  `watchTimeByMonth`, `derived` (streak, peak hour, histograms, weekend %).
- **Community/leaderboard** functions already exist in
  `lib/wrapped/tautulli-leaderboards.ts`: `fetchWatchTimeLeaderboard` (`:105`),
  `fetchItemLeaderboard` (`:25`), `fetchTopContentLeaderboards` (`:236`, already
  computes `userPosition` + `totalWatchers`), + `computePercentile`
  (`derived-statistics.ts:180`) → "Top X%" labels.

## ⭐ Single most important reuse finding
`getUserActivityTimeline(userId)` (`actions/user-queries.ts:637`) **already merges
`DiscordCommandLog` + `UserMediaMark`** into one paginated, timestamp-sorted feed
with typed items — exactly the "your Discord activity" view. It's just
`requireAdmin()`-gated (`:641`). A `getMyActivityTimeline()` sibling that drops
the admin check and hard-scopes `userId = session.user.id` (like `getUserMediaMarks`
in `user-marks.ts:19` already does) unlocks most of Surface A cheaply.

## Surface A — In-app (Next.js)
Dashboard (`components/dashboard/user-dashboard.tsx`) has "Quick Links / Features /
Membership" sections; **no `/media` route exists yet** (`revalidatePath("/media")`
in `user-marks.ts:105` points at nothing → greenfield).
- **A2 Personal marks list** — `getUserMediaMarks` **already self-scopes**; delete
  already wired (`deleteUserMediaMark`). *Lowest effort, high value.*
- **A1 Personal activity feed** — un-gate/clone `getUserActivityTimeline`. Low
  effort, high value.
- **A3 Year-round watch stats** — reuse `fetchTautulliStatistics` +
  `computeDerivedStatistics` on a rolling window, decoupled from the Wrapped
  season gate; cache (Tautulli full-history fetch is expensive). Med/high.
- **A4 Linking health** — surface `expiresAt`/`lastError` (already in DB;
  `page.tsx:93-101` omits them) → amber card when re-link needed. Low.
- **A5 Linked Role status** — surface `metadataSyncedAt` + existing "Force
  resync" + `isOnServer` warning. Mostly copy/visibility. Low.

## Surface B — In-Discord (bot)
All handlers already resolve identity via `verifyDiscordUser` (`services.ts:81`,
returns `plexUserId`/`email`/`isAdmin`) → per-user scoping is trivial.
- **B1 `/mystats`** — personal watch-stats embed; reply **ephemeral / DM**;
  route through `sanitizeDiscordResponse`. Med.
- **B2 `/watching`** — user's OWN current sessions (needs a small new Tautulli
  `get_activity` wrapper). Others' sessions → admin/opt-in. Med.
- **B3 `/mymarks`** — recall personal marks in Discord (pure DB read). Low.
- **B4 Server "what's popular" (no names)** — reuse `fetchWatchTimeLeaderboard`;
  title-level aggregates safe in a public channel. Med.
- **B5 Named leaderboards** — highest sensitivity (identity ↔ viewing volume) →
  opt-in required. High.

## Privacy / consent — the sensitivity gradient
1. **Your own data shown to you** (A1–5, B1–3): always safe — hard-scope to
   `session.user.id` / resolved `userId`.
2. **Title-level aggregates, no names** (B4): low sensitivity — safe in public.
3. **Your own rank, no other names** (B1 + `computePercentile`, "Top 5%"): safe.
4. **Named leaderboards / others' sessions** (B2 others, B5): **opt-in.**

- **No consent flag exists in the schema.** For tier 4, add `User.leaderboardOptIn`
  (default false) or an admin/server toggle (like `Config.wrappedEnabled` /
  `DiscordIntegration.botEnabled`) so the operator decides if the community
  feature is on at all — consistent with every other opt-in feature.
- **Reuse existing PII posture:** route new bot embeds through
  `sanitizeDiscordResponse`; keep the `(discordUserId, channelId)` session scoping
  discipline; reuse the "details removed for privacy" degradation pattern
  (`services.ts:227-229`).

## Reuse map — parameterize `audit.ts` by `userId`
`getCommandLogs` (`audit.ts:147`) **already accepts `userId`**. Add optional
`userId?` to the aggregate `where` clauses to make them serve both dashboards:
| Function | line | User-facing |
|---|---|---|
| `getSummaryStats` | 377 | "Your Discord activity: N cmds, X% success" |
| `getMediaMarkingBreakdown` | 565 | your most-marked titles |
| `getDailyActivity` | 269 | personal sparkline |
| `getActiveUsers` | 330 | **admin-only** (enumerates users) |
| linking/error/help/selection | — | keep admin-only |

## Effort/value ranking
| Option | Effort | Value |
|---|---|---|
| A2 personal marks | Very low | High |
| A1 personal activity feed | Low | High |
| A4/A5 linking health + role | Low | Medium |
| B3 `/mymarks` | Low | Medium |
| A3 year-round stats | Medium | High |
| B1 `/mystats` | Medium | High |
| B4 server "popular" (no names) | Medium | Medium |
| B2 `/watching` (own) | Medium | Medium |
| B5 named leaderboards | High | Medium |

### Continuation
User-visibility research agent kept alive: `a5e610b03c3e6336f`.
