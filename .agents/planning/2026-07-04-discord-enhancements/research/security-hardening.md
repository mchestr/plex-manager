# Research: Security Hardening Options

_Grounded in the actual codebase; all file:line refs verified by the research
agent._

## Baseline already in place
- **AES-256-GCM at rest** via Prisma `$extends` (`lib/security/crypto.ts`,
  `lib/prisma.ts`). `ENCRYPTED_FIELDS` (`lib/prisma.ts:23-35`) already covers
  `DiscordIntegration.clientSecret` + `DiscordConnection.accessToken/refreshToken`.
  No-op without `ENCRYPTION_KEY`; **can't be used in `where`** (random IV).
- **Security utils** (`lib/security/`): `rate-limit.ts` (`rateLimit()` for API
  routes, `checkRateLimit(key, opts)` for server actions), `audit-log.ts`
  (`logAuditEvent`, currently **log-only** with a TODO for DB sink),
  `api-helpers.ts` (`requireAdminAPI`/`requireAuthAPI`), `ip-hash.ts`.
- **`omitSecret`** (`actions/admin/admin-settings.ts:19-27`) strips decrypted
  secrets before RSC payloads (regression-tested).

## 1. Bot token & channel config (env → encrypted DB)
- **Now:** `DISCORD_BOT_TOKEN` + `DISCORD_SUPPORT_CHANNEL_ID` + thread IDs are
  plaintext env (`bot.ts:13-16,73-79`, login `:96`); `integration.ts:415` ALSO
  reads `process.env.DISCORD_BOT_TOKEN` directly (split-brain). OAuth half is
  DB-managed + encrypted.
- **Gap:** most privileged credential is env-only, unencrypted, unrotatable from
  UI, disconnected from `DiscordIntegration`.
- **Options that fit:** add `botToken` column to `DiscordIntegration`, add to
  `ENCRYPTED_FIELDS.DiscordIntegration`, manage via the existing admin form
  (extend `discordIntegrationSchema`, `omitSecret(..., "botToken",
  "hasBotToken")`, blank-means-keep like `clientSecret` at `discord.ts:26-27`).
  Move channel/thread IDs onto `DiscordIntegration` too (non-secret). Keep env as
  fallback when column null (non-destructive rollout). Add a "rotate token" action.
- **Trade-off — the restart problem:** `client.login(token)` captures the token
  in a closure (`bot.ts:96`); a DB change does NOT re-login. Need a **bounce**:
  the `lock.ts` polling loop (`:286-370`, already has `onLockLost`/`onLockAcquired`
  + `bot.destroy()`) is the correct and only place to detect a config/token
  change (via a config hash read each 10s tick) and force `destroy()` +
  re-`initialize()` on the lock-holding pod. Effort: Med-High.

## 2. OAuth flow
- **Now:** state = 192 bits entropy, 10-min TTL, single-use (`consumedAt`),
  session-bound to `userId`, open-redirect-safe (`sanitizeRedirectPath`
  `integration.ts:55-69`). PKCE intentionally off (`role_connections.write`
  incompatibility; empty `codeVerifier` + dead commented code).
- **Gaps:** **no rate limit** on `/discord/connect` state creation (authenticated
  user can spam `DiscordOAuthState`; cleanup only opportunistic, >1h old). No
  session re-check in callback (bound in row but not re-verified).
- **Options that fit:** `checkRateLimit(\`discord-link:${userId}\`, …)` in
  `connect/route.ts` exactly like `subscription.ts:67`; prune prior un-consumed
  states per user in the existing `$transaction`; optionally re-verify session in
  callback; delete PKCE dead code or document inline. Effort: Low.

## 3. Audit logging
- **Now:** two disjoint systems — `lib/security/audit-log.ts` (log-only, no
  Discord events in the enum) and `DiscordCommandLog` (rich runtime *command*
  logging). **Admin/lifecycle security events are NOT audited:** config changes
  (`discord.ts:14-74`, touches secrets + enable toggles), link
  (`completeDiscordLink`), unlink (`clearDiscordRoleForUser`,
  `disconnectDiscordAccount`), token refresh, role resync.
- **Options that fit:** add `AuditEventType`s (`DISCORD_INTEGRATION_CONFIG_CHANGED`,
  `_ACCOUNT_LINKED`, `_ACCOUNT_UNLINKED`, `_TOKEN_ROTATED`, `_COMMAND_DENIED`) +
  `logAuditEvent` calls. For config changes log a **diff of which fields changed /
  whether secrets touched — never values**. Log-only until the DB sink TODO is
  built; or persist via a dedicated `AuditLog` model reusing the
  `DiscordCommandLog` pattern. Effort: Low (enum+calls) → Med (persistent table).

## 4. PII redaction (`chat-safety.ts`)
- **Now:** 4 denylist regexes (EMAIL/PHONE/IPv4/"plex user id" label) run on the
  **final assistant text only** (`services.ts:221-229`); prompt also *advises*
  anonymizing.
