# Release Notes — Discord Enhancements

## ⚠️ Breaking change: `!`-prefix commands removed

The Discord bot has been migrated from `!`-prefix text commands to native Discord
**slash commands**. The old `!help`, `!assistant`, `!finished`, `!keep`, etc. no
longer work. This is a clean break (no grace period).

## Highlights

- **Privacy:** the bot no longer uses the **Message Content privileged intent** —
  it no longer receives the text of arbitrary channel messages. Disable that
  intent in the Discord Developer Portal after deploying.
- **Slash commands:** `/help`, `/mark <finished|keep|notinterested|rewatch|badquality>`,
  `/assistant ask`, `/assistant reset`.
- **New personal self-service commands** (ephemeral, only you see them):
  `/mystats`, `/mymarks [type]`, `/watching`.
- **AI assistant is now DM-based** — DM the bot for multi-turn conversation;
  `/assistant ask` gives a quick ephemeral answer in a channel.
- **Media picker** uses a select menu instead of "type a number".
- **Security:** bot token + channel IDs moved to the **encrypted database**,
  managed in `Admin → Settings → Discord`, with **rotation without redeploy**;
  per-tool allowlist PII scrubbing before the LLM; fail-closed tool execution;
  admin-only gating of server-wide diagnostic tools; audit events for
  link/unlink/config-change/token-rotation; OAuth rate limiting.

## Upgrade steps

1. **Deploy the code** (multi-instance safe; one pod runs the bot via the DB lock).
2. **Regenerate the Prisma client + run migrations** (adds
   `DiscordPendingSelection` and new `DiscordIntegration` columns):
   ```bash
   npm run db:generate
   npm run db:migrate
   ```
3. **Register the slash commands** with Discord:
   ```bash
   DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... npm run register-discord-commands
   # add DISCORD_GUILD_ID=... for instant registration to one guild (dev)
   ```
4. **(Optional) Move the bot token into the admin UI** — `Admin → Settings →
   Discord`. Env vars remain a fallback, so this is not required to keep working.
5. **Disable the Message Content privileged intent** in the Discord Developer
   Portal (Bot tab) — it is no longer needed.
6. **Pin a support message** in your Discord server pointing members at `/help`
   and DMing the bot (passive channel monitoring is retired).

## Notes

- Existing linked accounts, media marks, and command-log history are preserved
  (schema changes are additive).
- Linked Roles metadata is unchanged (`is_subscribed`, `watched_hours`); no
  re-registration needed.
