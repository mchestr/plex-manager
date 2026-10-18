/**
 * Tests for actions/wrapped-generation.ts - wrapped generation logic
 */

import {
  generatePlexWrapped,
  generateAllPlexWrapped,
} from '@/actions/wrapped-generation'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import {
  fetchTautulliStatistics,
  fetchPlexServerStatistics,
  fetchOverseerrStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/statistics'
import { revalidatePath } from 'next/cache'
import { generateShareToken } from '@/lib/utils'
import { memberErrorCopy } from '@/lib/wrapped/generation-errors'
import { assembleWrappedData } from '@/lib/wrapped/assemble-wrapped'
import {
  buildLeaderboards,
  buildValidOutput,
  LEADERBOARD_MEMBER_EMAIL,
} from '@/lib/wrapped/__tests__/fixtures'

// Mock dependencies
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
    plexServer: {
      findFirst: jest.fn(),
    },
    tautulli: {
      findFirst: jest.fn(),
    },
    overseerr: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/wrapped/llm', () => ({
  generateWrappedWithLLM: jest.fn(),
}))

jest.mock('@/lib/wrapped/statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchPlexServerStatistics: jest.fn(),
  fetchOverseerrStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/utils', () => ({
  generateShareToken: jest.fn(() => 'test-share-token'),
}))

// Import test builders
import {
  makePrismaUser,
  makeSession,
  makeAdminSession,
  makePrismaPlexServer,
  makePrismaTautulli,
} from '../utils/test-builders'

const mockUser = makePrismaUser({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  plexUserId: 'plex-user-123',
})

const mockSession = makeSession({
  user: {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
  },
})

const mockAdminSession = makeAdminSession({
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
})

