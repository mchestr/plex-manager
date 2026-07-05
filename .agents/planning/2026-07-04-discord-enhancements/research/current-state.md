# Research: Current State of Discord Functionality

_Compiled 2026-07-04 from a parallel read of the codebase (bot core, commands,
chatbot, activity/analytics, linking, config)._

## Summary

Discord is a large, mature subsystem: **~6,262 lines** across `lib/discord/` and
`actions/chatbot/` alone, plus ~2,600 lines of linking/config/UI. It uses
**discord.js ^14.16.3** (gateway websocket for messages) plus **raw REST**
(`fetch`) for OAuth2 + Linked Roles. Charts use **chart.js ^4.5.1** +
**react-chartjs-2 ^5.3.1**.

The system is functional and feature-rich for admins, but shows classic
"grew organically" symptoms: several 400–860 line files, a monolithic message
handler, duplicated logic, in-memory state that dies on restart, and a few
confirmed bugs. Crucially for this project's stated goals, **there is essentially
zero user-facing visibility** — all analytics are admin-only.

## Architecture (current)

```
                       Discord Gateway (websocket)
                                 │  MessageCreate
                                 ▼
                      lib/discord/bot.ts (608 LOC)
        singleton client · 380-line message handler · routing · audit
          │            │             │            │            │
          ▼            ▼             ▼            ▼            ▼
     services.ts    lock.ts     commands/*     audit.ts   chat-safety.ts
   verify/chat/    DB-backed   help(255)/     (861 LOC)   regex PII (34)
   clear (332)   distributed  media-marking   analytics
                    lock (406)   (458)         queries
          │
          ▼
    integration.ts (462) ── api.ts (311) ── Discord REST (OAuth, Linked Roles)
   OAuth orchestration      token exchange / profile / role metadata / guild check
          │
          ▼
       Prisma  ── DiscordIntegration, DiscordConnection, DiscordChatSession,
                  DiscordOAuthState, DiscordBotLock, DiscordCommandLog

  Web UI chatbot (admin only): actions/chatbot/index.ts → lib/chatbot/assistant.ts
     context="default" → full 52 tools;  context="discord" → 13 safe tools
```

## Feature inventory (what exists today)

### Bot & commands (prefix `!`, NOT slash commands)
- `!help` / `!commands` — public, no auth
- `!assistant` / `!bot` / `!support` — AI chatbot (linked users)
- `!clear` / `!reset` / `!clearcontext` — clear chat context
- `!finished`, `!notinterested`, `!keep`, `!rewatch`, `!badquality` — media marking
  (linked users; searches Plex, numbered 1–5 selection UI, upserts `UserMediaMark`,
  syncs watched state to Plex)
- **Registration:** commands are text-prefix handlers on `MessageCreate`, NOT
  registered Discord application (slash) commands. Only *Linked Role metadata*
  (`is_subscribed`, `watched_hours`) is registered via
  `scripts/register-discord-metadata.ts`.

### Chatbot
- Shared engine `runChatbotForUser()` with two contexts:
  - `default` (admin web UI): 52 tools, 846-line system prompt, cross-user data.
  - `discord`: 13 safe tools, 32-line privacy-focused prompt, per-user scoping.
