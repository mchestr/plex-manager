# Discord Support Bot

This repository ships with a lightweight Discord bot that **automatically runs with the Next.js process** to monitor a support channel, verify that users have linked roles, and gently remind unverified members to link their account.

## Prerequisites

1. **Discord Application**
   - Enable *Privileged Gateway Intents* for **Message Content** (you must toggle this on the "Bot" tab).
   - In the **OAuth2** section, enable the `role_connections.write` scope (required for Linked Roles).
   - Add your callback URL to **Redirects**: `https://yourdomain.com/api/discord/callback`
   - Invite the bot to your server with the `Send Messages`, `Read Message History`, and `Manage Threads` permissions for the support channel.
2. **Linked Roles**
   - Follow the admin UI instructions to configure Discord Linked Roles and set a *Bot Shared Secret* in `Admin → Settings → Discord Linked Roles`.
3. **Environment**
   - Copy the variables from `example.env` and set:
     ```
     # Optional: Set to "false" to disable bot attempts (default: enabled)
     # The bot uses a distributed database lock, so only one pod will run it automatically
     ENABLE_DISCORD_BOT="true"

     DISCORD_BOT_TOKEN=...
     DISCORD_SUPPORT_CHANNEL_ID=...   # Channel ID the bot should watch
     DISCORD_SUPPORT_THREAD_IDS=...   # Optional comma-delimited list of thread IDs
     DISCORD_PORTAL_URL=https://yourdomain.com/discord/link  # Optional: defaults to NEXT_PUBLIC_APP_URL/discord/link
     ```

> **Tip:** Grab IDs by enabling *Developer Mode* in Discord → Advanced → right-click the channel → “Copy ID”.

## Running the Bot

The Discord bot **only starts** when `ENABLE_DISCORD_BOT="true"` is set in your environment:

```bash
npm run dev      # Development mode
npm run start    # Production mode
```

**Automatic Distributed Locking for Horizontal Scaling**: The bot uses a **database-based distributed lock** to ensure only one instance runs the bot, even when scaling horizontally (Kubernetes, Docker Swarm, etc.).

- All pods attempt to acquire the lock on startup
- Only one pod successfully acquires the lock and runs the bot
- The lock is automatically renewed every 10 seconds
- If a pod crashes, the lock expires after 30 seconds and another pod can take over
- No manual configuration needed - works automatically across all pods

To disable bot attempts entirely, set `ENABLE_DISCORD_BOT="false"` (useful for maintenance or debugging).

The bot will initialize automatically if all required environment variables are set and the lock is acquired. If the lock cannot be acquired, the pod will start normally but skip bot initialization.

The bot:

- Listens for new messages in `DISCORD_SUPPORT_CHANNEL_ID` (and optional threads).
- Verifies users directly via database queries (no HTTP API calls needed).
- Replies with a link reminder if the user is missing the Linked Role and now answers verified members over **DMs** using the in-app troubleshooting chatbot.
- Logs verified messages to stdout so you can pipe them into your own tooling.
- Responds in monitored channels when someone mentions the bot or starts a message with `!assistant` / `!bot` / `!support`, forwarding the request to the chatbot assistant.

## Customizing Behavior

- Update `lib/discord/bot.ts` to add slash commands, forward messages into your ticketing system, or integrate observational tooling.
- Use different channel IDs or add logic for multiple channels by extending the listener.
- The bot uses direct function calls (`lib/discord/services.ts`) instead of HTTP APIs for better security and performance.
- Adjust the `CHAT_TRIGGER_PREFIXES` array if you want additional text commands to wake the chatbot, or remove the mention check to restrict responses to direct mentions only.

## Chatbot Integration

- The bot calls `handleDiscordChat()` directly (no HTTP overhead) for verified users, reusing the same OpenAI configuration stored in the database.
- Conversation history is persisted per Discord channel, so DMs and support threads maintain context between messages.
- All LLM usage triggered from Discord continues to flow into the existing `LLMUsage` table for cost tracking and admin reports.
- If LLM access is disabled (or misconfigured), the bot replies with the same fallback message shown in the Plex Wrapped UI.
- Responses are scrubbed for emails, phone numbers, IPs, or user identifiers, and the system prompt enforces that Discord answers only cover general system status or media issues—anything else is politely declined.
- Discord chats intentionally use a reduced toolset (`get_plex_status`, `get_plex_sessions`, `get_tautulli_status`, `get_tautulli_activity`, `get_overseerr_status`, `get_sonarr_status`, `get_sonarr_queue`, `get_radarr_status`, `get_radarr_queue`). Requests that need other tools are politely declined.

## Troubleshooting

- **Bot won't start** → ensure all required env vars are set and the token is correct.
- **Bot doesn't respond** → double-check the channel IDs, and confirm Message Content intent is enabled in the Discord Developer Portal.
- **Verification errors** → check database connectivity and ensure Discord connections are properly linked in the admin UI.

