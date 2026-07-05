# Research: Refactor Architecture Options

_Per-file decomposition proposals + a shippable sequencing. Grounded in a full
read of the modules; line refs are to current code._

## Cross-cutting findings
1. **`get_tautulli_library_stats` misrouted** — `executors/tautulli.ts:112-118`
   calls `getTautulliLibraryNames` (identical to the names case). Confirmed bug.
2. **`get_tautulli_users` unscoped** — `tautulli.ts:126-132` returns the full
   roster with no `context === "discord"` gating (unlike sessions/activity).
   Not in the safe list today, but the Discord prompt still advertises it
   (`tools.ts:782`) and nothing prevents a future add. Latent PII leak.
3. **Two hand-maintained tool lists drift** — `TOOLS` (`tools.ts:3-652`) vs
   `DISCORD_SAFE_TOOL_NAME_LIST` (`:654-669`); no single source of truth.
4. **Duplicated Plex-config load** — `plexServer.findFirst({isActive})` block in
   `executors/plex.ts:11-19`, `executors/media-marking.ts:20-30`,
   `commands/media-marking.ts:92-106` + `:259-273`. No shared loader.
5. **Config shape mismatch** — executors omit `adminPlexUserId`;
   `integration.ts:301-313` loads it separately.

## 1. `bot.ts` (608) → command-dispatcher/registry
Problem: `MessageCreate` handler `:124-505` (~380 lines) mixes filtering,
channel gating, trigger detection, verification, and 5 inline command branches,
each repeating the audit-log lifecycle ~5×. Untestable (class method needing a
live `Client`).
Decompose (bot.ts → ~120):
- `routing/message-router.ts` (~90) — `routeMessage(ctx)`: verify → iterate a
  command registry → chatbot fallthrough.
- `routing/context.ts` (~90) — `buildMessageContext(...)` + the pure helpers
  (`buildChatInput`/`stripBotMention`/`stripCommandPrefix`/`describeAttachments`).
- `routing/audit-wrapper.ts` (~40) — `withAuditLog(params, fn)` kills the 5× copy.
- `commands/registry.ts` (~60) — `interface DiscordCommand { matches; commandType;
  commandName; handle }` + ordered `COMMANDS[]`; clear/help/mark/selection become
  entries. **Adding a slash command later = one more entry.**
Testable: `routeMessage`/`buildMessageContext` take a small context object + a
fake message.

## 2. `audit.ts` (861) → query modules + push aggregation to SQL
Problem: write path + 9 analytics readers, each re-implementing in-memory
`groupBy` via `Map`; `getCommandStats` (`:205-257`) fires 2 `count()` per command
group (N+1).
Decompose (no file > ~150):
- `audit/write.ts` (~110) — create/update/logCommandExecution (what bot.ts imports).
- `audit/query-helpers.ts` (~80) — `dateRangeWhere`, `countByStatus` in ONE
  `groupBy(['status'])`, `toDailyBuckets`.
- `audit/metrics/{activity,commands,users,errors}.ts` — push date bucketing to
  `$queryRaw date_trunc('day', …)`; rewrite `getCommandStats` to a single grouped
  query. Move result interfaces next to their functions.
- `audit/index.ts` barrel → callers (`discord-activity.ts`) unchanged.
Behavior-preserving except the `getCommandStats` rewrite; split `audit.test.ts`
in the same PR.

## 3. `tools.ts` (895) → single registry + per-context flags
Problem: 52 defs + second name-list + ~180 lines of hardcoded decision-tree/
few-shot prose re-listing tool names. 90% data+prose.
Decompose (no file > ~150):
- `tools/types.ts` — `RegisteredTool extends ChatTool { discordSafe?; userScoped? }`.
- `tools/{plex,tautulli,sonarr,radarr,overseerr,media-marking}.ts` — per-service
  arrays tagged with flags (mirrors `executors/<service>.ts`).
- `tools/registry.ts` — `ALL_TOOLS`, `TOOLS` (flags stripped for LLM),
  `DISCORD_SAFE_TOOLS = ALL_TOOLS.filter(t => t.discordSafe)`. **Deletes the second
  list.** Drift test: every safe tool is userScoped-handled or inherently global.
- `prompts/{default,discord}-system-prompt.ts` — generate the decision tree FROM
  the registry instead of hardcoding names.
- `tools/index.ts` barrel → `assistant.ts`/`conversation.ts` imports unchanged.
Fixes finding #2/#3. Note `executors/index.ts` `TOOL_SERVICE_MAP` is a *third*
list — generate it from the same per-service registry as a follow-up.

