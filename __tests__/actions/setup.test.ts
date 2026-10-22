/**
 * Tests for actions/setup.ts - setup wizard actions
 */

import {
    completeSetup,
    getSetupStatus,
    saveLLMProvider,
    saveOverseerr,
    savePlexServer,
    savePrometheus,
    saveTautulli,
} from '@/actions/setup'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testPrometheusConnection } from '@/lib/connections/prometheus'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import { revalidatePath } from 'next/cache'
import { mockDeep, mockReset } from 'jest-mock-extended'
import type { Prisma } from '@/lib/generated/prisma/client'
import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'

// Mock dependencies
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => {
  mockReset(prismaMock)
  // Each transaction runs against a fresh client whose delegates resolve to undefined.
  prismaMock.$transaction.mockImplementation((callback) => callback(mockDeep<Prisma.TransactionClient>()))
})

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

jest.mock('@/lib/connections/prometheus', () => ({
  testPrometheusConnection: jest.fn(),
}))

jest.mock('@/lib/connections/llm-provider', () => ({
  testLLMProviderConnection: jest.fn(),
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

const mockPrisma = prismaMock
const mockTestPlexConnection = testPlexConnection as jest.MockedFunction<typeof testPlexConnection>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockTestTautulliConnection = testTautulliConnection as jest.MockedFunction<typeof testTautulliConnection>
const mockTestOverseerrConnection = testOverseerrConnection as jest.MockedFunction<typeof testOverseerrConnection>
const mockTestPrometheusConnection = testPrometheusConnection as jest.MockedFunction<typeof testPrometheusConnection>
const mockTestLLMProviderConnection = testLLMProviderConnection as jest.MockedFunction<typeof testLLMProviderConnection>
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
        data: { id: 'plex-user-123', username: 'admin', email: 'admin@example.com' },
      })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        plexServer: {
          create: jest.fn().mockResolvedValue({ id: 'plex-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
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
      expect(mockTx.plexServer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: plexInput.name,
          url: 'https://plex.example.com:32400',
          token: plexInput.token,
          publicUrl: plexInput.publicUrl,
          adminPlexUserId: 'plex-user-123',
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
        data: { id: 'plex-user-123', username: 'admin', email: 'admin@example.com' },
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

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
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
        tautulli: {
          create: jest.fn().mockResolvedValue({ id: 'tautulli-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
      })

      const result = await saveTautulli(tautulliInput)

      expect(result.success).toBe(true)
      expect(mockTestTautulliConnection).toHaveBeenCalled()
      expect(mockTx.tautulli.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: tautulliInput.name,
          url: 'http://tautulli.example.com:8181',
          apiKey: tautulliInput.apiKey,
          publicUrl: tautulliInput.publicUrl,
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
        overseerr: {
          create: jest.fn().mockResolvedValue({ id: 'overseerr-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
      })

      const result = await saveOverseerr(overseerrInput)

      expect(result.success).toBe(true)
      expect(mockTestOverseerrConnection).toHaveBeenCalled()
      expect(mockTx.overseerr.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: overseerrInput.name,
          url: 'https://overseerr.example.com:5055',
          apiKey: overseerrInput.apiKey,
          publicUrl: overseerrInput.publicUrl,
          isActive: true,
        }),
      })
    })
  })

  describe('savePrometheus', () => {
    const prometheusInput = {
      name: 'Plex Server',
      url: 'http://prometheus.example.com:9090',
      query: 'up{job="plex"}',
    }

    it('should save Prometheus configuration successfully', async () => {
      mockTestPrometheusConnection.mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        prometheus: {
          create: jest.fn().mockResolvedValue({ id: 'prometheus-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
      })

      const result = await savePrometheus(prometheusInput)

      expect(result.success).toBe(true)
      expect(mockTestPrometheusConnection).toHaveBeenCalled()
      expect(mockTx.prometheus.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: prometheusInput.name,
          url: 'http://prometheus.example.com:9090',
          query: prometheusInput.query,
          isActive: true,
        }),
      })
    })

    it('should return error when connection test fails', async () => {
      mockTestPrometheusConnection.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      })

      const result = await savePrometheus(prometheusInput)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
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
        lLMProvider: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 'llm-1' }),
        },
      }

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(asTransactionClient(mockTx))
      })

      const result = await saveLLMProvider(llmInput)

      expect(result.success).toBe(true)
      expect(mockTestLLMProviderConnection).toHaveBeenCalled()
      expect(mockTx.lLMProvider.updateMany).toHaveBeenCalledWith({
        where: { isActive: true, purpose: "wrapped" },
        data: { isActive: false },
      })
      expect(mockTx.lLMProvider.create).toHaveBeenCalledWith({
        data: {
          provider: llmInput.provider,
          purpose: "wrapped",
          apiKey: llmInput.apiKey,
          model: llmInput.model || null,
          temperature: null,
          maxTokens: null,
          isActive: true,
        },
      })
    })

    it('should default to the current default model when none is given', async () => {
      mockTestLLMProviderConnection.mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
        lLMProvider: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'llm-1' }),
        },
      }
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(asTransactionClient(mockTx)))

      const result = await saveLLMProvider({ provider: 'openai', apiKey: 'openai-key' })

      expect(result.success).toBe(true)
      expect(mockTx.lLMProvider.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ model: 'gpt-5.4-mini' }),
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
})

describe('setup saves keep a stored secret only for its own address (P4.6)', () => {
  const storedTautulli = {
    id: 't1',
    name: 'Tautulli',
    url: 'http://tautulli.lan:8181',
    publicUrl: null,
    apiKey: 'stored-tautulli-key',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.setup.findFirst.mockResolvedValue(null)
    mockTestTautulliConnection.mockResolvedValue({ success: true })
  })

  /** Lets the fire-and-forget audit write settle. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('refuses a blank key for a new host before any connection test', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue(storedTautulli)

    const result = await saveTautulli({ name: 'Tautulli', url: 'http://listener.example:8181' })

    expect(result).toEqual({
      success: false,
      code: 'SECRET_REQUIRED',
      error: 'Enter the API key again to use it with the new address.',
    })
    expect(mockTestTautulliConnection).not.toHaveBeenCalled()
  })

  it('reuses the stored key for the same origin (Back and edit)', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue(storedTautulli)

    const result = await saveTautulli({ name: 'Renamed', url: 'http://tautulli.lan:8181/' })

    expect(result).toEqual({ success: true })
    expect(mockTestTautulliConnection).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'stored-tautulli-key' }))
  })

  it('reuses a stored Plex token only for the same origin', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue({
      id: 'p1',
      name: 'Plex',
      url: 'https://plex.lan:32400',
      publicUrl: null,
      token: 'stored-plex-token',
      adminPlexUserId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(savePlexServer({ name: 'Plex', url: 'https://other.lan:32400' })).resolves.toMatchObject({
      code: 'SECRET_REQUIRED',
    })
    expect(mockTestPlexConnection).not.toHaveBeenCalled()
  })

  it('audits the save as the setup actor with origins only', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue(null)

    await saveTautulli({ name: 'Tautulli', url: 'http://tautulli.lan:8181/path', apiKey: 'first-key' })
    await flush()

    const rows = mockPrisma.auditLog.create.mock.calls.map(([args]) => args.data)
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'CONFIG_CHANGED',
        actorUserId: 'setup',
        details: expect.objectContaining({
          section: 'setup.tautulli',
          secretChanged: true,
          origins: { before: null, after: { url: 'http://tautulli.lan:8181', publicUrl: null } },
        }),
      }),
    ])
    expect(JSON.stringify(rows)).not.toContain('first-key')
  })
})

