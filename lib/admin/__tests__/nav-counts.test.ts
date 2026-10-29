/**
 * The admin sidebar's invite badge counts admin invites that can still be
 * redeemed, never a member's affiliate invite.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAdminNavCounts } from '@/lib/admin/nav-counts'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/cache', () => ({ unstable_cache: <T>(fn: T) => fn }))
jest.mock('bullmq', () => ({ Queue: jest.fn() }))
jest.mock('@/lib/queue/client', () => ({ QUEUE_NAME: 'test' }))
jest.mock('@/lib/queue/connection', () => ({ isRedisConfigured: () => false }))

beforeEach(() => mockReset(prismaMock))

it('counts only active admin invites for the badge', async () => {
  prismaMock.user.count.mockResolvedValue(7)
  prismaMock.invite.count.mockResolvedValue(3)

  await expect(getAdminNavCounts()).resolves.toEqual({ users: 7, activeInvites: 3, failedJobs: null })
  expect(prismaMock.invite.count.mock.calls[0][0]?.where).toMatchObject({ kind: 'ADMIN' })
})
