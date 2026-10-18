/**
 * Tests for actions/wrapped-generation.ts - wrapped generation logic, and the
 * P0.12 guardrails (SEC-22, RWP-12): the season year, single flight, stale
 * takeover, compare-and-set writes and the member limits.
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
import { getWrappedSettings } from '@/actions/admin'
import { consume, reward } from '@/lib/security/rate-limit'
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

jest.mock('@/actions/admin', () => ({
  getWrappedSettings: jest.fn(),
}))

// The limiter is a pass-through by default; the rate-limit tests below
// switch these to the real in-process limiter.
jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  reward: jest.fn(),
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

const SEASON_YEAR = 2026

/**
 * The defaults every test starts from: the season is 2026, Stripe is off,
 * the limiter allows, and the run claims row wrapped-1 and keeps its claim.
 */
function setGenerationDefaults() {
  ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: SEASON_YEAR })
  ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
  ;(consume as jest.Mock).mockResolvedValue({ ok: true })
  ;(reward as jest.Mock).mockResolvedValue(undefined)
  ;(prisma.plexWrapped.createMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.plexWrapped.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'wrapped-1' })
}

/** The claim's updateMany calls (by member and year). */
function claimCalls() {
  return (prisma.plexWrapped.updateMany as jest.Mock).mock.calls.map(([args]) => args).filter((args) => !args.where.id)
}

/** The compare-and-set writes of a run's outcome (by row id). */
function outcomeWrites() {
  return (prisma.plexWrapped.updateMany as jest.Mock).mock.calls.map(([args]) => args).filter((args) => args.where.id)
}

/** The where clause of an outcome write for the claim made at `claimedAt`. */
function claimedRow(claimedAt: Date, id = 'wrapped-1') {
  return {
    id,
    status: 'generating',
    updatedAt: { gte: claimedAt, lt: new Date(claimedAt.getTime() + 15 * 60 * 1000) },
  }
}

