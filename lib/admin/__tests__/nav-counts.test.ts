/**
 * The admin sidebar's counts: members and PENDING affiliate applications from
 * the database (invites have no badge, so none are counted). The failed-job
 * count asks Redis, and is null when Redis is unset, not ready, slow or failing.
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
  prismaMock.problemReport.count.mockResolvedValue(3)
})

it('counts the members, the pending applications and the reports with the server admin, and no longer the invites', async () => {
  await expect(getAdminNavCounts()).resolves.toStrictEqual({ users: 7, pendingAffiliates: 2, failedJobs: null, reportsToReview: 3 })
  expect(prismaMock.problemReport.count).toHaveBeenCalledWith({ where: { status: 'WITH_ADMIN' } })
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
