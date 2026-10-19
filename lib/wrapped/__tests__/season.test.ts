/**
 * The Rewind season: month-day dates evaluated in the server zone, the season
 * year across New Year, and the `/wrapped` year resolver (P0.14: RWP-04,
 * RWV-02, UI-02; P2.2: GAP-40).
 */

import { prisma } from '@/lib/prisma'
import {
  getLatestCompletedRewindYear,
  getSeasonState,
  getSeasonYear,
  listCompletedRewindYears,
  parseMonthDay,
  resolveRewindYear,
  seasonStateAt,
} from '@/lib/wrapped/season'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

const mockConfigFindUnique = prisma.config.findUnique as jest.Mock
const mockWrappedFindFirst = prisma.plexWrapped.findFirst as jest.Mock
const mockWrappedFindMany = prisma.plexWrapped.findMany as jest.Mock
const mockWrappedFindUnique = prisma.plexWrapped.findUnique as jest.Mock

// Only years /wrapped/<year> opens: a playground save for 2005 or 9999 would 404.
const OPENABLE_YEARS = { gte: 2010, lte: 2100 }

/** The stored window and server zone (one Config row serves both reads). */
function config(opens = '12-01', closes = '01-31', timezone: string | null = null) {
  mockConfigFindUnique.mockResolvedValue({ rewindSeasonOpens: opens, rewindSeasonCloses: closes, timezone })
}

const at = (iso: string) => new Date(iso)

describe('parseMonthDay', () => {
  it.each([
    ['12-01', { month: 12, day: 1 }],
    ['01-31', { month: 1, day: 31 }],
    ['02-29', { month: 2, day: 29 }],
  ])('reads %s', (value, expected) => {
    expect(parseMonthDay(value)).toEqual(expected)
  })

  it.each(['02-30', '04-31', '13-01', '00-10', '12-00', '1-01', '12-1', '2026-12-01', ''])('rejects %p', (value) => {
    expect(parseMonthDay(value)).toBeNull()
  })
})

describe('getSeasonState with the default window (12-01 to 01-31)', () => {
  it('2027-01-02 is open for 2026', async () => {
    config()
    await expect(getSeasonState(at('2027-01-02T12:00:00Z'))).resolves.toEqual({
      seasonYear: 2026,
      isOpen: true,
      opensAt: at('2026-12-01T00:00:00Z'),
      closesAt: at('2027-02-01T00:00:00Z'),
    })
  })

  it('2026-10-18 is closed for 2026', async () => {
    config()
    await expect(getSeasonState(at('2026-10-18T12:00:00Z'))).resolves.toMatchObject({ seasonYear: 2026, isOpen: false })
  })

  it('2026-11-30T23:30Z is open under Europe/Berlin, where it is already 1 December', async () => {
    config('12-01', '01-31', 'Europe/Berlin')
    await expect(getSeasonState(at('2026-11-30T23:30:00Z'))).resolves.toEqual({
      seasonYear: 2026,
      isOpen: true,
      opensAt: at('2026-11-30T23:00:00Z'),
      closesAt: at('2027-01-31T23:00:00Z'),
    })
  })

  it('the same instant is closed under UTC', async () => {
    config()
    await expect(getSeasonState(at('2026-11-30T23:30:00Z'))).resolves.toMatchObject({ seasonYear: 2026, isOpen: false })
  })

  it('31 January is the last open day and 1 February starts the next season year', () => {
    expect(seasonStateAt(at('2027-01-31T23:59:59Z'), '12-01', '01-31', 'UTC')).toMatchObject({
      seasonYear: 2026,
      isOpen: true,
    })
    expect(seasonStateAt(at('2027-02-01T00:00:00Z'), '12-01', '01-31', 'UTC')).toMatchObject({
      seasonYear: 2027,
      isOpen: false,
    })
  })

  it('reads the day in the server zone, not UTC', () => {
    // 1 February 04:00 UTC is still 31 January in Los Angeles
    expect(seasonStateAt(at('2027-02-01T04:00:00Z'), '12-01', '01-31', 'America/Los_Angeles')).toMatchObject({
      seasonYear: 2026,
      isOpen: true,
    })
  })

  it('uses the defaults when no Config row exists, in the TZ zone', async () => {
    mockConfigFindUnique.mockResolvedValue(null)
    await expect(getSeasonYear(at('2027-01-02T12:00:00Z'))).resolves.toBe(2026)
  })

  it('reads the window and the zone from Config', async () => {
    config()
    await getSeasonState(at('2026-10-18T12:00:00Z'))
    expect(mockConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 'config' },
      select: { rewindSeasonOpens: true, rewindSeasonCloses: true },
    })
  })
})

describe('seasonStateAt with other windows', () => {
  it('a window within one year belongs to the calendar year', () => {
    expect(seasonStateAt(at('2026-11-25T12:00:00Z'), '11-20', '12-31', 'UTC')).toEqual({
      seasonYear: 2026,
      isOpen: true,
      opensAt: at('2026-11-20T00:00:00Z'),
      closesAt: at('2027-01-01T00:00:00Z'),
    })
    expect(seasonStateAt(at('2027-01-05T12:00:00Z'), '11-20', '12-31', 'UTC')).toMatchObject({
      seasonYear: 2027,
      isOpen: false,
    })
  })

  it('a window that ends on 29 February ends on the 28th in a common year', () => {
    expect(seasonStateAt(at('2027-01-10T00:00:00Z'), '12-01', '02-29', 'UTC').closesAt).toEqual(at('2027-03-01T00:00:00Z'))
    expect(seasonStateAt(at('2028-01-10T00:00:00Z'), '12-01', '02-29', 'UTC').closesAt).toEqual(at('2028-03-01T00:00:00Z'))
    expect(seasonStateAt(at('2027-03-01T00:00:00Z'), '12-01', '02-29', 'UTC').isOpen).toBe(false)
  })

  it('invalid stored values fall back to the default window', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(seasonStateAt(at('2027-01-02T12:00:00Z'), '02-30', 'nope', 'UTC')).toMatchObject({
      seasonYear: 2026,
      isOpen: true,
    })
    expect(warn).toHaveBeenCalledWith('[REWIND_SEASON]', 'Invalid stored season dates; using the defaults', expect.anything())
    warn.mockRestore()
  })
})

describe('JSDoc examples', () => {
  it('seasonStateAt and parseMonthDay', () => {
    expect(seasonStateAt(new Date('2027-01-02T12:00:00Z'), '12-01', '01-31', 'UTC')).toEqual({
      seasonYear: 2026,
      isOpen: true,
      opensAt: new Date('2026-12-01T00:00:00Z'),
      closesAt: new Date('2027-02-01T00:00:00Z'),
    })
    expect(seasonStateAt(new Date('2026-10-18T12:00:00Z'), '12-01', '01-31', 'UTC').isOpen).toBe(false)
    expect(parseMonthDay('02-30')).toBeNull()
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
    config()
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
