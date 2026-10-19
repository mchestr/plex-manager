/**
 * @jest-environment node
 */

/**
 * `syncUserWatchlist` (P4.13, SEC-27, GAP-39): every skip code, checked
 * before Plex is read or a request is filed; requests go out as the member's
 * Overseerr user; the totals use atomic increments; and the processor finishes
 * a skip without a retry, including when the global toggle is off.
 */

import type { Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAccessLevel } from '@/lib/access'
import { buildOverseerrUserIndex, submitOverseerrRequest } from '@/lib/connections/overseerr'
import { getWatchlistProcessor } from '@/lib/queue/jobs/watchlist-sync'
import { JOB_TYPES } from '@/lib/queue/types'
import { getPlexWatchlist, validatePlexToken } from '@/lib/watchlist/plex-watchlist'
import { WATCHLIST_SKIP_COPY, type WatchlistSkipCode } from '@/lib/watchlist/skip'
import { syncAllEnabledUsers, syncUserWatchlist } from '@/lib/watchlist/sync-service'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/access', () => ({ ...jest.requireActual('@/lib/access'), getAccessLevel: jest.fn() }))
jest.mock('@/lib/watchlist/plex-watchlist', () => ({ getPlexWatchlist: jest.fn(), validatePlexToken: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({
  ...jest.requireActual('@/lib/connections/overseerr'),
  buildOverseerrUserIndex: jest.fn(),
  submitOverseerrRequest: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MEMBER = {
  id: 'member-1',
  plexUserId: '4815162',
  plexAuthToken: 'plex-token',
  watchlistSyncSettings: { syncEnabled: true },
}

function given(overrides: {
  globalEnabled?: boolean
  member?: Partial<typeof MEMBER>
  level?: 'full' | 'lapsed' | 'none'
  index?: Map<number, number>
} = {}) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: overrides.globalEnabled ?? true }))
  prismaMock.user.findUnique.mockResolvedValue({ ...MEMBER, ...overrides.member } as never)
  prismaMock.overseerr.findFirst.mockResolvedValue({ url: 'http://overseerr.local', apiKey: 'key' } as never)
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([])
  jest.mocked(getAccessLevel).mockResolvedValue(overrides.level ?? 'full')
  jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: true, data: overrides.index ?? new Map([[4815162, 7]]) })
  jest.mocked(validatePlexToken).mockResolvedValue(true)
  jest.mocked(getPlexWatchlist).mockResolvedValue({
    success: true,
    data: [{ ratingKey: 'rk-1', guid: 'plex://movie/1', type: 'movie', title: 'The Matrix', year: 1999, tmdbId: 603 }],
  })
  jest.mocked(submitOverseerrRequest).mockResolvedValue({ success: true, requestId: 412, status: 'created' })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
})

describe('syncUserWatchlist skips', () => {
  it.each<[WatchlistSkipCode, Parameters<typeof given>[0]]>([
    ['WATCHLIST_DISABLED', { globalEnabled: false }],
    ['NOT_OPTED_IN', { member: { watchlistSyncSettings: { syncEnabled: false } } }],
    ['NOT_OPTED_IN', { member: { watchlistSyncSettings: null as never } }],
    ['NOT_ENTITLED', { level: 'lapsed' }],
    ['NOT_ENTITLED', { level: 'none' }],
    ['NO_PLEX_IDENTITY', { member: { plexUserId: null as never } }],
    ['OVERSEERR_USER_NOT_FOUND', { index: new Map([[1001, 1]]) }],
  ])('%s, without reading Plex or filing a request', async (code, setup) => {
    given(setup)

    await expect(syncUserWatchlist('member-1')).resolves.toEqual({ success: true, skipped: code })

    expect(validatePlexToken).not.toHaveBeenCalled()
    expect(getPlexWatchlist).not.toHaveBeenCalled()
    expect(submitOverseerrRequest).not.toHaveBeenCalled()
    expect(prismaMock.watchlistSyncSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: 'member-1' },
      data: { lastSyncAt: expect.any(Date), lastSyncStatus: 'skipped', lastSyncError: WATCHLIST_SKIP_COPY[code] },
    })
  })

  it('skips a deleted member as NOT_ENTITLED, so the job is not retried', async () => {
    given()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(syncUserWatchlist('member-1')).resolves.toEqual({ success: true, skipped: 'NOT_ENTITLED' })
    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
  })

  it('makes no Overseerr call at all before the Overseerr user lookup', async () => {
    given({ level: 'none' })

    await syncUserWatchlist('member-1')

    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
  })

  it('fails, for a retry, when the Overseerr users cannot be read', async () => {
    given()
    jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: false, code: 'TIMEOUT' })

    await expect(syncUserWatchlist('member-1')).resolves.toMatchObject({ success: false })
    expect(submitOverseerrRequest).not.toHaveBeenCalled()
  })
})

describe('syncUserWatchlist for a matched member', () => {
  it("files each request as the member's Overseerr user", async () => {
    given()

    await expect(syncUserWatchlist('member-1')).resolves.toMatchObject({
      success: true,
      data: { itemsSynced: 1, itemsRequested: 1 },
    })
    expect(submitOverseerrRequest).toHaveBeenCalledWith(
      { url: 'http://overseerr.local', apiKey: 'key' },
      { mediaType: 'movie', mediaId: 603 },
      { overseerrUserId: 7 }
    )
  })

  it('adds the counts to the totals with atomic increments', async () => {
    given()

    await syncUserWatchlist('member-1')

    expect(prismaMock.watchlistSyncSettings.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.watchlistSyncSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastSyncStatus: 'success',
          itemsSynced: 1,
          itemsRequested: 1,
          totalItemsSynced: { increment: 1 },
          totalItemsRequested: { increment: 1 },
        }),
      })
    )
  })

  it('stores fixed copy, never the thrown text, when the sync throws', async () => {
    given()
    prismaMock.watchlistSyncHistory.findMany.mockRejectedValue(new Error("Can't reach database server at db:5432"))

    await expect(syncUserWatchlist('member-1')).resolves.toEqual({ success: false, error: 'Sync failed' })
    expect(JSON.stringify(prismaMock.watchlistSyncSettings.upsert.mock.calls)).not.toContain('db:5432')
  })
})

describe('syncAllEnabledUsers', () => {
  it('selects nobody while the global toggle is off', async () => {
    given({ globalEnabled: false })

    await expect(syncAllEnabledUsers()).resolves.toEqual({ usersProcessed: 0, usersSucceeded: 0, usersFailed: 0 })
    expect(prismaMock.watchlistSyncSettings.findMany).not.toHaveBeenCalled()
  })
})

describe('WATCHLIST_SYNC_USER processor', () => {
  const run = () => {
    const process = getWatchlistProcessor(JOB_TYPES.WATCHLIST_SYNC_USER)
    if (!process) throw new Error('no processor')
    return process({ id: 'job-1', attemptsMade: 0, data: { userId: 'member-1', triggeredBy: 'scheduled' } } as Job)
  }

  it('finishes as skipped, without a retry, when the global toggle is off', async () => {
    given({ globalEnabled: false })

    await expect(run()).resolves.toMatchObject({ success: true, skipped: 'WATCHLIST_DISABLED' })
    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
    expect(submitOverseerrRequest).not.toHaveBeenCalled()
  })

  it('throws for a retry when the sync fails', async () => {
    given({ member: { plexAuthToken: null as never } })

    await expect(run()).rejects.toThrow('No Plex auth token')
  })
})
