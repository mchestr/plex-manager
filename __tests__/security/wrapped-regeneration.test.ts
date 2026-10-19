/**
 * Security tests for wrapped regeneration
 * Tests that only admins can regenerate completed wrapped data, and that the
 * P0.12 guardrails hold for admins (season year, single flight) while the
 * member limits do not apply to them (SEC-22, RWP-12)
 */

import { generatePlexWrapped } from '@/actions/wrapped-generation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getWrappedSettings } from '@/actions/admin'
import { consume } from '@/lib/security/rate-limit'
import { checkRewindEligibility } from '@/lib/wrapped/eligibility'

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
      createMany: jest.fn(),
      updateMany: jest.fn(),
      updateManyAndReturn: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    tautulli: {
      findFirst: jest.fn(),
    },
    overseerr: {
      findFirst: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/wrapped/tautulli-statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))
jest.mock('@/lib/wrapped/server-statistics', () => ({
  fetchPlexServerStatistics: jest.fn(),
}))
jest.mock('@/lib/wrapped/overseerr-statistics', () => ({
  fetchOverseerrStatistics: jest.fn(),
}))

jest.mock('@/lib/wrapped/llm', () => ({
  generateWrappedWithLLM: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/actions/admin', () => ({
  getWrappedSettings: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  reward: jest.fn(),
}))

// Every member here has Plex history; the eligibility gate is tested in
// user-wrapped-generation.test.ts and wrapped-generation-action.test.ts.
jest.mock('@/lib/wrapped/eligibility', () => ({
  checkRewindEligibility: jest.fn(),
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

  const mockPlexServer = {
    id: 'server-1',
    name: 'Test Server',
    url: 'https://plex.example.com:32400',
    token: 'server-token',
    isActive: true,
  }

  const mockTautulli = {
    id: 'tautulli-1',
    url: 'http://tautulli.example.com:8181',
    apiKey: 'tautulli-key',
    isActive: true,
  }

  const mockCompletedWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2026,
    status: 'completed',
    shareToken: 'test-token',
    data: JSON.stringify({ sections: [] }),
  }

  const mockFailedWrapped = {
    id: 'wrapped-1',
    userId: 'user-1',
    year: 2026,
    status: 'failed',
    shareToken: 'test-token',
    error: 'Generation failed',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
    ;(checkRewindEligibility as jest.Mock).mockResolvedValue({ eligible: true, tautulliUser: null })
    ;(consume as jest.Mock).mockResolvedValue({ ok: true })
    ;(prisma.plexWrapped.createMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockResolvedValue([{ id: 'wrapped-1' }])
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
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
      ;(prisma.plexServer.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockPlexServer)
        .mockResolvedValueOnce(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })


      const statsModule = {
        ...(await import('@/lib/wrapped/tautulli-statistics')),
        ...(await import('@/lib/wrapped/server-statistics')),
      }
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

      const result = await generatePlexWrapped('user-1', 2026)

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

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only admins can regenerate wrapped data')
      expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
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
      ;(prisma.plexServer.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockPlexServer)
        .mockResolvedValueOnce(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })


      const statsModule = {
        ...(await import('@/lib/wrapped/tautulli-statistics')),
        ...(await import('@/lib/wrapped/server-statistics')),
      }
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

      const result = await generatePlexWrapped('user-1', 2026)

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

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized: You can only generate your own wrapped')
      expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const result = await generatePlexWrapped('user-1', 2026)

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
      ;(prisma.plexServer.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockPlexServer)
        .mockResolvedValueOnce(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })


      const statsModule = {
        ...(await import('@/lib/wrapped/tautulli-statistics')),
        ...(await import('@/lib/wrapped/server-statistics')),
      }
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

      const result = await generatePlexWrapped('user-1', 2026)

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

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized: You can only generate your own wrapped')
      expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
    })
  })

  describe('guardrails for admins and members (P0.12)', () => {
    const adminSession = { user: { id: 'admin-1', isAdmin: true } }
    const memberSession = { user: { id: 'user-1', isAdmin: false } }

    async function setUpRun(session: typeof adminSession, existing: Record<string, unknown> | null) {
      ;(getServerSession as jest.Mock).mockResolvedValue(session)
      ;(prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }) =>
        where.id === 'admin-1' ? { ...mockAdminUser, isExempt: false, subscription: null } : { ...mockUser1, isExempt: false, subscription: null }
      )
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(existing)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled: false })

      const statsModule = {
        ...(await import('@/lib/wrapped/tautulli-statistics')),
        ...(await import('@/lib/wrapped/server-statistics')),
      }
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
      ;(statsModule.fetchPlexServerStatistics as jest.Mock).mockResolvedValue({ success: false })
      ;(statsModule.fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
      ;(statsModule.fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })

      const { generateWrappedWithLLM } = await import('@/lib/wrapped/llm')
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: { sections: [], summary: 'Test summary', metadata: { totalSections: 0, generationTime: 0 } },
      })
      return generateWrappedWithLLM as jest.Mock
    }

    /** The status filter of the claim's first branch. */
    function claimedStatuses() {
      const [[claim]] = (prisma.plexWrapped.updateManyAndReturn as jest.Mock).mock.calls
      return claim.where.OR[0].status
    }

    it('lets an admin regenerate a completed Rewind, spending no member points', async () => {
      const llm = await setUpRun(adminSession, mockCompletedWrapped)

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
      expect(claimedStatuses()).toEqual({ not: 'generating' })
      expect(consume).not.toHaveBeenCalled()
      expect(llm).toHaveBeenCalledTimes(1)
    })

    it('exempts admins from the member limits on back-to-back runs', async () => {
      const llm = await setUpRun(adminSession, mockCompletedWrapped)

      for (let run = 0; run < 4; run++) {
        expect((await generatePlexWrapped('user-1', 2026)).success).toBe(true)
      }

      expect(consume).not.toHaveBeenCalled()
      expect(llm).toHaveBeenCalledTimes(4)
    })

    it('lets an admin run while Stripe is on, even for a member with no subscription', async () => {
      const llm = await setUpRun(adminSession, null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled: true })

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
      expect(llm).toHaveBeenCalledTimes(1)
    })

    it('still holds admins to the season year', async () => {
      const llm = await setUpRun(adminSession, mockCompletedWrapped)

      const result = await generatePlexWrapped('user-1', 2025)

      expect(result).toEqual({ success: false, error: 'Rewind is only available for 2026' })
      expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
      expect(llm).not.toHaveBeenCalled()
    })

    it('does not start a second run for an admin while one is live', async () => {
      const llm = await setUpRun(adminSession, { ...mockCompletedWrapped, status: 'generating', updatedAt: new Date() })

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual({
        success: false,
        code: 'ALREADY_GENERATING',
        error: 'Your Rewind is already being made.',
      })
      expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
      expect(llm).not.toHaveBeenCalled()
    })

    it("never lets a member's claim take a row that completed after the check", async () => {
      // The action read "failed", but the row completed before the claim ran.
      const llm = await setUpRun(memberSession, mockFailedWrapped)
      ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockResolvedValue([])

      const result = await generatePlexWrapped('user-1', 2026)

      expect(claimedStatuses()).toEqual({ notIn: ['generating', 'completed'] })
      expect(result.code).toBe('ALREADY_GENERATING')
      expect(llm).not.toHaveBeenCalled()
    })
  })
})
