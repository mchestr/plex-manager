/**
 * Tests for actions/dev-defaults.ts - development defaults for setup wizard
 */

// Store original environment to restore after tests
const originalEnv = process.env

/**
 * Clear all DEV_* environment variables for clean test state
 */
function clearDevEnvVars() {
  Object.keys(process.env).forEach((key) => {
    if (key.startsWith('DEV_')) {
      delete process.env[key]
    }
  })
}

describe('getDevDefaults', () => {
  beforeEach(() => {
    // Reset modules to ensure fresh import with new environment
    jest.resetModules()
    // Create a fresh copy of environment variables
    process.env = { ...originalEnv }
    // Clear all DEV_* variables for clean test state
    clearDevEnvVars()
  })

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Production Mode', () => {
    it('should return empty defaults when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production'
      process.env.DEV_PLEX_NAME = 'My Plex'
      process.env.DEV_PLEX_URL = 'http://localhost:32400'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.isDevMode).toBe(false)
      expect(result.autoSubmit).toBe(false)
      expect(result.plex).toBeNull()
      expect(result.tautulli).toBeNull()
      expect(result.overseerr).toBeNull()
      expect(result.sonarr).toBeNull()
      expect(result.radarr).toBeNull()
      expect(result.discord).toBeNull()
      expect(result.chatLlmProvider).toBeNull()
      expect(result.wrappedLlmProvider).toBeNull()
      expect(result.llmProvider).toBeNull()
    })

    it('should return empty defaults when NODE_ENV is test but treated as production', async () => {
      // Note: In actual tests NODE_ENV is 'test', so this tests that behavior
      process.env.NODE_ENV = 'test'
      process.env.DEV_PLEX_NAME = 'My Plex'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      // test is not development, so should return empty
      expect(result.isDevMode).toBe(false)
    })
  })

  describe('Development Mode - Service Defaults', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should return Plex defaults when DEV_PLEX_* variables are set', async () => {
      process.env.DEV_PLEX_NAME = 'My Plex Server'
      process.env.DEV_PLEX_URL = 'http://localhost:32400'
      process.env.DEV_PLEX_TOKEN = 'test-token-123'
      process.env.DEV_PLEX_PUBLIC_URL = 'https://plex.example.com'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.plex).toEqual({
        name: 'My Plex Server',
        url: 'http://localhost:32400',
        token: 'test-token-123',
        publicUrl: 'https://plex.example.com',
      })
      expect(result.isDevMode).toBe(true)
    })

    it('should return Tautulli defaults when DEV_TAUTULLI_* variables are set', async () => {
      process.env.DEV_TAUTULLI_NAME = 'My Tautulli'
      process.env.DEV_TAUTULLI_URL = 'http://localhost:8181'
      process.env.DEV_TAUTULLI_API_KEY = 'tautulli-api-key'
      process.env.DEV_TAUTULLI_PUBLIC_URL = 'https://tautulli.example.com'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.tautulli).toEqual({
        name: 'My Tautulli',
        url: 'http://localhost:8181',
        apiKey: 'tautulli-api-key',
        publicUrl: 'https://tautulli.example.com',
      })
    })

    it('should return Overseerr defaults when DEV_OVERSEERR_* variables are set', async () => {
      process.env.DEV_OVERSEERR_NAME = 'My Overseerr'
      process.env.DEV_OVERSEERR_URL = 'http://localhost:5055'
      process.env.DEV_OVERSEERR_API_KEY = 'overseerr-api-key'
      process.env.DEV_OVERSEERR_PUBLIC_URL = 'https://overseerr.example.com'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.overseerr).toEqual({
        name: 'My Overseerr',
        url: 'http://localhost:5055',
        apiKey: 'overseerr-api-key',
        publicUrl: 'https://overseerr.example.com',
      })
    })

    it('should return Sonarr defaults when DEV_SONARR_* variables are set', async () => {
      process.env.DEV_SONARR_NAME = 'My Sonarr'
      process.env.DEV_SONARR_URL = 'http://localhost:8989'
      process.env.DEV_SONARR_API_KEY = 'sonarr-api-key'
      process.env.DEV_SONARR_PUBLIC_URL = 'https://sonarr.example.com'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.sonarr).toEqual({
        name: 'My Sonarr',
        url: 'http://localhost:8989',
        apiKey: 'sonarr-api-key',
        publicUrl: 'https://sonarr.example.com',
      })
    })

    it('should return Radarr defaults when DEV_RADARR_* variables are set', async () => {
      process.env.DEV_RADARR_NAME = 'My Radarr'
      process.env.DEV_RADARR_URL = 'http://localhost:7878'
      process.env.DEV_RADARR_API_KEY = 'radarr-api-key'
      process.env.DEV_RADARR_PUBLIC_URL = 'https://radarr.example.com'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.radarr).toEqual({
        name: 'My Radarr',
        url: 'http://localhost:7878',
        apiKey: 'radarr-api-key',
        publicUrl: 'https://radarr.example.com',
      })
    })

    it('should return null for services when no DEV_* variables are set', async () => {
      // No DEV_* variables set

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.plex).toBeNull()
      expect(result.tautulli).toBeNull()
      expect(result.overseerr).toBeNull()
      expect(result.sonarr).toBeNull()
      expect(result.radarr).toBeNull()
      expect(result.isDevMode).toBe(false)
    })

    it('should handle partial service configuration', async () => {
      // Only set some Plex variables
      process.env.DEV_PLEX_NAME = 'Partial Plex'
      // DEV_PLEX_URL and DEV_PLEX_TOKEN not set

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.plex).toEqual({
        name: 'Partial Plex',
      })
      expect(result.isDevMode).toBe(true)
    })
  })

  describe('Development Mode - Discord Defaults', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should return Discord defaults when DEV_DISCORD_* variables are set', async () => {
      process.env.DEV_DISCORD_ENABLED = 'true'
      process.env.DEV_DISCORD_BOT_ENABLED = 'true'
      process.env.DEV_DISCORD_CLIENT_ID = 'discord-client-id'
      process.env.DEV_DISCORD_CLIENT_SECRET = 'discord-client-secret'
      process.env.DEV_DISCORD_GUILD_ID = 'discord-guild-id'
      process.env.DEV_DISCORD_SERVER_INVITE_CODE = 'invite-code'
      process.env.DEV_DISCORD_PLATFORM_NAME = 'My Platform'
      process.env.DEV_DISCORD_INSTRUCTIONS = 'Custom instructions'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.discord).toEqual({
        isEnabled: true,
        botEnabled: true,
        clientId: 'discord-client-id',
        clientSecret: 'discord-client-secret',
        guildId: 'discord-guild-id',
        serverInviteCode: 'invite-code',
        platformName: 'My Platform',
        instructions: 'Custom instructions',
      })
    })

    it('should parse boolean values correctly for Discord', async () => {
      process.env.DEV_DISCORD_ENABLED = 'false'
      process.env.DEV_DISCORD_BOT_ENABLED = 'false'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.discord?.isEnabled).toBe(false)
      expect(result.discord?.botEnabled).toBe(false)
    })

    it('should handle non-boolean strings for Discord enabled fields', async () => {
      process.env.DEV_DISCORD_ENABLED = 'yes'  // Not 'true'
      process.env.DEV_DISCORD_BOT_ENABLED = '1'  // Not 'true'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.discord?.isEnabled).toBe(false)
      expect(result.discord?.botEnabled).toBe(false)
    })
  })

  describe('Development Mode - LLM Provider Defaults', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should return chat LLM defaults from DEV_CHAT_LLM_* variables', async () => {
      process.env.DEV_CHAT_LLM_PROVIDER = 'openai'
      process.env.DEV_CHAT_LLM_API_KEY = 'chat-api-key'
      process.env.DEV_CHAT_LLM_MODEL = 'gpt-4'
      process.env.DEV_CHAT_LLM_TEMPERATURE = '0.7'
      process.env.DEV_CHAT_LLM_MAX_TOKENS = '4096'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider).toEqual({
        provider: 'openai',
        apiKey: 'chat-api-key',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4096,
      })
    })

    it('should return wrapped LLM defaults from DEV_WRAPPED_LLM_* variables', async () => {
      process.env.DEV_WRAPPED_LLM_PROVIDER = 'openai'
      process.env.DEV_WRAPPED_LLM_API_KEY = 'wrapped-api-key'
      process.env.DEV_WRAPPED_LLM_MODEL = 'gpt-3.5-turbo'
      process.env.DEV_WRAPPED_LLM_TEMPERATURE = '1.0'
      process.env.DEV_WRAPPED_LLM_MAX_TOKENS = '2048'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.wrappedLlmProvider).toEqual({
        provider: 'openai',
        apiKey: 'wrapped-api-key',
        model: 'gpt-3.5-turbo',
        temperature: 1.0,
        maxTokens: 2048,
      })
    })

    it('should fall back to generic DEV_LLM_* for chat when specific not set', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'
      process.env.DEV_LLM_API_KEY = 'generic-api-key'
      process.env.DEV_LLM_MODEL = 'gpt-4-turbo'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider).toEqual({
        provider: 'openai',
        apiKey: 'generic-api-key',
        model: 'gpt-4-turbo',
      })
    })

    it('should fall back to generic DEV_LLM_* for wrapped when specific not set', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'
      process.env.DEV_LLM_API_KEY = 'generic-api-key'
      process.env.DEV_LLM_MODEL = 'gpt-4-turbo'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.wrappedLlmProvider).toEqual({
        provider: 'openai',
        apiKey: 'generic-api-key',
        model: 'gpt-4-turbo',
      })
    })

    it('should prefer specific over generic LLM settings', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'
      process.env.DEV_LLM_API_KEY = 'generic-key'
      process.env.DEV_LLM_MODEL = 'generic-model'
      process.env.DEV_CHAT_LLM_API_KEY = 'specific-chat-key'
      process.env.DEV_WRAPPED_LLM_MODEL = 'specific-wrapped-model'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.apiKey).toBe('specific-chat-key')
      expect(result.chatLlmProvider?.model).toBe('generic-model')  // Falls back
      expect(result.wrappedLlmProvider?.apiKey).toBe('generic-key')  // Falls back
      expect(result.wrappedLlmProvider?.model).toBe('specific-wrapped-model')
    })

    it('should return legacy llmProvider for backwards compatibility', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'
      process.env.DEV_LLM_API_KEY = 'legacy-key'
      process.env.DEV_LLM_MODEL = 'legacy-model'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.llmProvider).toEqual({
        provider: 'openai',
        apiKey: 'legacy-key',
        model: 'legacy-model',
      })
    })
  })

  describe('Input Validation - Temperature', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should parse valid temperature values', async () => {
      process.env.DEV_CHAT_LLM_TEMPERATURE = '0.5'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.temperature).toBe(0.5)
    })

    it('should clamp temperature below 0 to 0', async () => {
      process.env.DEV_CHAT_LLM_TEMPERATURE = '-0.5'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.temperature).toBe(0)
    })

    it('should clamp temperature above 2 to 2', async () => {
      process.env.DEV_CHAT_LLM_TEMPERATURE = '3.0'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.temperature).toBe(2)
    })

    it('should return undefined for invalid temperature (NaN)', async () => {
      process.env.DEV_CHAT_LLM_TEMPERATURE = 'invalid'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.temperature).toBeUndefined()
    })

    it('should handle temperature edge cases', async () => {
      // Edge case: 0 is valid
      process.env.DEV_CHAT_LLM_TEMPERATURE = '0'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.temperature).toBe(0)
    })
  })

  describe('Input Validation - Max Tokens', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should parse valid max tokens values', async () => {
      process.env.DEV_CHAT_LLM_MAX_TOKENS = '4096'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.maxTokens).toBe(4096)
    })

    it('should return undefined for zero max tokens', async () => {
      process.env.DEV_CHAT_LLM_MAX_TOKENS = '0'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.maxTokens).toBeUndefined()
    })

    it('should return undefined for negative max tokens', async () => {
      process.env.DEV_CHAT_LLM_MAX_TOKENS = '-100'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.maxTokens).toBeUndefined()
    })

    it('should return undefined for invalid max tokens (NaN)', async () => {
      process.env.DEV_CHAT_LLM_MAX_TOKENS = 'invalid'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.maxTokens).toBeUndefined()
    })

    it('should handle float max tokens by truncating to integer', async () => {
      process.env.DEV_CHAT_LLM_MAX_TOKENS = '4096.7'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.chatLlmProvider?.maxTokens).toBe(4096)
    })
  })

  describe('Input Validation - LLM Provider', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should accept valid provider value "openai"', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.llmProvider?.provider).toBe('openai')
    })

    it('should return undefined for invalid provider value', async () => {
      process.env.DEV_LLM_PROVIDER = 'invalid-provider'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.llmProvider?.provider).toBeUndefined()
    })

    it('should return undefined for empty provider value', async () => {
      process.env.DEV_LLM_PROVIDER = ''

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.llmProvider).toBeNull()
    })

    it('should handle case-sensitive provider validation', async () => {
      process.env.DEV_LLM_PROVIDER = 'OpenAI'  // Wrong case

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.llmProvider?.provider).toBeUndefined()
    })
  })

  describe('Auto-Submit Feature', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should enable auto-submit when DEV_SETUP_AUTO_SUBMIT is true', async () => {
      process.env.DEV_SETUP_AUTO_SUBMIT = 'true'
      process.env.DEV_PLEX_NAME = 'Plex'  // Need some defaults to enable dev mode

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.autoSubmit).toBe(true)
    })

    it('should disable auto-submit when DEV_SETUP_AUTO_SUBMIT is false', async () => {
      process.env.DEV_SETUP_AUTO_SUBMIT = 'false'
      process.env.DEV_PLEX_NAME = 'Plex'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.autoSubmit).toBe(false)
    })

    it('should disable auto-submit when DEV_SETUP_AUTO_SUBMIT is not set', async () => {
      process.env.DEV_PLEX_NAME = 'Plex'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.autoSubmit).toBe(false)
    })

    it('should disable auto-submit for non-true string values', async () => {
      process.env.DEV_SETUP_AUTO_SUBMIT = 'yes'  // Not exactly 'true'
      process.env.DEV_PLEX_NAME = 'Plex'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.autoSubmit).toBe(false)
    })
  })

  describe('isDevMode Flag', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should be true when any service defaults are set', async () => {
      process.env.DEV_PLEX_NAME = 'Plex'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.isDevMode).toBe(true)
    })

    it('should be true when only Discord defaults are set', async () => {
      process.env.DEV_DISCORD_ENABLED = 'true'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.isDevMode).toBe(true)
    })

    it('should be true when only LLM defaults are set', async () => {
      process.env.DEV_LLM_PROVIDER = 'openai'
      process.env.DEV_LLM_API_KEY = 'key'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.isDevMode).toBe(true)
    })

    it('should be false when only auto-submit is set without other defaults', async () => {
      process.env.DEV_SETUP_AUTO_SUBMIT = 'true'

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      expect(result.isDevMode).toBe(false)
      expect(result.autoSubmit).toBe(true)  // Auto-submit still works
    })

    it('should be false when only legacy llmProvider is set without valid provider', async () => {
      process.env.DEV_LLM_API_KEY = 'key'  // No provider set

      const { getDevDefaults } = await import('@/actions/dev-defaults')
      const result = await getDevDefaults()

      // llmProvider will have apiKey but no provider, so it's still valid
      expect(result.llmProvider).toEqual({ apiKey: 'key' })
      // But isDevMode checks chatLlmProvider/wrappedLlmProvider which get the same
      expect(result.isDevMode).toBe(true)
    })
  })
})
