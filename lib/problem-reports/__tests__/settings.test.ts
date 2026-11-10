/**
 * The problem reports switch: off without a row, and `/report` kept, while
 * the switch is off, for a member who made or follows a report.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getProblemReportSettings, getSwapSettings, hasReportPage } from '@/lib/problem-reports/settings'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const settings = (enabled: boolean) => ({
  id: 'problem-reports',
  enabled,
  breakerTrippedAt: null,
  automatic: 'OFF' as const,
  automaticSince: null,
  weeklySwaps: 3,
  titleCooldownDays: 14,
  dailySwapCap: 10,
  updatedAt: new Date(),
  updatedBy: null,
})

beforeEach(() => mockReset(prismaMock))

describe('getProblemReportSettings', () => {
  it('is off without a saved row', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    expect(await getProblemReportSettings()).toEqual({ enabled: false })
  })
})

describe('getSwapSettings', () => {
  it('has members\' swaps off with the default limits without a saved row', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    expect(await getSwapSettings()).toEqual({ automatic: 'OFF', automaticSince: null, weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10, breakerTrippedAt: null })
  })

  it('reads the saved mode, when it changed, the limits and the breaker', async () => {
    const since = new Date('2026-11-01T00:00:00Z')
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...settings(true), automatic: 'DRY_RUN', automaticSince: since, weeklySwaps: 2 })

    expect(await getSwapSettings()).toMatchObject({ automatic: 'DRY_RUN', automaticSince: since, weeklySwaps: 2 })
    expect(prismaMock.problemReportSettings.findUnique).toHaveBeenCalledWith({
      where: { id: 'problem-reports' },
      select: { automatic: true, automaticSince: true, weeklySwaps: true, titleCooldownDays: true, dailySwapCap: true, breakerTrippedAt: true },
    })
  })
})

describe('hasReportPage', () => {
  it('gives every member the page while the switch is on', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings(true))

    expect(await hasReportPage('member-1')).toBe(true)
    expect(prismaMock.problemReport.findFirst).not.toHaveBeenCalled()
  })

  it('keeps the page, while the switch is off, for a member who made or follows a report', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings(false))
    prismaMock.problemReport.findFirst.mockResolvedValue({ id: 'report-1' } as never)

    expect(await hasReportPage('member-1')).toBe(true)
    expect(prismaMock.problemReport.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ reporterId: 'member-1' }, { events: { some: { kind: 'ALSO_REPORTED', actorUserId: 'member-1' } } }] },
      select: { id: true },
    })
  })

  it('hides the page, while the switch is off, from a member with no reports', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)
    prismaMock.problemReport.findFirst.mockResolvedValue(null)

    expect(await hasReportPage('member-1')).toBe(false)
  })
})
