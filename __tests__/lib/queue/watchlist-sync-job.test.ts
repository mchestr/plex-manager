/**
 * @jest-environment node
 */

/**
 * Triggering a member's watchlist sync (P4.13, GAP-39):
 *
 * - the admin path queues the job, and the job skips a member who has not
 *   opted in, without reading Plex or filing a request;
 * - the member's and the admin's triggers share the BullMQ deduplication id
 *   `watchlist:user:<userId>`, so two triggers enqueue one job;
 * - the member's own trigger is limited to 4 an hour (`watchlist:manual`).
 *
 * BullMQ is replaced by an in-memory queue that honours `deduplication` the
 * way BullMQ does (lib/queue/__tests__/rewind-dedup.redis.test.ts checks the
 * real behaviour against Redis).
 */

import type { Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { triggerWatchlistSyncJob } from '@/actions/admin/queue'
import { triggerWatchlistSync } from '@/actions/watchlist'
import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildOverseerrUserIndex, submitOverseerrRequest } from '@/lib/connections/overseerr'
import { getWatchlistProcessor } from '@/lib/queue/jobs/watchlist-sync'
import { JOB_TYPES } from '@/lib/queue/types'
import { getPlexWatchlist } from '@/lib/watchlist/plex-watchlist'

interface QueuedJob {
  id: string
  name: string
  data: unknown
}

const mockQueued = new Map<string, QueuedJob>()
const mockDeduplication = new Map<string, string>()
const mockAdd = jest.fn(
  async (name: string, data: unknown, opts: { jobId: string; deduplication?: { id: string } }) => {
    const live = opts.deduplication && mockDeduplication.get(opts.deduplication.id)
    if (live) return { id: live }
    mockQueued.set(opts.jobId, { id: opts.jobId, name, data })
    if (opts.deduplication) mockDeduplication.set(opts.deduplication.id, opts.jobId)
    return { id: opts.jobId }
  }
)

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({ add: mockAdd })),
  QueueEvents: jest.fn(),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/connection', () => ({
  isRedisConfigured: () => true,
  getRedisConnection: jest.fn(),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/watchlist/plex-watchlist', () => ({ getPlexWatchlist: jest.fn(), validatePlexToken: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({
  ...jest.requireActual('@/lib/connections/overseerr'),
  buildOverseerrUserIndex: jest.fn(),
  submitOverseerrRequest: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function signedInAs(id: string, isAdmin: boolean) {
  jest.mocked(getServerSession).mockResolvedValue({ expires: '2099-01-01', user: { id, isAdmin } })
}

/** An active member (Stripe off) with the given opt-in. */
function member(id: string, syncEnabled: boolean) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: true }))
  prismaMock.user.findUnique.mockResolvedValue({
    id,
    disabledAt: null,
    isAdmin: false,
    isExempt: false,
    subscription: null,
    plexUserId: '4815162',
    plexAuthToken: 'plex-token',
    watchlistSyncSettings: { syncEnabled },
  } as never)
  prismaMock.watchlistSyncSettings.findUnique.mockResolvedValue({ syncEnabled } as never)
}

function runJob(job: QueuedJob) {
  const process = getWatchlistProcessor(job.name)
  if (!process) throw new Error(`no processor for ${job.name}`)
  return process({ id: job.id, attemptsMade: 0, data: job.data } as Job)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockQueued.clear()
  mockDeduplication.clear()
})

describe('the admin trigger', () => {
  it('queues a job that skips a member who has not opted in', async () => {
    signedInAs('admin-1', true)
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', isAdmin: true } as never)
    const result = await triggerWatchlistSyncJob({ userId: 'member-1' })
    if (!result.success) throw new Error(result.error)

    const job = mockQueued.get(result.data.jobId)
    expect(job).toMatchObject({ name: JOB_TYPES.WATCHLIST_SYNC_USER, data: { userId: 'member-1', triggeredBy: 'admin' } })

    member('member-1', false)
    await expect(runJob(job!)).resolves.toMatchObject({ success: true, skipped: 'NOT_OPTED_IN' })
    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
    expect(getPlexWatchlist).not.toHaveBeenCalled()
    expect(submitOverseerrRequest).not.toHaveBeenCalled()
  })
})

describe('deduplication', () => {
  it("collapses the member's and the admin's triggers into one job", async () => {
    member('member-2', true)
    signedInAs('member-2', false)
    const own = await triggerWatchlistSync()

    signedInAs('admin-1', true)
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', isAdmin: true } as never)
    const admin = await triggerWatchlistSyncJob({ userId: 'member-2' })

    if (!own.success || !own.data.queued || !admin.success) throw new Error('not queued')
    expect(admin.data.jobId).toBe(own.data.jobId)
    expect(mockQueued.size).toBe(1)
    expect(mockAdd).toHaveBeenCalledTimes(2)
    for (const [, , opts] of mockAdd.mock.calls) {
      expect(opts.deduplication).toEqual({ id: 'watchlist:user:member-2' })
    }
  })
})

describe("the member's trigger", () => {
  it('allows 4 an hour, then answers RATE_LIMITED', async () => {
    member('member-3', true)
    signedInAs('member-3', false)

    for (let i = 0; i < 4; i++) {
      await expect(triggerWatchlistSync()).resolves.toMatchObject({ success: true })
    }
    await expect(triggerWatchlistSync()).resolves.toMatchObject({ success: false, code: 'RATE_LIMITED' })
  })
})
