# Discord Bot

This repository ships with a Discord bot that runs inside the app's own
process: the single container, or the `worker` container when you split roles
(`PROCESS_ROLE`, see [the workers example](examples/docker-compose.workers.yml)).
It serves users through native **slash commands** and a **DM-based AI
assistant**; it does **not** monitor or read channel messages.

**Admin → Settings → Discord → "Bot enabled"** is the main control. Turn it on
and save a bot token, and the bot comes online within one poll (10 s by
default), with no restart; turn it off and it goes offline the same way.

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
| `/mystats` | Your watch statistics for this year, in your own time zone. |
| `/mymarks [type]` | The media you've marked, optionally filtered by type. |
| `/watching` | What you're currently watching. |

The **AI assistant** is DM-based: DM the bot for a full multi-turn conversation.
DM content is delivered **without** the Message Content privileged intent.

`/mystats` reads the member's completed Rewind for the year when there is one,
so it makes no Tautulli call. Otherwise it reads at most 20 pages (20,000 rows)
of the member's Tautulli history for their year, through the shared Tautulli
limit, and keeps the result for 15 minutes (with Redis). The year is the
member's current year in their own time zone, else the server's.

### Jellyfin members

A member whose account is on Jellyfin can link Discord and use `/help`,
`/mymarks` and the assistant, and their linked role follows their Jellyfin
account. The commands that read Plex answer with the reason instead of an
empty result:

| Command | Reply for a Jellyfin-only member |
|---|---|
| `/mystats` | "Stats use Plex watch history, and your account is on Jellyfin, so they aren't available yet." |
| `/watching` | "I can only see Plex streams for now." |
| `/mark` | "Marking works with the Plex library only." |

The assistant's Plex and Tautulli session tools return
`{"unavailable":"jellyfin-member"}` for them, and the Discord system prompt
names Jellyfin when a Jellyfin server is active, so the assistant explains
this rather than reporting that nothing is playing. A member with both a Plex
and a Jellyfin account uses every command with their Plex account.

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
   member with access on Plex or Jellyfin) and `watched_hours` (this year's
   hours, as `/mystats` reads them). Register them
   with `npm run register-discord-metadata`. See *Linked-role refresh* for
   when they are pushed.
3. **Configuration** — the bot token and support channel/thread IDs are now
   **managed in the admin UI** (`Admin → Settings → Discord`) and stored
   **encrypted** in the database. Environment variables act as a **fallback**
   when the corresponding DB fields are unset, so existing deployments keep
   working:
   ```
   # On by default; "false" opts this process out of running the bot.
   # The bot uses a distributed DB lock, so only one pod runs it.
   # ENABLE_DISCORD_BOT="false"

   # Fallbacks only — prefer setting these in Admin → Settings → Discord.
   DISCORD_BOT_TOKEN=...
   DISCORD_SUPPORT_CHANNEL_ID=...   # optional; informational (pinned-post/portal)
   DISCORD_SUPPORT_THREAD_IDS=...   # optional, comma-delimited
   DISCORD_PORTAL_URL=https://yourdomain.com/discord/link  # optional
   ```
   The bot starts once "Bot enabled" is on and a token exists, saved in the
   admin UI or in `DISCORD_BOT_TOKEN`. Turning it on, saving or rotating the
   token all take effect **without a restart** (see *Token rotation* below).

> **Tip:** Grab IDs by enabling *Developer Mode* in Discord → Advanced →
> right-click → "Copy ID".

## Linked-role refresh

A member's linked role follows their access:

- `is_subscribed` is true only when the member is entitled (not disabled and,
  with Stripe on, paying, exempt or an admin) **and** has access on one of
  their services: Plex reports a share of the server, or their Jellyfin
  account on the active server exists and is not disabled. When no service
  grants access and one cannot answer, nothing is pushed and Discord keeps the
  stored role. `platform_username` is the member's display name, never their
  email.
- **Within minutes of an access change** — an unshare, demotion, disable or
  re-enable, a Stripe revoke, a Plex grant, any Stripe subscription status
  change, and the admin's cancel, access-grant and exemption actions — a
  `discord:role:sync` job re-pushes the metadata. Jobs are deduplicated per
  member (`discord:role:<userId>`) and retried 3 times. These syncs reuse the
  stored `watched_hours` (`DiscordConnection.lastWatchedHours`) instead of
  reading the hours again.
