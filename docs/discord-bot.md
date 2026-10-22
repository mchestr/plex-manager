# Discord Bot

This repository ships with a Discord bot that **runs automatically with the
Next.js process**. It serves users through native **slash commands** and a
**DM-based AI assistant** — it does **not** monitor or read channel messages.

> **Migration note:** the bot was migrated from `!`-prefix text commands to
> native slash commands. As a result it **no longer requires the `Message
> Content` privileged intent** — a deliberate privacy improvement (the bot no
> longer receives the text of arbitrary channel messages). The legacy
> `!assistant` / `!finished` / etc. text commands have been removed (clean
> break). Re-run the command registration script after upgrading (below).

## Commands

All commands are slash commands. Personal commands reply **ephemerally** (only
the invoking user sees them) and are hard-scoped to that user.

| Command | Description |
|---|---|
| `/help [command]` | List commands, or details for one. |
| `/mark finished\|keep\|notinterested\|rewatch\|badquality title:<name>` | Mark media; disambiguates multiple matches with a select menu. `finished` also marks it watched on your own Plex account (see *Marking as the member*). |
| `/assistant ask prompt:<text>` | Ask the AI assistant (answers ephemerally; DM the bot to continue a multi-turn conversation). |
| `/assistant reset` | Clear your assistant conversation context (a `reset`/`clear` DM also works). |
| `/mystats` | Your personal watch statistics. |
| `/mymarks [type]` | The media you've marked, optionally filtered by type. |
| `/watching` | What you're currently watching. |

The **AI assistant** is DM-based: DM the bot for a full multi-turn conversation.
DM content is delivered **without** the Message Content privileged intent.

## Prerequisites

1. **Discord Application**
   - **No privileged intents required.** The bot uses only the (non-privileged)
     `Guilds` and `Direct Messages` gateway intents.
   - In the **OAuth2** section, enable the `role_connections.write` scope
     (required for Linked Roles).
   - Add your callback URL to **Redirects**:
     `https://yourdomain.com/api/discord/callback`
   - Invite the bot with the `applications.commands` scope (for slash commands)
     and `Send Messages` permission.
2. **Linked Roles** — configure Discord Linked Roles in the admin UI. The bot
   exposes two role-connection metadata fields, `is_subscribed` (an entitled
   member with Plex access) and `watched_hours` (from Tautulli). Register them
   with `npm run register-discord-metadata`. See *Linked-role refresh* for
   when they are pushed.
3. **Configuration** — the bot token and support channel/thread IDs are now
   **managed in the admin UI** (`Admin → Settings → Discord`) and stored
   **encrypted** in the database. Environment variables act as a **fallback**
   when the corresponding DB fields are unset, so existing deployments keep
   working:
   ```
   # Optional: set to "false" to disable bot attempts (default: enabled).
   # The bot uses a distributed DB lock, so only one pod runs it.
   ENABLE_DISCORD_BOT="true"

   # Fallbacks only — prefer setting these in Admin → Settings → Discord.
   DISCORD_BOT_TOKEN=...
   DISCORD_SUPPORT_CHANNEL_ID=...   # optional; informational (pinned-post/portal)
   DISCORD_SUPPORT_THREAD_IDS=...   # optional, comma-delimited
   DISCORD_PORTAL_URL=https://yourdomain.com/discord/link  # optional
   ```
   Only the **bot token** is required for the bot to start. Setting/rotating the
   token in the admin UI takes effect **without a redeploy** (see *Token
   rotation* below).

> **Tip:** Grab IDs by enabling *Developer Mode* in Discord → Advanced →
> right-click → "Copy ID".

## Linked-role refresh

A member's linked role follows their access:

- `is_subscribed` is true only when the member is entitled (not disabled and,
  with Stripe on, paying, exempt or an admin) **and** Plex reports access to
  the server. `platform_username` is the member's display name, never their
  email.
- **Within minutes of an access change** — an unshare, demotion, disable or
  re-enable, a Stripe revoke, a Plex grant, any Stripe subscription status
  change, and the admin's cancel, comp-grant and exemption actions — a
  `discord:role:sync` job re-pushes the metadata. Jobs are deduplicated per
  member (`discord:role:<userId>`) and retried 3 times. These syncs reuse the
  stored `watched_hours` (`DiscordConnection.lastWatchedHours`) instead of
  scanning Tautulli.
