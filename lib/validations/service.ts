import { parseServerUrl } from "@/lib/utils"
import { z } from "zod"

// Service types enum matching the Prisma enum
export const ServiceType = {
  PLEX: "PLEX",
  TAUTULLI: "TAUTULLI",
  OVERSEERR: "OVERSEERR",
  SONARR: "SONARR",
  RADARR: "RADARR",
  LLM_PROVIDER: "LLM_PROVIDER",
  DISCORD: "DISCORD",
} as const

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType]

// Helper function for URL validation and normalization
const createUrlSchema = (example: string) =>
  z
    .string()
    .min(1, "Server URL is required")
    .refine(
      (url) => {
        try {
          parseServerUrl(url)
          return true
        } catch {
          return false
        }
      },
      { message: `Invalid URL format. Expected format: ${example}` }
    )
    .transform((url) => {
      // Normalize URL by parsing and reconstructing it
      const parsed = parseServerUrl(url)
      const defaultPort = parsed.protocol === "https" ? 443 : 80
      if (parsed.port === defaultPort) {
        return `${parsed.protocol}://${parsed.hostname}`
      }
      return `${parsed.protocol}://${parsed.hostname}:${parsed.port}`
    })

// Helper for optional public URL validation
const publicUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url) return true
      try {
        new URL(url)
        return true
      } catch {
        return false
      }
    },
    { message: "Invalid URL format. Expected format: https://example.com" }
  )

// ============================================
// Service-specific config schemas
// ============================================

// Plex config stored in JSON
export const plexConfigSchema = z.object({
  token: z.string().min(1, "Plex token is required"),
  adminPlexUserId: z.string().optional(),
})

export type PlexConfig = z.infer<typeof plexConfigSchema>

// API Key-based services (Tautulli, Overseerr, Sonarr, Radarr)
export const apiKeyConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
})

export type ApiKeyConfig = z.infer<typeof apiKeyConfigSchema>

// LLM Provider config
export const llmProviderConfigSchema = z.object({
  provider: z.enum(["openai"], {
    message: "Please select a provider",
  }),
  purpose: z.enum(["chat", "wrapped"]),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
})

export type LLMProviderConfig = z.infer<typeof llmProviderConfigSchema>

// Helper to parse Discord invite code from URL or code
function parseDiscordInviteCode(input: string): string {
  if (!input) return ""
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/discord\.gg\/([a-zA-Z0-9]+)/i)
  if (urlMatch) {
    return urlMatch[1]
  }
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

// Discord config - Note: Discord doesn't use url/publicUrl, uses separate config fields
export const discordConfigSchema = z.object({
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

export type DiscordConfig = z.infer<typeof discordConfigSchema>

// ============================================
// Full service schemas for each type
// ============================================

// Base schema for URL-based services
const baseUrlServiceSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  publicUrl: publicUrlSchema,
})

// Plex service schema
export const plexServiceSchema = baseUrlServiceSchema.extend({
  type: z.literal(ServiceType.PLEX),
  url: createUrlSchema("https://example.com:32400"),
  config: plexConfigSchema,
})

export type PlexServiceInput = z.input<typeof plexServiceSchema>
export type PlexServiceParsed = z.output<typeof plexServiceSchema>

// Tautulli service schema
export const tautulliServiceSchema = baseUrlServiceSchema.extend({
  type: z.literal(ServiceType.TAUTULLI),
  url: createUrlSchema("http://example.com:8181"),
  config: apiKeyConfigSchema,
})

export type TautulliServiceInput = z.input<typeof tautulliServiceSchema>
export type TautulliServiceParsed = z.output<typeof tautulliServiceSchema>

// Overseerr service schema
export const overseerrServiceSchema = baseUrlServiceSchema.extend({
  type: z.literal(ServiceType.OVERSEERR),
  url: createUrlSchema("http://example.com:5055"),
  config: apiKeyConfigSchema,
})

export type OverseerrServiceInput = z.input<typeof overseerrServiceSchema>
export type OverseerrServiceParsed = z.output<typeof overseerrServiceSchema>

// Sonarr service schema
export const sonarrServiceSchema = baseUrlServiceSchema.extend({
  type: z.literal(ServiceType.SONARR),
  url: createUrlSchema("http://example.com:8989"),
  config: apiKeyConfigSchema,
})

export type SonarrServiceInput = z.input<typeof sonarrServiceSchema>
export type SonarrServiceParsed = z.output<typeof sonarrServiceSchema>

// Radarr service schema
export const radarrServiceSchema = baseUrlServiceSchema.extend({
  type: z.literal(ServiceType.RADARR),
  url: createUrlSchema("http://example.com:7878"),
  config: apiKeyConfigSchema,
})

export type RadarrServiceInput = z.input<typeof radarrServiceSchema>
export type RadarrServiceParsed = z.output<typeof radarrServiceSchema>