- **Daily at 04:00** in the server time zone (`Config.timezone`, else `TZ`,
  else UTC, read at boot), `discord:role:reconcile` re-syncs every link whose
  last sync is more than 20 hours old, at most 25 a minute, and recomputes
  `watched_hours` the way `/mystats` reads them (the stored Rewind, else at
  most 20 pages of the member's year) through the shared Tautulli limit. Linking an account and
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

Slash commands must be registered with Discord once, and again whenever the
command set changes (the changelog says when):

```bash
# From a checkout (reads .env):
npm run register-discord-commands

# From the image:
docker compose exec app node scripts/dist/register-discord-commands.cjs

# List the commands without registering anything (no network, no database):
npm run register-discord-commands -- --dry-run
```

The script reads `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` (or
`NEXT_PUBLIC_DISCORD_CLIENT_ID`) from the environment or `.env`. When either is
missing, it uses the bot token and client ID saved in Admin → Settings →
Discord, read through `DATABASE_URL`. Without `DISCORD_GUILD_ID` the commands
are global and can take up to an hour to appear; with it they appear at once in
that server, which suits development. It performs an idempotent bulk overwrite
of the application's commands. `register-discord-metadata` runs the same two
ways (`node scripts/dist/register-discord-metadata.cjs` in the image), from
the environment only.

## Running the bot

Every process that runs background work (`PROCESS_ROLE` `all` or `worker`)
polls for the bot unless `ENABLE_DISCORD_BOT="false"`. On each poll it checks
that "Bot enabled" is on and a token exists, so a bot turned on or given a
token after boot starts at the next poll. The log says why it is waiting, once
per change: `discord.waiting_for_enable`, `discord.waiting_for_token`, then
`discord.ready`. If the database cannot be read, that poll counts as not ready
(warning at most once a minute) and the next poll tries again.

```bash
npm run dev      # Development
npm run start    # Production
```

**Distributed locking for horizontal scaling:** the bot runs under the
`discord-bot` **database lease** (`lib/locks/`: `LeaseLock` and `LeasePoller`,
one `LeaseLock` row per name) so exactly one instance runs it, even when scaled
horizontally (Kubernetes, Docker Swarm, etc.). The watchlist sync fallback
without Redis shares the same lock and poller under the name `watchlist-sync`.

- All pods attempt to acquire the lock on startup; only one succeeds.
- The lease lasts **30 s**. The holder renews it every **10 s** (a third of the
  lease) on its own timer, starting the moment it takes the lock, before the bot
  logs in. If the holder crashes, the lease expires within 30 s and another pod
  takes it at its next poll.
- Every pod also runs a **poll** every `DISCORD_BOT_POLL_INTERVAL_MS`
  (default `10000`, 10 s). The poll tries for the lock when this pod does not
  hold it, re-checks the "Bot enabled" switch and the token, and applies config changes (see
  *Token rotation*). The poll never renews the lease, so a longer poll interval
  only slows takeover and settings changes; it cannot take the bot offline.
- No manual configuration needed.
- Only `worker` and `all` containers (`PROCESS_ROLE`) poll for the lock; a
  `web` container never runs the bot. See
  [the workers example](examples/docker-compose.workers.yml).

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
bot, which logs in again **only if the token changed**; a save that left the
token alone keeps the gateway session, so it costs no login. A different token
destroys the old client first, so one process never holds two. A bot that is not
running picks the change up at its next poll.

### Login limits, backoff and a reset token

Discord allows about 1000 gateway logins (IDENTIFY) per bot per 24 hours and
**resets the bot's token** above that. The bot stays far below it:

- **Failed logins back off.** After a failed login the holding pod keeps the
  lease and waits 30 s, then 60 s, doubling up to 30 min, with jitter. The delay
  resets after the bot has been READY for a minute. A failed login always
  destroys the client it created.
- **Fatal errors stop.** A rejected token (close code 4004) or invalid or
  disallowed intents (4013, 4014) will fail every time, so the bot stops trying,
  logs `discord.login_fatal` at error and shows **Login rejected** under
  Admin, Settings, Discord. It tries again when a different token is saved.
- **Daily cap.** At most 100 login attempts in a rolling 24 hours, counted in
  Redis when `REDIS_URL` is set (so restarts do not clear the count) and in
  memory otherwise. Above it the bot logs `discord.login_daily_cap` at error and
  shows **Login limit reached** until the count falls.
- **A renewal that fails once does not drop the session.** The bot stays up for
  15 s after a failed lease renewal. If this pod takes the lease back at its
  next poll, the same gateway session carries on. If not, the bot is destroyed
  before the lease can lapse for another pod. Turning the bot off, or stopping
  the process, destroys it at once.
- discord.js resumes a dropped connection by itself (`ShardReconnecting`,
  `ShardResume`); the bot does not destroy the client for that.

**After Discord resets a token:** generate a new one in the Discord Developer
Portal (Bot, Reset Token) and paste it under Admin, Settings, Discord (Edit,
then Save changes). The bot
logs in within one poll. While it was reset, check `plex_manager_discord_gateway_logins_24h`
and the `ShardDisconnect` warnings (`code`, `reason`) in the log to see what
looped.

`/api/metrics` reports (Redis required):
`plex_manager_discord_gateway_logins_total`,
`plex_manager_discord_gateway_logins_24h`,
`plex_manager_discord_gateway_disconnects_total`,
`plex_manager_discord_gateway_last_close_code` and `plex_manager_discord_bot_healthy`
(0 while the token is rejected, the bot is backing off or the cap is hit).
Alert when `logins_24h` passes 50.

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
- The app tells members that server admins can review assistant
  conversations, and names the provider that processes them. It does this in
  the first reply of each chat session, `/help`, the `/assistant ask`
  description, the sign-in screen and the account page.
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
  (in the image, `node scripts/dist/register-discord-commands.cjs`; use
  `DISCORD_GUILD_ID` for instant dev registration).
- **Bot won't start** → `/admin/discord` says "Turned off" (turn on "Bot
  enabled") or "Waiting for a bot token" (save one, or set
  `DISCORD_BOT_TOKEN`). Check that `ENABLE_DISCORD_BOT` is not `"false"` and
  that a `worker` or `all` container is running.
- **Token change not taking effect** → the holding pod bounces within one poll
  interval; check logs for the bounce, and that the lock is held.
- **Bot keeps going offline or logging in again** → while it runs,
  `SELECT "instanceId", "lastRenewedAt", "expiresAt" FROM "LeaseLock" WHERE "name" = 'discord-bot'`
  should show `lastRenewedAt` advancing every 10 s for one instance. If it
  stops, check database connectivity: a failed renewal shuts the bot down
  until the next poll takes the lock again.
- **Bot stays offline for up to 30 s after a restart** → a clean stop
  (SIGTERM, `docker stop`) destroys the bot and deletes its `LeaseLock`
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
