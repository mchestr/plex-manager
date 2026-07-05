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
| `/mark finished\|keep\|notinterested\|rewatch\|badquality title:<name>` | Mark media; disambiguates multiple matches with a select menu. `finished` also marks it watched in Plex. |
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
   exposes two role-connection metadata fields, `is_subscribed` (Plex access) and
   `watched_hours` (from Tautulli). Register them with
   `npm run register-discord-metadata`.
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
- The lock is renewed on a short interval; if the holder crashes, the lease
  expires (~30s) and another pod takes over.
- No manual configuration needed.

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
  users, reusing the OpenAI configuration stored in the database.
- Conversation history is persisted per Discord DM/channel, so multi-turn context
  is maintained. Session creation and history append are transactional (safe
  under concurrent messages).
- All LLM usage from Discord flows into the `LLMUsage` table for cost tracking.
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

## Troubleshooting

- **Slash commands don't appear** → run `npm run register-discord-commands`
  (use `DISCORD_GUILD_ID` for instant dev registration).
- **Bot won't start** → ensure a bot token is set (admin UI or `DISCORD_BOT_TOKEN`)
  and `ENABLE_DISCORD_BOT="true"`.
- **Token change not taking effect** → the holding pod bounces within one poll
  interval; check logs for the bounce, and that the lock is held.
- **Assistant doesn't reply in a channel** → the assistant is DM-based; DM the
  bot, or use `/assistant ask`.
- **Verification errors** → check database connectivity and that the Discord
  account is linked in the admin UI.
