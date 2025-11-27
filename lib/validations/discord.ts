import { z } from "zod"

/**
 * Parses a Discord invite code from either a full URL or just the code
 * Examples:
 * - https://discord.gg/axzpDYH6jz -> axzpDYH6jz
 * - discord.gg/axzpDYH6jz -> axzpDYH6jz
 * - axzpDYH6jz -> axzpDYH6jz
 */
function parseDiscordInviteCode(input: string): string {
  if (!input) return ""

  const trimmed = input.trim()

  // Match Discord invite URLs (https://discord.gg/CODE or discord.gg/CODE)
  const urlMatch = trimmed.match(/discord\.gg\/([a-zA-Z0-9]+)/i)
  if (urlMatch) {
    return urlMatch[1]
  }

  // If it's already just a code, return as-is
  return trimmed
}

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined
    const trimmed = value.trim()
    return trimmed.length === 0 ? undefined : trimmed
  })

export const discordIntegrationSchema = z.object({
  clientId: optionalString,
  clientSecret: optionalString,
  guildId: optionalString,
  serverInviteCode: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined
      const trimmed = value.trim()
      if (trimmed.length === 0) return undefined
      // Parse Discord invite code from full URL if needed
      return parseDiscordInviteCode(trimmed)
    }),
  platformName: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim()
      return trimmed && trimmed.length > 0 ? trimmed : "Plex Wrapped"
    }),
  instructions: optionalString,
  isEnabled: z.boolean().optional().default(false),
  botEnabled: z.boolean().optional().default(false),
})

export type DiscordIntegrationInput = z.infer<typeof discordIntegrationSchema>

