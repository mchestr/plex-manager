import { z } from "zod"

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

