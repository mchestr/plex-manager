/**
 * @jest-environment node
 */

/**
 * Watchlist actions and entitlement (P4.5, SEC-28): with Stripe on, turning
 * sync on and triggering a sync need an active membership, reading the
 * settings and history needs only `read`, and turning sync off needs nothing.
 * With Stripe off, everyone runs. The levels come from the real
 * `getAccessLevel` over a mocked database.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { getWatchlistSyncSettings, triggerWatchlistSync, updateWatchlistSyncSettings } from '@/actions/watchlist'
import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { isRedisConfigured } from '@/lib/queue/connection'
import { syncUserWatchlist } from '@/lib/watchlist/sync-service'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/connection', () => ({ isRedisConfigured: jest.fn() }))
jest.mock('@/lib/watchlist/sync-service', () => ({ syncUserWatchlist: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

type Member = 'active' | 'canceled-with-rewind' | 'canceled'

function given(stripeEnabled: boolean, member: Member) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled, watchlistSyncEnabled: true }))
  prismaMock.user.findUnique.mockResolvedValue({
    disabledAt: null,
    isAdmin: false,
    isExempt: false,
    subscription: { status: member === 'active' ? 'ACTIVE' : 'CANCELED' },
    plexAuthToken: 'plex-token',
    watchlistSyncSettings: { syncEnabled: true },
  } as never)
  prismaMock.plexWrapped.findFirst.mockResolvedValue(
    member === 'canceled-with-rewind' ? ({ id: 'w1' } as never) : null
  )
  prismaMock.overseerr.findFirst.mockResolvedValue({ id: 'o1' } as never)
  prismaMock.watchlistSyncSettings.findUnique.mockResolvedValue({ syncEnabled: true } as never)
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([])
  ;(prismaMock.watchlistSyncHistory.groupBy as jest.Mock).mockResolvedValue([])
}

const NOT_ENTITLED = { success: false, code: 'NOT_ENTITLED', error: 'This needs an active membership.' }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ expires: '2099-01-01', user: { id: 'member-1', isAdmin: false } })
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(syncUserWatchlist).mockResolvedValue({ success: true, data: { itemsSynced: 1 } as never })
})

describe('with Stripe on', () => {
  it.each<Member>(['canceled', 'canceled-with-rewind'])('refuses to trigger a sync for a %s member', async (member) => {
    given(true, member)

    await expect(triggerWatchlistSync()).resolves.toEqual(NOT_ENTITLED)
    expect(syncUserWatchlist).not.toHaveBeenCalled()
  })

  it('refuses to turn sync on for a canceled member, but lets them turn it off', async () => {
    given(true, 'canceled-with-rewind')

    await expect(updateWatchlistSyncSettings({ syncEnabled: true })).resolves.toEqual(NOT_ENTITLED)
    await expect(updateWatchlistSyncSettings({ syncEnabled: false })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.watchlistSyncSettings.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.watchlistSyncSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { syncEnabled: false } })
    )
  })

  it('lets a lapsed member read their settings and history, but not a member with no access', async () => {
    given(true, 'canceled-with-rewind')
    await expect(getWatchlistSyncSettings()).resolves.toMatchObject({ success: true })

    given(true, 'canceled')
    await expect(getWatchlistSyncSettings()).resolves.toEqual(NOT_ENTITLED)
  })

  it('runs a sync for an active member', async () => {
    given(true, 'active')

    await expect(triggerWatchlistSync()).resolves.toMatchObject({ success: true, data: { queued: false } })
    expect(syncUserWatchlist).toHaveBeenCalledWith('member-1')
  })
})

describe('with Stripe off', () => {
  it('lets a canceled member trigger, enable and read', async () => {
    given(false, 'canceled')

    await expect(triggerWatchlistSync()).resolves.toMatchObject({ success: true })
    await expect(updateWatchlistSyncSettings({ syncEnabled: true })).resolves.toEqual({ success: true, data: null })
    await expect(getWatchlistSyncSettings()).resolves.toMatchObject({ success: true })
  })
})
