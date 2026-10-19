/**
 * @jest-environment node
 */

/**
 * Roles set in the UI survive the next login (P4.7, SEC-12, GAP-26). Login
 * only ever promotes: the Plex server owner, and a Jellyfin administrator.
 * It never demotes, a failed Jellyfin lookup changes nothing and writes no
 * audit event, and a disabled user cannot sign in with either provider.
 */

import { authOptions } from '@/lib/auth'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { buildUser } from '@/__tests__/helpers/factories'
import { authenticateJellyfin, type JellyfinAdminStatus } from '@/lib/jellyfin-auth'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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
const mockAuthenticateJellyfin = authenticateJellyfin as jest.MockedFunction<typeof authenticateJellyfin>
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>

type Authorize = (credentials: Record<string, string> | undefined) => Promise<unknown>

function getAuthorize(name: 'Plex' | 'Jellyfin'): Authorize {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { name?: string } }).options?.name === name
  ) as { options?: { authorize?: unknown } } | undefined
  const authorize = provider?.options?.authorize
  if (typeof authorize !== 'function') {
    throw new Error(`${name} authorize function not found on authOptions`)
  }
  return authorize as Authorize
}

const PLEX_SERVER = {
  id: 'server-1',
  name: 'Plex',
  url: 'https://plex.example.com:32400',
  publicUrl: null,
  token: 'server-token',
  adminPlexUserId: 'plex-owner',
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
  const authorize = getAuthorize('Plex')

  function signInAsPlexUser(id: string) {
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: { id, username: id, email: `${id}@example.com` } } as never)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.plexServer.findFirst.mockResolvedValue(PLEX_SERVER)
    mockCheckUserServerAccess.mockResolvedValue({ success: true, hasAccess: true })
  })

  it('keeps a member promoted in the UI an admin', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', isAdmin: true }))

    const result = await authorize({ authToken: 'member-token' })

    expect(result).toMatchObject({ id: 'member-row', isAdmin: true, sessionVersion: 0 })
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('isAdmin')
    expect(adminAuditTypes()).toEqual([])
  })

  it('keeps a member demoted in the UI a member', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', isAdmin: false }))

    await expect(authorize({ authToken: 'member-token' })).resolves.toMatchObject({ isAdmin: false })
    expect(adminAuditTypes()).not.toContain(AuditEventType.ADMIN_PRIVILEGE_REVOKED)
  })

  it('promotes the server owner and audits it', async () => {
    signInAsPlexUser('plex-owner')
    givenRow(buildUser({ id: 'owner-row', plexUserId: 'plex-owner', isAdmin: false }))

    await expect(authorize({ authToken: 'owner-token' })).resolves.toMatchObject({ isAdmin: true })
    expect(prismaMock.user.update.mock.calls[0][0].data).toMatchObject({ isAdmin: true })
    expect(adminAuditTypes()).toEqual([AuditEventType.ADMIN_PRIVILEGE_GRANTED])
  })

  it('writes no audit event when the owner is already an admin', async () => {
    signInAsPlexUser('plex-owner')
    givenRow(buildUser({ id: 'owner-row', plexUserId: 'plex-owner', isAdmin: true }))

    await authorize({ authToken: 'owner-token' })

    expect(adminAuditTypes()).toEqual([])
  })

  it('returns the stored sessionVersion for the JWT', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', sessionVersion: 3 }))

    await expect(authorize({ authToken: 'member-token' })).resolves.toMatchObject({ sessionVersion: 3 })
  })

  it('refuses a disabled user without writing the row', async () => {
    signInAsPlexUser('plex-member')
    givenRow(buildUser({ id: 'member-row', plexUserId: 'plex-member', disabledAt: new Date() }))

    await expect(authorize({ authToken: 'member-token' })).resolves.toBeNull()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith('auth.disabled', { userId: 'member-row', provider: 'plex' })
  })
})

describe('Jellyfin sign-in never demotes', () => {
  const authorize = getAuthorize('Jellyfin')

  function jellyfinSays(adminStatus: JellyfinAdminStatus) {
    mockAuthenticateJellyfin.mockResolvedValue({
      success: true,
      data: { id: 'jf-carol', username: 'carol', adminStatus },
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([true, false])("keeps the stored role (isAdmin %s) on 'unknown', with no audit event", async (isAdmin) => {
    jellyfinSays('unknown')
    givenRow(buildUser({ id: 'carol-row', plexUserId: null, jellyfinUserId: 'jf-carol', isAdmin }))

    await expect(authorize({ username: 'carol', password: 'pw' })).resolves.toMatchObject({ isAdmin })
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('isAdmin')
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })

  it("does not demote an admin on 'not-admin'", async () => {
    jellyfinSays('not-admin')
    givenRow(buildUser({ id: 'carol-row', plexUserId: null, jellyfinUserId: 'jf-carol', isAdmin: true }))

    await expect(authorize({ username: 'carol', password: 'pw' })).resolves.toMatchObject({ isAdmin: true })
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })

  it("promotes a member on 'admin' and audits it", async () => {
    jellyfinSays('admin')
    givenRow(buildUser({ id: 'carol-row', plexUserId: null, jellyfinUserId: 'jf-carol', isAdmin: false }))

    await expect(authorize({ username: 'carol', password: 'pw' })).resolves.toMatchObject({ isAdmin: true })
    expect(adminAuditTypes()).toEqual([AuditEventType.ADMIN_PRIVILEGE_GRANTED])
  })

  it("creates a new row as a member on 'unknown'", async () => {
    jellyfinSays('unknown')
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) =>
      buildUser({ id: 'new-row', plexUserId: null, ...data })) as never)

    await expect(authorize({ username: 'carol', password: 'pw' })).resolves.toMatchObject({ isAdmin: false })
    expect(prismaMock.user.create.mock.calls[0][0].data).toMatchObject({ isAdmin: false })
  })

  it('refuses a disabled user', async () => {
    jellyfinSays('admin')
    givenRow(buildUser({ id: 'carol-row', plexUserId: null, jellyfinUserId: 'jf-carol', disabledAt: new Date() }))

    await expect(authorize({ username: 'carol', password: 'pw' })).resolves.toBeNull()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith('auth.disabled', { userId: 'carol-row', provider: 'jellyfin' })
  })
})
