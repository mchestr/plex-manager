/**
 * @jest-environment node
 */

/**
 * The Plex provider in lib/auth.ts signs a member in even when another row
 * already holds their Plex email (SEC-08).
 *
 * Old releases stored Jellyfin usernames as emails, so a row can hold someone
 * else's address. The unique email would otherwise refuse that person's Plex
 * sign-in on every attempt, right after their invite redemption succeeded.
 */

import { signInWithPlexToken } from '@/__tests__/helpers/plex-sign-in'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex-pin', () => ({ readPin: jest.fn() }))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock('@/lib/jellyfin-auth', () => ({
  authenticateJellyfin: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(async () => ({ ok: true })),
  reward: jest.fn(async () => undefined),
}))

jest.mock('@/lib/security/audit-log', () => ({
  logAuditEvent: jest.fn(),
  AuditEventType: {
    USER_CREATED: 'USER_CREATED',
    ADMIN_PRIVILEGE_GRANTED: 'ADMIN_PRIVILEGE_GRANTED',
    ADMIN_PRIVILEGE_REVOKED: 'ADMIN_PRIVILEGE_REVOKED',
  },
}))

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}))

const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockCheckUserServerAccess = checkUserServerAccess as jest.MockedFunction<typeof checkUserServerAccess>
const mockPlexServerFindFirst = prisma.plexServer.findFirst as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserCreate = prisma.user.create as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock

/** The P2002 that the pg driver adapter raises for a duplicate value. */
function uniqueViolation(index: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: {
      modelName: 'User',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { index }, table: 'User' },
      },
    },
  })
}

const PLEX_SERVER = {
  id: 'server-1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
  adminPlexUserId: 'plex-owner',
  machineIdentifier: 'this-server-machine-id',
  isActive: true,
}

const VICTIM = { id: 'plex-victim', username: 'victim', email: 'victim@example.com' }

/** The row that holds the victim's address: an old Jellyfin username stored as its email. */
const HOLDER_ROW = { id: 'jellyfin-row', email: VICTIM.email, plexUserId: null, jellyfinUserId: 'jf-eve' }

/** The victim's own row, created without an email by an invite redemption that hit the conflict. */
const VICTIM_ROW = {
  id: 'victim-row',
  email: null,
  name: 'victim',
  image: null,
  isAdmin: false,
  plexUserId: VICTIM.id,
}

const env = process.env as Record<string, string | undefined>

/** Serves `user.findUnique` by `plexUserId` from `byPlexId`, and by `email` from the holder row. */
function givenPlexRow(byPlexId: typeof VICTIM_ROW | null) {
  mockUserFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if ('plexUserId' in where) return where.plexUserId === VICTIM.id ? byPlexId : null
    if ('email' in where) return where.email === HOLDER_ROW.email ? { id: HOLDER_ROW.id } : null
    return null
  })
}

describe('Plex sign-in when another row holds the Plex email (SEC-08)', () => {

  beforeEach(() => {
    jest.clearAllMocks()
    // Drop queued one-off results too, so a write a test left unconsumed cannot leak.
    mockUserFindUnique.mockReset()
    mockUserCreate.mockReset()
    mockUserUpdate.mockReset()
    delete env.E2E_TEST_MODE
    mockPlexServerFindFirst.mockResolvedValue(PLEX_SERVER)
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: VICTIM })
    mockCheckUserServerAccess.mockResolvedValue({ status: 'granted' })
  })

  it('creates the row without an email and returns a session when the create conflicts', async () => {
    givenPlexRow(null)
    mockUserCreate
      .mockRejectedValueOnce(uniqueViolation('User_email_key'))
      .mockResolvedValueOnce({ ...VICTIM_ROW })

    const result = await signInWithPlexToken('victim-token')

    expect(result).toEqual({ id: 'victim-row', email: null, name: 'victim', image: null, isAdmin: false })
    expect(mockUserCreate).toHaveBeenCalledTimes(2)
    expect(mockUserCreate.mock.calls[0][0].data).toMatchObject({ plexUserId: VICTIM.id, email: VICTIM.email })
    const retryData = mockUserCreate.mock.calls[1][0].data
    expect(retryData).toMatchObject({ plexUserId: VICTIM.id, plexAuthToken: 'victim-token', name: 'victim' })
    expect(retryData).not.toHaveProperty('email')
    // Each attempt gets its own data object (the encryption extension rewrites it in place).
    expect(retryData).not.toBe(mockUserCreate.mock.calls[0][0].data)
    expect(mockWarn).toHaveBeenCalledWith('auth.email_conflict', {
      existingUserId: HOLDER_ROW.id,
      plexUserId: VICTIM.id,
    })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('keeps the existing row email and returns a session when the update conflicts', async () => {
    givenPlexRow({ ...VICTIM_ROW })
    mockUserUpdate
      .mockRejectedValueOnce(uniqueViolation('User_email_key'))
      .mockResolvedValueOnce({ ...VICTIM_ROW })

    const result = await signInWithPlexToken('victim-token')

    expect(result).toEqual({ id: 'victim-row', email: null, name: 'victim', image: null, isAdmin: false })
    expect(mockUserUpdate).toHaveBeenCalledTimes(2)
    expect(mockUserUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'victim-row' },
      data: { email: VICTIM.email },
    })
    const retry = mockUserUpdate.mock.calls[1][0]
    expect(retry.where).toEqual({ id: 'victim-row' })
    expect(retry.data).toMatchObject({ plexAuthToken: 'victim-token', name: 'victim' })
    expect(retry.data).not.toHaveProperty('isAdmin')
    expect(retry.data).not.toHaveProperty('email')
    expect(mockWarn).toHaveBeenCalledWith('auth.email_conflict', {
      existingUserId: HOLDER_ROW.id,
      plexUserId: VICTIM.id,
    })
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('writes the Plex email once when nothing conflicts', async () => {
    givenPlexRow({ ...VICTIM_ROW })
    mockUserUpdate.mockResolvedValueOnce({ ...VICTIM_ROW, email: VICTIM.email })

    const result = await signInWithPlexToken('victim-token')

    expect(result).toMatchObject({ id: 'victim-row', email: VICTIM.email })
    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    expect(mockUserUpdate.mock.calls[0][0].data).toMatchObject({ email: VICTIM.email })
    expect(mockWarn).not.toHaveBeenCalledWith('auth.email_conflict', expect.anything())
  })

  it('does not retry a conflict on another unique column', async () => {
    givenPlexRow(null)
    mockUserCreate.mockRejectedValue(uniqueViolation('User_plexUserId_key'))

    const result = await signInWithPlexToken('victim-token')

    expect(result).toBeNull()
    expect(mockUserCreate).toHaveBeenCalledTimes(1)
    expect(mockWarn).not.toHaveBeenCalledWith('auth.email_conflict', expect.anything())
  })
})
