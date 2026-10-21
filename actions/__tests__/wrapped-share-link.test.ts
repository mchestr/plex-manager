/**
 * Tests for actions/wrapped-share-link.ts: stopping a v2 share link (P0.19,
 * SEC-16). P7.13 deleted the action that minted one.
 *
 * The Prisma mock is a small in-memory PlexWrapped table, so the tests check
 * what ends up stored rather than which calls were made.
 */

import { disableWrappedShareLink } from '@/actions/wrapped-share-link'
import { prisma } from '@/lib/prisma'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { forgetShareToken } from '@/lib/wrapped/poster-keys'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

jest.mock('@/lib/wrapped/poster-keys', () => ({
  forgetShareToken: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const YEAR = 2026

interface Row {
  id: string
  userId: string
  year: number
  status: string
  shareToken: string | null
}

let rows: Row[]
// The rate limiter's store lives for the whole file, so each test signs in as
// a member of its own.
let memberId: string
let memberCounter = 0

function seed(row: Partial<Row> & Pick<Row, 'userId'>): Row {
  const full: Row = { id: `wrapped-${row.userId}`, year: YEAR, status: 'completed', shareToken: null, ...row }
  rows.push(full)
  return full
}

function rowOf(userId: string): Row {
  const row = rows.find((r) => r.userId === userId && r.year === YEAR)
  if (!row) throw new Error(`no row for ${userId}`)
  return row
}

type Where = { id?: string; shareToken?: null; userId_year?: { userId: string; year: number } }

function matches(row: Row, where: Where): boolean {
  if (where.userId_year) {
    return row.userId === where.userId_year.userId && row.year === where.userId_year.year
  }
  if (where.id !== undefined && row.id !== where.id) return false
  if ('shareToken' in where && row.shareToken !== where.shareToken) return false
  return true
}

function installFakeTable() {
  ;(prisma.plexWrapped.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: Where }) => {
    const row = rows.find((r) => matches(r, where))
    return row ? { ...row } : null
  })
  ;(prisma.plexWrapped.update as jest.Mock).mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const row = rows.find((r) => matches(r, where))
      if (!row) throw new Error('Record to update not found')
      Object.assign(row, data)
      return { ...row }
    }
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  rows = []
  memberCounter += 1
  memberId = `member-${memberCounter}`
  ;(getServerSession as jest.Mock).mockResolvedValue({
    user: { id: memberId, isAdmin: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  })
  installFakeTable()
})

describe('disableWrappedShareLink', () => {
  it('nulls the token and records the revocation', async () => {
    const row = seed({ userId: memberId, shareToken: 'live-token' })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true, data: null })
    expect(rowOf(memberId).shareToken).toBeNull()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SHARE_LINK_REVOKED, memberId, {
      wrappedId: row.id,
      year: YEAR,
    })
    expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toContain('live-token')
    expect(revalidatePath).toHaveBeenCalledWith('/rewind', 'layout')
    // The poster proxy stops serving the old token at once, not after its cache TTL.
    expect(forgetShareToken).toHaveBeenCalledWith('live-token')
  })

  it('succeeds without writing when no link is on', async () => {
    seed({ userId: memberId })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true, data: null })
    expect(prisma.plexWrapped.update).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('stops a link while the Rewind is not completed, e.g. during a regeneration', async () => {
    seed({ userId: memberId, status: 'generating', shareToken: 'live-token' })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true, data: null })
    expect(rowOf(memberId).shareToken).toBeNull()
  })

  it('never touches another member\'s link', async () => {
    seed({ userId: 'someone-else', shareToken: 'their-token' })

    const result = await disableWrappedShareLink({ year: YEAR, userId: 'someone-else' } as { year: number })

    expect(result).toEqual({ success: false, code: 'NOT_FOUND', error: 'No Rewind found for this year' })
    expect(rowOf('someone-else').shareToken).toBe('their-token')
  })

  it('requires a session', async () => {
    seed({ userId: memberId, shareToken: 'live-token' })
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(rowOf(memberId).shareToken).toBe('live-token')
  })

  it('stops a link for another year than the one on screen', async () => {
    seed({ userId: memberId, year: 2025, shareToken: 'old-season-token' })
    seed({ userId: memberId, id: 'wrapped-current', shareToken: 'current-token' })

    const result = await disableWrappedShareLink({ year: 2025 })

    expect(result).toEqual({ success: true, data: null })
    expect(rows.find((r) => r.year === 2025)?.shareToken).toBeNull()
    expect(rowOf(memberId).shareToken).toBe('current-token')
  })

  it('returns an error instead of throwing when the database fails', async () => {
    seed({ userId: memberId, shareToken: 'live-token' })
    ;(prisma.plexWrapped.update as jest.Mock).mockRejectedValueOnce(new Error('connection lost'))

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: false, code: 'INTERNAL', error: 'Failed to stop sharing' })
  })
})
