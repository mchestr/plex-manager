#!/usr/bin/env ts-node
/**
 * Script to register Discord role connection metadata schema.
 *
 * This MUST be run before you can use the role_connections.write scope.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=your_bot_token \
 *   DISCORD_CLIENT_ID=your_client_id \
 *   npm run register-discord-metadata
 *
 * Or set these in your .env file and run:
 *   npm run register-discord-metadata
 */

import { getRoleConnectionMetadata, registerRoleConnectionMetadata } from "@/lib/discord/api"
import dotenv from "dotenv"

dotenv.config()

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID

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

const TYPE_NAMES: Record<number, string> = {
  1: "INTEGER_LESS_THAN_OR_EQUAL",
  2: "INTEGER_GREATER_THAN_OR_EQUAL",
  3: "INTEGER_EQUAL",
  4: "INTEGER_NOT_EQUAL",
  5: "DATETIME_LESS_THAN_OR_EQUAL",
  6: "DATETIME_GREATER_THAN_OR_EQUAL",
  7: "BOOLEAN_EQUAL",
  8: "BOOLEAN_NOT_EQUAL",
}

function displayMetadata(metadata: Array<{ type: number; key: string; name: string; description: string; name_localizations?: Record<string, string> }>) {
  if (metadata.length === 0) {
    console.log("   No metadata registered")
    return
  }

  metadata.forEach((field, index) => {
    // Use emoji for boolean types, name for others (matching Discord's display format)
    const displayName = field.type === 7 || field.type === 8 ? "⭐" : field.name
    console.log(`   ${index + 1}. ${displayName} (${field.key})`)
    console.log(`      Type: ${field.type} (${TYPE_NAMES[field.type] || "UNKNOWN"})`)
    console.log(`      Description: ${field.description}`)
    if (field.name_localizations) {
      console.log(`      Localizations: ${Object.keys(field.name_localizations).length} languages`)
    }
    if (index < metadata.length - 1) {
      console.log("")
    }
  })
}

async function main() {
  // TypeScript guard: these are checked above but TypeScript doesn't know
  if (!BOT_TOKEN || !CLIENT_ID) {
    process.exit(1)
  }

  console.log("🔍 Checking current Discord role connection metadata...")
  console.log(`   Application ID: ${CLIENT_ID}`)
  console.log("")

  try {
    // Fetch current metadata
    const currentMetadata = await getRoleConnectionMetadata(BOT_TOKEN, CLIENT_ID)

    if (currentMetadata.length > 0) {
      console.log("📋 Current registered metadata:")
      displayMetadata(currentMetadata)
      console.log("")
      console.log("💡 To register new metadata, you can modify this script and run it again.")
      console.log("   Note: Registering new metadata will REPLACE all existing metadata.")
    } else {
      console.log("📋 Current registered metadata:")
      displayMetadata(currentMetadata)
      console.log("")
      console.log("📝 No metadata found. Would you like to register metadata?")
      console.log("   (Modify this script to change the metadata schema, then run again)")
    }
  } catch (error) {
    console.error("❌ Failed to fetch current metadata:")
    if (error instanceof Error) {
      console.error(`   ${error.message}`)
    } else {
      console.error(error)
    }
    console.log("")
    console.log("⚠️  Continuing to attempt registration...")
    console.log("")
  }

  // Default metadata schema matching your integration settings
  // Type 1 = INTEGER_LESS_THAN_OR_EQUAL
  // Type 2 = INTEGER_GREATER_THAN_OR_EQUAL
  // Type 3 = INTEGER_EQUAL
  // Type 4 = INTEGER_NOT_EQUAL
  // Type 5 = DATETIME_LESS_THAN_OR_EQUAL
  // Type 6 = DATETIME_GREATER_THAN_OR_EQUAL
  // Type 7 = BOOLEAN_EQUAL
  // Type 8 = BOOLEAN_NOT_EQUAL

  const metadata = [
    {
      type: 7 as const, // BOOLEAN_EQUAL - checks if the user has Plex access
      key: "is_subscribed", // Must match your metadataKey in DiscordIntegration
      name: "Subscribed", // Display will show ⭐ for boolean types
      description: "Access to Plex Server",
    },
    {
      type: 2 as const, // INTEGER_GREATER_THAN_OR_EQUAL - checks hours streamed
      key: "watched_hours", // Hours spent streaming
      name: "Hours Streamed",
      description: "Hours spent streaming",
    },
  ]

  console.log("📝 Registering Discord role connection metadata schema...")
  console.log("   New metadata to register:")
  displayMetadata(metadata)
  console.log("")

  try {
    await registerRoleConnectionMetadata(BOT_TOKEN, CLIENT_ID, metadata)
    console.log("✅ Successfully registered role connection metadata schema!")
    console.log("")
    console.log("You can now use the role_connections.write scope in OAuth2.")
    console.log("")
    console.log("Next steps:")
    console.log("1. Go to your Discord server")
    console.log("2. Server Settings → Roles → Create/Edit a role")
    console.log("3. Enable 'Linked Roles' and select your application")
    console.log("4. Set conditions using is_subscribed (boolean) or watched_hours (integer)")
  } catch (error) {
    console.error("❌ Failed to register metadata schema:")
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

