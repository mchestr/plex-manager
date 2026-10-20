/**
 * @jest-environment node
 */

/**
 * The v2 playground's statistics route (P5.9, DUP-02, BP-25): one assembly
 * path through `collectV2Statistics`, members resolved by id.
 */

import { mockReset } from 'jest-mock-extended'
import { NextRequest } from 'next/server'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { GET } from '@/app/api/admin/playground/statistics/route'
import { requireAdminAPI } from '@/lib/security/api-helpers'
import { limitRequest } from '@/lib/security/rate-limit'
import { collectV2Statistics } from '@/lib/wrapped/pipeline/collect-v2-statistics'
import { RewindGenerationError } from '@/lib/wrapped/pipeline/generation-error'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/security/api-helpers', () => ({ requireAdminAPI: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ limitRequest: jest.fn() }))
jest.mock('@/lib/wrapped/pipeline/collect-v2-statistics', () => ({ collectV2Statistics: jest.fn() }))

const collect = jest.mocked(collectV2Statistics)
const STATISTICS = { totalWatchTime: { total: 600, movies: 200, shows: 400 }, percentile: { value: 80 } }

const get = (query: string) => GET(new NextRequest(`http://localhost/api/admin/playground/statistics?${query}`))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(limitRequest).mockResolvedValue(null)
  jest.mocked(requireAdminAPI).mockResolvedValue({ response: null } as never)
  prismaMock.user.findFirst.mockResolvedValue(buildUser({ plexUserId: 'plex-1', email: 'member@example.com' }))
  prismaMock.plexServer.findFirst.mockResolvedValue({ name: 'Home', url: 'http://plex', token: 't' } as never)
  prismaMock.tautulli.findFirst.mockResolvedValue({ url: 'http://tautulli', apiKey: 'k' } as never)
  prismaMock.overseerr.findFirst.mockResolvedValue(null)
  collect.mockResolvedValue(STATISTICS as never)
})

describe('GET /api/admin/playground/statistics', () => {
  it('collects through collectV2Statistics, so the playground gets the derived statistics and percentile', async () => {
    const response = await get('userId=user-1&year=2026')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ statistics: STATISTICS })
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ member: { plexUserId: 'plex-1', email: 'member@example.com' }, year: 2026, overseerr: null })
    )
  })

  it('resolves the member by app id or Plex account id, never by name', async () => {
    await get('userId=plex-1&year=2026')

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ id: 'plex-1' }, { plexUserId: 'plex-1' }] } })
    )
  })

  it('rejects a missing id and a bad year', async () => {
    expect((await get('year=2026')).status).toBe(400)
    expect((await get('userId=user-1&year=1999')).status).toBe(400)
    expect(collect).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown member or one missing from Tautulli', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    expect((await get('userId=nobody&year=2026')).status).toBe(404)

    collect.mockRejectedValueOnce(new RewindGenerationError('TAUTULLI_USER_NOT_FOUND', { retryable: false }))
    expect((await get('userId=user-1&year=2026')).status).toBe(404)
  })

  it('stops at the admin check', async () => {
    jest.mocked(requireAdminAPI).mockResolvedValueOnce({ response: new Response(null, { status: 401 }) } as never)

    expect((await get('userId=user-1&year=2026')).status).toBe(401)
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
  })
})
