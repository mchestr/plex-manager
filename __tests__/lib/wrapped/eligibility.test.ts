/**
 * Tests for lib/wrapped/eligibility.ts (P0.17: RWP-08, FR-48).
 *
 * A member can have a Rewind only with a plex.tv identity that Tautulli knows.
 * The answer is keyed on `plexUserId`, never on `primaryAuthService`, fails
 * open when Tautulli cannot answer (reusing that answer for a minute), and is
 * reused for 10 minutes. `checkRewindEligibility` also hands a generation run
 * the Tautulli row it has just fetched.
 *
 * The module keeps its cache for the whole file, so each test uses its own
 * member id.
 */

import { prisma } from '@/lib/prisma'
import {
  checkRewindEligibility,
  ELIGIBILITY_CACHE_MS,
  FAIL_OPEN_CACHE_MS,
  getRewindEligibility,
} from '@/lib/wrapped/eligibility'
import { makePrismaTautulli, makePrismaUser } from '../../utils/test-builders'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

const roster = [
  { user_id: 101, username: 'alice', email: 'alice@example.com', friendly_name: 'Alice' },
  { user_id: 102, username: 'bob', email: 'bob@example.com', friendly_name: 'Bob' },
]

function respondWithRoster() {
  mockFetch.mockResolvedValue({
    ok: true,
    statusText: 'OK',
    json: async () => ({ response: { result: 'success', data: roster } }),
  } as Response)
}

