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

/**
 * Parses support thread IDs from either a comma-separated string or an array of
 * strings into a normalized `string[]` (trimmed, non-empty). Returns undefined
 * when nothing usable is provided so callers can distinguish "not supplied".
 */
function parseSupportThreadIds(input: unknown): string[] | undefined {
  const raw =
    typeof input === "string"
      ? input.split(",")
      : Array.isArray(input)
        ? input
        : []
  const ids = raw
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0)
  return ids.length > 0 ? ids : undefined
}

export const discordIntegrationSchema = z.object({
  clientId: optionalString,
  clientSecret: optionalString,
  botToken: optionalString,
  supportChannelId: optionalString,
  supportThreadIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => parseSupportThreadIds(value)),
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

/** Parsed (output) shape — transforms applied, defaults resolved. */
export type DiscordIntegrationInput = z.infer<typeof discordIntegrationSchema>

/**
 * Pre-parse (input) shape. Optional fields are truly optional keys here (unlike
 * the inferred output type, where a `.optional().transform()` field becomes a
 * required `| undefined` key). Use this to type callers that build a payload to
 * hand to `discordIntegrationSchema.parse()`.
 */
export type DiscordIntegrationInputData = z.input<typeof discordIntegrationSchema>

