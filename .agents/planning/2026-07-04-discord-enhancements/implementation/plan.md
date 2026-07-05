# Implementation Plan — Discord Enhancements

Test-driven, incremental plan derived from `design/detailed-design.md`. Each step
produces a working, demoable increment, ships with its tests, and builds on the
previous step. Steps are grouped into the five phases from the design; **each
phase is independently releasable**.

Assumes all context docs (`rough-idea.md`, `idea-honing.md`, `research/*`,
`design/detailed-design.md`) are available during implementation. FR/NFR refs
point into the design's Detailed Requirements.

---

## Progress Checklist

**Phase 0 — Bug fixes (independent, ship immediately)**
- [ ] Step 1: Fix misrouted `get_tautulli_library_stats`
- [ ] Step 2: Gate/scope `get_tautulli_users` for Discord + prompt cleanup

**Phase 1 — Refactor foundation**
- [ ] Step 3: Shared `getActivePlexServerConfig()` + `resolvePlexAccess()`
- [ ] Step 4: Single chatbot tool registry (`discordSafe`/`userScoped`/`discordFields`)
- [ ] Step 5: Split `audit.ts` into modules + fix `getCommandStats` N+1
- [ ] Step 6: Extract chat-history + atomic chat-session (race fix)
- [ ] Step 7: Extract `computeRoleMetadata` from `integration.ts`
- [ ] Step 8: Refactor lock into `DistributedLock` + `BotLockPoller`; inject bot

**Phase 2 — Slash + component migration (drops MessageContent)**
- [ ] Step 9: Command registry + interaction router scaffold
- [ ] Step 10: `/help` slash command (first end-to-end interaction)
- [ ] Step 11: `DiscordPendingSelection` model + DB pending store + shared `applyMark`
- [ ] Step 12: `/mark` subcommands with component select-menu picker
- [ ] Step 13: DM router + `/assistant` (+ `/assistant reset`)
- [ ] Step 14: Command registration script + **remove MessageContent intent**

**Phase 3 — Security**
- [ ] Step 15: Per-tool allowlist scrubbing (before LLM) + hardened denylist backstop
- [ ] Step 16: Fail-closed Discord tool execution + `getDiscordStats` leak fix
- [ ] Step 17: Bot token + channel IDs → encrypted DB + admin UI (blank-means-keep)
- [ ] Step 18: Token-rotation bounce via poller (`configVersion`) + env fallback
- [ ] Step 19: Discord audit events + OAuth rate limiting + `isAdmin` authz tiers

**Phase 4 — In-Discord visibility (self-service)**
- [ ] Step 20: `/mymarks` (self-scoped marks embed)
- [ ] Step 21: `/mystats` (self-scoped watch-stats embed)
- [ ] Step 22: `/watching` (self-scoped current sessions)
- [ ] Step 23: `/help` refresh + pinned-post copy; retire support-channel monitoring

**Wrap-up**
- [ ] Step 24: Docs (`docs/discord-bot.md`), release notes, final regression pass

---

## Phase 0 — Bug fixes

### Step 1: Fix misrouted `get_tautulli_library_stats`
**Objective.** `get_tautulli_library_stats` returns real library stats, not the
names list (current bug: `executors/tautulli.ts:112` calls
`getTautulliLibraryNames`).
**Guidance.** Confirm/add a stats client (`getTautulliLibrariesTable` /
`get_libraries_table`) in `lib/connections/tautulli.ts`; route the executor case
to it.
**Tests.** Unit test asserting the `library_stats` case calls the stats client and
returns a shape distinct from `library_names`; mock the Tautulli client.
**Integration.** Isolated executor change; no callers change.
**Demo.** Admin chatbot: "show library stats" returns counts/sizes, not just names.

### Step 2: Gate/scope `get_tautulli_users` for Discord + prompt cleanup
**Objective.** Close the unscoped user-roster exposure (`executors/tautulli.ts:126`)
and stop advertising it in the Discord prompt (FR-10).
**Guidance.** Mark the tool as not Discord-safe (interim: remove from the safe
list; the registry in Step 4 makes this structural). Remove its mention from
`generateDiscordSystemPrompt`.
**Tests.** Unit test: Discord toolset excludes `get_tautulli_users`; Discord prompt
text no longer references it.
**Integration.** Executor + prompt only.
**Demo.** In Discord context the assistant cannot enumerate users; admin context
unchanged.

---

