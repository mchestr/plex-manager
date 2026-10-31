# Privacy: personal data and member removal

This is the inventory of the personal data Plex Manager stores, and what happens to each piece when an admin removes a member.

The inventory drives member removal (`lib/members/erase.ts`) and the retention jobs. A test (`__tests__/docs/privacy-inventory.test.ts`) fails when a model in `prisma/schema.prisma` is missing from the tables below, so a new table or personal-data column updates this file in the same pull request.

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
   - the member's unused affiliate invites are deleted;
   - the `User` row is deleted, and the rest cascades;
   - one `MEMBER_ERASED` audit row is written.

If Stripe, Plex or Jellyfin fails, removal stops before the transaction with a code and nothing in the database changes. Every step is idempotent, so running the removal again finishes it.

### What removal keeps

- **Audit entries.** `AuditLog` rows keep user ids only. `MEMBER_ERASED` holds the member's id, the row counts, the outcome of each external step and the Stripe customer id, so the owner can still find the billing record in Stripe. It holds no name or email.
- **Stripe's own records.** Stripe keeps the customer, invoices and the cancelled subscription; delete those in the Stripe dashboard if the member asks.
- **Media server history.** Plex, Jellyfin and Tautulli keep their own accounts and watch history, outside this app. Removal unshares Plex and disables Jellyfin; it does not delete accounts or history there.
- **Server logs.** Lines already written to stdout stay until the operator's log rotation removes them.
- **Used affiliate invites.** An affiliate invite that someone joined with is that member's join record, so it stays. When the affiliate is removed, its `affiliateUserId` is set to null. When the invitee is removed, its `joinedUserId` is set to null, so only the join date is left. Its label is already gone, since it is nulled on use.
- **Admin ids on server content.** An admin's id on invites, announcements and prompt templates (`createdBy`, `updatedBy`) stays after that admin is removed. It is no longer linked to a person.

### Losing access without removal

Unsharing a member (`unshareUserLibrary`), the inactivity sweep (`lib/inactivity/sweep.ts`, which unshares the same way) and the Stripe revoke job (`PLEX_ACCESS_REVOKE`) also turn the member's watchlist sync off and clear their stored plex.tv token, then end their sessions. The watchlist sync refuses a member without access with the skip code `NO_ACCESS`. Unlinking Discord revokes the grant at Discord and deletes the member's assistant chat sessions for that Discord account.

## Admin access

Admins can see each member's watch activity and Rewind (and its past versions), the assistant conversations stored in `LLMUsage` (prompts, responses and tool results; the assistant page's own history shows each user only their own conversations), Discord command history (assistant messages as a length only), media marks and watchlist sync history. Opening one member's content writes `MEMBER_CONTENT_VIEWED` (once an hour per admin, member and page); pages that list every member's content write `MEMBER_CONTENT_LISTED`; unsharing, importing members and regenerating a Rewind are audited too. Admins and Support users read the audit trail in **Admin > Audit log**; only admins see an event's stored details, and opening the page writes `AUDIT_LOG_VIEWED` (once an hour per viewer). `AuditLog` rows are kept for 400 days (P11.14).

## Your data: single deletes

From Account, Your data, a member can delete, one at a time and only their own (`actions/member-data.ts`, 60 an hour):

- a mark (Discord `/mymarks` links here; there is no `/unmark`); and
- a watchlist history item. If the title is still on their Plex watchlist, the next sync can request it again.

A member's Discord assistant conversations cannot be deleted by the member; the retention sweep below removes them. Share links and hidden titles keep their own controls on the Rewind.

## Assistant page history

The admin assistant (`/admin/assistant`) keeps each conversation's questions and answers (`ChatConversationMessage`, encrypted at rest) so its owner can reopen it; nobody else sees that history there. An admin or Support user deletes their own conversations from it, where their newest 100 are listed (`deleteAssistantConversation`, 60 an hour): the messages and title go at once and the conversation ends. The conversation's `LLMUsage` rows are not touched, so admins can still read its calls on the LLM usage pages until the assistant AI text window below clears them, and the day's spend caps keep counting their cost. A conversation idle past its window leaves the history the same way, and so does every conversation of an admin who is demoted (`updateUserAdminStatus`), so a role never reads answers built from tool output only an admin may see.

## Retention