- **Daily at 04:00** in the server time zone (`Config.timezone`, else `TZ`,
  else UTC, read at boot), `discord:role:reconcile` re-syncs every link whose
  last sync is more than 20 hours old, at most 25 a minute, and recomputes
  `watched_hours` through the shared Tautulli limit. Linking an account and
  the member's own "Resync" also recompute the hours. Like the watchlist
  sync, the schedule follows the settings at boot: it is created when the
  server starts with the integration on and removed when it starts with it
  off, so restart after turning the integration on.
- **Without `REDIS_URL`**, the access-change sync runs inline on a best-effort
  basis, and the daily reconcile does not run (it needs the job queue).
- Nothing is synced while the integration is off, or for members who have not
  linked Discord.

## Marking as the member

`/mark finished` and the assistant's `mark_media_finished` tool mark the item
watched in the **member's** Plex history, never the owner's. Plex Manager
looks up the member's own access token for this server on plex.tv (from their
stored Plex sign-in, cached for 10 minutes) and scrobbles with it. When the
member has no stored sign-in, or plex.tv does not list this server for them,
the mark is still saved, nothing is sent to Plex, and the reply asks them to
sign in with Plex and try again. The assistant still picks the first search
hit, so a wrong pick now touches only the member's own history.

## Registering slash commands

Slash commands must be registered with Discord once per deploy (and whenever the
command set changes):

```bash
# Global registration (eventually consistent across all guilds):
DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... npm run register-discord-commands

# Instant registration to a single guild (recommended for development):
DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... \
  npm run register-discord-commands
```

The script performs an idempotent bulk overwrite of the application's commands.

## Running the bot

The bot **only starts** when `ENABLE_DISCORD_BOT="true"`:

```bash
npm run dev      # Development
npm run start    # Production
```

**Distributed locking for horizontal scaling:** the bot uses a **database-backed
distributed lock** so exactly one instance runs it, even when scaled
horizontally (Kubernetes, Docker Swarm, etc.).

- All pods attempt to acquire the lock on startup; only one succeeds.
- The lease lasts **30 s**. The holder renews it every **10 s** (a third of the
  lease) on its own timer, starting the moment it takes the lock, before the bot
  logs in. If the holder crashes, the lease expires within 30 s and another pod
  takes it at its next poll.
- Every pod also runs a **poll** every `DISCORD_BOT_POLL_INTERVAL_MS`
  (default `10000`, 10 s). The poll tries for the lock when this pod does not
  hold it, re-checks the "bot enabled" switch, and applies config changes (see
  *Token rotation*). The poll never renews the lease, so a longer poll interval
  only slows takeover and settings changes; it cannot take the bot offline.
- No manual configuration needed.

**Gateway compression is optional.** `zlib-sync` is an optional dependency.
When it builds (it needs `python3`, `make` and `g++` at install time),
discord.js compresses the gateway connection; when it does not, `npm ci` skips
it and the bot connects uncompressed. The Docker image ships without that
toolchain, so it runs uncompressed. To compress, install the toolchain before
`npm ci` in your own image.

### Token rotation

Because only the lock holder runs the bot, config changes are applied there. The
lock poller watches a `configVersion` counter on the `DiscordIntegration` row
(bumped on every settings save). When it changes, the holding pod **bounces** the
bot — `destroy()` then `initialize()` — so it reconnects with the fresh token,
**without a redeploy**. If the re-initialization fails, the pod releases the lease
so another pod can take over.

## Support flow

There is **no passive channel monitoring**. Users get help by:

- Running `/help` (or `/help command:<name>`).
- DMing the bot for the AI assistant.

Pin a message in your support channel pointing members at these. The support
channel/thread IDs remain configurable (informational only).

## Chatbot integration & privacy

- The bot calls `handleDiscordChat()` directly (no HTTP overhead) for verified
  users, reusing the chat LLM provider configured in the admin settings.
- Conversation history is persisted per Discord DM/channel, so multi-turn context
  is maintained. Session creation and history append are transactional (safe
  under concurrent messages).
- Every model call from Discord writes one `LLMUsage` row: the member, the
  model, token counts and cost, and the prompt and response text (the whole
  conversation so far, tool results included). Admins can read these at
  `/admin/llm-usage`, where opening a member's record or conversation writes a
  `MEMBER_CONTENT_VIEWED` audit row (once an hour per admin and member).
