# Privacy: personal data and member removal

This is the inventory of the personal data Plex Manager stores, and what happens to each piece when an admin removes a member. It updates the October 2026 audit's inventory (`.agents/planning/2026-10-17-app-audit-and-rewind-2026/research/additional-findings.md`, "Privacy: personal-data inventory") for the Rewind 2026 (v3) models and every column added since.

The inventory drives member removal (`lib/members/erase.ts`), the member export (`lib/members/export.ts`), and later the retention jobs. A test (`__tests__/docs/privacy-inventory.test.ts`) fails when a model in `prisma/schema.prisma` is missing from the tables below, so a new table or personal-data column updates this file in the same pull request.

## Removing a member

An admin removes a member from the danger zone on their page (`/admin/users/<id>`, Overview tab). The dialog first runs a dry run and lists what will happen and how many rows each table holds. The admin then types the member's display name to confirm. The action (`removeMember` in `actions/admin/member-access.ts`) is limited to 10 an hour per admin.

Removal is refused for:

- the admin's own account;
- the Plex server owner;
- the last admin;
- a member whose Rewind is queued or being made. Remove them once it finishes.

Removal runs in this order:

1. **Outside the database**, each recorded in the result:
   - an `ACTIVE` or `PAST_DUE` Stripe subscription is cancelled at once (not at period end);
   - the Plex share of the active server is removed, and the Jellyfin account is disabled. A Jellyfin administrator is never disabled, so removal stops and asks the admin to remove that role in Jellyfin first;
   - the Discord linked role is cleared, and the Discord OAuth grant is revoked at Discord (`POST /oauth2/token/revoke`);
   - every session ends, and the member's waiting jobs (watchlist sync, Discord role sync) are removed.
2. **One database transaction:**
   - Discord command log rows, chat sessions and pending selections, by app user id and by Discord id;
   - prompts and responses of LLM rows that admins generated about the member (for example an admin regeneration of their Rewind) are set to null, keeping tokens and cost;
   - the `User` row is deleted, and the rest cascades;
   - one `MEMBER_ERASED` audit row is written.

If Stripe, Plex or Jellyfin fails, removal stops before the transaction with a code and nothing in the database changes. Every step is idempotent, so running the removal again finishes it.

### What removal keeps

- **Audit entries.** `AuditLog` rows keep user ids only. `MEMBER_ERASED` holds the member's id, the row counts, the outcome of each external step and the Stripe customer id, so the owner can still find the billing record in Stripe. It holds no name or email.
- **Stripe's own records.** Stripe keeps the customer, invoices and the cancelled subscription; delete those in the Stripe dashboard if the member asks.
- **Media server history.** Plex, Jellyfin and Tautulli keep their own accounts and watch history, outside this app. Removal unshares Plex and disables Jellyfin; it does not delete accounts or history there.
- **Server logs.** Lines already written to stdout stay until the operator's log rotation removes them.
- **Admin ids on server content.** An admin's id on invites, announcements, prompt templates and eval runs (`createdBy`, `updatedBy`) stays after that admin is removed. It is no longer linked to a person.

### Losing access without removal

Unsharing a member (`unshareUserLibrary`) and the Stripe revoke job (`PLEX_ACCESS_REVOKE`) also turn the member's watchlist sync off and clear their stored plex.tv token, then end their sessions. The watchlist sync refuses a member without access with the skip code `NO_ACCESS`. Unlinking Discord revokes the grant at Discord and deletes the member's assistant chat sessions for that Discord account.

## Admin access

Admins can see each member's watch activity and Rewind (and its past versions), the assistant conversations stored in `LLMUsage` (prompts, responses and tool results), Discord command history (assistant messages as a length only), media marks and watchlist sync history. Opening one member's content writes `MEMBER_CONTENT_VIEWED` (once an hour per admin, member and page); pages that list every member's content write `MEMBER_CONTENT_LISTED`; unsharing, importing members and regenerating a Rewind are audited too. `AuditLog` rows are kept for 400 days (P11.14).

## Your data: export and single deletes