describe('generatePlexWrapped', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully generate wrapped for user', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalRequests: 20,
        totalServerRequests: 100,
        approvedRequests: 15,
        pendingRequests: 5,
        topRequestedGenres: [],
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('should return error when user is not authenticated', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should return error when user does not exist', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  it('should allow user to generate their own wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (will fail later in the process, but authorization check passes)
    expect(result).toBeDefined()
  })

  it('should prevent user from generating wrapped for another user', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      id: 'user-2',
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-2', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should allow admin to regenerate completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'completed',
      shareToken: 'existing-token',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'existing-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (admin can regenerate)
    expect(result).toBeDefined()
  })

  it('should prevent non-admin from regenerating completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'completed',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Only admins can regenerate')
  })

  it('should allow user to retry failed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'failed',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (user can retry failed wrapped)
    expect(result).toBeDefined()
  })

  it('should return error when no active Plex server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active Plex server')
  })

  it('should return error when no active Tautulli server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active Tautulli server')
  })

  it('should return error when user has no Plex user ID', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makePrismaUser({
        ...mockUser,
        plexUserId: null,
      })
    )
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not have a Plex user ID')
  })

  it('should handle Tautulli statistics fetch failure', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch statistics',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(prisma.plexWrapped.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wrapped-1' },
        data: expect.objectContaining({
          status: 'failed',
        }),
      })
    )
  })

  describe('when the member is missing from Tautulli', () => {
    const roster = [
      { user_id: 301, username: 'gina_plex', email: 'gina.private@example.com', friendly_name: 'Gina G' },
      { user_id: 302, username: 'hank_plex', email: 'hank.private@example.com', friendly_name: 'Hank H' },
      { user_id: 303, username: 'iris_plex', email: 'iris.private@example.com', friendly_name: 'Iris I' },
    ]
    const rosterStrings = roster.flatMap((u) => [u.username, u.email, u.friendly_name])
    const originalFetch = global.fetch

    beforeEach(() => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: 'test-share-token',
      })
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
      // Run the real lookup against a Tautulli roster that lacks the member.
      const actual = jest.requireActual('@/lib/wrapped/tautulli-user-statistics')
      ;(fetchTautulliStatistics as jest.Mock).mockImplementation(actual.fetchTautulliStatistics)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { result: 'success', data: roster } }),
      })
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('stores the code, returns the member copy and leaks no roster strings', async () => {
      const result = await generatePlexWrapped('user-1', 2024)

      expect(result).toEqual({
        success: false,
        code: 'TAUTULLI_USER_NOT_FOUND',
        error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
      })
      expect(prisma.plexWrapped.update).toHaveBeenCalledTimes(1)
      expect(prisma.plexWrapped.update).toHaveBeenCalledWith({
        where: { id: 'wrapped-1' },
        data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' },
      })
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()

      const output = JSON.stringify({
        result,
        writes: (prisma.plexWrapped.update as jest.Mock).mock.calls,
      })
      for (const value of rosterStrings) {
        expect(output).not.toContain(value)
      }
    })

    it("does not match the member through another member's email", async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
        makePrismaUser({ ...mockUser, email: 'hank.private@example.com' })
      )

      const result = await generatePlexWrapped('user-1', 2024)

      expect(fetchTautulliStatistics).toHaveBeenCalledWith(
        { url: 'https://tautulli.example.com:8181', apiKey: 'tautulli-key' },
        { plexUserId: 'plex-user-123' },
        2024
      )
      expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    // Tautulli's user_id is the plex.tv account ID, so when no row carries the
    // member's ID, a row that matches their name belongs to someone else: a
    // managed user's plex.tv title, the built-in Local user, a stale row after
    // a rename, or a Jellyfin username that User.name was set from.
    it.each(['Kids', 'local', 'HANK_PLEX'])(
      "never builds a Rewind from another account whose username is the member's name (%s)",
      async (name) => {
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
          makePrismaUser({ ...mockUser, name, email: null })
        )
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            response: {
              result: 'success',
              data: [
                { user_id: 0, username: 'Local', email: null, friendly_name: 'Local' },
                { user_id: 401, username: 'Kids', email: null, friendly_name: 'Kids' },
                ...roster,
              ],
            },
          }),
        })

        const result = await generatePlexWrapped('user-1', 2024)

        expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
        expect(prisma.plexWrapped.update).toHaveBeenCalledWith({
          where: { id: 'wrapped-1' },
          data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' },
        })
        // Only get_users ran: no other account's history was fetched.
        expect(global.fetch).toHaveBeenCalledTimes(1)
        expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('cmd=get_users')
        expect(generateWrappedWithLLM).not.toHaveBeenCalled()
      }
    )
  })

  describe('the name sent to the model', () => {
    const email = 'member.private@example.com'

    function setUpSuccessfulRun(user: ReturnType<typeof makePrismaUser>) {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: 'test-share-token',
      })
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue({
        id: 'overseerr-1',
        url: 'http://localhost:5055',
        apiKey: 'overseerr-key',
        isActive: true,
      })
      ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          tautulliUserId: 'tautulli-user-123',
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
        },
      })
      ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({ success: false })
      ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: { totalRequests: 3, totalServerRequests: 9, approvedRequests: 2, pendingRequests: 1, topRequestedGenres: [] },
      })
      ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
      ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: { sections: [], summary: 'Test summary', metadata: { totalSections: 0, generationTime: 0 } },
      })
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})
    }

    function promptInput() {
      const args = (generateWrappedWithLLM as jest.Mock).mock.calls[0][0]
      return { promptName: args.promptName, year: args.year, statistics: args.statistics }
    }

    it('sends the member name, never the email', async () => {
      setUpSuccessfulRun(makePrismaUser({ id: 'user-1', name: '  Test User ', email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expect(promptInput().promptName).toBe('Test User')
      expect(JSON.stringify(promptInput())).not.toContain(email)
      // Overseerr is looked up by plexId, then email; that lookup is not the prompt
      expect(fetchOverseerrStatistics).toHaveBeenCalledWith(
        expect.anything(),
        { plexUserId: 'plex-user-123', email },
        2024
      )
    })

    it.each([
      ['a null name', null],
      ['an empty name', '   '],
      ['an email used as the name', email],
    ])('sends "there" for %s', async (_label, name) => {
      setUpSuccessfulRun(makePrismaUser({ id: 'user-1', name, email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expect(promptInput().promptName).toBe('there')
      expect(JSON.stringify(promptInput())).not.toContain(email)
      expect(JSON.stringify(promptInput())).not.toContain('@')
    })
  })

  describe('what a completed generation stores', () => {
    const email = 'member.private@example.com'

    function setUpRunWithLeaderboards(user: ReturnType<typeof makePrismaUser>) {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: 'test-share-token',
      })
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          tautulliUserId: '7',
          totalWatchTime: 60480,
          moviesWatchTime: 20160,
          showsWatchTime: 40320,
          moviesWatched: 85,
          showsWatched: 23,
          episodesWatched: 412,
          topMovies: [{ title: 'Dune: Part Three', watchTime: 165, playCount: 1, ratingKey: '101' }],
          topShows: [{ title: 'Severance', watchTime: 900, playCount: 18, episodesWatched: 18, ratingKey: '202' }],
          watchTimeByMonth: [],
        },
      })
      ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({ success: false })
      const leaderboards = buildLeaderboards()
      ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: true, data: leaderboards.topContent })
      ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
        success: true,
        data: leaderboards.watchTime.leaderboard,
      })
      // The real assembly step, so the test sees exactly what would be stored
      ;(generateWrappedWithLLM as jest.Mock).mockImplementation(async (args) => ({
        success: true,
        data: assembleWrappedData({
          output: buildValidOutput(),
          statistics: args.statistics,
          userId: args.userId,
          userName: args.displayName,
          year: args.year,
        }),
      }))
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})
    }

    function storedData() {
      const completed = (prisma.plexWrapped.update as jest.Mock).mock.calls
        .map(([args]) => args.data)
        .find((data) => data.status === 'completed')
      return { raw: completed.data as string, parsed: JSON.parse(completed.data) }
    }

    it('gives the prompt the leaderboards but stores no roster', async () => {
      setUpRunWithLeaderboards(makePrismaUser({ id: 'user-1', name: 'Test User', email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      const promptStatistics = (generateWrappedWithLLM as jest.Mock).mock.calls[0][0].statistics
      expect(promptStatistics.leaderboards.watchTime.userPosition).toBe(2)

      const { raw, parsed } = storedData()
      expect(parsed.statistics).not.toHaveProperty('leaderboards')
      for (const leaked of ['leaderboard', LEADERBOARD_MEMBER_EMAIL, 'Jon Snow', 'Alice Smith', 'asmith']) {
        expect(raw).not.toContain(leaked)
      }
      expect(parsed.statistics.percentile).toEqual({ percentile: 100, topPercentLabel: 'Top 100%' })
      expect(parsed.userName).toBe('Test User')
    })

    it.each([
      ['an email used as the name', email],
      ['a null name', null],
    ])('stores "Viewer" as the name for %s', async (_label, name) => {
      setUpRunWithLeaderboards(makePrismaUser({ id: 'user-1', name, email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expect((generateWrappedWithLLM as jest.Mock).mock.calls[0][0].displayName).toBe('Viewer')
      const { raw, parsed } = storedData()
      expect(parsed.userName).toBe('Viewer')
      expect(raw).not.toContain(email)
    })
  })

  it('should handle LLM generation failure', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: false,
      error: 'LLM generation failed',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(prisma.plexWrapped.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wrapped-1' },
        data: expect.objectContaining({
          status: 'failed',
        }),
      })
    )
  })

  it('should handle invalid year parameter', async () => {
    // With validation, invalid year parameter (-1) is rejected before any database calls
    // No need to mock session or database - validation happens first
    const result = await generatePlexWrapped('user-1', -1)

    // The function should return an error for invalid year
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should handle database error during user lookup', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database connection failed')
  })

  it('should handle database error during wrapped upsert', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockRejectedValue(
      new Error('Database write failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database write failed')
  })

  it('should handle Plex server statistics fetch failure gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Plex server unavailable',
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalRequests: 20,
        totalServerRequests: 100,
        approvedRequests: 15,
        pendingRequests: 5,
        topRequestedGenres: [],
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if Plex server stats fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle Overseerr statistics fetch failure gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue({
      id: 'overseerr-1',
      url: 'https://overseerr.example.com:5055',
      apiKey: 'overseerr-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Overseerr unavailable',
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if Overseerr stats fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle leaderboard fetch failures gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch leaderboards',
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch watch time leaderboard',
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if leaderboards fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle invalid session with empty user ID', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: '',
        email: 'test@example.com',
        name: 'Test User',
        isAdmin: false,
      },
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid session')
  })

  it('should handle database error during final wrapped update', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockRejectedValue(
      new Error('Database update failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database update failed')
  })

  describe('share tokens (opt-in sharing, SEC-16)', () => {
    function setUpCompletedRun(session: typeof mockSession, existing: Record<string, unknown> | null) {
      ;(getServerSession as jest.Mock).mockResolvedValue(session)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(existing)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
      ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'generating',
        shareToken: (existing?.shareToken as string | null | undefined) ?? null,
      })
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
      ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
      ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          tautulliUserId: '7',
          totalWatchTime: 1000,
          moviesWatchTime: 500,
          showsWatchTime: 500,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
        },
      })
      ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({ success: false })
      ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({ success: false })
      ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({ success: false })
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
        success: true,
        data: { sections: [], summary: 'Test summary', metadata: { totalSections: 0, generationTime: 0 } },
      })
      ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})
    }

    /** Every payload generation wrote to PlexWrapped: the upsert's create and update, and each update's data. */
    function writtenPayloads(): Record<string, unknown>[] {
      const upserts = (prisma.plexWrapped.upsert as jest.Mock).mock.calls.flatMap(([args]) => [args.create, args.update])
      const updates = (prisma.plexWrapped.update as jest.Mock).mock.calls.map(([args]) => args.data)
      return [...upserts, ...updates]
    }

    function expectNoShareTokenWrites() {
      const payloads = writtenPayloads()
      expect(payloads.length).toBeGreaterThanOrEqual(3)
      for (const payload of payloads) {
        expect(payload).not.toHaveProperty('shareToken')
      }
      expect(generateShareToken).not.toHaveBeenCalled()
    }

    it('creates a new Rewind without a share token', async () => {
      setUpCompletedRun(mockSession, null)

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expect((prisma.plexWrapped.upsert as jest.Mock).mock.calls[0][0].create).toEqual(
        expect.objectContaining({ userId: 'user-1', year: 2024, status: 'generating' })
      )
      expectNoShareTokenWrites()
    })

    it('retries a failed Rewind without minting a token', async () => {
      setUpCompletedRun(mockSession, { id: 'wrapped-1', userId: 'user-1', year: 2024, status: 'failed', shareToken: null })

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expectNoShareTokenWrites()
    })

    it('regenerates a shared Rewind without touching the existing token', async () => {
      setUpCompletedRun(mockAdminSession, {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2024,
        status: 'completed',
        shareToken: 'member-chose-to-share',
      })

      const result = await generatePlexWrapped('user-1', 2024)

      expect(result.success).toBe(true)
      expectNoShareTokenWrites()
    })
  })
})