- **Gaps:** denylist is inherently leaky — no IPv6, US-centric phone, `ID_REGEX`
  only catches English-labeled IDs (bare Plex/Discord/Tautulli IDs, usernames,
  rating keys pass through). Worse: **redaction happens AFTER the LLM already saw
  the raw data** — tools like `get_tautulli_users`/`top_users`/`watch_history`
  return real emails/usernames/IPs/IDs into the model context, which can
  paraphrase PII ("the user John"), and raw tool output is stored unredacted in
  `DiscordChatSession.messages`.
- **Options that fit (strongest first):**
  1. **Allowlist-scrub tool outputs BEFORE the LLM sees them** (per-tool, keep only
     non-sensitive keys: counts, titles, statuses, versions, queue sizes).
  2. **Don't expose user-enumerating tools to Discord at all** (overlaps §6) —
     removes the largest PII source without perfect regexes.
  3. Harden regexes as a backstop (IPv6, structural ID matching).
  4. Redact before persisting session `messages`.
- Best value = tool-exposure reduction (§6) + allowlist scrub of any remaining
  user-bearing tool. Effort: Med.

## 5. Authorization tiers in Discord
- **Now:** `verifyDiscordUser` already returns `isAdmin` (`services.ts:108`) **but
  `bot.ts` never reads it** — every linked user has identical power; only
  channel-location gating exists (`bot.ts:133-150`). Server-wide diagnostic tools
  are reachable by any linked member.
- **Options that fit:** (a) **App-side `isAdmin` gating** — lowest friction, data
  already loaded; gate server-wide/user-enumerating tools to admins, keep
  status/queue/self-marks for members. (b) **Discord-role gating** via
  `checkGuildMembership` (`api.ts:270`) extended to fetch member roles + a
  configured mod-role ID on `DiscordIntegration` — more native but adds an API
  call/message + a `GuildMembers` intent + fail-closed lockout risk on Discord
  outage. (c) Hybrid: app `isAdmin` for privileged, Discord role for "mod".
  Denied attempts → `DISCORD_COMMAND_DENIED` audit event. Effort: Low-Med.

## 6. Chatbot tool safety (allowlist drift + unscoped tool)
- **Now:** `TOOLS` (52 defs) and `DISCORD_SAFE_TOOL_NAME_LIST` (14 names,
  `tools.ts:654-669`) are **separate hand-maintained literals** → structural
  drift; no test asserts subset/name-resolution. `get_tautulli_users`
  (`executors/tautulli.ts:126-132`) returns raw user objects unscoped (currently
  NOT in the safe list, but the Discord prompt still mentions it and nothing
  prevents a future add).
- **Options that fit:** co-locate a **`discordSafe`/`sensitivity` flag on each tool
  def** and derive `DISCORD_SAFE_TOOLS = TOOLS.filter(t => t.discordSafe)` —
  eliminates the parallel list, forces an explicit decision per tool. Add a
  **subset-guard test** + a **fail-closed runtime check** in the discord
  execution path (reject tool names not in the resolved safe set — blocks
  prompt-injection). Tag PII-bearing tools so §5 tiering + §6 filtering share one
  flag set. Effort: Low-Med.

## 7. Secrets never reaching client
- **Now:** `omitSecret` correct for admin settings; `getDiscordLinkStatus` returns
  a safe projection.
- **Footgun found:** `getDiscordStats` (`integration.ts:449-461`) returns the RAW
  `DiscordIntegration` row → the Prisma extension **decrypts `clientSecret` into
  it**. No current source caller (dormant), but any future dashboard wiring leaks
  the secret. **Fix:** apply `omitSecret` / select explicit columns. Effort: Trivial.
- `api.ts` error logs only Discord `response.text()` (not outgoing payload) —
  confirmed no secret in logs; `bot.ts` logs only `hasToken` booleans.

## Highest-value, codebase-fitting changes (ranked)
| # | Change | Effort |
|---|---|---|
| 7 | `omitSecret` on `getDiscordStats` (dormant clientSecret leak) | Trivial |
| 6 | Per-tool `discordSafe` flag → derive safe set; subset test; fail-closed check | Low-Med |
| 2 | `checkRateLimit` on `/discord/connect`; cap pending OAuth states | Low |
| 3 | Discord `AuditEventType`s + `logAuditEvent` calls | Low |
| 4 | Allowlist-scrub tool outputs pre-LLM; redact before persist; regex backstop | Med |
| 5 | Gate server-wide/user tools on `isAdmin` (or Discord role) | Low-Med |
| 1 | Move `botToken`+channel IDs to encrypted DB; reinit-on-change via lock poll | Med-High |

### Continuation
Security research agent kept alive: `a758dfc5a1f272547`.
