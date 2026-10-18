/**
 * Tests for actions/wrapped-share-link.ts - opt-in share links (P0.19, SEC-16).
 *
 * The Prisma mock is a small in-memory PlexWrapped table, so the tests check
 * what ends up stored rather than which calls were made.
 */

import {
  disableWrappedShareLink,
  enableWrappedShareLink,
  type EnableWrappedShareLinkResult,
} from '@/actions/wrapped-share-link'
import { prisma } from '@/lib/prisma'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { generateShareToken } from '@/lib/utils'
import { forgetShareToken } from '@/lib/wrapped/poster-keys'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  },
}))

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

jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  generateShareToken: jest.fn(),
}))

jest.mock('@/lib/wrapped/poster-keys', () => ({
  forgetShareToken: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'

const YEAR = 2026

interface Row {
  id: string
  userId: string
  year: number
  status: string
  shareToken: string | null
}

let rows: Row[]
let mintedCount: number
// The rate limiter's store lives for the whole file, so each test signs in as
// a member of its own.
let memberId: string
let memberCounter = 0

function seed(row: Partial<Row> & Pick<Row, 'userId'>): Row {
  const full: Row = { id: `wrapped-${row.userId}`, year: YEAR, status: 'completed', shareToken: null, ...row }
  rows.push(full)
  return full
}

function tokenOf(result: EnableWrappedShareLinkResult): string {
  if (!result.success) throw new Error(`enable failed: ${result.error}`)
  return result.shareToken
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
  ;(prisma.plexWrapped.updateMany as jest.Mock).mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    }
  )
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
  mintedCount = 0
  memberCounter += 1
  memberId = `member-${memberCounter}`
  ;(getServerSession as jest.Mock).mockResolvedValue({
    user: { id: memberId, isAdmin: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  })
  ;(generateShareToken as jest.Mock).mockImplementation(() => `token-${++mintedCount}`)
  installFakeTable()
})

describe('enableWrappedShareLink', () => {
  it('mints a token for the member\'s own completed Rewind and returns the URL', async () => {
    seed({ userId: memberId })

    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({
      success: true,
      shareToken: 'token-1',
      url: 'https://plex.example.com/wrapped/share/token-1',
    })
    expect(rowOf(memberId).shareToken).toBe('token-1')
    expect(revalidatePath).toHaveBeenCalledWith('/wrapped')
  })

  it('is idempotent: a second call returns the same link and mints nothing', async () => {
    seed({ userId: memberId })

    const first = await enableWrappedShareLink({ year: YEAR })
    const second = await enableWrappedShareLink({ year: YEAR })

    expect(second).toEqual(first)
    expect(generateShareToken).toHaveBeenCalledTimes(1)
    expect(prisma.plexWrapped.updateMany).toHaveBeenCalledTimes(1)
    expect(rowOf(memberId).shareToken).toBe('token-1')
  })

  it('returns a link that survives from before opt-in instead of replacing it', async () => {
    seed({ userId: memberId, shareToken: 'surviving-v2-token' })

    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result).toEqual(expect.objectContaining({ success: true, shareToken: 'surviving-v2-token' }))
    expect(generateShareToken).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('gives two concurrent calls the same link', async () => {
    seed({ userId: memberId })

    const [a, b] = await Promise.all([
      enableWrappedShareLink({ year: YEAR }),
      enableWrappedShareLink({ year: YEAR }),
    ])

    expect(tokenOf(a)).toBe(tokenOf(b))
    expect(rowOf(memberId).shareToken).toBe(tokenOf(a))
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('works only on the caller\'s own row, whatever the input claims', async () => {
    seed({ userId: memberId })
    seed({ userId: 'someone-else' })

    const result = await enableWrappedShareLink({ year: YEAR, userId: 'someone-else' } as { year: number })

    expect(result.success).toBe(true)
    expect(rowOf(memberId).shareToken).toBe('token-1')
    expect(rowOf('someone-else').shareToken).toBeNull()
  })

  it('refuses when the member has no Rewind for that year, even if others do', async () => {
    seed({ userId: 'someone-else' })

    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: false, error: 'Your Rewind for this year is not ready to share' })
    expect(rowOf('someone-else').shareToken).toBeNull()
    expect(generateShareToken).not.toHaveBeenCalled()
  })

  it.each(['generating', 'failed', 'pending'])('refuses a %s Rewind', async (status) => {
    seed({ userId: memberId, status })

    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result.success).toBe(false)
    expect(rowOf(memberId).shareToken).toBeNull()
    expect(generateShareToken).not.toHaveBeenCalled()
  })

  it('records an audit entry that never carries the token', async () => {
    const row = seed({ userId: memberId })

    await enableWrappedShareLink({ year: YEAR })

    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SHARE_LINK_CREATED, memberId, {
      wrappedId: row.id,
      year: YEAR,
    })
    expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toContain('token-1')
  })

  it('requires a session', async () => {
    seed({ userId: memberId })
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['a year out of range', { year: 1999 }],
    ['a non-integer year', { year: 2026.5 }],
    ['a string year', { year: '2026' }],
  ])('rejects %s', async (_label, input) => {
    seed({ userId: memberId })

    const result = await enableWrappedShareLink(input as { year: number })

    expect(result).toEqual({ success: false, error: 'Invalid year' })
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it('allows ten share-link creations an hour and refuses the eleventh', async () => {
    seed({ userId: memberId })

    for (let i = 0; i < 10; i++) {
      const result = await enableWrappedShareLink({ year: YEAR })
      expect(result.success).toBe(true)
    }
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockClear()

    const limited = await enableWrappedShareLink({ year: YEAR })

    expect(limited).toEqual({ success: false, error: 'Too many share links created. Please try again later.' })
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it('does not count stopping a link against the limit', async () => {
    seed({ userId: memberId })

    for (let i = 0; i < 5; i++) {
      expect((await enableWrappedShareLink({ year: YEAR })).success).toBe(true)
      expect((await disableWrappedShareLink({ year: YEAR })).success).toBe(true)
    }
    for (let i = 0; i < 5; i++) {
      expect((await enableWrappedShareLink({ year: YEAR })).success).toBe(true)
    }

    expect(await enableWrappedShareLink({ year: YEAR })).toEqual({
      success: false,
      error: 'Too many share links created. Please try again later.',
    })
  })

  it('creates no link when the public URL cannot be built', async () => {
    seed({ userId: memberId })
    const saved = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.NEXTAUTH_URL }
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL

    try {
      const result = await enableWrappedShareLink({ year: YEAR })

      expect(result).toEqual({ success: false, error: 'Failed to create share link' })
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = saved.app
      if (saved.auth !== undefined) process.env.NEXTAUTH_URL = saved.auth
    }
    expect(rowOf(memberId).shareToken).toBeNull()
    expect(generateShareToken).not.toHaveBeenCalled()
    expect(prisma.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('disableWrappedShareLink', () => {
  it('nulls the token and records the revocation', async () => {
    const row = seed({ userId: memberId, shareToken: 'live-token' })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true })
    expect(rowOf(memberId).shareToken).toBeNull()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SHARE_LINK_REVOKED, memberId, {
      wrappedId: row.id,
      year: YEAR,
    })
    expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toContain('live-token')
    expect(revalidatePath).toHaveBeenCalledWith('/wrapped')
    // The poster proxy stops serving the old token at once, not after its cache TTL.
    expect(forgetShareToken).toHaveBeenCalledWith('live-token')
  })

  it('makes a later enable mint a new token rather than revive the old one', async () => {
    seed({ userId: memberId, shareToken: 'old-token' })

    await disableWrappedShareLink({ year: YEAR })
    const result = await enableWrappedShareLink({ year: YEAR })

    expect(result).toEqual(expect.objectContaining({ success: true, shareToken: 'token-1' }))
    expect(rowOf(memberId).shareToken).toBe('token-1')
  })

  it('succeeds without writing when no link is on', async () => {
    seed({ userId: memberId })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true })
    expect(prisma.plexWrapped.update).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('stops a link while the Rewind is not completed, e.g. during a regeneration', async () => {
    seed({ userId: memberId, status: 'generating', shareToken: 'live-token' })

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true })
    expect(rowOf(memberId).shareToken).toBeNull()
  })

  it('never touches another member\'s link', async () => {
    seed({ userId: 'someone-else', shareToken: 'their-token' })

    const result = await disableWrappedShareLink({ year: YEAR, userId: 'someone-else' } as { year: number })

    expect(result).toEqual({ success: false, error: 'No Rewind found for this year' })
    expect(rowOf('someone-else').shareToken).toBe('their-token')
  })

  it('requires a session', async () => {
    seed({ userId: memberId, shareToken: 'live-token' })
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(rowOf(memberId).shareToken).toBe('live-token')
  })

  it('stops a live link for a member who has used up the creation limit', async () => {
    seed({ userId: memberId })
    for (let i = 0; i < 10; i++) {
      expect((await enableWrappedShareLink({ year: YEAR })).success).toBe(true)
    }
    expect((await enableWrappedShareLink({ year: YEAR })).success).toBe(false)
    expect(rowOf(memberId).shareToken).toBe('token-1')

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: true })
    expect(rowOf(memberId).shareToken).toBeNull()
  })

  it('stops a link for another year than the one on screen', async () => {
    seed({ userId: memberId, year: 2025, shareToken: 'old-season-token' })
    seed({ userId: memberId, id: 'wrapped-current', shareToken: 'current-token' })

    const result = await disableWrappedShareLink({ year: 2025 })

    expect(result).toEqual({ success: true })
    expect(rows.find((r) => r.year === 2025)?.shareToken).toBeNull()
    expect(rowOf(memberId).shareToken).toBe('current-token')
  })

  it('returns an error instead of throwing when the database fails', async () => {
    seed({ userId: memberId, shareToken: 'live-token' })
    ;(prisma.plexWrapped.update as jest.Mock).mockRejectedValueOnce(new Error('connection lost'))

    const result = await disableWrappedShareLink({ year: YEAR })

    expect(result).toEqual({ success: false, error: 'Failed to stop sharing' })
  })
})