/** The time the first claim was made. */
function firstClaimedAt(): Date {
  return claimCalls()[0].data.updatedAt
}

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
    setGenerationDefaults()
  })

  it('should successfully generate wrapped for user', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
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

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('should return error when user is not authenticated', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should return error when user does not exist', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  it('should allow user to generate their own wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())

    const result = await generatePlexWrapped('user-1', 2026)

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

    const result = await generatePlexWrapped('user-2', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should allow admin to regenerate completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2026,
      status: 'completed',
      shareToken: 'existing-token',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())

    const result = await generatePlexWrapped('user-1', 2026)

    // Should proceed (admin can regenerate)
    expect(result).toBeDefined()
  })

  it('should prevent non-admin from regenerating completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2026,
      status: 'completed',
    })

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Only admins can regenerate')
  })

  it('should allow user to retry failed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2026,
      status: 'failed',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())

    const result = await generatePlexWrapped('user-1', 2026)

    // Should proceed (user can retry failed wrapped)
    expect(result).toBeDefined()
  })

  it('should return error when no active Plex server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active Plex server')
  })

  it('should return error when no active Tautulli server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2026)

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
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not have a Plex user ID')
  })

  it('should handle Tautulli statistics fetch failure', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch statistics',
    })

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(outcomeWrites()).toEqual([
      expect.objectContaining({
        where: claimedRow(firstClaimedAt()),
        data: expect.objectContaining({
          status: 'failed',
        }),
      }),
    ])
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
      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual({
        success: false,
        code: 'TAUTULLI_USER_NOT_FOUND',
        error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
      })
      expect(outcomeWrites()).toEqual([
        {
          where: claimedRow(firstClaimedAt()),
          data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' },
        },
      ])
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()

      const output = JSON.stringify({
        result,
        writes: (prisma.plexWrapped.updateMany as jest.Mock).mock.calls,
      })
      for (const value of rosterStrings) {
        expect(output).not.toContain(value)
      }
    })

    it("does not match the member through another member's email", async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
        makePrismaUser({ ...mockUser, email: 'hank.private@example.com' })
      )

      const result = await generatePlexWrapped('user-1', 2026)

      expect(fetchTautulliStatistics).toHaveBeenCalledWith(
        { url: 'https://tautulli.example.com:8181', apiKey: 'tautulli-key' },
        { plexUserId: 'plex-user-123' },
        2026
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

        const result = await generatePlexWrapped('user-1', 2026)

        expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
        expect(outcomeWrites()).toEqual([
          {
            where: claimedRow(firstClaimedAt()),
            data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' },
          },
        ])
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
    }

    function promptInput() {
      const args = (generateWrappedWithLLM as jest.Mock).mock.calls[0][0]
      return { promptName: args.promptName, year: args.year, statistics: args.statistics }
    }

    it('sends the member name, never the email', async () => {
      setUpSuccessfulRun(makePrismaUser({ id: 'user-1', name: '  Test User ', email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(true)
      expect(promptInput().promptName).toBe('Test User')
      expect(JSON.stringify(promptInput())).not.toContain(email)
      // Overseerr is looked up by plexId, then email; that lookup is not the prompt
      expect(fetchOverseerrStatistics).toHaveBeenCalledWith(
        expect.anything(),
        { plexUserId: 'plex-user-123', email },
        2026
      )
    })

    it.each([
      ['a null name', null],
      ['an empty name', '   '],
      ['an email used as the name', email],
    ])('sends "there" for %s', async (_label, name) => {
      setUpSuccessfulRun(makePrismaUser({ id: 'user-1', name, email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2026)

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
    }

    function storedData() {
      const completed = outcomeWrites()
        .map((args) => args.data)
        .find((data) => data.status === 'completed')
      return { raw: completed.data as string, parsed: JSON.parse(completed.data) }
    }

    it('gives the prompt the leaderboards but stores no roster', async () => {
      setUpRunWithLeaderboards(makePrismaUser({ id: 'user-1', name: 'Test User', email, plexUserId: 'plex-user-123' }))

      const result = await generatePlexWrapped('user-1', 2026)

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

      const result = await generatePlexWrapped('user-1', 2026)

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

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(outcomeWrites()).toEqual([
      expect.objectContaining({
        where: claimedRow(firstClaimedAt()),
        data: expect.objectContaining({
          status: 'failed',
        }),
      }),
    ])
  })

  it('should handle invalid year parameter', async () => {
    // An invalid year is rejected after the session check, before any database call
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)

    const result = await generatePlexWrapped('user-1', -1)

    expect(result).toEqual({ success: false, error: 'Rewind is only available for 2026' })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('should handle database error during user lookup', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    )

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database connection failed')
  })

  it('should handle database error while claiming the row', async () => {
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
    ;(prisma.plexWrapped.createMany as jest.Mock).mockRejectedValue(
      new Error('Database write failed')
    )

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database write failed')
    expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
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

    const result = await generatePlexWrapped('user-1', 2026)

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

    const result = await generatePlexWrapped('user-1', 2026)

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

    const result = await generatePlexWrapped('user-1', 2026)

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

    const result = await generatePlexWrapped('user-1', 2026)

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
    // The claim succeeds; storing the result (and then the failure) does not.
    ;(prisma.plexWrapped.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValue(new Error('Database update failed'))

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database update failed')
  })

  describe('share tokens (opt-in sharing, SEC-16)', () => {
    function setUpCompletedRun(session: typeof mockSession, existing: Record<string, unknown> | null) {
      ;(getServerSession as jest.Mock).mockResolvedValue(session)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(existing)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
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
    }

    /** Every payload generation wrote to PlexWrapped: the created row, the claim and the outcome. */
    function writtenPayloads(): Record<string, unknown>[] {
      const created = (prisma.plexWrapped.createMany as jest.Mock).mock.calls.flatMap(([args]) => args.data)
      const updates = (prisma.plexWrapped.updateMany as jest.Mock).mock.calls.map(([args]) => args.data)
      return [...created, ...updates]
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

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(true)
      expect((prisma.plexWrapped.createMany as jest.Mock).mock.calls[0][0].data).toEqual([
        expect.objectContaining({ userId: 'user-1', year: 2026, status: 'pending' }),
      ])
      expect(claimCalls()[0].data).toEqual(expect.objectContaining({ status: 'generating' }))
      expectNoShareTokenWrites()
    })

    it('retries a failed Rewind without minting a token', async () => {
      setUpCompletedRun(mockSession, { id: 'wrapped-1', userId: 'user-1', year: 2026, status: 'failed', shareToken: null })

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(true)
      expectNoShareTokenWrites()
    })

    it('regenerates a shared Rewind without touching the existing token', async () => {
      setUpCompletedRun(mockAdminSession, {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2026,
        status: 'completed',
        shareToken: 'member-chose-to-share',
      })

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result.success).toBe(true)
      expectNoShareTokenWrites()
    })
  })
})

describe('generation guardrails (P0.12)', () => {
  const MINUTE = 60 * 1000
  const ALREADY = { success: false, code: 'ALREADY_GENERATING', error: 'Your Rewind is already being made.' }

  function memberSession(id: string) {
    return makeSession({ user: { id, email: `${id}@example.com`, name: 'Member', isAdmin: false } })
  }

  function setUpRun({
    session = mockSession,
    user = mockUser,
    existing = null,
  }: {
    session?: ReturnType<typeof makeSession>
    user?: ReturnType<typeof makePrismaUser>
    existing?: { status: string; updatedAt: Date } | null
  } = {}) {
    ;(getServerSession as jest.Mock).mockResolvedValue(session)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(existing)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
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
  }

  function expectNothingWritten() {
    expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    setGenerationDefaults()
  })

  describe('the season year', () => {
    it.each([2025, 2027, 2100])('refuses %i for a member with no write and no LLM call', async (year) => {
      setUpRun()

      const result = await generatePlexWrapped('user-1', year)

      expect(result).toEqual({ success: false, error: 'Rewind is only available for 2026' })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(consume).not.toHaveBeenCalled()
      expectNothingWritten()
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()
    })

    it('refuses the year as a string', async () => {
      setUpRun()

      const result = await generatePlexWrapped('user-1', '2026' as unknown as number)

      expect(result).toEqual({ success: false, error: 'Rewind is only available for 2026' })
      expectNothingWritten()
    })

    it('follows the configured season, not the calendar', async () => {
      ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2025 })
      setUpRun()

      expect(await generatePlexWrapped('user-1', 2026)).toEqual({
        success: false,
        error: 'Rewind is only available for 2025',
      })
      expect(await generatePlexWrapped('user-1', 2025)).toEqual({ success: true, wrappedId: 'wrapped-1' })
      expect(generateWrappedWithLLM).toHaveBeenCalledWith(expect.objectContaining({ year: 2025 }))
    })
  })

  describe('one run at a time', () => {
    it('makes one LLM call for five parallel calls; the others are refused and refunded', async () => {
      setUpRun()
      let claims = 0
      ;(prisma.plexWrapped.updateMany as jest.Mock).mockImplementation(async (args) => ({
        // The first claim wins and the rest find the row taken; outcome writes keep their claim.
        count: args.where.id ? 1 : claims++ === 0 ? 1 : 0,
      }))

      const results = await Promise.all(
        Array.from({ length: 5 }, () => generatePlexWrapped('user-1', SEASON_YEAR))
      )

      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(1)
      expect(results.filter((result) => result.success)).toEqual([{ success: true, wrappedId: 'wrapped-1' }])
      expect(results.filter((result) => !result.success)).toEqual([ALREADY, ALREADY, ALREADY, ALREADY])
      expect(claimCalls()).toHaveLength(5)
      expect(outcomeWrites()).toHaveLength(1)
      // Every call spent both points; each of the four losers got both back.
      expect(consume).toHaveBeenCalledTimes(10)
      expect(reward).toHaveBeenCalledTimes(8)
      expect((reward as jest.Mock).mock.calls.filter(([name]) => name === 'rw:gen:burst')).toHaveLength(4)
      expect((reward as jest.Mock).mock.calls.filter(([name]) => name === 'rw:gen:daily')).toHaveLength(4)
      expect(reward).toHaveBeenCalledWith('rw:gen:burst', 'user-1')
    })

    it('refuses while a live run holds the row, before spending any points', async () => {
      setUpRun({ existing: { status: 'generating', updatedAt: new Date(Date.now() - 14 * MINUTE) } })

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual(ALREADY)
      expect(consume).not.toHaveBeenCalled()
      expectNothingWritten()
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()
    })

    it('reclaims a generating row whose claim is 16 minutes old', async () => {
      const staleClaim = new Date(Date.now() - 16 * MINUTE)
      setUpRun({ existing: { status: 'generating', updatedAt: staleClaim } })

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(1)
      const [claim] = claimCalls()
      const cutoff = new Date(claim.data.updatedAt.getTime() - 15 * MINUTE)
      expect(claim.where.OR).toContainEqual({ status: 'generating', updatedAt: { lt: cutoff } })
      expect(staleClaim.getTime()).toBeLessThan(cutoff.getTime())
      expect(claim.data).toEqual({ status: 'generating', error: null, updatedAt: expect.any(Date) })
    })
  })

  describe('compare-and-set outcome writes', () => {
    it('discards a result whose final write matches no row, and writes nothing else', async () => {
      setUpRun()
      ;(prisma.plexWrapped.updateMany as jest.Mock).mockImplementation(async (args) => ({
        count: args.where.id ? 0 : 1,
      }))

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual(ALREADY)
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: expect.objectContaining({ status: 'completed' }) },
      ])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('marks only its own claim failed when the run fails', async () => {
      setUpRun()
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({ success: false, error: 'LLM timed out' })
      ;(prisma.plexWrapped.updateMany as jest.Mock).mockImplementation(async (args) => ({
        count: args.where.id ? 0 : 1,
      }))

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual({ success: false, error: 'LLM timed out' })
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: { status: 'failed', error: 'LLM timed out' } },
      ])
    })

    it('never marks an existing Rewind failed when an error comes before the claim', async () => {
      setUpRun({ session: mockAdminSession, existing: { status: 'completed', updatedAt: new Date() } })
      ;(prisma.plexServer.findFirst as jest.Mock).mockRejectedValue(new Error('Database connection lost'))

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual({ success: false, error: 'Database connection lost' })
      expectNothingWritten()
    })
  })

  describe('member limits (the real in-process limiter)', () => {
    const actualLimiter = jest.requireActual('@/lib/security/rate-limit')
    const START = Date.parse('2026-12-01T12:00:00.000Z')
    let clock = START
    let nowSpy: jest.SpyInstance

    function runAs(memberId: string) {
      setUpRun({
        session: memberSession(memberId),
        user: makePrismaUser({ ...mockUser, id: memberId }),
      })
      return generatePlexWrapped(memberId, SEASON_YEAR)
    }

    beforeEach(() => {
      clock = START
      nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
      ;(consume as jest.Mock).mockImplementation(actualLimiter.consume)
      ;(reward as jest.Mock).mockImplementation(actualLimiter.reward)
    })

    afterEach(() => {
      nowSpy.mockRestore()
    })

    it('refuses a second run within 10 minutes and allows one after', async () => {
      expect((await runAs('member-burst')).success).toBe(true)

      clock += 9 * MINUTE
      expect(await runAs('member-burst')).toEqual({
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSec: 60,
        error: 'You can try again in 1 minute.',
      })
      expect(claimCalls()).toHaveLength(1)

      clock += MINUTE + 1000
      expect((await runAs('member-burst')).success).toBe(true)
      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(2)
    })

    it('refuses a fourth run in one day', async () => {
      for (let run = 0; run < 3; run++) {
        expect((await runAs('member-daily')).success).toBe(true)
        clock += 11 * MINUTE
      }

      const fourth = await runAs('member-daily')

      expect(fourth).toEqual({
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSec: 24 * 60 * 60 - 33 * 60,
        error: 'You can try again in 24 hours.',
      })
      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(3)

      // The refused daily point gave the burst point back: a minute later the
      // wait is still the daily one, not a fresh 10 minutes.
      clock += MINUTE
      expect((await runAs('member-daily')).retryAfterSec).toBe(24 * 60 * 60 - 34 * 60)

      clock = START + 24 * 60 * MINUTE + 1000
      expect((await runAs('member-daily')).success).toBe(true)
    })

    it('refunds a lost claim, so the member can try again at once', async () => {
      ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 })

      expect(await runAs('member-refund')).toEqual(ALREADY)
      expect((await runAs('member-refund')).success).toBe(true)
    })

    it('keeps each member to their own limit', async () => {
      expect((await runAs('member-one')).success).toBe(true)
      expect((await runAs('member-two')).success).toBe(true)
    })

    it('exempts admins', async () => {
      setUpRun({ session: mockAdminSession })

      for (let run = 0; run < 5; run++) {
        expect(await generatePlexWrapped('user-1', SEASON_YEAR)).toEqual({ success: true, wrappedId: 'wrapped-1' })
      }

      expect(consume).not.toHaveBeenCalled()
      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(5)
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
    ;(prisma.plexWrapped.createMany as jest.Mock).mockReset()
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockReset()
    ;(prisma.plexWrapped.findUniqueOrThrow as jest.Mock).mockReset()
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
    setGenerationDefaults()
    ;(prisma.plexWrapped.findUniqueOrThrow as jest.Mock).mockImplementation(async (args) => ({
      id: `wrapped-${args.where.userId_year.userId}`,
    }))
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
    const result = await generateAllPlexWrapped(2026)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('should reject non-admin users', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)

    const result = await generateAllPlexWrapped(2026)

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
    const result = await generateAllPlexWrapped(2026)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
  })

  it('should skip users without Plex user ID', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2026)

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

    const result = await generateAllPlexWrapped(2026)

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

    const result = await generateAllPlexWrapped(2026)

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
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      code: 'TAUTULLI_USER_NOT_FOUND',
      error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
    })

    const result = await generateAllPlexWrapped(2026)

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
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({ success: false, error: 'Tautulli is down' })

    const result = await generateAllPlexWrapped(2026)

    expect(result.errors).toEqual(['user-1: Tautulli is down'])
  })

  it('should handle empty user list', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2026)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject unauthenticated requests', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generateAllPlexWrapped(2026)

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})

