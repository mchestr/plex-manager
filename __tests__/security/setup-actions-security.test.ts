/**
 * Security tests for setup actions
 * Tests that setup actions properly enforce admin authorization when setup is complete
 * This is critical because these actions modify critical system configuration
 */

import { requireAdmin } from '@/lib/admin'
import {
  getSetupStatus,
  savePlexServer,
  saveTautulli,
  saveOverseerr,
  saveLLMProvider,
  completeSetup,
} from '@/actions/setup'
import { prisma } from '@/lib/prisma'
import { testPlexConnection, getPlexUserInfo } from '@/lib/connections/plex'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { UnauthorizedAdminError, UnauthenticatedError } from '@/lib/admin'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
  getAdminStatus: jest.fn(),
  UnauthorizedAdminError: class UnauthorizedAdminError extends Error {
    constructor(message: string = 'Admin access required') {
      super(message)
      this.name = 'UnauthorizedAdminError'
    }
  },
  UnauthenticatedError: class UnauthenticatedError extends Error {
    constructor(message: string = 'Authentication required') {
      super(message)
      this.name = 'UnauthenticatedError'
    }
  },
}))

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
    // Legacy tables - kept for backwards compatibility
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

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const mockAdminSession = {
  user: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
}

describe('Setup Actions Security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('savePlexServer', () => {
    const plexInput = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:32400',
      token: 'plex-token',
    }

    it('should allow admin when setup is complete', async () => {
      // Setup is complete
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(testPlexConnection as jest.Mock).mockResolvedValue({ success: true })
      ;(getPlexUserInfo as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: 'plex-user-123' },
      })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'setup-1' }),
          update: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'plex-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await savePlexServer(plexInput)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should allow non-admin during initial setup (setup not complete)', async () => {
      // Setup is NOT complete - initial setup
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: false,
        currentStep: 1,
      })
      ;(testPlexConnection as jest.Mock).mockResolvedValue({ success: true })
      ;(getPlexUserInfo as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: 'plex-user-123' },
      })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'plex-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await savePlexServer(plexInput)

      expect(requireAdmin).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should reject non-admin when setup is complete', async () => {
      // Setup is complete
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedAdminError('UNAUTHORIZED')
      })

      const result = await savePlexServer(plexInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(testPlexConnection).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user when setup is complete', async () => {
      // Setup is complete
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthenticatedError('UNAUTHENTICATED')
      })

      const result = await savePlexServer(plexInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(testPlexConnection).not.toHaveBeenCalled()
    })
  })

  describe('saveTautulli', () => {
    const tautulliInput = {
      name: 'Tautulli',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
    }

    it('should require admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(testTautulliConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'tautulli-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveTautulli(tautulliInput)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should allow non-admin during initial setup', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: false,
        currentStep: 2,
      })
      ;(testTautulliConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'tautulli-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveTautulli(tautulliInput)

      expect(requireAdmin).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should reject non-admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedAdminError('UNAUTHORIZED')
      })

      const result = await saveTautulli(tautulliInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(testTautulliConnection).not.toHaveBeenCalled()
    })
  })

  describe('saveOverseerr', () => {
    const overseerrInput = {
      name: 'Overseerr',
      url: 'https://overseerr.example.com:5055',
      apiKey: 'overseerr-key',
    }

    it('should require admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(testOverseerrConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'overseerr-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveOverseerr(overseerrInput)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should allow non-admin during initial setup', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: false,
        currentStep: 3,
      })
      ;(testOverseerrConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'overseerr-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveOverseerr(overseerrInput)

      expect(requireAdmin).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should reject non-admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedAdminError('UNAUTHORIZED')
      })

      const result = await saveOverseerr(overseerrInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(testOverseerrConnection).not.toHaveBeenCalled()
    })
  })

  describe('saveLLMProvider', () => {
    const llmInput = {
      provider: 'openai' as const,
      apiKey: 'openai-key',
      model: 'gpt-4',
    }

    it('should require admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(testLLMProviderConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'llm-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveLLMProvider(llmInput)

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should allow non-admin during initial setup', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: false,
        currentStep: 4,
      })
      ;(testLLMProviderConnection as jest.Mock).mockResolvedValue({ success: true })

      const mockTx = {
        setup: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        service: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'llm-1' }),
        },
      }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await saveLLMProvider(llmInput)

      expect(requireAdmin).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should reject non-admin when setup is complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        currentStep: 5,
      })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedAdminError('UNAUTHORIZED')
      })

      const result = await saveLLMProvider(llmInput)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(testLLMProviderConnection).not.toHaveBeenCalled()
    })
  })

  describe('completeSetup', () => {
    it('should require admin when setup is already complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          id: 'setup-1',
          isComplete: true,
          currentStep: 5,
        })
        .mockResolvedValueOnce({
          id: 'setup-1',
          isComplete: true,
          currentStep: 5,
        })
      ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdminSession)
      ;(prisma.setup.update as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        completedAt: new Date(),
      })

      const result = await completeSetup()

      expect(requireAdmin).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should allow non-admin during initial setup', async () => {
      ;(prisma.setup.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          id: 'setup-1',
          isComplete: false,
          currentStep: 4,
        })
        .mockResolvedValueOnce({
          id: 'setup-1',
          isComplete: false,
          currentStep: 4,
        })
      ;(prisma.setup.update as jest.Mock).mockResolvedValue({
        id: 'setup-1',
        isComplete: true,
        completedAt: new Date(),
      })

      const result = await completeSetup()

      expect(requireAdmin).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should reject non-admin when setup is already complete', async () => {
      ;(prisma.setup.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          id: 'setup-1',
          isComplete: true,
          currentStep: 5,
        })
      ;(requireAdmin as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedAdminError('UNAUTHORIZED')
      })

      // completeSetup doesn't have try-catch, so it will throw
      await expect(completeSetup()).rejects.toThrow(UnauthorizedAdminError)
      expect(prisma.setup.update).not.toHaveBeenCalled()
    })
  })
})

