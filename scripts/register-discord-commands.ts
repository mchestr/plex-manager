#!/usr/bin/env ts-node
/**
 * Script to register the bot's slash commands with Discord (deploy-time).
 *
 * Performs a bulk overwrite of the application's slash commands from the central
 * {@link COMMANDS} registry. Run this whenever the command set changes (add /
 * remove / rename a command, or edit its options).
 *
 * Guild registration (when DISCORD_GUILD_ID is set) is instant and ideal for
 * development. Global registration (no guild id) is the production path but can
 * take up to an hour to propagate.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=your_bot_token \
 *   DISCORD_CLIENT_ID=your_client_id \
 *   npm run register-discord-commands
 *
 * For instant, guild-scoped registration during development, also set:
 *   DISCORD_GUILD_ID=your_dev_guild_id
 *
 * Or set these in your .env file and run:
 *   npm run register-discord-commands
 */

import { REST, Routes } from "discord.js"
import dotenv from "dotenv"
import { COMMANDS } from "@/lib/discord/commands/registry"

dotenv.config()

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
const GUILD_ID = process.env.DISCORD_GUILD_ID

if (!BOT_TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN environment variable is required")
  console.error("   Get it from: https://discord.com/developers/applications → Your App → Bot → Token")
  process.exit(1)
}

if (!CLIENT_ID) {
  console.error("❌ DISCORD_CLIENT_ID environment variable is required")
  console.error("   Get it from: https://discord.com/developers/applications → Your App → OAuth2 → Client ID")
  process.exit(1)
}

async function main() {
  // TypeScript guard: these are checked above but TypeScript doesn't know
  if (!BOT_TOKEN || !CLIENT_ID) {
    process.exit(1)
  }

  const body = COMMANDS.map((command) => command.data.toJSON())
  const commandNames = COMMANDS.map((command) => command.data.name)

  console.log("📝 Registering Discord slash commands...")
  console.log(`   Application ID: ${CLIENT_ID}`)
  console.log(`   Scope: ${GUILD_ID ? `guild ${GUILD_ID} (instant)` : "global (may take up to 1 hour)"}`)
  console.log(`   Commands (${commandNames.length}): ${commandNames.map((name) => `/${name}`).join(", ")}`)
  console.log("")

  const rest = new REST().setToken(BOT_TOKEN)

  try {
    await rest.put(
      GUILD_ID
        ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        : Routes.applicationCommands(CLIENT_ID),
      { body }
    )
    console.log("✅ Successfully registered slash commands!")
    console.log("")
    console.log("Registered commands:")
    commandNames.forEach((name, index) => {
      console.log(`   ${index + 1}. /${name}`)
    })
    if (!GUILD_ID) {
      console.log("")
      console.log("💡 Global commands can take up to an hour to appear in every server.")
      console.log("   Set DISCORD_GUILD_ID to register instantly in a single (dev) guild.")
    }
  } catch (error) {
    console.error("❌ Failed to register slash commands:")
    if (error instanceof Error) {
      console.error(`   ${error.message}`)
    } else {
      console.error(error)
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})
