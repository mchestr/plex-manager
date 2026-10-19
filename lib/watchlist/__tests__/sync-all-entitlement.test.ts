/**
 * @jest-environment node
 */

/**
 * The watchlist jobs and entitlement (P4.5, SEC-28). With Stripe on, the
 * batch selects only entitled members in its query and logs how many it
 * skipped, and the per-user processor re-checks the member when it runs and
 * finishes as skipped with `NOT_ENTITLED`, without throwing (so BullMQ does
 * not retry). With Stripe off, everyone runs. The query filter itself runs
 * against PostgreSQL in __tests__/lib/access-entitled-where.pg.test.ts.
 */

import type { Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { entitledUserWhere } from '@/lib/access'
import { getWatchlistProcessor } from '@/lib/queue/jobs/watchlist-sync'
import { JOB_TYPES } from '@/lib/queue/types'
import { syncAllEnabledUsers } from '@/lib/watchlist/sync-service'
import { validatePlexToken } from '@/lib/watchlist/plex-watchlist'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/watchlist/plex-watchlist', () => ({ getPlexWatchlist: jest.fn(), validatePlexToken: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({ submitOverseerrRequest: jest.fn() }))

const mockInfo = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn() }),
}))

function given(stripeEnabled: boolean, status: 'ACTIVE' | 'CANCELED') {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled }))
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'member-1',
    disabledAt: null,
    isAdmin: false,
    isExempt: false,
    subscription: { status },
    // syncUserWatchlist's own read: no token, so it fails fast without Plex
    plexAuthToken: null,
    email: null,
    watchlistSyncSettings: null,
  } as never)
  prismaMock.plexWrapped.findFirst.mockResolvedValue({ id: 'w1' } as never)
  prismaMock.watchlistSyncSettings.findMany.mockResolvedValue([])
  prismaMock.watchlistSyncSettings.count.mockResolvedValue(0)
}

function userJob() {
  const process = getWatchlistProcessor(JOB_TYPES.WATCHLIST_SYNC_USER)
  if (!process) throw new Error('no processor')
  return process({ id: 'job-1', attemptsMade: 0, data: { userId: 'member-1', triggeredBy: 'manual' } } as Job)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
})

describe('syncAllEnabledUsers', () => {
  it.each([true, false])('selects only entitled users in its query (Stripe on: %s)', async (stripeEnabled) => {
    given(stripeEnabled, 'CANCELED')

    await syncAllEnabledUsers()

    expect(prismaMock.watchlistSyncSettings.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ syncEnabled: true, user: entitledUserWhere(stripeEnabled) }),
      })
    )
  })

  it('logs the members it skipped', async () => {
    given(true, 'CANCELED')
    prismaMock.watchlistSyncSettings.count.mockResolvedValue(2)

    await syncAllEnabledUsers()

    expect(prismaMock.watchlistSyncSettings.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ user: { NOT: entitledUserWhere(true) } }),
    })
    expect(mockInfo).toHaveBeenCalledWith('Batch watchlist sync skipped users', { skipped: 2, reason: 'NOT_ENTITLED' })
  })

  it('still runs the batch when the skipped count fails', async () => {
    given(true, 'ACTIVE')
    prismaMock.watchlistSyncSettings.count.mockRejectedValue(new Error('timeout'))

    await expect(syncAllEnabledUsers()).resolves.toEqual({ usersProcessed: 0, usersSucceeded: 0, usersFailed: 0 })
    expect(mockInfo).toHaveBeenCalledWith('Batch watchlist sync completed', expect.anything())
  })
})

describe('WATCHLIST_SYNC_USER processor', () => {
  it('skips a CANCELED member with NOT_ENTITLED and no retry', async () => {
    given(true, 'CANCELED')

    await expect(userJob()).resolves.toMatchObject({ success: false, skipped: 'NOT_ENTITLED' })
    expect(validatePlexToken).not.toHaveBeenCalled()
    expect(mockInfo).toHaveBeenCalledWith(
      'User watchlist sync job skipped',
      expect.objectContaining({ userId: 'member-1', reason: 'NOT_ENTITLED' })
    )
  })

  it.each<[boolean, 'ACTIVE' | 'CANCELED']>([
    [true, 'ACTIVE'],
    [false, 'CANCELED'],
  ])('syncs an entitled member (Stripe on: %s, %s)', async (stripeEnabled, status) => {
    given(stripeEnabled, status)

    // Reaching the sync: it fails on the missing Plex token, which throws for a retry
    await expect(userJob()).rejects.toThrow('No Plex auth token')
  })
})
