/**
 * `getRewindCardModel` (P6.9): what it reads for the resolver, and what it
 * leaves unasked. The resolver's order has its own table test.
 */

import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexWrapped, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import median from '@/e2e/fixtures/rewind/median.v3.json'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { getRewindCardModel } from '@/lib/rewind/home-card'
import { wallTimeToInstant } from '@/lib/utils/zoned-time'
import { getRewindEligibility } from '@/lib/wrapped/eligibility'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/settings/app-settings', () => ({
  getAppSettings: jest.fn().mockResolvedValue({ timeZone: 'America/Chicago', locale: 'en-US', serverName: 'Northfield Plex' }),
}))
jest.mock('@/lib/brand', () => ({ rewindName: jest.fn(async (year: number) => `Northfield Plex Rewind ${year}`) }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn().mockResolvedValue({ ok: true }) }))
jest.mock('@/lib/wrapped/eligibility', () => ({ getRewindEligibility: jest.fn().mockResolvedValue({ eligible: true }) }))
jest.mock('@/lib/connections/tautulli-first-watch', () => ({ getFirstWatchDate: jest.fn() }))

const at = (wall: string) => wallTimeToInstant(wall, 'America/Chicago')
const MEMBER = { id: 'u1', isAdmin: false }
const GENERATED = new Date(median.generatedAt)

const view = (wrappedId: string, createdAt: Date) => ({
  id: `v-${wrappedId}`,
  wrappedId,
  sessionKey: 'k',
  edition: 'full',
  furthestPage: 0,
  shareActions: {},
  createdAt,
})

const skippedManaged = {
  id: 'g1',
  wrappedId: 'w26',
  userId: 'u1',
  year: 2026,
  kind: 'season',
  status: 'skipped',
  jobId: null,
  startedAt: null,
  finishedAt: null,
  error: { code: 'MANAGED_ACCOUNT' },
  factsHash: null,
  copySource: null,
  copyPolicy: 'default',
  llmCalls: 0,
  costUsd: null,
  previousData: null,
  createdAt: new Date(),
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'all' }))
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'u1', plexUserId: '42', createdAt: at('2024-01-01T00:00') }))
  prismaMock.plexWrapped.findMany.mockResolvedValue([])
  prismaMock.rewindView.findMany.mockResolvedValue([])
  prismaMock.rewindGeneration.findFirst.mockResolvedValue(null)
  prismaMock.rewindShare.findFirst.mockResolvedValue(null)
})

describe('getRewindCardModel', () => {
  it('asks nothing more outside the teaser while the flags hide Rewind', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: false }))

    await expect(getRewindCardModel(MEMBER, at('2026-10-20T12:00'))).resolves.toBeNull()
    expect(prismaMock.plexWrapped.findMany).not.toHaveBeenCalled()
  })

  it('builds the ready state from the stored issue, with the archive of earlier years', async () => {
    const row = buildPlexWrapped({ id: 'w26', year: 2026, status: 'completed', dataVersion: 3, generatedAt: GENERATED })
    prismaMock.plexWrapped.findMany.mockResolvedValue([
      row,
      buildPlexWrapped({ id: 'w25', year: 2025, status: 'completed', dataVersion: 3, archetype: 'The Explorer' }),
      buildPlexWrapped({ id: 'w24', year: 2024, status: 'completed', dataVersion: 2 }),
    ])
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ ...row, data: JSON.stringify(median) })
    prismaMock.rewindView.findMany.mockResolvedValue([view('w26', new Date(GENERATED.getTime() - 1000)), view('w25', GENERATED)])

    const model = await getRewindCardModel(MEMBER, at('2026-12-05T12:00'))

    expect(model?.name).toBe('Northfield Plex Rewind 2026')
    expect(model?.state).toMatchObject({
      kind: 'ready',
      year: 2026,
      pages: 14,
      edition: 'full',
      ink: 'marigold',
      share: { state: 'off' },
      canShare: true,
      unread: true,
      dataThrough: 'Data through November 30',
    })
    expect(model?.state.kind === 'ready' && model.state.soundtrack?.d).toMatch(/^M0,40/)
    expect(model?.archive).toEqual([
      { year: 2025, ink: 'petrol', status: 'watched' },
      { year: 2024, ink: 'paper', status: 'ready' },
    ])
    // A completed season year needs no eligibility, joining date or Redis
    expect(getRewindEligibility).not.toHaveBeenCalled()
    expect(checkRewindInfra).not.toHaveBeenCalled()
  })

  it('hides the card from a managed account the admin has not included (FR-45)', async () => {
    // The latest run, then the managed-account skip
    prismaMock.rewindGeneration.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(skippedManaged)

    await expect(getRewindCardModel(MEMBER, at('2026-12-05T12:00'))).resolves.toBeNull()
  })

  it('reports Redis missing for a season year with nothing completed (FR-50)', async () => {
    jest.mocked(checkRewindInfra).mockResolvedValueOnce({ ok: false, code: 'REDIS_NOT_CONFIGURED' })

    const model = await getRewindCardModel({ id: 'u1', isAdmin: true }, at('2026-12-05T12:00'))

    expect(model?.state).toEqual({ kind: 'unavailable', year: 2026, viewerIsAdmin: true, code: 'REDIS_NOT_CONFIGURED' })
  })
})
