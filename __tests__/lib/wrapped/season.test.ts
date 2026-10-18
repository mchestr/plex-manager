/**
 * The season year comes from the stored Rewind window, else the calendar year
 * minus one in January, so the card, `/wrapped` and the admin screens agree
 * across New Year (P0.14: RWP-04, RWV-02, UI-02).
 */

import { prisma } from '@/lib/prisma'
import {
  getLatestCompletedRewindYear,
  getSeasonYear,
  listCompletedRewindYears,
  resolveRewindYear,
  seasonYearFor,
} from '@/lib/wrapped/season'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: { findUnique: jest.fn() },
    plexWrapped: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  },
}))

const mockConfigFindUnique = prisma.config.findUnique as jest.Mock
const mockWrappedFindFirst = prisma.plexWrapped.findFirst as jest.Mock
const mockWrappedFindMany = prisma.plexWrapped.findMany as jest.Mock
const mockWrappedFindUnique = prisma.plexWrapped.findUnique as jest.Mock

// Only years /wrapped/<year> opens: a playground save for 2005 or 9999 would 404.
const OPENABLE_YEARS = { gte: 2010, lte: 2100 }

function startDate(value: string | null) {
  mockConfigFindUnique.mockResolvedValue({ wrappedGenerationStartDate: value ? new Date(value) : null })
}

describe('getSeasonYear', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('on 2027-01-02', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    })

    it('gives 2026 for a 2026-12-01 start date', async () => {
      startDate('2026-12-01T12:00:00Z')

      await expect(getSeasonYear()).resolves.toBe(2026)
    })

    it('gives 2026 with no window, because the season closes on 31 January', async () => {
      startDate(null)

      await expect(getSeasonYear()).resolves.toBe(2026)
    })

    it('gives 2026 when no Config row exists yet', async () => {
      mockConfigFindUnique.mockResolvedValue(null)

      await expect(getSeasonYear()).resolves.toBe(2026)
    })
  })

  it('gives 2026 on 2026-10-18 with no window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T12:00:00Z'))
    startDate(null)

    await expect(getSeasonYear()).resolves.toBe(2026)
  })

  it('gives 2027 on 2027-02-01 with no window, once the season has closed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-02-01T12:00:00Z'))
    startDate(null)

    await expect(getSeasonYear()).resolves.toBe(2027)
  })

  // Known limitation until P2.2 stores month-day values: a start date saved
  // in an earlier year and never re-saved keeps the season on that year.
  it('gives 2025 for a stale 2025-11-20 start date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-05T12:00:00Z'))
    startDate('2025-11-20T12:00:00Z')

    await expect(getSeasonYear()).resolves.toBe(2025)
  })

  it('reads only the start date of the Config singleton', async () => {
    startDate(null)

    await getSeasonYear(new Date('2026-10-18T12:00:00Z'))

    expect(mockConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 'config' },
      select: { wrappedGenerationStartDate: true },
    })
  })
})

describe('seasonYearFor (JSDoc examples)', () => {
  it('matches the documented examples', () => {
    expect(seasonYearFor(new Date(2026, 11, 1), new Date(2027, 0, 2))).toBe(2026)
    expect(seasonYearFor(null, new Date(2027, 0, 2))).toBe(2026)
    expect(seasonYearFor(null, new Date(2026, 9, 18))).toBe(2026)
  })
})

describe('getLatestCompletedRewindYear', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns the member's newest completed year", async () => {
    mockWrappedFindFirst.mockResolvedValue({ year: 2026 })

    await expect(getLatestCompletedRewindYear('user-1')).resolves.toBe(2026)
    expect(mockWrappedFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'completed', year: OPENABLE_YEARS },
      orderBy: { year: 'desc' },
      select: { year: true },
    })
  })

  it('returns null when the member has no completed Rewind', async () => {
    mockWrappedFindFirst.mockResolvedValue(null)

    await expect(getLatestCompletedRewindYear('user-1')).resolves.toBeNull()
  })
})

describe('listCompletedRewindYears', () => {
  it("lists only the member's completed years, newest first", async () => {
    mockWrappedFindMany.mockResolvedValue([{ year: 2026 }, { year: 2025 }])

    await expect(listCompletedRewindYears('user-1')).resolves.toEqual([2026, 2025])
    expect(mockWrappedFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'completed', year: OPENABLE_YEARS },
      orderBy: { year: 'desc' },
      select: { year: true },
    })
  })
})

describe('resolveRewindYear', () => {
  const JAN_2027 = new Date('2027-01-02T12:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
    startDate('2026-12-01T12:00:00Z')
  })

  it('opens the season year when the member has a row for it in any state', async () => {
    mockWrappedFindUnique.mockResolvedValue({ id: 'wrapped-2026' })
    mockWrappedFindFirst.mockResolvedValue({ year: 2025 })

    await expect(resolveRewindYear('user-1', JAN_2027)).resolves.toBe(2026)
    expect(mockWrappedFindUnique).toHaveBeenCalledWith({
      where: { userId_year: { userId: 'user-1', year: 2026 } },
      select: { id: true },
    })
    expect(mockWrappedFindFirst).not.toHaveBeenCalled()
  })

  it('opens the latest completed year when the season year has no row', async () => {
    mockWrappedFindUnique.mockResolvedValue(null)
    mockWrappedFindFirst.mockResolvedValue({ year: 2025 })

    await expect(resolveRewindYear('user-1', JAN_2027)).resolves.toBe(2025)
  })

  it('opens the season year when the member has no Rewind at all', async () => {
    mockWrappedFindUnique.mockResolvedValue(null)
    mockWrappedFindFirst.mockResolvedValue(null)

    await expect(resolveRewindYear('user-1', JAN_2027)).resolves.toBe(2026)
  })
})
