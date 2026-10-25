/**
 * Registers the bot's slash commands with Discord: one bulk overwrite from
 * `lib/discord/commands/definitions.ts`. Run it whenever the command set
 * changes (a command or option added, removed, renamed or re-described).
 *
 * Credentials: `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` (or
 * `NEXT_PUBLIC_DISCORD_CLIENT_ID`) from the environment or `.env`. When either
 * is missing it reads the token and client id saved in Admin, Discord, which
 * needs `DATABASE_URL` (and the encryption key for the token).
 * `DISCORD_GUILD_ID` registers instantly in one server instead of globally.
 *
 * Usage:
 *   npm run register-discord-commands [-- --dry-run]          # from a checkout
 *   node scripts/dist/register-discord-commands.cjs [--dry-run] # in the image
 *
 * `--dry-run` prints the commands and exits without network or database access.
 */

// Load .env first: the database fallback below reads DATABASE_URL on import.
import "dotenv/config"
import { registerSlashCommands } from "@/lib/discord/register-commands"

function list(names: string[]) {
  names.forEach((name, index) => console.log(`   ${index + 1}. /${name}`))
}

/**
 * The environment's token and client id, filled from the database when either
 * is missing. A database that cannot be read leaves them missing.
 */
async function resolveCredentials(): Promise<{ token?: string; clientId?: string }> {
  const fromEnv = {
    token: process.env.DISCORD_BOT_TOKEN || undefined,
    clientId: process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || undefined,
  }
  if (fromEnv.token && fromEnv.clientId) return fromEnv
  if (!process.env.DATABASE_URL) return fromEnv

  try {
    const { getStoredBotCredentials } = await import("@/lib/discord/config")
    const stored = await getStoredBotCredentials()
    return { token: fromEnv.token ?? stored.token, clientId: fromEnv.clientId ?? stored.clientId }
  } catch (error) {
    console.error(`Could not read the Discord settings from the database: ${error instanceof Error ? error.message : String(error)}`)
    return fromEnv
  }
}

async function main(): Promise<number> {
  if (process.argv.includes("--dry-run")) {
    const names = await registerSlashCommands({ dryRun: true })
    console.log(`Slash commands (${names.length}), dry run, nothing registered:`)
    list(names)
    return 0
  }

  const { token, clientId } = await resolveCredentials()
  if (!token) {
    console.error("No Discord bot token: set DISCORD_BOT_TOKEN, or save the token in Admin, Discord.")
    return 1
  }
  if (!clientId) {
    console.error("No Discord application id: set DISCORD_CLIENT_ID, or save the client ID in Admin, Discord.")
    return 1
  }

  const guildId = process.env.DISCORD_GUILD_ID || undefined
  console.log(`Registering slash commands for application ${clientId}`)
  console.log(`   Scope: ${guildId ? `guild ${guildId} (instant)` : "global (may take up to an hour)"}`)
  try {
    const names = await registerSlashCommands({ token, clientId, guildId })
    console.log(`Registered ${names.length} commands:`)
    list(names)
    return 0
  } catch (error) {
    console.error(`Failed to register slash commands: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("Unexpected error:", error)
    process.exit(1)
  }
)
