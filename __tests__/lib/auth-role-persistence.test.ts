/**
 * @jest-environment node
 */

/**
 * Roles set in the UI survive the next login (P4.7, SEC-12, GAP-26). Login
 * only ever promotes the Plex server owner. It never demotes, and a disabled
 * user cannot sign in.
 */

import { signInWithPlexToken } from '@/__tests__/helpers/plex-sign-in'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { buildUser } from '@/__tests__/helpers/factories'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex-pin', () => ({ readPin: jest.fn() }))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(async () => ({ ok: true })),
  reward: jest.fn(async () => undefined),
}))

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
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
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>

const PLEX_SERVER = {
  id: 'server-1',
  name: 'Plex',
  url: 'https://plex.example.com:32400',
  publicUrl: null,
  token: 'server-token',
  adminPlexUserId: 'plex-owner',
  machineIdentifier: 'this-server-machine-id',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

/** The row update echoes the data it was given onto `row`. */
function givenRow(row: ReturnType<typeof buildUser>) {
  prismaMock.user.findUnique.mockResolvedValue(row)
  prismaMock.user.update.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    ...row,
    ...data,
  })) as never)
}

function adminAuditTypes() {
  return mockLogAuditEvent.mock.calls.map(([type]) => type)
}

describe('Plex sign-in keeps roles set in the UI', () => {
  function signInAsPlexUser(id: string) {
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: { id, username: id, email: `${id}@example.com` } } as never)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.plexServer.findFirst.mockResolvedValue(PLEX_SERVER)
    mockCheckUserServerAccess.mockResolvedValue({ status: 'granted' })
  })

  it('keeps a member promoted in the UI an admin', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', isAdmin: true }))

    const result = await signInWithPlexToken('member-token')

    expect(result).toMatchObject({ id: 'member-row', isAdmin: true, sessionVersion: 0 })
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('isAdmin')
    expect(adminAuditTypes()).toEqual([])
  })

  it('keeps a member demoted in the UI a member', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', isAdmin: false }))

    await expect(signInWithPlexToken('member-token')).resolves.toMatchObject({ isAdmin: false })
    expect(adminAuditTypes()).not.toContain(AuditEventType.ADMIN_PRIVILEGE_REVOKED)
  })

  it('promotes the server owner and audits it', async () => {
    signInAsPlexUser('plex-owner')
    givenRow(buildUser({ id: 'owner-row', plexUserId: 'plex-owner', isAdmin: false }))

    await expect(signInWithPlexToken('owner-token')).resolves.toMatchObject({ isAdmin: true })
    expect(prismaMock.user.update.mock.calls[0][0].data).toMatchObject({ isAdmin: true })
    expect(adminAuditTypes()).toEqual([AuditEventType.ADMIN_PRIVILEGE_GRANTED])
  })

  it('writes no audit event when the owner is already an admin', async () => {
    signInAsPlexUser('plex-owner')
    givenRow(buildUser({ id: 'owner-row', plexUserId: 'plex-owner', isAdmin: true }))

    await signInWithPlexToken('owner-token')

    expect(adminAuditTypes()).toEqual([])
  })

  it('returns the stored sessionVersion for the JWT', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', sessionVersion: 3 }))

    await expect(signInWithPlexToken('member-token')).resolves.toMatchObject({ sessionVersion: 3 })
  })

  it('refuses a disabled user without writing the row', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', disabledAt: new Date() }))

    await expect(signInWithPlexToken('member-token')).resolves.toBeNull()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith('auth.disabled', { userId: 'member-row', provider: 'plex' })
  })
})
