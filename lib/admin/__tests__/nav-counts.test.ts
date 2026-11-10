/**
 * The admin sidebar's counts: members and PENDING affiliate applications from
 * the database (invites have no badge, so none are counted). The failed-job
 * count asks Redis, and is null when Redis is unset, not ready, slow or failing.
 * The media cleanup items to review count held items and due Review first
 * items while the feature is on and not paused (TS 12.3 item 3).
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAdminNavCounts } from '@/lib/admin/nav-counts'
import { isRedisConfigured, readyWithin } from '@/lib/queue/connection'

const mockGetFailedCount = jest.fn()
jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/cache', () => ({ unstable_cache: <T>(fn: T) => fn }))
jest.mock('bullmq', () => ({ Queue: jest.fn(() => ({ getFailedCount: mockGetFailedCount, close: jest.fn() })) }))
jest.mock('@/lib/queue/client', () => ({ QUEUE_NAME: 'test' }))
jest.mock('@/lib/queue/connection', () => ({ isRedisConfigured: jest.fn(), readyWithin: jest.fn(), getRequestPathRedis: jest.fn(() => ({})) }))
jest.mock('@/lib/instrumentation/shutdown', () => ({ onShutdown: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(readyWithin).mockResolvedValue(true)
  prismaMock.user.count.mockResolvedValue(7)
  prismaMock.affiliateApplication.count.mockResolvedValue(2)
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(null)
  prismaMock.config.findUnique.mockResolvedValue({ timezone: 'America/Chicago' } as never)
  prismaMock.cleanupItem.count.mockResolvedValue(6)
})

it('counts the members and the pending applications, and no longer the invites', async () => {
  await expect(getAdminNavCounts()).resolves.toStrictEqual({ users: 7, pendingAffiliates: 2, failedJobs: null, cleanupReview: 0 })
  expect(prismaMock.affiliateApplication.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } })
  expect(prismaMock.invite.count).not.toHaveBeenCalled()
})

describe('failed jobs', () => {
  beforeEach(() => jest.mocked(isRedisConfigured).mockReturnValue(true))

  it('counts them from the queue', async () => {
    mockGetFailedCount.mockResolvedValue(4)
    await expect(getAdminNavCounts()).resolves.toMatchObject({ failedJobs: 4 })
  })

  it('is null while Redis is not ready', async () => {
    jest.mocked(readyWithin).mockResolvedValue(false)
    await expect(getAdminNavCounts()).resolves.toMatchObject({ failedJobs: null })
  })

  it('is null when the count fails', async () => {
    mockGetFailedCount.mockRejectedValue(new Error('down'))
    await expect(getAdminNavCounts()).resolves.toMatchObject({ failedJobs: null })
  })

  it('is null when the count takes more than 2 seconds', async () => {
    jest.useFakeTimers()
    try {
      mockGetFailedCount.mockReturnValue(new Promise(() => {}))
      const counts = getAdminNavCounts()
      await jest.advanceTimersByTimeAsync(2000)
      await expect(counts).resolves.toMatchObject({ failedJobs: null })
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('media cleanup items to review', () => {
  afterEach(() => jest.useRealTimers())

  it('counts the held items and the due Review first items, with today in the server zone, while cleanup is on', async () => {
    // 03:00 UTC is still the day before in Chicago
    jest.useFakeTimers({ now: new Date('2026-11-09T03:00:00Z'), doNotFake: ['setTimeout', 'clearTimeout'] })
    prismaMock.cleanupSettings.findUnique.mockResolvedValue({ enabled: true, pausedAt: null } as never)

    await expect(getAdminNavCounts()).resolves.toMatchObject({ cleanupReview: 6 })
    expect(prismaMock.cleanupSettings.findUnique).toHaveBeenCalledWith({ where: { id: 'cleanup' }, select: { enabled: true, pausedAt: true } })
    expect(prismaMock.cleanupItem.count).toHaveBeenCalledWith({
      where: { OR: [{ state: 'held' }, { state: 'leaving', needsApproval: true, leaveOn: { lte: '2026-11-08' } }] },
    })
  })

  it.each([
    ['off', { enabled: false, pausedAt: null }],
    ['paused', { enabled: true, pausedAt: new Date('2026-11-08T09:12:00Z') }],
  ])('is 0 while cleanup is %s, without counting', async (_state, settings) => {
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(settings as never)

    await expect(getAdminNavCounts()).resolves.toMatchObject({ cleanupReview: 0 })
    expect(prismaMock.cleanupItem.count).not.toHaveBeenCalled()
  })

  it('is 0 before the settings row exists', async () => {
    await expect(getAdminNavCounts()).resolves.toMatchObject({ cleanupReview: 0 })
    expect(prismaMock.cleanupItem.count).not.toHaveBeenCalled()
  })
})