A member downloads their data from Account, Your data ("Download my data", `/account/export`). The file is JSON (`format: "plex-manager-member-export"`, `version: 1`), checked against a strict schema (`MemberExportV1` in `lib/members/export-schema.ts`) so nothing outside it reaches the file: no token, token hash, share asset key, Stripe id or Discord token. It is limited to three a day per member, and a member whose membership lapsed can still download it.

What each model of the "Member data" table below becomes in the export (`EXPORT_COVERAGE`; a test fails when a model there has no entry):

- `User`: `profile` (name, email, image, services, Plex and Jellyfin user ids, time zone, joined date). Never `plexAuthToken`.
- `PlexWrapped`: `rewinds`, one per year with edition, status, generated date and data. Rewind 2026 data is copied as stored; older years go through the stored-Rewind parser.
- `RewindPrefs`: `rewindPrefs`.
- `RewindExclusion`: `rewindExclusions` (the titles hidden from the Rewind).
- `RewindShare`: `rewindShares` (pages, signed, options, dates and status), without the token hash or asset key.
- `UserMediaMark`: `marks`.
- `WatchlistSyncSettings` and `WatchlistSyncHistory`: `watchlist` (settings and history).
- `Subscription`: `subscription` (status, plan name, period end, cancel date), without Stripe ids.
- `DiscordConnection`: `discord` (username, display name, link date), without tokens.
- `LLMUsage` and `ChatConversation`: `assistantConversations`, the newest 500 assistant calls that still have text, by conversation. Rewind generation rows are not listed; the Rewind they wrote is in `rewinds`.
- `DiscordCommandLog`: `discordCommands`, metadata only (command, channel type, status, message length, time).
- Left out, with the reason recorded in `EXPORT_COVERAGE`: `RewindGeneration` (run records; the Rewind is in `rewinds`), `RewindShareVisitDay` (visit counts of a link), `RewindView` (reading progress for the season totals), `WrappedShareVisit` (data about visitors), `DiscordChatSession` (a working copy of the assistant turns), `DiscordOAuthState` and `DiscordPendingSelection` (expire within minutes), `InviteUsage` (which invite admitted the member) and `AuditLog` (the operator's security record).

On the same page a member can delete, one at a time and only their own (`actions/member-data.ts`, 60 an hour):

- a mark (Discord `/mymarks` links here; there is no `/unmark`);
- a watchlist history item. If the title is still on their Plex watchlist, the next sync can request it again;
- an assistant conversation. The `ChatConversation` row and its Discord chat session are deleted, and its `LLMUsage` rows lose their prompt and response but keep tokens and cost.

Share links and hidden titles keep their own controls on the Rewind.

## Retention

A daily sweep (`lib/queue/jobs/retention.ts`) removes personal data once it is older than its window. It runs at 03:30 in the server zone on the job queue; without Redis, one app process runs it under the `retention` database lease when the last run is more than 24 hours old. Each window can be changed with its `RETENTION_<NAME>_DAYS` variable (`lib/retention/policy.ts`, at least 1 day). **Admin → Settings → Privacy** lists the windows and the last run with its counts per rule, and **Run now** runs the sweep at once (audited as `RETENTION_RUN`). The sweep never touches a row before its window ends, and running it twice removes nothing more.

| Data | Kept for | Then | Variable |
|---|---|---|---|
| Rewind AI text (`LLMUsage` rows with no conversation, or tied to a Rewind) | 120 days | `prompt` and `response` set to null; tokens, cost and model kept (design 7.10) | `RETENTION_REWIND_LLM_TEXT_DAYS` |
| Assistant AI text (`LLMUsage` rows in a conversation) | 90 days | `prompt` and `response` set to null; tokens, cost and model kept | `RETENTION_ASSISTANT_LLM_TEXT_DAYS` |
| Assistant conversations (`ChatConversation`) | 180 days after it ends | Deleted; its `LLMUsage` rows keep their cost without the link, and its Discord sessions go with it. A conversation ends on an idle or manual reset, or when its Discord session is deleted | `RETENTION_CHAT_CONVERSATION_DAYS` |
| Discord chat turns (`DiscordChatSession.messages`) | 1 idle day | `messages` emptied | `RETENTION_DISCORD_CHAT_MESSAGES_DAYS` |
| Discord chat sessions (`DiscordChatSession`) | 30 idle days | Deleted, and its conversation ended | `RETENTION_DISCORD_CHAT_SESSION_DAYS` |
| Discord command arguments (`DiscordCommandLog.commandArgs`) | 7 days | `commandArgs` set to null | `RETENTION_DISCORD_COMMAND_ARGS_DAYS` |
| Discord command log (`DiscordCommandLog`) | 90 days | Deleted | `RETENTION_DISCORD_COMMAND_LOG_DAYS` |
| Share-link visit counts (`RewindShareVisitDay`) | 90 days | Deleted (design 6.2) | `RETENTION_SHARE_VISITS_DAYS` |
| Rewind reading records (`RewindView`) | 120 days | Deleted (design 7.10) | `RETENTION_REWIND_VIEW_DAYS` |
| Titles removed from a watchlist (`WatchlistSyncHistory`) | 30 days after the sync saw them gone | Deleted. A complete watchlist read marks missing titles `REMOVED_FROM_WATCHLIST`; other rows stay while the member has sync | `RETENTION_WATCHLIST_REMOVED_DAYS` |
| Discord link attempts (`DiscordOAuthState`) | 1 day after it expires | Deleted | `RETENTION_DISCORD_OAUTH_STATE_DAYS` |
| Parked Discord searches (`DiscordPendingSelection`) | until it expires | Deleted | none |
| Replaced Rewinds (`RewindGeneration.previousData`) | until 30 June after its season (2026's until 2027-06-30) | Set to null; the one rollback is then gone (design 7.9) | none |
| Audit log (`AuditLog`) | 400 days | Deleted; this is the only way audit rows are removed | `RETENTION_AUDIT_LOG_DAYS` |

Every other row in the member tables below is kept while the member is, and goes when they are removed. `WrappedShareVisit` (v2 share visits) is deleted with its Rewind. Server logs are kept for as long as the operator's log rotation keeps them.

### Stored tokens

- **`User.plexAuthToken`** (the member's plex.tv token): kept while the member has access, and cleared on unshare, the Stripe revoke and removal.
- **`DiscordConnection` access and refresh tokens**: kept until the member unlinks, and revoked at Discord on unlink and on removal.
- **Invite codes** (`Invite.code`): kept until the invite is deleted. Admins see them to share them, so they are not hashed.
- **Rewind share tokens**: stored only as SHA-256 hashes (`RewindShare.tokenHash`); the token itself is never stored.
- **Service keys** (Plex, Jellyfin, Tautulli, Overseerr, Sonarr, Radarr, LLM providers, Stripe, Discord app): kept until an admin replaces them.
- Every secret column is encrypted at rest when `ENCRYPTION_KEY` is set (the last column of the tables below).

## Inventory

Readers: M is the member, A is admins, P is the public. "Cascade" means the row is deleted with the `User` row.

### Member data

| Model | Personal data | Readers | Removal does | Encrypted at rest |
|---|---|---|---|---|
| `User` | name, email, image, `plexUserId`, `jellyfinUserId`, `primaryAuthService`, `timezone`, exemption note, role, `disabledAt`; `plexAuthToken` (credential) | M own; A users list and detail; P name and image on a signed share | Deleted. Unshare and the Stripe revoke clear `plexAuthToken` | `plexAuthToken` when `ENCRYPTION_KEY` is set |
| `PlexWrapped` | the member's Rewind: viewing history facts, LLM copy, summary, archetype, legacy share token | M viewer; A Rewind pages; P published pages of a share | Cascade | No |
| `RewindGeneration` | run status, error code, `previousData` (the replaced Rewind) | A Rewind history | Cascade | No |
| `RewindShare` | published page list, card facts, token hash and asset key | M sharing panel; P the public link | Cascade (through `PlexWrapped`); the link returns 404 | Token stored as a SHA-256 hash only |
| `RewindShareVisitDay` | daily visit counts of a share link, no visitor data | M | Cascade | No |
| `RewindView` | when the member opened their Rewind, how far they read, share actions; no IP | A season dashboard (aggregates) | Cascade | No |
| `RewindPrefs` | sharing and notification choices per year | M | Cascade | No |
| `RewindExclusion` | titles the member hid from their Rewind | M | Cascade | No |
| `WrappedShareVisit` | v2 share visits: hashed IP, user agent, referer of visitors | none | Cascade (through `PlexWrapped`) | IP is a salted hash |
| `LLMUsage` | prompt and response text (viewing stats, assistant turns, tool output), tokens, cost, model | A LLM usage pages, conversation page, Rewind history | Cascade for the member's rows; admins' rows about the member keep cost but lose their text | No |
| `ChatConversation` | which member a conversation belongs to, start and end | A via LLM usage | Cascade | No |
| `DiscordConnection` | Discord id, username, global name, avatar; access and refresh tokens | M link panel; A user detail | Grant revoked at Discord, then deleted (also on unlink) | Tokens when `ENCRYPTION_KEY` is set |
| `DiscordChatSession` | the last assistant turns of a Discord chat, Discord id, channel id | none (LLM context only) | Deleted by Discord id, and through `ChatConversation` (also on unlink) | No |
| `DiscordOAuthState` | a pending link attempt and its redirect | none | Cascade | No |
| `DiscordPendingSelection` | a parked `/mark` search for a Discord id | none | Deleted by Discord id | No |
| `DiscordCommandLog` | Discord id and username, linked user id, command name and arguments (assistant messages as a length only, `argsLength`), channel and guild | A Discord activity, user timeline | Deleted by user id and by Discord id. If a `User` row is deleted any other way, the foreign key sets `userId` to null | No |
| `UserMediaMark` | titles the member marked and how | M `/mymarks`; A marked media, timeline | Cascade | No |
| `WatchlistSyncSettings` | sync choice, last result and counters | M card; A counts | Cascade. Unshare and the Stripe revoke turn sync off | No |
| `WatchlistSyncHistory` | titles from the member's private Plex watchlist and their request status | M recent items; A recent items | Cascade | No |
| `InviteUsage` | which invite the member redeemed, and when | A invite detail | Cascade | No |
| `Subscription` | Stripe customer and subscription ids, status, plan, period end, cancel date, Plex invite status, Jellyfin access status, access skip code | M status; A users list, billing tab | Stripe subscription cancelled at once, then cascade; the customer id goes to the audit row | No |
| `AuditLog` | actor and target user ids, event details (ids and counts, never secrets) | none in the app; the operator | Kept (ids only) | No |

### Server data with no member's personal data

These hold configuration, credentials for the services the app talks to, cached media metadata or server-wide aggregates. Removal does not touch them.

| Model | Holds | Encrypted at rest |
|---|---|---|
| `Setup` | first-run wizard progress | No |
| `PlexServer` | server URL, owner token, owner's Plex id (`adminPlexUserId`) | `token` |
| `JellyfinServer` | server URL, API key, admin's Jellyfin id | `apiKey` |
| `Tautulli` | URL and API key | `apiKey` |
| `Overseerr` | URL and API key | `apiKey` |
| `Sonarr` | URL and API key | `apiKey` |
| `Radarr` | URL and API key | `apiKey` |
| `Prometheus` | URL | No |
| `LLMProvider` | provider, model and API key | `apiKey` |
| `Config` | app settings, Stripe keys, Rewind settings | `stripeSecretKey`, `stripeWebhookSecret`, `rewindSerialKey` |
| `DiscordIntegration` | Discord app credentials and bot settings; `updatedBy` admin id | `clientSecret`, `botToken` |
| `LeaseLock` | which instance holds each lease (Discord bot, watchlist sync, retention) and until when | No |
| `RewindServerAggregate` | server-wide yearly totals, no per-member rows | No |
| `MediaMetadataCache` | Plex metadata per title | No |
| `RewindEvalRun` | Rewind copy eval results on fixture data; `createdBy` admin id | No |
| `RewindBatch` | provider batch submissions for the final cut | No |
| `PromptTemplate` | prompt text; `updatedBy` admin id | No |
| `Invite` | invite codes and library settings; `createdBy` admin id | No |
| `Announcement` | announcement text; `createdBy` admin id | No |
| `StripeEvent` | Stripe event ids and types, for webhook idempotency | No |
