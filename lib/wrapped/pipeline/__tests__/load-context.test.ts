/**
 * @jest-environment node
 */

/**
 * The window `loadRewindContext` resolves (design 7.7, P7.7): a member or
 * admin run after the year ends reads the whole year, while a hide or unhide
 * (`keepWindow`) keeps the stored issue's window, so a season issue stays on
 * 1 January to 30 November and its season batch.
 */

import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexWrapped, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import type { RewindDataV3 } from '@/lib/wrapped/data/schema-v3'
import { loadRewindContext } from '@/lib/wrapped/pipeline/load-context'
import { dayKey } from '@/lib/wrapped/time/zone'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/llm/registry', () => ({ getFrozenRewindModel: jest.fn(async () => null) }))
jest.mock('@/lib/llm/usage-totals', () => ({ getRewindSeasonSpend: jest.fn(async () => 0) }))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn(async () => null) }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/wrapped/prompt/store', () => ({ findRewindStyleGuide: jest.fn(async () => null) }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const LA = 'America/Los_Angeles'
const JANUARY = Date.parse('2027-01-03T18:00:00Z')

/** A stored postcard (no copy), on the season window or the whole year. */
function storedIssue(wholeYear: boolean): RewindDataV3 {
  return {
    version: 3,
    year: 2026,
    statsVersion: 'stats-2026.1',
    generatedAt: wholeYear ? '2027-01-02T10:00:00.000Z' : '2026-12-01T10:00:00.000Z',
    window: { from: '2026-01-01', through: wholeYear ? '2026-12-31' : '2026-11-30', zone: LA, finalCut: wholeYear },
    edition: 'postcard',
    facts: {},
    pages: [{ type: 'cover', data: null }],
    archetype: null,
    copy: null,
    copySource: 'template',
    copyMeta: { model: null, promptVersion: 'rewind-2026.1', slotHashes: {} },
    factsHash: 'a'.repeat(64),
  }
}

function seed(stored: RewindDataV3) {
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ timezone: LA }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSerialKey: 'serial-key' }))
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
  prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ data: JSON.stringify(stored), dataVersion: 3 }))
  prismaMock.rewindServerAggregate.findUnique.mockResolvedValue(null)
  prismaMock.plexWrapped.count.mockResolvedValue(0)
}

async function load(keepWindow?: boolean) {
  const ctx = await loadRewindContext({ userId: 'user-1', year: 2026, kind: 'member', keepWindow })
  const aggregate = prismaMock.rewindServerAggregate.findUnique.mock.calls[0][0].where.year_dataThrough
  return { through: ctx.through, finalCut: ctx.finalCut, lastDay: dayKey(ctx.window.end - 1, ctx.window.zone), aggregate }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.spyOn(Date, 'now').mockReturnValue(JANUARY)
})

afterEach(() => jest.restoreAllMocks())

describe('loadRewindContext', () => {
  it('keeps a season issue on 1 January to 30 November for a hide in January, with the season batch', async () => {
    seed(storedIssue(false))

    await expect(load(true)).resolves.toEqual({
      through: '2026-11-30',
      finalCut: false,
      lastDay: '2026-11-30',
      aggregate: { year: 2026, dataThrough: new Date('2026-11-30T00:00:00.000Z') },
    })
  })

  it('reads the whole year for a member or admin run in January', async () => {
    seed(storedIssue(false))

    await expect(load()).resolves.toEqual({
      through: '2026-12-31',
      finalCut: true,
      lastDay: '2026-12-31',
      aggregate: { year: 2026, dataThrough: new Date('2026-12-31T00:00:00.000Z') },
    })
  })

  it('keeps a whole-year issue on the whole year for a hide', async () => {
    seed(storedIssue(true))

    await expect(load(true)).resolves.toMatchObject({ through: '2026-12-31', finalCut: true, lastDay: '2026-12-31' })
  })
})