## Phase 1 — Refactor foundation

### Step 3: Shared `getActivePlexServerConfig()` + `resolvePlexAccess()`
**Objective.** One loader for the active Plex server config; one `resolvePlexAccess`
used by role sync and admin access (removes 4× duplication, finding #4/#5).
**Guidance.** `lib/connections/plex-config.ts` returning
`{ name, url, token, publicUrl, adminPlexUserId }`. Adopt in `executors/plex.ts`,
`executors/media-marking.ts`, `commands/media-marking.ts` (both sites),
`integration.ts`.
**Tests.** Unit test the loader (active/none); keep existing executor/command tests
green (behavior-preserving).
**Integration.** Call-site swaps; no behavior change.
**Demo.** All Plex-backed commands/tools still work; grep shows a single loader.

### Step 4: Single chatbot tool registry
**Objective.** Replace `TOOLS` + hand-maintained `DISCORD_SAFE_TOOL_NAME_LIST` with
one registry; each tool tagged `discordSafe`/`userScoped`/`discordFields` (FR-7).
**Guidance.** `tools/types.ts` (`RegisteredTool`); per-service files
(`tools/{plex,tautulli,sonarr,radarr,overseerr,media-marking}.ts`);
`tools/registry.ts` derives `TOOLS`, `DISCORD_SAFE_TOOLS`, `DISCORD_SAFE_TOOL_NAMES`;
`tools/index.ts` barrel keeps import paths. Generate prompt tool lists from the
registry.
**Tests.** Drift-guard unit test: `DISCORD_SAFE_TOOLS ⊆ ALL_TOOLS`; every
`discordSafe` tool is `userScoped` or inherently global; names resolve. Keep
assistant tests green.
**Integration.** `assistant.ts`/`conversation.ts` import from the barrel unchanged.
**Demo.** Adding a tool in one place flows to LLM set + Discord subset + prompt;
Step 2's exclusion is now structural.

### Step 5: Split `audit.ts` into modules + fix `getCommandStats` N+1
**Objective.** Decompose the 861-line file to ≤150-line modules; single grouped
query for `getCommandStats`.
**Guidance.** `audit/write.ts`, `audit/query-helpers.ts` (`dateRangeWhere`,
`countByStatus`, `date_trunc` bucketing), `audit/metrics/{activity,commands,users,
errors}.ts`, `audit/index.ts` barrel. Colocate result interfaces.
**Tests.** Split `audit.test.ts` to match modules **in this step**; keep outputs
identical (golden). New test: `getCommandStats` issues one grouped query, same
result.
**Integration.** `actions/discord-activity.ts` imports via barrel unchanged; admin
dashboard identical.
**Demo.** `/admin/discord` renders identically; fewer queries for command stats.

### Step 6: Extract chat-history + atomic chat-session (race fix)
**Objective.** Fix non-atomic session upsert + clobbering `messages` write
(`services.ts:149-182`, `:236-246`).
**Guidance.** `chat-history.ts` (pure `coerceHistory`/`trimHistory`/`HISTORY_LIMIT`);
`chat-session.ts` (`getOrCreateSession` in `$transaction` on
`@@unique([discordUserId, discordChannelId])`; `appendTurn` re-reads+appends
transactionally). `services.ts` → orchestration only.
**Tests.** `chat-history` edge cases (malformed JSON, bad roles); `chat-session`
simulated-concurrency test (no duplicate `chatConversation`, no clobbered messages).
**Integration.** `services.handleDiscordChat` uses the new modules; DM/assistant
path unchanged externally.
**Demo.** Two near-simultaneous messages in one channel keep one conversation with
both turns preserved.

### Step 7: Extract `computeRoleMetadata` from `integration.ts`
**Objective.** Move inline Plex/Tautulli metadata compute into a testable module;
resolve the `is_subscribed` TODO (FR-19). Keep the 2 metadata fields.
**Guidance.** `role-metadata.ts` `computeRoleMetadata(user)` calling
`resolvePlexAccess` (Step 3). `integration.ts` → ~300 lines.
**Tests.** Unit test `computeRoleMetadata` with injected service fns (subscribed/not,
watch-hours). Existing link/sync tests green.
**Integration.** `syncDiscordRoleConnection` calls the extracted fn.
**Demo.** Linking a user still writes `is_subscribed`/`watched_hours` to Discord.

### Step 8: Refactor lock into classes; inject the bot
**Objective.** Replace lock module-globals with `DistributedLock` + `BotLockPoller`;
single source of lock truth; delete `getDiscordBot()` singleton (inject the bot).
**Guidance.** `lock/lease.ts`, `lock/poller.ts`, thin `lock.ts` facade preserving
function names; `instrumentation/node.ts` constructs the poller and injects
`DiscordBot`. (Config-change bounce added in Step 18.)
**Tests.** Unit test lease acquire/renew/release and poller acquire→onAcquired /
lose→onLost with a mocked lock+timers.
**Integration.** `instrumentation/node.ts` + `actions/discord-activity.ts` (bot
status) use the facade.
**Demo.** Bot still acquires the lock and runs on one instance; `/admin/discord`
bot-status still accurate. `DiscordBot` now constructable with a mock Client.

---

## Phase 2 — Slash + component migration

### Step 9: Command registry + interaction router scaffold
**Objective.** Introduce the `SlashCommand` registry + `routeInteraction` +
`withAuditLog`, wired to `InteractionCreate` (empty registry to start).
**Guidance.** `commands/registry.ts` (`SlashCommand` interface, `COMMANDS=[]`);
`routing/interaction-router.ts` (type guards, verify, dispatch, audit wrap);
`routing/audit-wrapper.ts`. Add `InteractionCreate` handler in `bot.ts`.
**Tests.** Router unit test with a faked interaction: dispatches to a stub command,
wraps in audit lifecycle (SUCCESS/FAILED), rejects unknown command.
**Integration.** Runs alongside the existing `MessageCreate` handler (not yet
removed).
**Demo.** A temporary `/ping` stub registered in a dev guild replies "pong" and
logs a `DiscordCommandLog` row.

### Step 10: `/help` slash command
**Objective.** First real migrated command end-to-end as an embed (FR-2).
**Guidance.** `commands/help.ts` reusing `COMMAND_REGISTRY` text → `EmbedBuilder`;
`command` option with autocomplete. Register into `COMMANDS`.
**Tests.** Handler test: builds expected embed for all-commands and single-command;
autocomplete returns ≤25 matches.
**Integration.** Registered via the registry; routed by Step 9.
**Demo.** `/help` and `/help command:mark` render embeds in Discord.

### Step 11: `DiscordPendingSelection` model + pending store + shared `applyMark`
**Objective.** DB-backed selection state + one shared mark path (removes in-memory
Map and command/executor duplication).
**Guidance.** Prisma migration for `DiscordPendingSelection` (additive);
`commands/mark/pending-store.ts` (create/findByCustomId/delete/gcExpired);
`media/mark-media.ts` `applyMark(...)`; `media/mark-labels.ts`. Point the existing
chatbot mark executor at `applyMark` too.
**Tests.** `pending-store` create/find/gc (+ "survives restart" via DB);
`mark-media` upsert + *arr matching + Plex watch, used by both callers;
`mark-labels`.
**Integration.** `db:generate` + `db:migrate`; executor mark tools now call
`applyMark`.
**Demo.** Marking via the admin chatbot still works and now runs through the shared
`applyMark`; pending selections persist in the DB.

### Step 12: `/mark` subcommands with component picker
**Objective.** Replace the numeric picker with a select-menu flow (FR-3, A13).
**Guidance.** `commands/mark/index.ts` — `/mark <sub> title:` → search → if multiple,
`StringSelectMenuBuilder` (≤25) with a `custom_id` keyed to a `DiscordPendingSelection`
row → on select, `UPDATE_MESSAGE` to a confirmation; defer if search is slow.
Component interactions routed via Step 9's router.
**Tests.** Handler tests: single-result marks directly; multi-result posts a select
menu + persists pending row; component select resolves the row → `applyMark` →
update; expired/absent selection handled.
**Integration.** Uses `pending-store` + `applyMark` (Step 11), registry (Step 9).
**Demo.** `/mark finished title:The Office` → pick from a menu → "✅ Marked … as
finished" (Plex watched synced). No text typing.

### Step 13: DM router + `/assistant` (+ reset)
**Objective.** DM-based multi-turn assistant + `/assistant` entry and reset (FR-5,
A14).
**Guidance.** `routing/dm-router.ts` handles DM `MessageCreate` (verify →
`chat-session` → assistant → reply); `commands/assistant.ts` — `/assistant [prompt]`
(deferred inline answer, points to DM) and `/assistant reset`; DM `reset`/`clear`
keyword clears context. Ensure `DirectMessages` intent is in the client.
**Tests.** DM router unit test (verified user → assistant invoked with `discord`
context; unlinked → link nudge); `/assistant reset` clears the session; keyword
reset works.
**Integration.** Reuses `chat-session` (Step 6) and the tool registry (Step 4).
**Demo.** DM the bot → multi-turn answer; `/assistant reset` starts fresh.

### Step 14: Registration script + remove MessageContent intent
**Objective.** Deploy-time command registration; **drop the privileged intent**
(FR-4).
**Guidance.** `scripts/register-discord-commands.ts` (bulk overwrite via
`REST.put(Routes.applicationGuildCommands|applicationCommands)` from
`COMMANDS.map(c=>c.data.toJSON())`); add npm script. Remove `MessageContent` from
the client intents; delete the now-dead `!`-prefix `MessageCreate` command
handling (keep only the DM path). Confirm no code reads channel message content.
**Tests.** Intent assertion test: client is constructed WITHOUT
`GatewayIntentBits.MessageContent`; router covers all commands; grep-guard test
that `!`-prefix parsing is gone.
**Integration.** All commands now flow through interactions + DM only.
**Demo.** After running the register script, all slash commands work; the bot
functions with MessageContent disabled in the Developer Portal.

---

## Phase 3 — Security

### Step 15: Per-tool allowlist scrubbing + hardened denylist backstop
**Objective.** Strip tool outputs to declared safe fields BEFORE the LLM in Discord
context (FR-8); harden the regex backstop (FR-8, A12).
**Guidance.** `executors/scrub.ts` `scrubForDiscord(toolName, output)` projecting to
`discordFields` from the registry; apply in executor dispatch when
`context==="discord"`. Add IPv6 + structural-ID patterns to `chat-safety.ts`.
**Tests.** Scrubber keeps only `discordFields`; PII keys (email/username/user_id/ip/
rating keys) never survive; regex backstop catches IPv6 + bare IDs.
**Integration.** Runs inside the Discord executor path (Step 4 registry supplies
`discordFields`).
**Demo.** A Discord assistant answer built from a tool that would include a
username shows only allowlisted fields; nothing identifying leaks.

### Step 16: Fail-closed execution + `getDiscordStats` leak fix
**Objective.** A tool not in the resolved safe set cannot execute in Discord context
(FR-9); close the dormant `clientSecret` leak (FR-11).
**Guidance.** Guard in `executors/index.ts`: `context==="discord"` &&
tool ∉ `DISCORD_SAFE_TOOL_NAMES` → refuse + emit `DISCORD_COMMAND_DENIED`. Apply
`omitSecret`/column projection in `getDiscordStats`.
**Tests.** Fail-closed test (injected unsafe tool name is refused, audited);
`getDiscordStats` result has no `clientSecret` (has `hasClientSecret`).
**Integration.** Dispatch + integration read path.
**Demo.** A crafted prompt asking for an unsafe tool is refused; `getDiscordStats`
payload carries no secret.

### Step 17: Bot token + channel IDs → encrypted DB + admin UI
**Objective.** Move `DISCORD_BOT_TOKEN` + support channel/thread IDs into
`DiscordIntegration`, encrypted, admin-managed (FR-12).
**Guidance.** Additive migration (`botToken`, `supportChannelId`, `supportThreadIds`,
`configVersion`); add `botToken` to `ENCRYPTED_FIELDS`; extend
`discordIntegrationSchema` + `DiscordIntegrationForm` (password, blank-means-keep);
`omitSecret(..., "botToken", "hasBotToken")`; blank-means-keep in `actions/discord.ts`.
**Tests.** Blank-means-keep (mirror the existing clientSecret test); form omits the
token; schema validation.
**Integration.** `db:migrate`; bot/`checkGuildMembership` read token from config
(with env fallback wired in Step 18).
**Demo.** Admin sets/rotates the bot token in the UI; the value is encrypted at rest
and never returned to the client.

### Step 18: Token-rotation bounce + env fallback
**Objective.** Rotating the token/config re-inits the bot on the lock-holding pod
(FR-13); env acts as null-fallback (NFR-5).
**Guidance.** Bump `configVersion` on config change; `BotLockPoller` compares it each
tick and, on change, `bot.destroy()` + re-`initialize()` with fresh config;
config loader falls back to env when DB columns are null; on re-init failure the
poller releases the lease and retries.
**Tests.** Poller test: config-version change triggers destroy+init; failure path
releases lease; env fallback used when DB null.
**Integration.** Ties Step 8 (poller) + Step 17 (DB config) together.
**Demo.** Change the token in admin UI → within a tick the bot reconnects with the
new token, no redeploy.

### Step 19: Discord audit events + OAuth rate limiting + authz tiers
**Objective.** Traceability + abuse prevention + tiered access (FR-14).
**Guidance.** Add `AuditEventType`s (`DISCORD_INTEGRATION_CONFIG_CHANGED`,
`_ACCOUNT_LINKED`, `_ACCOUNT_UNLINKED`, `_TOKEN_ROTATED`, `_COMMAND_DENIED`) + calls;
`checkRateLimit('discord-link:'+userId, …)` in `/discord/connect` + cap pending
states; gate server-wide tools on the already-fetched `isAdmin` in the router.
**Tests.** Audit events fire on config-change/link/unlink/rotation/denied; rate-limit
blocks the N+1th state; non-admin is refused server-wide tools (member tools OK).
**Integration.** Router (`isAdmin` from `verifyDiscordUser`), OAuth route, actions.
**Demo.** Config change logs an audit line (no secret values); rapid re-link is
throttled; a non-admin Discord user can't pull server-wide data.

---

## Phase 4 — In-Discord visibility

### Step 20: `/mymarks`
**Objective.** User sees their own marks in Discord (FR-15).
**Guidance.** `commands/mymarks.ts` — `/mymarks [type]` → `getUserMediaMarks`
(already self-scoped) → embed (grouped by mark type / paginated with buttons if
long). Ephemeral.
**Tests.** Handler test: self-scoped query; embed groups by type; empty state.
**Integration.** Registry + verify + `getUserMediaMarks`.
**Demo.** `/mymarks` shows the caller's Keep/Finished/etc. lists, only to them.

### Step 21: `/mystats`
**Objective.** User sees their own watch stats in Discord (FR-15).
**Guidance.** `commands/mystats.ts` → `fetchTautulliStatistics(user)` →
`computeDerivedStatistics` → embed (hours, top show/movie, streak, peak hour).
Deferred (Tautulli is slow) + ephemeral; route through the scrubber/backstop.
**Tests.** Handler test: resolves the caller's Tautulli identity, builds the embed;
no-linked-account and no-data states.
**Integration.** Reuses Wrapped stats engine; verify + scrub.
**Demo.** `/mystats` returns a personal stats embed, visible only to the caller.

### Step 22: `/watching`
**Objective.** User sees their own current sessions (FR-15).
**Guidance.** `commands/watching.ts` — reuse the Discord-scoped session logic
(`get_plex_sessions`/`get_tautulli_activity` scoping filters to the caller); add a
small Tautulli `get_activity` wrapper if needed. Ephemeral.
**Tests.** Handler test: returns only the caller's sessions; empty when idle.
**Integration.** Scoped executors + verify.
**Demo.** `/watching` shows the caller's own active stream (or "nothing playing").

### Step 23: `/help` refresh + retire support monitoring
**Objective.** `/help` reflects the final command set; document the pinned-post
support flow; remove the last of passive channel monitoring (FR-18).
**Guidance.** Update `COMMAND_REGISTRY`/help embed for the new commands; remove any
residual `DISCORD_SUPPORT_CHANNEL_ID` monitoring code paths (config field remains
for the pinned-post/portal link only).
**Tests.** `/help` lists the final commands; grep-guard that support-channel
message monitoring is gone.
**Integration.** Final command surface consistent.
**Demo.** `/help` shows `/mark`, `/mystats`, `/mymarks`, `/watching`, `/assistant`;
support is DM + `/help`.

---

## Wrap-up

### Step 24: Docs + release notes + final regression
**Objective.** Ship-ready: docs and a clean full test run.
**Guidance.** Update `docs/discord-bot.md` (slash commands, DM assistant, no
MessageContent, DB-managed token + rotation, registration script); write release
notes covering the clean break (`!` → slash). Run full `npm test` + `npm run lint`
+ `npm run build`.
**Tests.** Whole suite green; JSDoc-example tests for new pure modules (scrubber,
registry) pass.
**Integration.** N/A (documentation + verification).
**Demo.** Green CI; docs describe the new end state; release notes ready.
