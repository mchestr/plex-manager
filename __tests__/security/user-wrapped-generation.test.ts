/**
 * Security tests for user wrapped generation
 * Tests that users can only generate their own wrapped, only for the season
 * year, and (with Stripe on) only while entitled (P0.12: SEC-22, RWP-12)
 */

import { generatePlexWrapped } from '@/actions/wrapped-generation'
import { getUserPlexWrapped } from '@/actions/user-queries'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getWrappedSettings } from '@/actions/admin'
import { consume } from '@/lib/security/rate-limit'

// Mock dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    plexWrapped: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
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

jest.mock('@/actions/admin', () => ({
  getWrappedSettings: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  reward: jest.fn(),
}))

describe('User Wrapped Generation Security', () => {
  const mockUser1 = {
    id: 'user-1',
    email: 'user1@example.com',
    name: 'User 1',
    plexUserId: 'plex-user-1',
    isAdmin: false,
  }

  const mockUser2 = {
    id: 'user-2',
    email: 'user2@example.com',
    name: 'User 2',
    plexUserId: 'plex-user-2',
    isAdmin: false,
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

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
    ;(consume as jest.Mock).mockResolvedValue({ ok: true })
    ;(prisma.plexWrapped.createMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.plexWrapped.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'wrapped-1' })
  })

  describe('generatePlexWrapped', () => {
    it('should allow user to generate their own wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockPlexServer) // First call for initial check
        .mockResolvedValueOnce(mockPlexServer) // Second call for server stats
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ llmDisabled: false })

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

      // Note: In a real scenario, this would be called from a server action
      // with the authenticated user's ID. The security check happens at the
      // application level (e.g., in the component/page that calls this).
      // This test verifies the function works correctly when called with valid user ID.
      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(true)
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      })
    })

    it('should fail if user does not exist', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await generatePlexWrapped('non-existent-user', 2026)

      expect(result.success).toBe(false)
      expect(result.error).toBe('User not found')
    })

    it('should fail if user does not have plexUserId', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-1',
          isAdmin: false,
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser1,
        plexUserId: null,
      })
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)

      const { fetchTautulliStatistics } = await import('@/lib/wrapped/statistics')
      ;(fetchTautulliStatistics as jest.Mock).mockRejectedValue(
        new Error('User does not have a Plex user ID')
      )

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Plex user ID')
    })

    it('should preserve existing share token when regenerating', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'admin-1',
          isAdmin: true,
        },
      })
      const existingWrapped = {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2026,
        status: 'completed',
        shareToken: 'existing-share-token',
      }

      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser1)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(existingWrapped)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(mockPlexServer)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)

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

      const result = await generatePlexWrapped('user-1', 2026)

      // No write of the regeneration touches the token the member turned on
      expect(result.success).toBe(true)
      const writes = [
        ...(prisma.plexWrapped.createMany as jest.Mock).mock.calls.flatMap(([args]) => args.data),
        ...(prisma.plexWrapped.updateMany as jest.Mock).mock.calls.map(([args]) => args.data),
      ]
      expect(writes.length).toBeGreaterThanOrEqual(3)
      for (const data of writes) {
        expect(data).not.toHaveProperty('shareToken')
      }
    })

    describe('season year, ownership and entitlement (P0.12)', () => {
      async function setUpMemberRun({
        stripeEnabled = false,
        subscription = null,
        isExempt = false,
      }: { stripeEnabled?: boolean; subscription?: { status: string } | null; isExempt?: boolean } = {}) {
        ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
        // The same row answers the existence check and the access gate's select.
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser1, isExempt, subscription })
        ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ stripeEnabled })
        ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
        ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(mockPlexServer)
        ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(mockTautulli)
        ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)

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

      function expectNoClaim() {
        expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
        expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
      }

      it.each([2025, 2027, 2100])('refuses a member asking for %i before any read, write or LLM call', async (year) => {
        const llm = await setUpMemberRun()

        const result = await generatePlexWrapped('user-1', year)

        expect(result).toEqual({ success: false, error: 'Rewind is only available for 2026' })
        expect(prisma.user.findUnique).not.toHaveBeenCalled()
        expectNoClaim()
        expect(consume).not.toHaveBeenCalled()
        expect(llm).not.toHaveBeenCalled()
      })

      it("refuses a member acting on another member's row before spending points", async () => {
        const llm = await setUpMemberRun()

        const result = await generatePlexWrapped('user-2', 2026)

        expect(result).toEqual({ success: false, error: 'Unauthorized: You can only generate your own wrapped' })
        expectNoClaim()
        expect(consume).not.toHaveBeenCalled()
        expect(llm).not.toHaveBeenCalled()
      })

      it('refuses a member who is not entitled while Stripe is on, with no claim', async () => {
        const llm = await setUpMemberRun({ stripeEnabled: true, subscription: { status: 'CANCELED' } })

        const result = await generatePlexWrapped('user-1', 2026)

        expect(result).toEqual({
          success: false,
          code: 'NOT_ENTITLED',
          error: 'Rewind is part of an active membership. Renew your subscription to make yours.',
        })
        expectNoClaim()
        expect(consume).not.toHaveBeenCalled()
        expect(llm).not.toHaveBeenCalled()
      })

      it.each([
        ['an active subscriber', { subscription: { status: 'ACTIVE' } }],
        ['a subscriber in the dunning window', { subscription: { status: 'PAST_DUE' } }],
        ['an exempt member', { isExempt: true }],
      ])('lets %s run while Stripe is on', async (_label, facts) => {
        const llm = await setUpMemberRun({ stripeEnabled: true, ...facts })

        const result = await generatePlexWrapped('user-1', 2026)

        expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
        expect(llm).toHaveBeenCalledTimes(1)
      })

      it('lets a member with no subscription run while Stripe is off', async () => {
        const llm = await setUpMemberRun({ stripeEnabled: false, subscription: null })

        const result = await generatePlexWrapped('user-1', 2026)

        expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
        expect(llm).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('getUserPlexWrapped', () => {
    it('should allow user to get their own wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', isAdmin: false },
      })
      const mockWrapped = {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2026,
        status: 'completed',
        data: JSON.stringify({ sections: [] }),
        user: {
          id: 'user-1',
          name: 'User 1',
          email: 'user1@example.com',
          image: null,
        },
      }

      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockWrapped)

      const result = await getUserPlexWrapped('user-1', 2026)

      expect(result).toBeTruthy()
      expect(result?.userId).toBe('user-1')
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith({
        where: {
          userId_year: {
            userId: 'user-1',
            year: 2026,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      })
    })

    it('should return null if wrapped does not exist', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', isAdmin: false },
      })
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await getUserPlexWrapped('user-1', 2026)

      expect(result).toBeNull()
    })

    // Authorization is enforced inside getUserPlexWrapped itself: a user may only
    // read their own Wrapped, and admins may read any. Because a "use server"
    // export is a directly-invocable endpoint, the ownership check cannot be left
    // to the calling component.
    it('should return null when a non-owner (non-admin) requests another user wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'attacker', isAdmin: false },
      })

      const result = await getUserPlexWrapped('victim', 2026)

      expect(result).toBeNull()
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it('should return null when unauthenticated', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const result = await getUserPlexWrapped('user-1', 2026)

      expect(result).toBeNull()
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it('should allow an admin to read any user wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', isAdmin: true },
      })
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        id: 'wrapped-2',
        userId: 'user-1',
        year: 2026,
      })

      const result = await getUserPlexWrapped('user-1', 2026)

      expect(result).toBeTruthy()
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalled()
    })
  })
})