A daily sweep (`lib/queue/jobs/retention.ts`) removes personal data once it is older than its window. It runs at 03:30 in the server zone on the job queue; without Redis, one app process runs it under the `retention` database lease when the last run is more than 24 hours old. Each window can be changed with its `RETENTION_<NAME>_DAYS` variable (`lib/retention/policy.ts`, at least 1 day). **Admin → Settings → Privacy** shows when the sweep last finished. The sweep never touches a row before its window ends, and running it twice removes nothing more.

| Data | Kept for | Then | Variable |
|---|---|---|---|
| Rewind AI text (`LLMUsage` rows with no conversation, or tied to a Rewind) | 120 days | `prompt` and `response` set to null; tokens, cost and model kept | `RETENTION_REWIND_LLM_TEXT_DAYS` |
| Assistant AI text (`LLMUsage` rows in a conversation) | 90 days | `prompt` and `response` set to null; tokens, cost and model kept | `RETENTION_ASSISTANT_LLM_TEXT_DAYS` |
| Assistant page history (`ChatConversation.title`, `ChatConversationMessage`) | 90 days after its last message, or after it started when no turn was stored (a first reply that failed, or a side-panel conversation from before the page) | Messages and title removed, and the conversation ended | `RETENTION_ASSISTANT_CHAT_DAYS` |
| Assistant conversations (`ChatConversation`) | 180 days after it ends | Deleted; its `LLMUsage` rows keep their cost without the link, and its Discord sessions go with it. A conversation ends on an idle or manual reset, when its Discord session is deleted, when it is deleted from the assistant page or idle there past its window, or, for an assistant page conversation, when its owner stops being an admin | `RETENTION_CHAT_CONVERSATION_DAYS` |
| Discord chat turns (`DiscordChatSession.messages`) | 1 idle day | `messages` emptied | `RETENTION_DISCORD_CHAT_MESSAGES_DAYS` |
| Discord chat sessions (`DiscordChatSession`) | 30 idle days | Deleted, and its conversation ended | `RETENTION_DISCORD_CHAT_SESSION_DAYS` |
| Discord command arguments (`DiscordCommandLog.commandArgs`) | 7 days | `commandArgs` set to null | `RETENTION_DISCORD_COMMAND_ARGS_DAYS` |
| Discord command log (`DiscordCommandLog`) | 90 days | Deleted | `RETENTION_DISCORD_COMMAND_LOG_DAYS` |
| Share-link visit counts (`RewindShareVisitDay`) | 90 days | Deleted | `RETENTION_SHARE_VISITS_DAYS` |
| Rewind reading records (`RewindView`) | 120 days | Deleted | `RETENTION_REWIND_VIEW_DAYS` |
| Titles removed from a watchlist (`WatchlistSyncHistory`) | 30 days after the sync saw them gone | Deleted. A complete watchlist read marks missing titles `REMOVED_FROM_WATCHLIST`; other rows stay while the member has sync | `RETENTION_WATCHLIST_REMOVED_DAYS` |
| Discord link attempts (`DiscordOAuthState`) | 1 day after it expires | Deleted | `RETENTION_DISCORD_OAUTH_STATE_DAYS` |
| Parked Discord searches (`DiscordPendingSelection`) | until it expires | Deleted | none |
| Replaced Rewinds (`RewindGeneration.previousData`) | until 30 June after its season (2026's until 2027-06-30) | Set to null; the one rollback is then gone | none |
| Audit log (`AuditLog`) | 400 days | Deleted; this is the only way audit rows are removed | `RETENTION_AUDIT_LOG_DAYS` |
| Ended affiliate applications (`AffiliateApplication`: refused, revoked, ended or closed) | 365 days after their last date, and never less than 30 days, so a refusal stays for its 30-day wait before the member can apply again | Deleted. Pending and approved applications stay | `RETENTION_AFFILIATE_DAYS` |
| Unused affiliate invites (`Invite` of kind `AFFILIATE` that nobody joined with) | 365 days after it is cancelled or expires | Deleted. Used affiliate invites and admin invites stay | `RETENTION_AFFILIATE_DAYS` |
| Affiliate invite labels (`Invite.label`) | until the invite is used, cancelled or expires | Set to null | none |

Every other row in the member tables below is kept while the member is, and goes when they are removed. `WrappedShareVisit` (v2 share visits) is deleted with its Rewind. Server logs are kept for as long as the operator's log rotation keeps them.

### Stored tokens

- **`User.plexAuthToken`** (the member's plex.tv token): kept while the member has access, and cleared on unshare, the Stripe revoke and removal.
- **`DiscordConnection` access and refresh tokens**: kept until the member unlinks, and revoked at Discord on unlink and on removal.
- **Invite codes** (`Invite.code`): kept until the invite is deleted. Admins see them to share them, so they are not hashed.
- **Rewind share tokens**: stored only as SHA-256 hashes (`RewindShare.tokenHash`); the token itself is never stored.
- **Affiliate blocks**: a blocked Plex account is stored only as an HMAC-SHA256 of its Plex id (`AffiliateBlock.plexIdHash`), keyed by `Config.affiliateBlockKey` (encrypted at rest). The Plex id itself is not stored. A block is kept until an admin unblocks it.
- **Service keys** (Plex, Jellyfin, Tautulli, Overseerr, Sonarr, Radarr, LLM providers, Stripe, Discord app): kept until an admin replaces them.
- Every secret column, and the AI prompt and reply text, is encrypted at rest under the keyring in `ENCRYPTION_KEYS` (the last column of the tables below); production refuses to start without a key ([operations](operations.md#encryption-keys)).

## Inventory

Readers: M is the member, A is admins, P is the public. "Cascade" means the row is deleted with the `User` row.

### Member data

| Model | Personal data | Readers | Removal does | Encrypted at rest |
|---|---|---|---|---|
| `User` | name, email, image, `plexUserId`, `jellyfinUserId`, `primaryAuthService`, `timezone`, exemption note, role, `disabledAt`, `accessEndedAt`, `accessRestoredAt`, `inactivityExcluded`; a Tautulli watch-hours snapshot (`watchHours`, `watchHoursLast30Days`, `watchHoursReadAt`); the start of their newest play in Tautulli (`lastSeenAt`, `lastSeenReadAt`); `plexAuthToken` (credential) | M own; A users list and detail; P name and image on a signed share | Deleted. Unshare and the Stripe revoke clear `plexAuthToken` | `plexAuthToken` |
| `PlexWrapped` | the member's Rewind: viewing history facts, LLM copy, summary, archetype, legacy share token | M viewer; A Rewind pages; P published pages of a share | Cascade | No |
| `RewindGeneration` | run status, error code, `previousData` (the replaced Rewind) | A Rewind history | Cascade | No |
| `RewindShare` | published page list, card facts, token hash and asset key | M sharing panel; P the public link | Cascade (through `PlexWrapped`); the link returns 404 | Token stored as a SHA-256 hash only |
| `RewindShareVisitDay` | daily visit counts of a share link, no visitor data | M | Cascade | No |
| `RewindView` | when the member opened their Rewind, how far they read, share actions; no IP | A season dashboard (aggregates) | Cascade | No |
| `RewindPrefs` | sharing and notification choices per year | M | Cascade | No |
| `RewindExclusion` | titles the member hid from their Rewind | M | Cascade | No |
| `WrappedShareVisit` | v2 share visits: hashed IP, user agent, referer of visitors | none | Cascade (through `PlexWrapped`) | IP is a salted hash |
| `LLMUsage` | prompt and response text (viewing stats, assistant turns, tool output), tokens, cost, model | A LLM usage pages, conversation page, Rewind history | Cascade for the member's rows; admins' rows about the member keep cost but lose their text | Prompt and response text |
| `ChatConversation` | which member a conversation belongs to, start and end; on the assistant page its title (from the first question) and last message time | M assistant page (own); A via LLM usage | Cascade | `title` |
| `ChatConversationMessage` | an assistant page conversation's questions and answers, and the tools each answer used | M assistant page (own) | Cascade (through `ChatConversation`); removed when its owner deletes the conversation, it is idle past its window or its owner stops being an admin | `content` |
| `DiscordConnection` | Discord id, username, global name, avatar; access and refresh tokens | M link panel; A user detail | Grant revoked at Discord, then deleted (also on unlink) | Tokens |
| `DiscordChatSession` | the last assistant turns of a Discord chat, Discord id, channel id | none (LLM context only) | Deleted by Discord id, and through `ChatConversation` (also on unlink) | No |
| `DiscordOAuthState` | a pending link attempt and its redirect | none | Cascade | No |
| `DiscordPendingSelection` | a parked `/mark` search for a Discord id | none | Deleted by Discord id | No |
| `DiscordCommandLog` | Discord id and username, linked user id, command name and arguments (assistant messages as a length only, `argsLength`), channel and guild | A Discord activity, user timeline | Deleted by user id and by Discord id. If a `User` row is deleted any other way, the foreign key sets `userId` to null | No |
| `UserMediaMark` | titles the member marked and how | M `/mymarks`; A marked media, timeline | Cascade | No |
| `WatchlistSyncSettings` | sync choice, last result and counters | M card; A counts | Cascade. Unshare and the Stripe revoke turn sync off | No |
| `WatchlistSyncHistory` | titles from the member's private Plex watchlist and their request status | M recent items; A every member's items (Admin → Watchlist sync) | Cascade | No |
| `InviteUsage` | which invite the member redeemed, and when | A invite detail | Cascade | No |
| `Invite` | admin invites: codes and library settings, `createdBy` admin id. An affiliate invite also holds the affiliate's user id (`affiliateUserId`), a private label for the affiliate, and the invitee's user id and join date (`joinedUserId`, `joinedAt`) | A Admin → Invites (admin invites only); M the affiliate's own invites | Unused affiliate invites the member made are deleted. A used one stays, and the foreign key sets `affiliateUserId` to null. The invite the member joined with stays, and the foreign key sets `joinedUserId` to null | No |
| `AffiliateApplication` | one affiliate application: the member's note, watch hours when they applied, whether they shared their Plex email, the admin's decision and reason, end date and cause, invite override and tier | M own; A affiliate pages | Cascade | No |
| `AffiliateBlock` | an HMAC-SHA256 of a blocked Plex id, no foreign key to `User`, and the admin id that made it | A affiliate pages | Not erased on removal: it holds no Plex id, and it stays until an admin unblocks it | Keyed hash only |
| `Subscription` | Stripe customer and subscription ids, status, plan, period end, cancel date, Plex invite status, Jellyfin access status, access skip code | M status; A users list, billing tab | Stripe subscription cancelled at once, then cascade; the customer id goes to the audit row | No |
| `AuditLog` | actor and target user ids, event details (ids and counts, never secrets) | A and Support in **Admin > Audit log** (Support sees who, what and when, never the stored details); the operator | Kept (ids only) | No |
| `RequestTierRun` | per run, each member's Overseerr display name, watch hours, tier and request quota before and after (no foreign key to `User`) | A request limits in settings | Not erased on removal; the daily sync keeps only the newest 30 runs, so a removed member's name leaves within about a month | No |
| `InactivityRun` | per daily member activity run, the ids of the members the inactivity sweep removed, skipped or failed on, with their last seen dates (no names, no foreign key to `User`) | A **Admin > Inactive members** | Not erased on removal; the daily run keeps only the newest 30 runs, so a removed member's id leaves within about a month | No |

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
| `LLMProvider` | provider, model and API key | `apiKey` |
| `McpServer` | name, URL, auth header name and value, and the tools the admin turned on | `authHeaderSecret` |
| `KnowledgeSource` | name, GitHub repository, branch, folder and an optional GitHub token | `token` |
| `Config` | app settings, Stripe keys, Rewind settings, affiliate invite settings and the affiliate block key | `stripeSecretKey`, `stripeWebhookSecret`, `rewindSerialKey`, `affiliateBlockKey` |
| `DiscordIntegration` | Discord app credentials and bot settings; `updatedBy` admin id | `clientSecret`, `botToken` |
| `InactivitySettings` | whether the inactivity sweep is on, its days without a play, the claim of the run in progress; `updatedBy` admin id | No |
| `LeaseLock` | which instance holds each lease (Discord bot, watchlist sync, retention) and until when | No |
| `RewindServerAggregate` | server-wide yearly totals, no per-member rows | No |
| `MediaMetadataCache` | Plex metadata per title | No |
| `RewindEvalRun` | Rewind copy eval results on fixture data; unused, nothing reads or writes it | No |
| `RewindBatch` | provider batch submissions; unused, nothing writes it | No |
| `PromptTemplate` | old prompt templates and style guides; unused, nothing reads or writes it; `updatedBy` admin id | No |
| `Announcement` | announcement text; `createdBy` admin id | No |
| `StripeEvent` | Stripe event ids and types, for webhook idempotency | No |
