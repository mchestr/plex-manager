/**
 * Tests for actions/playground-wrapped.ts - what a playground save stores
 */

import { savePlaygroundWrapped } from '@/actions/playground-wrapped'
import { prisma } from '@/lib/prisma'
import {
  buildLeaderboards,
  buildStatistics,
  buildValidOutput,
  LEADERBOARD_MEMBER_EMAIL,
} from '@/lib/wrapped/__tests__/fixtures'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    plexWrapped: { upsert: jest.fn() },
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

const MEMBER_EMAIL = 'member.private@example.com'

const adminSession = {
  user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', isAdmin: true },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

function storedData() {
  const args = (prisma.plexWrapped.upsert as jest.Mock).mock.calls[0][0]
  return { raw: args.create.data as string, parsed: JSON.parse(args.create.data) }
}

describe('savePlaygroundWrapped', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(adminSession)
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({ id: 'wrapped-1' })
  })

  it('stores no leaderboards from the playground statistics', async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'Mike', email: MEMBER_EMAIL })

    const result = await savePlaygroundWrapped({
      llmResponse: JSON.stringify(buildValidOutput()),
      statistics: buildStatistics({ leaderboards: buildLeaderboards() }),
      userName: 'Mike',
      year: 2026,
    })

    expect(result).toEqual({ success: true, wrappedId: 'wrapped-1', userId: 'user-1' })
    const { raw, parsed } = storedData()
    expect(parsed.statistics).not.toHaveProperty('leaderboards')
    expect(raw).not.toContain(LEADERBOARD_MEMBER_EMAIL)
    expect(parsed.userName).toBe('Mike')
  })

  it('stores the member name from the user row, not the email the admin looked them up by', async () => {
    // Not found by name, then found by email
    ;(prisma.user.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-1', name: MEMBER_EMAIL, email: MEMBER_EMAIL })

    const result = await savePlaygroundWrapped({
      llmResponse: JSON.stringify(buildValidOutput()),
      statistics: buildStatistics(),
      userName: MEMBER_EMAIL,
      year: 2026,
    })

    expect(result.success).toBe(true)
    const { raw, parsed } = storedData()
    expect(parsed.userName).toBe('Viewer')
    expect(raw).not.toContain(MEMBER_EMAIL)
  })

  describe('share tokens (opt-in sharing, SEC-16)', () => {
    type StoredRow = { id: string; status: string; shareToken: string | null }

    /** Applies the upsert the way Prisma would to a member's row, or creates one. */
    function upsertInto(existing: StoredRow | null) {
      let stored: StoredRow | null = existing
      ;(prisma.plexWrapped.upsert as jest.Mock).mockImplementation(
        async ({ create, update }: { create: Partial<StoredRow>; update: Partial<StoredRow> }) => {
          stored = stored
            ? { ...stored, ...update }
            : { id: 'wrapped-new', status: 'pending', shareToken: null, ...create }
          return stored
        }
      )
      return () => stored
    }

    beforeEach(() => {
      ;(prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'Mike', email: MEMBER_EMAIL })
    })

    function save() {
      return savePlaygroundWrapped({
        llmResponse: JSON.stringify(buildValidOutput()),
        statistics: buildStatistics(),
        userName: 'Mike',
        year: 2026,
      })
    }

    it.each([
      ['a new row', null],
      ['an existing row without a token', { id: 'wrapped-1', status: 'completed', shareToken: null }],
    ])('leaves shareToken null on %s', async (_label, existing) => {
      const storedRow = upsertInto(existing)

      const result = await save()

      expect(result.success).toBe(true)
      expect(storedRow()).toEqual(expect.objectContaining({ status: 'completed', shareToken: null }))
      const args = (prisma.plexWrapped.upsert as jest.Mock).mock.calls[0][0]
      expect(args.create).not.toHaveProperty('shareToken')
      expect(args.update).not.toHaveProperty('shareToken')
    })

    it('keeps an existing token unchanged', async () => {
      const storedRow = upsertInto({ id: 'wrapped-1', status: 'completed', shareToken: 'member-chose-to-share' })

      const result = await save()

      expect(result.success).toBe(true)
      expect(storedRow()?.shareToken).toBe('member-chose-to-share')
    })
  })
})
