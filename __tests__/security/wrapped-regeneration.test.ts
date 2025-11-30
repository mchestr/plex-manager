/**
 * Security tests for wrapped regeneration
 * Tests that only admins can regenerate completed wrapped data
 */

import { generatePlexWrapped, generateAllPlexWrapped } from '@/actions/wrapped-generation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import {
  getActivePlexService,
  getActiveTautulliService,
  getActiveOverseerrService,
} from '@/lib/services/service-helpers'

// Mock dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    plexWrapped: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActivePlexService: jest.fn(),
  getActiveTautulliService: jest.fn(),
  getActiveOverseerrService: jest.fn(),
}))

jest.mock('@/lib/wrapped/statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchPlexServerStatistics: jest.fn(),
  fetchOverseerrStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))

jest.mock('@/lib/wrapped/llm', () => ({
  generateWrappedWithLLM: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

describe('Wrapped Regeneration Security', () => {
  const mockUser1 = {
    id: 'user-1',
    email: 'user1@example.com',
    name: 'User 1',
    plexUserId: 'plex-user-1',
    isAdmin: false,
  }

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    plexUserId: 'plex-admin-1',
    isAdmin: true,
  }

  const mockPlexService = {
    id: 'server-1',
    name: 'Test Server',
    url: 'https://plex.example.com:32400',
    isActive: true,
    config: {
      token: 'server-token',
    },
  }

  const mockTautulliService = {
    id: 'tautulli-1',
    name: 'Tautulli',
    url: 'http://tautulli.example.com:8181',
    isActive: true,
    config: {
      apiKey: 'tautulli-key',
    },
  }

  const mockCompletedWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2024,
    status: 'completed',
    shareToken: 'test-token',
    data: JSON.stringify({ sections: [] }),
  }

  const mockFailedWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2024,
    status: 'failed',
    shareToken: 'test-token',
    error: 'Generation failed',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generatePlexWrapped - Regeneration Security', () => {
    it('should allow admin to regenerate completed wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'admin-1',
          isAdmin: true,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)
      ;(getActivePlexService as jest.Mock)
        .mockResolvedValueOnce(mockPlexService)
        .mockResolvedValueOnce(mockPlexService)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getActiveOverseerrService as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })

      const wrappedRecord = {
        ...mockCompletedWrapped,
        status: 'generating',
      }
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue(wrappedRecord)
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
        ...wrappedRecord,
        status: 'completed',
      })

      const statsModule = await import('@/lib/wrapped/statistics')
      ;(statsModule.fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'tautulli-user-1',
        },
      })
      ;(statsModule.fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalStorage: 1000,
          totalStorageFormatted: '1TB',
          librarySize: 500,
        },
      })
      ;(statsModule.fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })
      ;(statsModule.fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })

      const { generateWrappedWithLLM } = await import('@/lib/wrapped/llm')
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          sections: [],
          summary: 'Test summary',
          metadata: { totalSections: 0, generationTime: 0 },
        },
      })

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expect(getServerSession).toHaveBeenCalled()
    })

    it('should reject non-admin user attempting to regenerate completed wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockCompletedWrapped)

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only admins can regenerate wrapped data')
      expect(prisma.plexWrapped.upsert).not.toHaveBeenCalled()
    })

    it('should allow user to retry their own failed wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockFailedWrapped)
      ;(getActivePlexService as jest.Mock)
        .mockResolvedValueOnce(mockPlexService)
        .mockResolvedValueOnce(mockPlexService)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getActiveOverseerrService as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })

      const wrappedRecord = {
        ...mockFailedWrapped,
        status: 'generating',
      }
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue(wrappedRecord)
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
        ...wrappedRecord,
        status: 'completed',
      })

      const statsModule = await import('@/lib/wrapped/statistics')
      ;(statsModule.fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'tautulli-user-1',
        },
      })
      ;(statsModule.fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalStorage: 1000,
          totalStorageFormatted: '1TB',
          librarySize: 500,
        },
      })
      ;(statsModule.fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })
      ;(statsModule.fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })

      const { generateWrappedWithLLM } = await import('@/lib/wrapped/llm')
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          sections: [],
          summary: 'Test summary',
          metadata: { totalSections: 0, generationTime: 0 },
        },
      })

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
    })

    it('should reject user attempting to retry another user\'s failed wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-2',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockFailedWrapped)

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized: You can only retry your own wrapped')
      expect(prisma.plexWrapped.upsert).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('should allow user to generate their own wrapped if it does not exist', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(getActivePlexService as jest.Mock)
        .mockResolvedValueOnce(mockPlexService)
        .mockResolvedValueOnce(mockPlexService)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getActiveOverseerrService as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })

      const wrappedRecord = {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      }
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue(wrappedRecord)
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
        ...wrappedRecord,
        status: 'completed',
      })

      const statsModule = await import('@/lib/wrapped/statistics')
      ;(statsModule.fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'tautulli-user-1',
        },
      })
      ;(statsModule.fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalStorage: 1000,
          totalStorageFormatted: '1TB',
          librarySize: 500,
        },
      })
      ;(statsModule.fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })
      ;(statsModule.fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })

      const { generateWrappedWithLLM } = await import('@/lib/wrapped/llm')
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          sections: [],
          summary: 'Test summary',
          metadata: { totalSections: 0, generationTime: 0 },
        },
      })

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
    })

    it('should reject user attempting to generate wrapped for another user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-2',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized: You can only generate your own wrapped')
      expect(prisma.plexWrapped.upsert).not.toHaveBeenCalled()
    })
  })

  describe('generateAllPlexWrapped - Admin Only', () => {
    it('should allow admin to generate wrapped for all users', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'admin-1',
          isAdmin: true,
        },
      })
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([mockUser1])
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(getActivePlexService as jest.Mock)
        .mockResolvedValueOnce(mockPlexService)
        .mockResolvedValueOnce(mockPlexService)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getActiveOverseerrService as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })

      const wrappedRecord = {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      }
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue(wrappedRecord)
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
        ...wrappedRecord,
        status: 'completed',
      })

      const statsModule = await import('@/lib/wrapped/statistics')
      ;(statsModule.fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'tautulli-user-1',
        },
      })
      ;(statsModule.fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalStorage: 1000,
          totalStorageFormatted: '1TB',
          librarySize: 500,
        },
      })
      ;(statsModule.fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })
      ;(statsModule.fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      })

      const { generateWrappedWithLLM } = await import('@/lib/wrapped/llm')
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          sections: [],
          summary: 'Test summary',
          metadata: { totalSections: 0, generationTime: 0 },
        },
      })

      const result = await generateAllPlexWrapped(2024)

      expect(result.success).toBe(true)
      expect(result.generated).toBe(1)
      expect(getServerSession).toHaveBeenCalled()
    })

    it('should reject non-admin user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })

      const result = await generateAllPlexWrapped(2024)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
      expect(prisma.user.findMany).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const result = await generateAllPlexWrapped(2024)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
      expect(prisma.user.findMany).not.toHaveBeenCalled()
    })
  })
})