- Per-user privacy scoping for `get_plex_sessions` and `get_tautulli_activity`
  (filters to caller's own Plex/Tautulli identity).

### Linking (OAuth2)
- Flow: `/discord/connect` → Discord authorize → `/api/discord/callback` →
  `completeDiscordLink` → store `DiscordConnection` → `syncDiscordRoleConnection`.
- State param (24 random bytes, 10-min TTL, single-use, session-bound). **No PKCE**
  (documented Discord limitation for `role_connections.write`).
- Scopes: `identify role_connections.write`.
- Linked Roles metadata: `is_subscribed` (Plex access) + `watched_hours` (Tautulli).

### Admin analytics (`/admin/discord`)
- Bot status, summary KPIs (total/success rate/avg response/unique users),
  trend + command charts, active users, help/linking/media-marking/context/
  selection/error breakdowns, recent activity table. 12 chart components,
  ~1,756 LOC. Backed entirely by `DiscordCommandLog`.

### Config (admin)
- `isEnabled`, `botEnabled`, `clientId`, `clientSecret` (encrypted), `guildId`,
  `serverInviteCode`, `platformName`, `instructions`. Configurable in admin
  settings + setup wizard. Onboarding has a "Support & Community" step.

## Secret / token handling (current)

| Secret | Storage | Encrypted? |
|---|---|---|
| `clientSecret` | DB `DiscordIntegration` | ✅ (ENCRYPTED_FIELDS) |
| user `accessToken`/`refreshToken` | DB `DiscordConnection` | ✅ |
| `DISCORD_BOT_TOKEN` | **env var** | ❌ plaintext env |
| `DISCORD_SUPPORT_CHANNEL_ID` / `THREAD_IDS` | **env var** | ❌ |
| OAuth `state` | DB `DiscordOAuthState` | ❌ (single-use, short TTL) |

Note the split-brain: linking config lives in the DB and is admin-editable, but
the **bot** (token, channels) is configured purely through **env vars** — so the
bot cannot be fully managed from the admin UI, and the token isn't encrypted.

## Refactor targets (code health)

Files over the project's 200–300 line guideline:
- `lib/discord/audit.ts` — **861** (analytics; in-memory aggregation, repeated
  groupBy patterns, hardcoded limits, should split by concern + push aggregation
  to SQL)
- `lib/discord/bot.ts` — **608** (380-line message handler mixing verification,
  routing, audit, chat; hardcoded constants; untestable singleton)
- `lib/discord/integration.ts` — **462** (OAuth + Plex/Tautulli metadata compute
  inline; tight coupling; passive error recovery)
- `lib/discord/lock.ts` — **406** (global state, fire-and-forget callbacks, fixed
  retry / no backoff)
- `lib/discord/services.ts` — **332** (fragile JSON history coercion, non-atomic
  session upsert / race conditions)
- `actions/chatbot/tools.ts` — **895** (52 tool defs + 878 lines of prompt text in
  one file; two hand-maintained tool lists risk drifting)
- Several chart components 180–230 LOC (media-marking-breakdown 230, activity-table
  209, trend-chart 181).

Cross-cutting smells:
- Duplicated Plex-config load in media-marking (`handleMarkCommand` +
  `handleSelectionResponse`).
- Duplicated `parseDiscordInviteCode` (validations + form component).
- Hardcoded scope/URL/TTL constants scattered across files.
- In-memory `pendingSelections` map (media marking) and lock/polling globals lost
  on restart; no persistence/recovery.
- No retry/backoff on Discord REST calls; no rate limiting on state creation.

## Confirmed bugs (verified by reading the code)

1. **`get_tautulli_library_stats` is misrouted** — `executors/tautulli.ts:113`
   calls `getTautulliLibraryNames(config)` instead of a stats function.
2. **`get_tautulli_users` has no Discord scoping** — `executors/tautulli.ts:126`
   returns ALL Tautulli users regardless of context. (Need to confirm whether it's
   in `DISCORD_SAFE_TOOLS`; if so, it leaks the full user list to Discord users.)

## Security observations

- ✅ Good: encrypted client secret + user tokens, single-use state, session
  binding, minimal scopes, redirect sanitization, per-user chatbot data scoping,
  PII scrubbing of chatbot output.
- ⚠️ Gaps flagged for the "better security" goal:
  - `DISCORD_BOT_TOKEN` in plaintext env, not encrypted DB; can't rotate from UI.
  - No PKCE (documented limitation — worth re-verifying against current Discord API).
  - No rate limiting on OAuth state creation.
  - No audit trail for link/unlink/refresh events (only current-state timestamps).
  - `chat-safety.ts` regex PII scrubbing is heuristic: loose phone/IP patterns,
    global-flag `lastIndex` handling, only catches literal "plex user id" syntax.
  - No command-level authorization tiers (any linked user = same power; no admin/
    mod distinction inside Discord).
  - Guild membership checked live on every render (no cache) — perf + rate-limit risk.

## "Visibility for users on the server" — the big gap

Users currently see **only** a connection status card ("Connected as X" / join
link). They have **no** view of:
- their own Discord command / media-mark history,
- their own stats (commands run, watch hours reflected in Linked Roles),
- server-wide community activity (what's popular, who's active — opt-in),
- their linking health (token expiry, sync errors surfaced meaningfully).

All the data to power these already exists in `DiscordCommandLog`,
`UserMediaMark`, and Tautulli — it's simply admin-gated today.

## Key open questions for requirements

1. "More features" — new **slash commands**? migrate `!` → `/`? request media via
   Overseerr from Discord? notifications/announcements to the server?
2. "More visibility for users on the server" — in-app (Next.js) user dashboard,
   in-Discord (bot messages/embeds), or both? Individual vs community/leaderboard?
3. "Better security" — priority: move bot token to encrypted DB + UID rotation?
   authorization tiers? harden PII scrubbing? audit logging?
4. Scope of "refactor" — decompose the big files now, or only touch what the new
   features require?
5. Backwards-compat constraints — existing linked users, existing command prefixes,
   existing `DiscordCommandLog` data must be preserved?
