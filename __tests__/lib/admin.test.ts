import { assertAdmin, getAdminGate, getAdminStatus } from '@/lib/admin'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

const mockGetServerSession = jest.mocked(getServerSession)
const session = (isAdmin: boolean) => ({ expires: '2099-01-01', user: { id: 'user-1', isAdmin } })

beforeEach(() => jest.clearAllMocks())

describe('getAdminStatus', () => {
  it('is true for an admin, false for a member and null without a session', async () => {
    mockGetServerSession.mockResolvedValueOnce(session(true))
    await expect(getAdminStatus()).resolves.toBe(true)
    expect(mockGetServerSession).toHaveBeenCalledWith(authOptions)

    mockGetServerSession.mockResolvedValueOnce(session(false))
    await expect(getAdminStatus()).resolves.toBe(false)

    mockGetServerSession.mockResolvedValueOnce(null)
    await expect(getAdminStatus()).resolves.toBeNull()
  })
})

describe('getAdminGate (BP-27)', () => {
  it('refuses a missing session as unauthenticated without throwing', async () => {
    mockGetServerSession.mockResolvedValue(null)
    await expect(getAdminGate()).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('refuses a member as forbidden', async () => {
    mockGetServerSession.mockResolvedValue(session(false))
    await expect(getAdminGate()).resolves.toEqual({ ok: false, reason: 'forbidden' })
  })

  it('passes an admin with the session', async () => {
    mockGetServerSession.mockResolvedValue(session(true))
    await expect(getAdminGate()).resolves.toEqual({ ok: true, session: session(true) })
  })
})

describe('assertAdmin (P11.5)', () => {
  it('returns the admin session', async () => {
    mockGetServerSession.mockResolvedValue(session(true))
    await expect(assertAdmin()).resolves.toEqual(session(true))
  })

  it('throws errors whose digests survive a production build', async () => {
    mockGetServerSession.mockResolvedValue(null)
    await expect(assertAdmin()).rejects.toMatchObject({ digest: 'PM_UNAUTHENTICATED' })

    mockGetServerSession.mockResolvedValue(session(false))
    await expect(assertAdmin()).rejects.toMatchObject({ digest: 'PM_FORBIDDEN', message: 'Admin access required' })
  })
})
