"use server"

// Type definitions for dev defaults
interface ServiceDefaults {
  name?: string
  url?: string
  token?: string
  apiKey?: string
  publicUrl?: string
}

interface LLMDefaults {
  provider?: "openai"
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

interface DiscordDefaults {
  isEnabled?: boolean
  botEnabled?: boolean
  clientId?: string
  clientSecret?: string
  guildId?: string
  serverInviteCode?: string
  platformName?: string
  instructions?: string
}

export interface DevDefaults {
  plex: ServiceDefaults | null
  tautulli: ServiceDefaults | null
  overseerr: ServiceDefaults | null
  sonarr: ServiceDefaults | null
  radarr: ServiceDefaults | null
  discord: DiscordDefaults | null
  chatLlmProvider: LLMDefaults | null
  wrappedLlmProvider: LLMDefaults | null
  /** @deprecated Use chatLlmProvider or wrappedLlmProvider instead */
  llmProvider: LLMDefaults | null
  /** Whether any DEV_* variables are actively providing defaults */
  isDevMode: boolean
  /** Whether auto-submit is enabled for fully populated forms */
  autoSubmit: boolean
}

/**
 * Returns development defaults for the setup wizard.
 *
 * SECURITY NOTE: These values are ONLY available in development mode (NODE_ENV=development).
 * In production, all values return null regardless of environment variables.
 *
 * Auto-submit behavior:
 * - When DEV_SETUP_AUTO_SUBMIT=true and all required fields for a form are populated,
 *   the form will automatically submit after a brief delay.
 * - This enables zero-click setup for development environments.
 */
export async function getDevDefaults(): Promise<DevDefaults> {
  const emptyDefaults: DevDefaults = {
    plex: null,
    tautulli: null,
    overseerr: null,
    sonarr: null,
    radarr: null,
    discord: null,
    chatLlmProvider: null,
    wrappedLlmProvider: null,
    llmProvider: null,
    isDevMode: false,
    autoSubmit: false,
  }

  // Only expose in development - this is a critical security boundary
  if (process.env.NODE_ENV !== "development") {
    return emptyDefaults
  }

  // Track if any DEV_* variables are set
  let hasAnyDefaults = false

  // Plex defaults
  const plexDefaults: ServiceDefaults = {}
  if (process.env.DEV_PLEX_NAME) plexDefaults.name = process.env.DEV_PLEX_NAME
  if (process.env.DEV_PLEX_URL) plexDefaults.url = process.env.DEV_PLEX_URL
  if (process.env.DEV_PLEX_TOKEN) plexDefaults.token = process.env.DEV_PLEX_TOKEN
  if (process.env.DEV_PLEX_PUBLIC_URL) plexDefaults.publicUrl = process.env.DEV_PLEX_PUBLIC_URL

  // Tautulli defaults
  const tautulliDefaults: ServiceDefaults = {}
  if (process.env.DEV_TAUTULLI_NAME) tautulliDefaults.name = process.env.DEV_TAUTULLI_NAME
  if (process.env.DEV_TAUTULLI_URL) tautulliDefaults.url = process.env.DEV_TAUTULLI_URL
  if (process.env.DEV_TAUTULLI_API_KEY) tautulliDefaults.apiKey = process.env.DEV_TAUTULLI_API_KEY
  if (process.env.DEV_TAUTULLI_PUBLIC_URL) tautulliDefaults.publicUrl = process.env.DEV_TAUTULLI_PUBLIC_URL

  // Overseerr defaults
  const overseerrDefaults: ServiceDefaults = {}
  if (process.env.DEV_OVERSEERR_NAME) overseerrDefaults.name = process.env.DEV_OVERSEERR_NAME
  if (process.env.DEV_OVERSEERR_URL) overseerrDefaults.url = process.env.DEV_OVERSEERR_URL
  if (process.env.DEV_OVERSEERR_API_KEY) overseerrDefaults.apiKey = process.env.DEV_OVERSEERR_API_KEY
  if (process.env.DEV_OVERSEERR_PUBLIC_URL) overseerrDefaults.publicUrl = process.env.DEV_OVERSEERR_PUBLIC_URL

  // Sonarr defaults
  const sonarrDefaults: ServiceDefaults = {}
  if (process.env.DEV_SONARR_NAME) sonarrDefaults.name = process.env.DEV_SONARR_NAME
  if (process.env.DEV_SONARR_URL) sonarrDefaults.url = process.env.DEV_SONARR_URL
  if (process.env.DEV_SONARR_API_KEY) sonarrDefaults.apiKey = process.env.DEV_SONARR_API_KEY
  if (process.env.DEV_SONARR_PUBLIC_URL) sonarrDefaults.publicUrl = process.env.DEV_SONARR_PUBLIC_URL

  // Radarr defaults
  const radarrDefaults: ServiceDefaults = {}
  if (process.env.DEV_RADARR_NAME) radarrDefaults.name = process.env.DEV_RADARR_NAME
  if (process.env.DEV_RADARR_URL) radarrDefaults.url = process.env.DEV_RADARR_URL
  if (process.env.DEV_RADARR_API_KEY) radarrDefaults.apiKey = process.env.DEV_RADARR_API_KEY
  if (process.env.DEV_RADARR_PUBLIC_URL) radarrDefaults.publicUrl = process.env.DEV_RADARR_PUBLIC_URL

  // Discord defaults
  const discordDefaults: DiscordDefaults = {}
  if (process.env.DEV_DISCORD_ENABLED) discordDefaults.isEnabled = process.env.DEV_DISCORD_ENABLED === "true"
  if (process.env.DEV_DISCORD_BOT_ENABLED) discordDefaults.botEnabled = process.env.DEV_DISCORD_BOT_ENABLED === "true"
  if (process.env.DEV_DISCORD_CLIENT_ID) discordDefaults.clientId = process.env.DEV_DISCORD_CLIENT_ID
  if (process.env.DEV_DISCORD_CLIENT_SECRET) discordDefaults.clientSecret = process.env.DEV_DISCORD_CLIENT_SECRET
  if (process.env.DEV_DISCORD_GUILD_ID) discordDefaults.guildId = process.env.DEV_DISCORD_GUILD_ID
  if (process.env.DEV_DISCORD_SERVER_INVITE_CODE) discordDefaults.serverInviteCode = process.env.DEV_DISCORD_SERVER_INVITE_CODE
  if (process.env.DEV_DISCORD_PLATFORM_NAME) discordDefaults.platformName = process.env.DEV_DISCORD_PLATFORM_NAME
  if (process.env.DEV_DISCORD_INSTRUCTIONS) discordDefaults.instructions = process.env.DEV_DISCORD_INSTRUCTIONS

  // Chat LLM defaults (separate from wrapped)
  const chatLlmDefaults: LLMDefaults = {}
  // First try chat-specific, then fall back to generic DEV_LLM_*
  if (process.env.DEV_CHAT_LLM_PROVIDER) {
    chatLlmDefaults.provider = process.env.DEV_CHAT_LLM_PROVIDER as "openai"
  } else if (process.env.DEV_LLM_PROVIDER) {
    chatLlmDefaults.provider = process.env.DEV_LLM_PROVIDER as "openai"
  }
  if (process.env.DEV_CHAT_LLM_API_KEY) {
    chatLlmDefaults.apiKey = process.env.DEV_CHAT_LLM_API_KEY
  } else if (process.env.DEV_LLM_API_KEY) {
    chatLlmDefaults.apiKey = process.env.DEV_LLM_API_KEY
  }
  if (process.env.DEV_CHAT_LLM_MODEL) {
    chatLlmDefaults.model = process.env.DEV_CHAT_LLM_MODEL
  } else if (process.env.DEV_LLM_MODEL) {
    chatLlmDefaults.model = process.env.DEV_LLM_MODEL
  }
  if (process.env.DEV_CHAT_LLM_TEMPERATURE) {
    chatLlmDefaults.temperature = parseFloat(process.env.DEV_CHAT_LLM_TEMPERATURE)
  }
  if (process.env.DEV_CHAT_LLM_MAX_TOKENS) {
    chatLlmDefaults.maxTokens = parseInt(process.env.DEV_CHAT_LLM_MAX_TOKENS)
  }

  // Wrapped LLM defaults (separate from chat)
  const wrappedLlmDefaults: LLMDefaults = {}
  // First try wrapped-specific, then fall back to generic DEV_LLM_*
  if (process.env.DEV_WRAPPED_LLM_PROVIDER) {
    wrappedLlmDefaults.provider = process.env.DEV_WRAPPED_LLM_PROVIDER as "openai"
  } else if (process.env.DEV_LLM_PROVIDER) {
    wrappedLlmDefaults.provider = process.env.DEV_LLM_PROVIDER as "openai"
  }
  if (process.env.DEV_WRAPPED_LLM_API_KEY) {
    wrappedLlmDefaults.apiKey = process.env.DEV_WRAPPED_LLM_API_KEY
  } else if (process.env.DEV_LLM_API_KEY) {
    wrappedLlmDefaults.apiKey = process.env.DEV_LLM_API_KEY
  }
  if (process.env.DEV_WRAPPED_LLM_MODEL) {
    wrappedLlmDefaults.model = process.env.DEV_WRAPPED_LLM_MODEL
  } else if (process.env.DEV_LLM_MODEL) {
    wrappedLlmDefaults.model = process.env.DEV_LLM_MODEL
  }
  if (process.env.DEV_WRAPPED_LLM_TEMPERATURE) {
    wrappedLlmDefaults.temperature = parseFloat(process.env.DEV_WRAPPED_LLM_TEMPERATURE)
  }
  if (process.env.DEV_WRAPPED_LLM_MAX_TOKENS) {
    wrappedLlmDefaults.maxTokens = parseInt(process.env.DEV_WRAPPED_LLM_MAX_TOKENS)
  }

  // Legacy llmProvider for backwards compatibility
  const llmProviderDefaults: LLMDefaults = {}
  if (process.env.DEV_LLM_PROVIDER) llmProviderDefaults.provider = process.env.DEV_LLM_PROVIDER as "openai"
  if (process.env.DEV_LLM_API_KEY) llmProviderDefaults.apiKey = process.env.DEV_LLM_API_KEY
  if (process.env.DEV_LLM_MODEL) llmProviderDefaults.model = process.env.DEV_LLM_MODEL

  // Build result, only including non-empty objects
  const plex = Object.keys(plexDefaults).length > 0 ? plexDefaults : null
  const tautulli = Object.keys(tautulliDefaults).length > 0 ? tautulliDefaults : null
  const overseerr = Object.keys(overseerrDefaults).length > 0 ? overseerrDefaults : null
  const sonarr = Object.keys(sonarrDefaults).length > 0 ? sonarrDefaults : null
  const radarr = Object.keys(radarrDefaults).length > 0 ? radarrDefaults : null
  const discord = Object.keys(discordDefaults).length > 0 ? discordDefaults : null
  const chatLlmProvider = Object.keys(chatLlmDefaults).length > 0 ? chatLlmDefaults : null
  const wrappedLlmProvider = Object.keys(wrappedLlmDefaults).length > 0 ? wrappedLlmDefaults : null
  const llmProvider = Object.keys(llmProviderDefaults).length > 0 ? llmProviderDefaults : null

  // Check if any defaults are set
  hasAnyDefaults = !!(plex || tautulli || overseerr || sonarr || radarr || discord || chatLlmProvider || wrappedLlmProvider)

  // Auto-submit enables zero-click setup when forms are fully populated
  const autoSubmit = process.env.DEV_SETUP_AUTO_SUBMIT === "true"

  return {
    plex,
    tautulli,
    overseerr,
    sonarr,
    radarr,
    discord,
    chatLlmProvider,
    wrappedLlmProvider,
    llmProvider,
    isDevMode: hasAnyDefaults,
    autoSubmit,
  }
}