- The command log (`DiscordCommandLog`) keeps only the length of what a member
  types to the assistant (`argsLength`), never the text; `/admin/discord`
  shows "Message, N characters".
- Members are told: the first reply of each chat session, `/help`, the
  `/assistant ask` description, the sign-in screen, `/help#privacy` and the
  account page say that server admins can review assistant conversations and
  name the provider that processes them.
- **Data-leak prevention (defense in depth):**
  1. **Single tool registry** — each chatbot tool declares `discordSafe`,
     `userScoped`, and an output-field allowlist (`discordFields`).
  2. **Allowlist scrubbing before the LLM** — in the Discord context, every tool
     result is projected to its `discordFields` allowlist *before* the model sees
     it, so user-identifying fields (email, username, IPs, IDs) never enter the
     context. Undeclared/unknown tools **fail closed**.
  3. **Fail-closed execution** — a tool not in the Discord-safe set cannot run in
     the Discord context (blocks prompt injection); denials are audit-logged.
  4. **Authorization tiers** — server-wide diagnostic tools (queue/history) are
     restricted to app admins in Discord; members get self-scoped tools.
  5. **Denylist backstop** — the final assistant text is still scrubbed for
     emails, phones, IPv4/IPv6, and long/structural IDs.
- Discord link/unlink, config changes, and token rotation are recorded as audit
  events (never the secret values).

## Limits and spend caps

Every limit is per member (keyed by app user id) and shared across app
processes through Redis, with the in-process store as the fallback
(`lib/security/rate-limit-config.ts`).

| What | Limit |
|---|---|
| Assistant messages, DMs and `/assistant ask` together | 20 an hour and 100 a day (`llm:discord:dm`, `llm:discord:dm:day`) |
| `/mystats` | 5 an hour (`discord:mystats`) |
| The web "Force resync" button | 3 an hour (`discord:resync`) |
| The admin assistant on the web | 60 messages an hour per admin (`llm:assistant:admin`) |

A refused message is answered with when the member can ask again, for example
"You can ask again in 42 minutes", and makes no LLM call.

On top of the message limits, the assistant has **daily spend caps**, set under
Settings, LLM Configuration, Chat Assistant: per member (default $0.50), per
admin (default $5) and for the whole server (default $5), in US dollars per day
in the server time zone. They count only assistant calls, both on the web and in
Discord; Rewind generation has its own budget. The caps are checked before every
LLM call, including each step of a tool loop, so a long turn stops at the cap
with "I've hit today's assistant budget. It resets at midnight server time." If
the check itself fails, for example while the database is down, the call is
refused. A cap of 0 turns the assistant off for that group.

Every billed call is an `LLMUsage` row, including calls cut short by the token
limit (`outcome: length`), refused or filtered by the provider. A provider error
that carries no token usage is logged, not recorded.

## Troubleshooting

- **Slash commands don't appear** → run `npm run register-discord-commands`
  (use `DISCORD_GUILD_ID` for instant dev registration).
- **Bot won't start** → ensure a bot token is set (admin UI or `DISCORD_BOT_TOKEN`)
  and `ENABLE_DISCORD_BOT="true"`.
- **Token change not taking effect** → the holding pod bounces within one poll
  interval; check logs for the bounce, and that the lock is held.
- **Bot keeps going offline or logging in again** → while it runs,
  `SELECT "instanceId", "lastRenewedAt", "expiresAt" FROM "DiscordBotLock"`
  should show `lastRenewedAt` advancing every 10 s for one instance. If it
  stops, check database connectivity: a failed renewal shuts the bot down
  until the next poll takes the lock again.
- **Bot stays offline for up to 30 s after a restart** → a clean stop
  (SIGTERM, `docker stop`) destroys the bot and deletes the `DiscordBotLock`
  row, so the next instance takes over at its first poll. The shutdown
  coordinator needs `NEXT_MANUAL_SIG_HANDLE=true` (the image and
  `npm run start:prod` set it); without it, Next exits at once and the lease
  has to expire instead. With manual signal handling Next no longer closes the
  HTTP server: in-flight requests finish within `SHUTDOWN_GRACE_MS` (default
  8000) because the process exits last.
- **Assistant doesn't reply in a channel** → the assistant is DM-based; DM the
  bot, or use `/assistant ask`.
- **Verification errors** → check database connectivity and that the Discord
  account is linked in the admin UI.
