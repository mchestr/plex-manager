/**
 * `/wrapped` resolves to a year from data: the season year when the member
 * has a row for it (so a generating or failed Rewind shows its status), else
 * the latest completed Rewind, else the season year. In January it no longer
 * looks up the new calendar year, which has no Rewind (P0.14: RWP-04,
 * RWV-02, UI-02).
 */

import { getServerSession } from 'next-auth'

import WrappedResolverPage from '@/app/(app)/wrapped/page'
import { prisma } from '@/lib/prisma'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

// Next's redirect() throws to stop rendering; the mock does the same.
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))

interface MockRow {
  userId: string
  year: number
  status: string
}

const mockRows: MockRow[] = []

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: { findUnique: jest.fn() },
    plexWrapped: {
      // A tiny in-memory table, so the test checks what the query asks for.
      findFirst: jest.fn(async ({ where }: { where: { userId: string; status: string } }) => {
        const [latest] = mockRows
          .filter((row) => row.userId === where.userId && row.status === where.status)
          .sort((a, b) => b.year - a.year)
        return latest ? { year: latest.year } : null
      }),
      findUnique: jest.fn(async ({ where }: { where: { userId_year: { userId: string; year: number } } }) => {
        const { userId, year } = where.userId_year
        const found = mockRows.find((row) => row.userId === userId && row.year === year)
        return found ? { id: `${userId}-${year}` } : null
      }),
    },
  },
}))

const mockConfigFindUnique = prisma.config.findUnique as jest.Mock

function seed(...rows: MockRow[]) {
  mockRows.splice(0, mockRows.length, ...rows)
}

function windowStartsOn(value: string | null) {
  mockConfigFindUnique.mockResolvedValue({ wrappedGenerationStartDate: value ? new Date(value) : null })
}

describe('/wrapped resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    windowStartsOn('2026-12-01T12:00:00Z')
    seed()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('opens 2026 on 2027-01-02 when 2026 is completed and 2027 has no Rewind', async () => {
    seed(
      { userId: 'user-1', year: 2025, status: 'completed' },
      { userId: 'user-1', year: 2026, status: 'completed' }
    )

    await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2026')
  })

  it('skips a newer year that is not completed', async () => {
    seed(
      { userId: 'user-1', year: 2026, status: 'completed' },
      { userId: 'user-1', year: 2027, status: 'failed' }
    )

    await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2026')
  })

  it.each(['generating', 'failed'])(
    'opens the season year while its Rewind is %s, not an older completed year',
    async (status) => {
      seed(
        { userId: 'user-1', year: 2025, status: 'completed' },
        { userId: 'user-1', year: 2026, status }
      )

      await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2026')
    }
  )

  it('opens the latest completed year when the season year has no row', async () => {
    seed({ userId: 'user-1', year: 2025, status: 'completed' })

    await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2025')
  })

  it('falls back to the season year when the member has no completed Rewind', async () => {
    windowStartsOn(null)

    await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2026')
  })

  it("ignores another member's newer Rewind", async () => {
    seed(
      { userId: 'user-1', year: 2024, status: 'completed' },
      { userId: 'user-2', year: 2026, status: 'completed' }
    )

    await expect(WrappedResolverPage()).rejects.toThrow('NEXT_REDIRECT /wrapped/2024')
  })

  it('sends a signed-out visitor home', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    await expect(WrappedResolverPage()).rejects.toThrow(/^NEXT_REDIRECT \/$/)
    expect(prisma.plexWrapped.findFirst).not.toHaveBeenCalled()
  })
})