## 4. `integration.ts` (462) → extract metadata compute
Problem: `syncDiscordRoleConnection` (`:271-375`) inlines Plex `is_subscribed`
(`:299-327`, dup of admin-access logic per its own comment) + Tautulli
`watched_hours` (`:329-358`).
Decompose (integration.ts → ~300):
- `role-metadata.ts` (~110) — `computeRoleMetadata(user)`; calls a shared
  `resolvePlexAccess(user)` (kills the 3rd copy of Plex-access logic).
- `oauth-state.ts` (~50, optional) — `consumeOAuthState` + cleanup.
Testable: `computeRoleMetadata` with injected service fns.

## 5. `lock.ts` (406) → injectable classes
Problem: two module-global mutables (`lockState` `:39`, `pollingState` `:273`);
renewal + poll timers reason about the same state (consistency gap); untestable.
Decompose (lock.ts facade ~60 + classes ~280):
- `lock/lease.ts` (~140) — `DistributedLock` class (acquire/renew/release/isHeld;
  `INSTANCE_ID` + durations as ctor params).
- `lock/poller.ts` (~140) — `BotLockPoller` taking a lock + callbacks; owns the
  single loop and drives renewal off the same lock object (timers can't disagree).
- `lock.ts` — thin facade preserving the function names used by
  `instrumentation/node.ts:192` + `discord-activity.ts`.
DI: `node.ts` constructs the poller and injects the `DiscordBot` → **delete the
`getDiscordBot()` singleton** (`bot.ts:600-607`), enabling tests with a mock Client.
This is also where the **§1 token-rotation bounce** lives.

## 6. `services.ts` (332) → atomic session + history unit
Problems: **non-atomic session upsert** (`:149-182` — two concurrent messages can
both create a `chatConversation`); **clobbering read-modify-write** of the
`messages` JSON blob (`:236-246`); hand-rolled `coerceHistory` (`:40-67`). Schema
HAS `@@unique([discordUserId, discordChannelId])` (`:333`) → atomic path available.
Decompose (services.ts → ~180):
- `chat-session.ts` (~110) — `getOrCreateSession(...)` in `$transaction`;
  `appendTurn(...)` re-reads + appends atomically (closes both races).
- `chat-history.ts` (~70) — `coerceHistory`/`trimHistory`/`HISTORY_LIMIT`, pure.
- `services.ts` — `verifyDiscordUser` + orchestration only.

## 7. `commands/media-marking.ts` (458) → DB pending store + shared mark logic
Problems: **in-memory `pendingSelections` Map** (`:38`) + leaky `setInterval` GC
(`:41-51`) — lost on redeploy mid-selection; duplicated Plex-config load; mark
upsert + Radarr/Sonarr matching + labels duplicated with
`executors/media-marking.ts`.
Decompose (no file > ~150):
- `commands/mark/pending-store.ts` (~90) — new `DiscordPendingSelection` Prisma
  model + create/find/delete/gc (opportunistic GC like `DiscordOAuthState`). Kills
  the `setInterval`. Survives redeploys (spans two Discord messages).
- `media/mark-media.ts` (~120) — shared `applyMark(...)` used by BOTH command +
  executor (deletes ~100-line dup).
- `media/mark-labels.ts` (~25) — one copy of label formatting.
- `commands/media-marking.ts` — orchestration + reply formatting only.

## Shared prerequisite
`lib/connections/plex-config.ts` — `getActivePlexServerConfig()` returning
`{ name, url, token, publicUrl, adminPlexUserId }`; adopt in all 4 sites + a
`resolvePlexAccess(user)`. Zero-behavior-change; unblocks #1/#4/#7.

## Sequencing (each step shippable + test-covered)
- **Phase 0 — Bugs (independent, immediate):** fix misrouted
  `get_tautulli_library_stats`; gate/scope/remove `get_tautulli_users` for Discord
  + drop it from the prompt.
- **Phase 1 — Shared loaders:** `plex-config.ts` + `resolvePlexAccess`.
- **Phase 2 — Independent decompositions (parallelizable):** `audit.ts` split;
  **`tools.ts` registry (prerequisite for new tools/slash commands)**;
  `services.ts` atomic-session fix; `integration.ts` metadata extract.
- **Phase 3 — media-marking:** shared `mark-media`/`mark-labels`; `pendingSelections`
  → DB model (+ migration).
- **Phase 4 — highest blast radius (last):** `bot.ts` command-registry
  (**prerequisite for slash commands**); `lock.ts` → injectable classes + delete
  `getDiscordBot()` singleton.

Rationale: bugs first (no risk); shared loaders unblock coupling; `tools.ts`
registry gates new features; `bot.ts`/`lock.ts` depend on leaf modules being
extracted, so they land last. Barrels preserve import paths at each step.

### Continuation
Refactor research agent kept alive: `a16c23d5101171011`.