describe('generateAllPlexWrapped', () => {
  beforeEach(() => {
    // Clear mock call history but keep implementations
    jest.clearAllMocks()
    // Ensure all prisma mocks are reset
    ;(prisma.user.findMany as jest.Mock).mockReset()
    ;(prisma.user.findUnique as jest.Mock).mockReset()
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockReset()
    ;(prisma.plexWrapped.upsert as jest.Mock).mockReset()
    ;(prisma.plexWrapped.update as jest.Mock).mockReset()
    ;(prisma.plexServer.findFirst as jest.Mock).mockReset()
    ;(prisma.tautulli.findFirst as jest.Mock).mockReset()
    ;(prisma.overseerr.findFirst as jest.Mock).mockReset()
    ;(fetchTautulliStatistics as jest.Mock).mockReset()
    ;(fetchPlexServerStatistics as jest.Mock).mockReset()
    ;(fetchOverseerrStatistics as jest.Mock).mockReset()
    ;(fetchTopContentLeaderboards as jest.Mock).mockReset()
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockReset()
    ;(generateWrappedWithLLM as jest.Mock).mockReset()
    ;(getServerSession as jest.Mock).mockReset()
  })

  it('should generate wrapped for all users when admin', async () => {
    // Mock getServerSession to always return admin session (called multiple times)
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])

    // Mock all dependencies for generatePlexWrapped - need to handle 2 users
    ;(prisma.user.findUnique as jest.Mock).mockImplementation((args) => {
      if (args.where.id === 'user-1') {
        return Promise.resolve({ ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' })
      }
      if (args.where.id === 'user-2') {
        return Promise.resolve({ ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' })
      }
      return Promise.resolve(null)
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.upsert as jest.Mock).mockImplementation((args) => {
      return Promise.resolve({
        id: `wrapped-${args.where.userId_year.userId}`,
        userId: args.where.userId_year.userId,
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      })
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'api-key',
      isActive: true,
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalWatchTime: 100,
        moviesWatchTime: 50,
        showsWatchTime: 50,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
        tautulliUserId: 'user-1',
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      status: 'completed',
    })

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('should reject non-admin users', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('should handle partial failures', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])

    // Mock dependencies - first user succeeds, second fails
    ;(prisma.user.findUnique as jest.Mock).mockImplementation((args) => {
      if (args.where.id === 'user-1') {
        return Promise.resolve({ ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' })
      }
      if (args.where.id === 'user-2') {
        return Promise.resolve({ ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' })
      }
      return Promise.resolve(null)
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.upsert as jest.Mock).mockImplementation((args) => {
      return Promise.resolve({
        id: `wrapped-${args.where.userId_year.userId}`,
        userId: args.where.userId_year.userId,
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      })
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'api-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalWatchTime: 100,
          moviesWatchTime: 50,
          showsWatchTime: 50,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'user-1',
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch statistics',
      })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock)
      .mockResolvedValueOnce({
        id: 'wrapped-1',
        status: 'completed',
      })
      .mockResolvedValueOnce({
        id: 'wrapped-2',
        status: 'failed',
        error: 'Failed to fetch statistics',
      })

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
  })

  it('should skip users without Plex user ID', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2024)

    // Should successfully call the function with admin session
    expect(result.success).toBe(true)
    // Should only query for users with plexUserId not null
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        plexUserId: { not: null },
      },
    })
  })

  it('should handle database error when fetching users', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockRejectedValue(
      new Error('Database query failed')
    )

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Database query failed')

    consoleErrorSpy.mockRestore()
  })

  it('should handle all users failing', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(2)
    expect(result.errors).toHaveLength(2)

    consoleErrorSpy.mockRestore()
  })

  it('lists the admin hint, not the member copy, for a member missing from Tautulli', async () => {
    const member = { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' }
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([member])
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(member)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      code: 'TAUTULLI_USER_NOT_FOUND',
      error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
    })

    const result = await generateAllPlexWrapped(2024)

    expect(result.failed).toBe(1)
    expect(result.errors).toEqual([
      "User 1: Plex user plex-1 is not in Tautulli's user list. Refresh users in Tautulli.",
    ])
  })

  it('labels a failed member without a name by id, never by email', async () => {
    const member = { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: null, email: 'user1@test.com' }
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([member])
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(member)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({ success: false, error: 'Tautulli is down' })

    const result = await generateAllPlexWrapped(2024)

    expect(result.errors).toEqual(['user-1: Tautulli is down'])
  })

  it('should handle empty user list', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject unauthenticated requests', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})