// LLM Provider service schema - Note: LLM providers don't use URL
export const llmProviderServiceSchema = z.object({
  type: z.literal(ServiceType.LLM_PROVIDER),
  name: z.string().min(1, "Provider name is required"),
  config: llmProviderConfigSchema,
})

export type LLMProviderServiceInput = z.input<typeof llmProviderServiceSchema>
export type LLMProviderServiceParsed = z.output<typeof llmProviderServiceSchema>

// Discord service schema - Note: Discord doesn't use URL like other services
export const discordServiceSchema = z.object({
  type: z.literal(ServiceType.DISCORD),
  name: z.string().default("Discord"),
  config: discordConfigSchema,
})

export type DiscordServiceInput = z.input<typeof discordServiceSchema>
export type DiscordServiceParsed = z.output<typeof discordServiceSchema>

// Union of all service schemas for discriminated validation
export const serviceSchema = z.discriminatedUnion("type", [
  plexServiceSchema,
  tautulliServiceSchema,
  overseerrServiceSchema,
  sonarrServiceSchema,
  radarrServiceSchema,
  llmProviderServiceSchema,
  discordServiceSchema,
])

export type ServiceInput = z.input<typeof serviceSchema>
export type ServiceParsed = z.output<typeof serviceSchema>

// ============================================
// Type guards for config extraction
// ============================================

export function isPlexConfig(config: unknown): config is PlexConfig {
  return plexConfigSchema.safeParse(config).success
}

export function isApiKeyConfig(config: unknown): config is ApiKeyConfig {
  return apiKeyConfigSchema.safeParse(config).success
}

export function isLLMProviderConfig(config: unknown): config is LLMProviderConfig {
  return llmProviderConfigSchema.safeParse(config).success
}

export function isDiscordConfig(config: unknown): config is DiscordConfig {
  return discordConfigSchema.safeParse(config).success
}

// ============================================
// Helper to get typed config from a service
// ============================================

export function getPlexConfig(service: { type: string; config: unknown }): PlexConfig {
  if (service.type !== ServiceType.PLEX) {
    throw new Error(`Expected PLEX service, got ${service.type}`)
  }
  return plexConfigSchema.parse(service.config)
}

export function getApiKeyConfig(service: { type: string; config: unknown }): ApiKeyConfig {
  const validTypes: string[] = [ServiceType.TAUTULLI, ServiceType.OVERSEERR, ServiceType.SONARR, ServiceType.RADARR]
  if (!validTypes.includes(service.type)) {
    throw new Error(`Expected API key service type, got ${service.type}`)
  }
  return apiKeyConfigSchema.parse(service.config)
}

export function getLLMProviderConfig(service: { type: string; config: unknown }): LLMProviderConfig {
  if (service.type !== ServiceType.LLM_PROVIDER) {
    throw new Error(`Expected LLM_PROVIDER service, got ${service.type}`)
  }
  return llmProviderConfigSchema.parse(service.config)
}

export function getDiscordConfig(service: { type: string; config: unknown }): DiscordConfig {
  if (service.type !== ServiceType.DISCORD) {
    throw new Error(`Expected DISCORD service, got ${service.type}`)
  }
  return discordConfigSchema.parse(service.config)
}

// ============================================
// Backwards compatibility exports
// These allow existing code to continue working
// ============================================

// Re-export for backwards compatibility with existing validation imports
export const plexServerSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createUrlSchema("https://example.com:32400"),
  token: z.string().min(1, "Plex token is required"),
  publicUrl: publicUrlSchema,
})

export type PlexServerInput = z.input<typeof plexServerSchema>
export type PlexServerParsed = z.output<typeof plexServerSchema>

export const tautulliSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createUrlSchema("http://example.com:8181"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: publicUrlSchema,
})

export type TautulliInput = z.input<typeof tautulliSchema>
export type TautulliParsed = z.output<typeof tautulliSchema>

export const overseerrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createUrlSchema("http://example.com:5055"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: publicUrlSchema,
})

export type OverseerrInput = z.input<typeof overseerrSchema>
export type OverseerrParsed = z.output<typeof overseerrSchema>

export const sonarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createUrlSchema("http://example.com:8989"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: publicUrlSchema,
})

export type SonarrInput = z.input<typeof sonarrSchema>
export type SonarrParsed = z.output<typeof sonarrSchema>

export const radarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createUrlSchema("http://example.com:7878"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: publicUrlSchema,
})

export type RadarrInput = z.input<typeof radarrSchema>
export type RadarrParsed = z.output<typeof radarrSchema>

export const llmProviderSchema = z.object({
  provider: z.enum(["openai"], {
    message: "Please select a provider",
  }),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
})

export type LLMProviderInput = z.infer<typeof llmProviderSchema>

export const discordIntegrationSchema = discordConfigSchema

export type DiscordIntegrationInput = z.infer<typeof discordIntegrationSchema>