describe('getRewindEligibility', () => {
  const START = Date.parse('2026-12-01T12:00:00.000Z')
  let clock = START
  let nowSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    clock = START
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    respondWithRoster()
  })

  afterEach(() => {
    nowSpy.mockRestore()
  })

  it('returns NO_PLEX_IDENTITY without asking the database or Tautulli', async () => {
    const result = await getRewindEligibility({ id: 'jellyfin-member', plexUserId: null })

    expect(result).toEqual({ eligible: false, reason: 'NO_PLEX_IDENTITY' })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(prisma.tautulli.findFirst).not.toHaveBeenCalled()
  })

  it('is eligible when Tautulli has a row for the plex.tv account ID', async () => {
    const result = await getRewindEligibility({ id: 'member-match', plexUserId: '102' })

    expect(result).toEqual({ eligible: true })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(String(mockFetch.mock.calls[0][0])).toContain('cmd=get_users')
  })

  it('returns NO_TAUTULLI_MATCH when no row carries the plex.tv account ID', async () => {
    const result = await getRewindEligibility({ id: 'member-miss', plexUserId: '999' })

    expect(result).toEqual({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })
  })

  it("never matches through the member's name", async () => {
    // P0.9's lookup matches by account ID only; a name is never a key.
    const member = makePrismaUser({ id: 'member-name', name: 'alice', plexUserId: '555' })

    expect(await getRewindEligibility(member)).toEqual({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })
  })

  it.each([
    ['the request fails', () => mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))],
    [
      'Tautulli answers with an error',
      () =>
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ response: { result: 'error', message: 'Invalid apikey' } }),
        } as Response),
    ],
    [
      'Tautulli answers 500',
      () => mockFetch.mockResolvedValue({ ok: false, statusText: 'Internal Server Error' } as Response),
    ],
  ])('is eligible when %s, and asks again after a minute', async (label, failTautulli) => {
    failTautulli()
    const member = { id: `member-error-${label}`, plexUserId: '999' }

    expect(await getRewindEligibility(member)).toEqual({ eligible: true })
    // tautulliCommand retries a network error or an error result (P2.3)
    const failedLookupCalls = mockFetch.mock.calls.length

    // Cached for a minute only: once Tautulli answers, the miss is found.
    respondWithRoster()
    clock += FAIL_OPEN_CACHE_MS
    expect(await getRewindEligibility(member)).toEqual({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })
    expect(mockFetch).toHaveBeenCalledTimes(failedLookupCalls + 1)
  })

  it('asks a failing Tautulli once for two calls within a minute', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const member = { id: 'member-error-twice', plexUserId: '999' }

    expect(await getRewindEligibility(member)).toEqual({ eligible: true })
    // One lookup: the first attempt and tautulliCommand's two retries (P2.3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    clock += FAIL_OPEN_CACHE_MS - 1000
    expect(await getRewindEligibility(member)).toEqual({ eligible: true })

    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('fails open when get_users hangs, after 10 seconds', async () => {
    jest.useFakeTimers()
    try {
      // A request that only ends when it is aborted.
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
            )
          })
      )

      const pending = getRewindEligibility({ id: 'member-hung', plexUserId: '999' })
      let settled = false
      void pending.then(() => {
        settled = true
      })
      await jest.advanceTimersByTimeAsync(9_999)
      expect(settled).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(await pending).toEqual({ eligible: true })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('is eligible without asking Tautulli when none is configured', async () => {
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(null)

    expect(await getRewindEligibility({ id: 'member-no-tautulli', plexUserId: '999' })).toEqual({ eligible: true })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('makes a Jellyfin-primary member with a linked Plex identity eligible', async () => {
    const member = makePrismaUser({
      id: 'member-jellyfin-linked',
      primaryAuthService: 'jellyfin',
      jellyfinUserId: 'jf-1',
      plexUserId: '101',
    })

    expect(await getRewindEligibility(member)).toEqual({ eligible: true })
  })

  it('makes a Jellyfin-only member ineligible', async () => {
    const member = makePrismaUser({
      id: 'member-jellyfin-only',
      primaryAuthService: 'jellyfin',
      jellyfinUserId: 'jf-2',
      plexUserId: null,
    })

    expect(await getRewindEligibility(member)).toEqual({ eligible: false, reason: 'NO_PLEX_IDENTITY' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('reuses a match for 10 minutes, then asks Tautulli again', async () => {
    const member = { id: 'member-cached-match', plexUserId: '101' }

    await getRewindEligibility(member)
    clock += ELIGIBILITY_CACHE_MS - 1000
    expect(await getRewindEligibility(member)).toEqual({ eligible: true })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(prisma.tautulli.findFirst).toHaveBeenCalledTimes(1)

    clock += 1000
    expect(await getRewindEligibility(member)).toEqual({ eligible: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('reuses a miss for 10 minutes', async () => {
    const member = { id: 'member-cached-miss', plexUserId: '999' }

    await getRewindEligibility(member)
    clock += 9 * 60 * 1000
    expect(await getRewindEligibility(member)).toEqual({ eligible: false, reason: 'NO_TAUTULLI_MATCH' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('asks again when the member links a different Plex account', async () => {
    await getRewindEligibility({ id: 'member-relinked', plexUserId: '999' })

    const result = await getRewindEligibility({ id: 'member-relinked', plexUserId: '102' })

    expect(result).toEqual({ eligible: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  describe('checkRewindEligibility', () => {
    it('hands a generation run the row it has just fetched', async () => {
      expect(await checkRewindEligibility({ id: 'check-fresh', plexUserId: '102' })).toEqual({
        eligible: true,
        tautulliUser: { user_id: 102, username: 'bob' },
      })
    })

    it('hands no row from the cache, so the run looks the member up itself', async () => {
      const member = { id: 'check-cached', plexUserId: '102' }
      await checkRewindEligibility(member)

      expect(await checkRewindEligibility(member)).toEqual({ eligible: true, tautulliUser: null })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('hands no row when Tautulli fails open', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      expect(await checkRewindEligibility({ id: 'check-fail-open', plexUserId: '102' })).toEqual({
        eligible: true,
        tautulliUser: null,
      })
    })

    it('returns the reason for a miss', async () => {
      expect(await checkRewindEligibility({ id: 'check-miss', plexUserId: '999' })).toEqual({
        eligible: false,
        reason: 'NO_TAUTULLI_MATCH',
      })
    })
  })

  it('keeps each member to their own answer', async () => {
    await getRewindEligibility({ id: 'member-a', plexUserId: '101' })

    expect(await getRewindEligibility({ id: 'member-b', plexUserId: '999' })).toEqual({
      eligible: false,
      reason: 'NO_TAUTULLI_MATCH',
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
