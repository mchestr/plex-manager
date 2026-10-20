/**
 * Security tests for reading a member's Wrapped: a member reads only their
 * own, and admins read any. Generation requests are covered in
 * actions/__tests__/rewind-generation.test.ts (P2.17).
 */

import { getUserPlexWrapped } from '@/actions/user-queries'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
})

describe('User Wrapped Security', () => {
  describe('getUserPlexWrapped', () => {
    it('should allow user to get their own wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', isAdmin: false },
      })
      const mockWrapped = {
        id: 'wrapped-1',
        userId: 'user-1',
        year: 2026,
        status: 'completed',
        data: JSON.stringify({ sections: [] }),
        user: {
          id: 'user-1',
          name: 'User 1',
          email: 'user1@example.com',
          image: null,
        },
      }

      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockWrapped)

      const result = await getUserPlexWrapped({ userId: 'user-1', year: 2026 })

      expect(result.success && result.data?.userId).toBe('user-1')
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith({
        where: {
          userId_year: {
            userId: 'user-1',
            year: 2026,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      })
    })

    it('should return null if wrapped does not exist', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', isAdmin: false },
      })
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await getUserPlexWrapped({ userId: 'user-1', year: 2026 })

      expect(result).toEqual({ success: true, data: null })
    })

    // Authorization is enforced inside getUserPlexWrapped itself: a user may only
    // read their own Wrapped, and admins may read any. Because a "use server"
    // export is a directly-invocable endpoint, the ownership check cannot be left
    // to the calling component.
    it('refuses a non-owner (non-admin) with FORBIDDEN', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'attacker', isAdmin: false },
      })

      const result = await getUserPlexWrapped({ userId: 'victim', year: 2026 })

      expect(result).toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it('refuses an unauthenticated caller', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const result = await getUserPlexWrapped({ userId: 'user-1', year: 2026 })

      expect(result).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it('should allow an admin to read any user wrapped', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', isAdmin: true },
      })
      ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
        id: 'wrapped-2',
        userId: 'user-1',
        year: 2026,
      })

      const result = await getUserPlexWrapped({ userId: 'user-1', year: 2026 })

      expect(result.success && result.data).toBeTruthy()
      expect(prisma.plexWrapped.findUnique).toHaveBeenCalled()
    })

    it.each([
      ['an empty user id', { userId: '', year: 2026 }],
      ['a year out of range', { userId: 'user-1', year: 1900 }],
    ])('refuses %s before reading', async (_label, input) => {
      ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })

      const result = await getUserPlexWrapped(input)

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
      expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
    })
  })
})

