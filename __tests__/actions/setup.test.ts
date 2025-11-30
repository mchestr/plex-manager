/**
 * Tests for actions/setup.ts - setup wizard actions
 */

import {
    completeSetup,
    fetchLLMModels,
    getSetupStatus,
    saveLLMProvider,
    saveOverseerr,
    savePlexServer,
    saveTautulli,
} from '@/actions/setup'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { fetchOpenAIModels } from '@/lib/connections/openai'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    setup: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    service: {
      updateMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Legacy tables kept for migration compatibility
    plexServer: {
      create: jest.fn(),
    },
    tautulli: {
      create: jest.fn(),
    },
    overseerr: {
      create: jest.fn(),
    },
    lLMProvider: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    discordIntegration: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback({
      setup: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      service: {
        updateMany: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Legacy tables kept for migration compatibility
      plexServer: {
        create: jest.fn(),
      },
      tautulli: {
        create: jest.fn(),
      },
      overseerr: {
        create: jest.fn(),
      },
      lLMProvider: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      discordIntegration: {
        upsert: jest.fn(),
      },
    })),
  },
}))

jest.mock('@/lib/connections/plex', () => ({
  testPlexConnection: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock('@/lib/connections/tautulli', () => ({
  testTautulliConnection: jest.fn(),
}))

jest.mock('@/lib/connections/overseerr', () => ({
  testOverseerrConnection: jest.fn(),
}))

jest.mock('@/lib/connections/llm-provider', () => ({
  testLLMProviderConnection: jest.fn(),
}))

jest.mock('@/lib/connections/openai', () => ({
  fetchOpenAIModels: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockTestPlexConnection = testPlexConnection as jest.MockedFunction<typeof testPlexConnection>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockTestTautulliConnection = testTautulliConnection as jest.MockedFunction<typeof testTautulliConnection>
const mockTestOverseerrConnection = testOverseerrConnection as jest.MockedFunction<typeof testOverseerrConnection>
const mockTestLLMProviderConnection = testLLMProviderConnection as jest.MockedFunction<typeof testLLMProviderConnection>
const mockFetchOpenAIModels = fetchOpenAIModels as jest.MockedFunction<typeof fetchOpenAIModels>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe('Setup Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSetupStatus', () => {
    it('should return setup status when setup exists', async () => {
      const mockSetup = {
        id: '1',
        isComplete: true,
        currentStep: 5,
        createdAt: new Date(),
      }

      mockPrisma.setup.findFirst.mockResolvedValue(mockSetup as any)

      const result = await getSetupStatus()

      expect(result.isComplete).toBe(true)
      expect(result.currentStep).toBe(5)
    })

    it('should return default values when no setup exists', async () => {
      mockPrisma.setup.findFirst.mockResolvedValue(null)

      const result = await getSetupStatus()

      expect(result.isComplete).toBe(false)
      expect(result.currentStep).toBe(1)
    })
  })

  describe('savePlexServer', () => {
    const plexInput = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:32400',
      token: 'plex-token',
      publicUrl: 'https://plex.public.com',
    }

    it('should save Plex server configuration successfully', async () => {
      mockTestPlexConnection.mockResolvedValue({ success: true })
      mockGetPlexUserInfo.mockResolvedValue({
        success: true,
        data: { id: 'plex-user-123' },
      })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'plex-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await savePlexServer(plexInput)

      expect(result.success).toBe(true)
      expect(mockTestPlexConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://plex.example.com:32400',
          token: plexInput.token,
        })
      )
      expect(mockGetPlexUserInfo).toHaveBeenCalledWith(plexInput.token)
      expect(mockTx.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PLEX',
          name: plexInput.name,
          url: 'https://plex.example.com:32400',
          publicUrl: plexInput.publicUrl,
          config: expect.objectContaining({
            token: plexInput.token,
            adminPlexUserId: 'plex-user-123',
          }),
          isActive: true,
        }),
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/setup')
    })

    it('should return error when connection test fails', async () => {
      // Mock the validation to pass, but connection test to fail
      mockTestPlexConnection.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      })

      const result = await savePlexServer(plexInput)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('should return error when user info fetch fails', async () => {
      mockTestPlexConnection.mockResolvedValue({ success: true })
      mockGetPlexUserInfo.mockResolvedValue({
        success: false,
        error: 'Failed to fetch user info',
      })

      const result = await savePlexServer(plexInput)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch user info from Plex token')
    })

    it('should update existing setup record', async () => {
      mockTestPlexConnection.mockResolvedValue({ success: true })
      mockGetPlexUserInfo.mockResolvedValue({
        success: true,
        data: { id: 'plex-user-123' },
      })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'setup-1' }),
          update: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        plexServer: {
          create: jest.fn().mockResolvedValue({ id: 'plex-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      await savePlexServer(plexInput)

      expect(mockTx.setup.update).toHaveBeenCalledWith({
        where: { id: 'setup-1' },
        data: { currentStep: 2 },
      })
    })
  })

  describe('saveTautulli', () => {
    const tautulliInput = {
      name: 'Tautulli',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      publicUrl: 'https://tautulli.public.com',
    }

    it('should save Tautulli configuration successfully', async () => {
      mockTestTautulliConnection.mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'tautulli-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveTautulli(tautulliInput)

      expect(result.success).toBe(true)
      expect(mockTestTautulliConnection).toHaveBeenCalled()
      expect(mockTx.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'TAUTULLI',
          name: tautulliInput.name,
          url: 'http://tautulli.example.com:8181',
          publicUrl: tautulliInput.publicUrl,
          config: expect.objectContaining({
            apiKey: tautulliInput.apiKey,
          }),
          isActive: true,
        }),
      })
    })

    it('should return error when connection test fails', async () => {
      mockTestTautulliConnection.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      })

      const result = await saveTautulli(tautulliInput)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
    })
  })

  describe('saveOverseerr', () => {
    const overseerrInput = {
      name: 'Overseerr',
      url: 'https://overseerr.example.com:5055',
      apiKey: 'overseerr-key',
      publicUrl: 'https://requests.public.com',
    }

    it('should save Overseerr configuration successfully', async () => {
      mockTestOverseerrConnection.mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'overseerr-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveOverseerr(overseerrInput)

      expect(result.success).toBe(true)
      expect(mockTestOverseerrConnection).toHaveBeenCalled()
      expect(mockTx.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'OVERSEERR',
          name: overseerrInput.name,
          url: 'https://overseerr.example.com:5055',
          publicUrl: overseerrInput.publicUrl,
          config: expect.objectContaining({
            apiKey: overseerrInput.apiKey,
          }),
          isActive: true,
        }),
      })
    })
  })

  describe('saveLLMProvider', () => {
    const llmInput = {
      provider: 'openai' as const,
      apiKey: 'openai-key',
      model: 'gpt-4',
    }

    it('should save LLM provider configuration successfully', async () => {
      mockTestLLMProviderConnection.mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        service: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'llm-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveLLMProvider(llmInput)

      expect(result.success).toBe(true)
      expect(mockTestLLMProviderConnection).toHaveBeenCalled()
      expect(mockTx.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'LLM_PROVIDER',
          name: expect.stringContaining('wrapped'),
          config: expect.objectContaining({
            provider: llmInput.provider,
            purpose: 'wrapped',
            apiKey: llmInput.apiKey,
            model: llmInput.model,
          }),
          isActive: true,
        }),
      })
    })

    it('should return error when connection test fails', async () => {
      mockTestLLMProviderConnection.mockResolvedValue({
        success: false,
        error: 'Invalid API key',
      })

      const result = await saveLLMProvider(llmInput)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })
  })

  describe('completeSetup', () => {
    it('should mark setup as complete', async () => {
      const mockSetup = {
        id: 'setup-1',
        isComplete: false,
        currentStep: 5,
      }

      mockPrisma.setup.findFirst.mockResolvedValue(mockSetup as any)
      mockPrisma.setup.update.mockResolvedValue({
        ...mockSetup,
        isComplete: true,
        completedAt: new Date(),
      } as any)

      const result = await completeSetup()

      expect(result.success).toBe(true)
      expect(mockPrisma.setup.update).toHaveBeenCalledWith({
        where: { id: 'setup-1' },
        data: {
          isComplete: true,
          completedAt: expect.any(Date),
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    })

    it('should handle case when no setup exists', async () => {
      mockPrisma.setup.findFirst.mockResolvedValue(null)

      const result = await completeSetup()

      expect(result.success).toBe(true)
      expect(mockPrisma.setup.update).not.toHaveBeenCalled()
    })
  })

  describe('fetchLLMModels', () => {
    it('should fetch OpenAI models successfully', async () => {
      const mockModels = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']
      mockFetchOpenAIModels.mockResolvedValue({
        success: true,
        models: mockModels,
      })

      // API key must be at least 10 characters for validation
      const validApiKey = 'test-api-key-12345'
      const result = await fetchLLMModels('openai', validApiKey)

      expect(result.success).toBe(true)
      expect(result.models).toEqual(mockModels)
      expect(mockFetchOpenAIModels).toHaveBeenCalledWith(validApiKey)
    })

    it('should return error when API key is missing', async () => {
      const result = await fetchLLMModels('openai', '')

      expect(result.success).toBe(false)
      // With validation, empty string fails the min length check
      expect(result.error).toBeDefined()
      expect(mockFetchOpenAIModels).not.toHaveBeenCalled()
    })

    it('should return error when API key is too short', async () => {
      const result = await fetchLLMModels('openai', 'short')

      expect(result.success).toBe(false)
      // With validation, short API key fails the min length check
      expect(result.error).toBeDefined()
      expect(mockFetchOpenAIModels).not.toHaveBeenCalled()
    })

    it('should return error for invalid provider', async () => {
      const result = await fetchLLMModels('invalid' as any, 'valid-api-key-123')

      expect(result.success).toBe(false)
      // With validation, invalid provider fails the enum check
      expect(result.error).toBeDefined()
    })

    it('should handle fetch errors', async () => {
      mockFetchOpenAIModels.mockRejectedValue(new Error('Network error'))

      const validApiKey = 'test-api-key-12345'
      const result = await fetchLLMModels('openai', validApiKey)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })
})

