/**
 * The problem reports switch: off without a row, and `/report` kept, while
 * the switch is off, for a member who made or follows a report.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getProblemReportSettings, hasReportPage } from '@/lib/problem-reports/settings'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const settings = (enabled: boolean) => ({ id: 'problem-reports', enabled, breakerTrippedAt: null, updatedAt: new Date(), updatedBy: null })

beforeEach(() => mockReset(prismaMock))

describe('getProblemReportSettings', () => {
  it('is off without a saved row', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    expect(await getProblemReportSettings()).toEqual({ enabled: false })
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
