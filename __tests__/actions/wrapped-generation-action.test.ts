/**
 * Tests for actions/wrapped-generation.ts - wrapped generation logic, the
 * P0.12 guardrails (SEC-22, RWP-12): the season year, single flight, stale
 * takeover, compare-and-set writes and the member limits, and the P0.17
 * eligibility gate (RWP-08, FR-48).
 */

import {
  generatePlexWrapped,
} from '@/actions/wrapped-generation'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import { fetchOverseerrStatistics } from '@/lib/wrapped/overseerr-statistics'
import { fetchPlexServerStatistics } from '@/lib/wrapped/server-statistics'
import {
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/tautulli-statistics'
import { revalidatePath } from 'next/cache'
import { generateShareToken } from '@/lib/utils'
import { getWrappedSettings } from '@/actions/admin'
import { consume, reward } from '@/lib/security/rate-limit'
import { memberErrorCopy } from '@/lib/wrapped/generation-errors'
import { checkRewindEligibility } from '@/lib/wrapped/eligibility'
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

// Every member is eligible by default; the eligibility tests below switch to
// ineligible answers or to the real module.
jest.mock('@/lib/wrapped/eligibility', () => ({
  checkRewindEligibility: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/wrapped/llm', () => ({
  generateWrappedWithLLM: jest.fn(),
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
  ;(checkRewindEligibility as jest.Mock).mockResolvedValue({ eligible: true, tautulliUser: null })
  ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
  ;(consume as jest.Mock).mockResolvedValue({ ok: true })
  ;(reward as jest.Mock).mockResolvedValue(undefined)
  ;(prisma.plexWrapped.createMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockResolvedValue([{ id: 'wrapped-1' }])
  ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
}

/** The claim statements (updateManyAndReturn, by member and year). */
function claimCalls() {
  return (prisma.plexWrapped.updateManyAndReturn as jest.Mock).mock.calls.map(([args]) => args)
}

/** The compare-and-set writes of a run's outcome (updateMany, by row id). */
function outcomeWrites() {
  return (prisma.plexWrapped.updateMany as jest.Mock).mock.calls.map(([args]) => args)
}

/** The points refunded to a member, as [limit, member] pairs. */
function refunds() {
  return (reward as jest.Mock).mock.calls
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

    expect(result).toEqual({ success: false, error: 'Unauthorized: You can only generate your own wrapped' })
    // Ownership is checked before the lookup, so the answer says nothing about whether the id exists.
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("gives a member the same answer for another member's id whether or not it exists", async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const missing = await generatePlexWrapped('no-such-user', 2026)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, id: 'user-2' })
    const existing = await generatePlexWrapped('user-2', 2026)

    expect(missing).toEqual(existing)
    expect(missing.error).toBe('Unauthorized: You can only generate your own wrapped')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
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

    // A failure no retry can fix costs the member nothing and leaves the row alone.
    expect(result).toEqual({ success: false, error: 'No active Tautulli server configured' })
    expect(consume).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
  })

  describe('Rewind eligibility (P0.17)', () => {
    const NOT_ELIGIBLE = {
      success: false,
      code: 'REWIND_NOT_ELIGIBLE',
      error: 'Rewind needs Plex watch history. Jellyfin support is planned.',
    }

    function setUpEligibilityRun(user: ReturnType<typeof makePrismaUser>) {
      ;(getServerSession as jest.Mock).mockResolvedValue(
        makeSession({ user: { id: user.id, email: user.email, name: user.name, isAdmin: false } })
      )
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    }

    function expectNoRowAndNoPoint() {
      expect(consume).not.toHaveBeenCalled()
      expect(prisma.plexWrapped.createMany).not.toHaveBeenCalled()
      expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
      expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
      expect(fetchTautulliStatistics).not.toHaveBeenCalled()
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()
    }

    it('refuses a Jellyfin-only member before any row is created or claimed', async () => {
      const jellyfinOnly = makePrismaUser({
        ...mockUser,
        primaryAuthService: 'jellyfin',
        jellyfinUserId: 'jf-1',
        plexUserId: null,
      })
      setUpEligibilityRun(jellyfinOnly)

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual(NOT_ELIGIBLE)
      expectNoRowAndNoPoint()
    })

    it('refuses a Plex member with no Tautulli match before any row is created or claimed', async () => {
      setUpEligibilityRun(mockUser)
      ;(checkRewindEligibility as jest.Mock).mockResolvedValue({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual(NOT_ELIGIBLE)
      expect(checkRewindEligibility).toHaveBeenCalledWith({ id: 'user-1', plexUserId: 'plex-user-123' })
      expectNoRowAndNoPoint()
    })

    it("checks ownership before eligibility, so another member's id reveals nothing", async () => {
      setUpEligibilityRun(mockUser)
      ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
      ;(checkRewindEligibility as jest.Mock).mockResolvedValue({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })

      const result = await generatePlexWrapped('user-2', 2026)

      expect(result).toEqual({ success: false, error: 'Unauthorized: You can only generate your own wrapped' })
      expect(checkRewindEligibility).not.toHaveBeenCalled()
    })

    it('refuses a Jellyfin-only member on a server with no Plex configured, revealing no configuration', async () => {
      setUpEligibilityRun(makePrismaUser({ ...mockUser, primaryAuthService: 'jellyfin', plexUserId: null }))
      ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(null)

      const result = await generatePlexWrapped('user-1', 2026)

      expect(result).toEqual(NOT_ELIGIBLE)
      expect(prisma.plexServer.findFirst).not.toHaveBeenCalled()
      expect(prisma.tautulli.findFirst).not.toHaveBeenCalled()
      expect(checkRewindEligibility).not.toHaveBeenCalled()
      expectNoRowAndNoPoint()
    })

    describe('with the real eligibility check and Tautulli roster', () => {
      const originalFetch = global.fetch
      const actualEligibility = jest.requireActual('@/lib/wrapped/eligibility')

      beforeEach(() => {
        ;(checkRewindEligibility as jest.Mock).mockImplementation(actualEligibility.checkRewindEligibility)
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            response: { result: 'success', data: [{ user_id: 4242, username: 'linked_plex' }] },
          }),
        })
        ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue(null)
        ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            tautulliUserId: '4242',
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
      })

      afterEach(() => {
        global.fetch = originalFetch
      })

      it('refuses a member missing from Tautulli without creating a failed row', async () => {
        // The member id is unique to this test: the module caches each answer.
        setUpEligibilityRun(makePrismaUser({ ...mockUser, id: 'member-missing', plexUserId: '999' }))

        const result = await generatePlexWrapped('member-missing', 2026)

        expect(result).toEqual(NOT_ELIGIBLE)
        expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('cmd=get_users')
        expectNoRowAndNoPoint()
      })

      it('generates for a Jellyfin-primary member with a linked Plex identity', async () => {
        setUpEligibilityRun(
          makePrismaUser({
            ...mockUser,
            id: 'member-jellyfin-linked',
            primaryAuthService: 'jellyfin',
            jellyfinUserId: 'jf-2',
            plexUserId: '4242',
          })
        )

        const result = await generatePlexWrapped('member-jellyfin-linked', 2026)

        expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
        // The row the eligibility check just fetched: no second get_users.
        expect(fetchTautulliStatistics).toHaveBeenCalledWith(
          { url: 'https://tautulli.example.com:8181', apiKey: 'tautulli-key' },
          { plexUserId: '4242' },
          2026,
          { user_id: 4242, username: 'linked_plex' }
        )
        expect(global.fetch).toHaveBeenCalledTimes(1)
      })

      it('reads get_users once for a run whose eligibility check asked Tautulli', async () => {
        // The real statistics fetch, against a roster that has the member and
        // an empty history: only get_users and get_history reach Tautulli.
        const actualStatistics = jest.requireActual('@/lib/wrapped/tautulli-user-statistics')
        ;(fetchTautulliStatistics as jest.Mock).mockImplementation(actualStatistics.fetchTautulliStatistics)
        global.fetch = jest.fn().mockImplementation(async (url: string) => ({
          ok: true,
          json: async () =>
            url.includes('cmd=get_users')
              ? { response: { result: 'success', data: [{ user_id: 4242, username: 'linked_plex' }] } }
              : { response: { result: 'success', data: { data: [], recordsTotal: 0 } } },
        }))
        setUpEligibilityRun(makePrismaUser({ ...mockUser, id: 'member-one-roster-read', plexUserId: '4242' }))

        const result = await generatePlexWrapped('member-one-roster-read', 2026)

        expect(result).toEqual({ success: true, wrappedId: 'wrapped-1' })
        const commands = (global.fetch as jest.Mock).mock.calls.map(([url]) => new URL(url).searchParams.get('cmd'))
        expect(commands.filter((cmd) => cmd === 'get_users')).toHaveLength(1)
        expect(commands).toContain('get_history')
      })
    })
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
        2026,
        null
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
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(prisma.plexWrapped.createMany as jest.Mock).mockRejectedValue(
      new Error('Database write failed')
    )

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database write failed')
    expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(refunds()).toEqual([
      ['rw:gen:burst', 'user-1'],
      ['rw:gen:daily', 'user-1'],
    ])
  })

  it('refunds the points when the claim statement fails, and writes no outcome', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockRejectedValue(new Error('Connection terminated'))

    const result = await generatePlexWrapped('user-1', 2026)

    expect(result).toEqual({ success: false, error: 'Connection terminated' })
    expect(consume).toHaveBeenCalledTimes(2)
    expect(refunds()).toEqual([
      ['rw:gen:burst', 'user-1'],
      ['rw:gen:daily', 'user-1'],
    ])
    expect(outcomeWrites()).toEqual([])
    expect(generateWrappedWithLLM).not.toHaveBeenCalled()
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
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockRejectedValue(new Error('Database update failed'))

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
      const claims = claimCalls().map((args) => args.data)
      const outcomes = outcomeWrites().map((args) => args.data)
      return [...created, ...claims, ...outcomes]
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
    expect(prisma.plexWrapped.updateManyAndReturn).not.toHaveBeenCalled()
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
      // The first claim wins and the rest find the row taken; outcome writes keep their claim.
      ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockImplementation(async () =>
        claims++ === 0 ? [{ id: 'wrapped-1' }] : []
      )

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
    /** A newer run took the row over: every outcome write of this run matches no row. */
    function loseTheClaim() {
      ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    }

    it('discards a result whose final write matches no row, and writes nothing else', async () => {
      setUpRun()
      loseTheClaim()

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual(ALREADY)
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: expect.objectContaining({ status: 'completed' }) },
      ])
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('marks only its own claim failed when the run fails, and reports the failure', async () => {
      setUpRun()
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({ success: false, error: 'LLM timed out' })

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual({ success: false, error: 'LLM timed out' })
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: { status: 'failed', error: 'LLM timed out' } },
      ])
    })

    it('returns ALREADY_GENERATING for an LLM failure after losing the claim', async () => {
      setUpRun()
      ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({ success: false, error: 'LLM timed out' })
      loseTheClaim()

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual(ALREADY)
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: { status: 'failed', error: 'LLM timed out' } },
      ])
    })

    it('returns ALREADY_GENERATING for a missing Tautulli account after losing the claim', async () => {
      setUpRun()
      ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
        success: false,
        code: 'TAUTULLI_USER_NOT_FOUND',
        error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
      })
      loseTheClaim()

      const result = await generatePlexWrapped('user-1', SEASON_YEAR)

      expect(result).toEqual(ALREADY)
      expect(outcomeWrites()).toEqual([
        { where: claimedRow(firstClaimedAt()), data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' } },
      ])
      expect(generateWrappedWithLLM).not.toHaveBeenCalled()
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
      ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockResolvedValueOnce([])

      expect(await runAs('member-refund')).toEqual(ALREADY)
      expect((await runAs('member-refund')).success).toBe(true)
    })

    it('refunds a claim statement that fails, so the member can try again at once', async () => {
      ;(prisma.plexWrapped.updateManyAndReturn as jest.Mock).mockRejectedValueOnce(new Error('Connection terminated'))

      expect(await runAs('member-claim-error')).toEqual({ success: false, error: 'Connection terminated' })
      expect((await runAs('member-claim-error')).success).toBe(true)
    })

    it('spends no point on a failure a retry cannot fix', async () => {
      for (let run = 0; run < 4; run++) {
        setUpRun({
          session: memberSession('member-jellyfin'),
          user: makePrismaUser({ ...mockUser, id: 'member-jellyfin', plexUserId: null }),
        })
        expect(await generatePlexWrapped('member-jellyfin', SEASON_YEAR)).toEqual({
          success: false,
          code: 'REWIND_NOT_ELIGIBLE',
          error: 'Rewind needs Plex watch history. Jellyfin support is planned.',
        })
      }

      // Linking a Plex account later finds both limits untouched.
      expect((await runAs('member-jellyfin')).success).toBe(true)
    })

    it('tells a second tab clicking at the same instant that the Rewind is already being made', async () => {
      setUpRun({ session: memberSession('member-tabs'), user: makePrismaUser({ ...mockUser, id: 'member-tabs' }) })
      // Both tabs pass check 5 before either claims; the one refused by the
      // burst limit re-reads the row the other has claimed by then.
      ;(prisma.plexWrapped.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ status: 'generating', updatedAt: new Date() })

      const results = await Promise.all([
        generatePlexWrapped('member-tabs', SEASON_YEAR),
        generatePlexWrapped('member-tabs', SEASON_YEAR),
      ])

      expect(results).toHaveLength(2)
      expect(results).toContainEqual({ success: true, wrappedId: 'wrapped-1' })
      expect(results).toContainEqual(ALREADY)
      expect(claimCalls()).toHaveLength(1)
      expect(generateWrappedWithLLM).toHaveBeenCalledTimes(1)
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledTimes(3)
      expect(prisma.plexWrapped.findUnique).toHaveBeenLastCalledWith({
        where: { userId_year: { userId: 'member-tabs', year: SEASON_YEAR } },
        select: { status: true, updatedAt: true },
      })
    })

    it.each([
      ['a live claim', 'generating', 0, 'ALREADY_GENERATING'],
      ['a row being claimed', 'pending', 0, 'ALREADY_GENERATING'],
      ['a failed run', 'failed', 0, 'RATE_LIMITED'],
      ['a stale claim', 'generating', 16, 'RATE_LIMITED'],
    ])('after a refused limit, answers %s (%s) with %s', async (_label, status, minutesAgo, code) => {
      // The limiter keeps its state across tests, so each case has its own member.
      const memberId = `member-reread-${status}-${minutesAgo}`
      expect((await runAs(memberId)).success).toBe(true)
      clock += MINUTE

      setUpRun({ session: memberSession(memberId), user: makePrismaUser({ ...mockUser, id: memberId }) })
      // The claim's age is read against new Date(), which the Date.now spy leaves on the wall clock.
      ;(prisma.plexWrapped.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ status, updatedAt: new Date(new Date().getTime() - minutesAgo * MINUTE) })
      const result = await generatePlexWrapped(memberId, SEASON_YEAR)

      expect(result.code).toBe(code)
      expect(result.retryAfterSec).toBe(code === 'RATE_LIMITED' ? 540 : undefined)
      expect(claimCalls()).toHaveLength(1)
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
