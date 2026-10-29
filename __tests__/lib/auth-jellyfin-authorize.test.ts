/**
 * @jest-environment node
 */

/**
 * The Jellyfin provider's `authorize()` for Jellyfin members (P11.10): a new
 * user is created as a Jellyfin member, an existing one is found by
 * `jellyfinUserId` and keeps the service it has, a disabled account is
 * refused (P0.5), and a Jellyfin administrator is promoted while an
 * `'unknown'` lookup changes nothing (P4.7).
 */

import { mockReset } from 'jest-mock-extended'

import { buildJellyfinServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { authOptions } from '@/lib/auth'
import { authenticateJellyfinUser, getJellyfinUserById } from '@/lib/connections/jellyfin-users'
import type { User } from '@/lib/generated/prisma/client'
import { logAuditEvent } from '@/lib/security/audit-log'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/connections/jellyfin-users', () => ({
  authenticateJellyfinUser: jest.fn(),
  getJellyfinUserById: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
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

const JELLYFIN_SERVER = buildJellyfinServer({ isActive: true, enabledForLogin: true })

function jellyfinAuthorize() {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { name?: string } }).options?.name === 'Jellyfin'
  ) as { options: { authorize: (credentials: Record<string, string>) => Promise<unknown> } }
  return provider.options.authorize
}

/** Jellyfin accepts the password; its admin lookup answers `isAdmin`, or fails for `'unknown'`. */
function signIn(isAdmin: boolean | 'unknown') {
  jest.mocked(authenticateJellyfinUser).mockResolvedValue({
    success: true,
    data: { User: { Id: 'jf-1', Name: 'jo' }, AccessToken: 'logged-out' },
  })
  jest.mocked(getJellyfinUserById).mockResolvedValue(
    isAdmin === 'unknown'
      ? { success: false, error: 'Error fetching user: timeout' }
      : {
          success: true,
          data: { Id: 'jf-1', Name: 'jo', HasPassword: true, HasConfiguredPassword: true, Policy: { IsAdministrator: isAdmin, IsDisabled: false } },
        }
  )
  return jellyfinAuthorize()({ username: 'jo', password: 'correct-password' })
}

const updated = (row: User, data: Partial<User>) => prismaMock.user.update.mockResolvedValue({ ...row, ...data })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  // The settings reader in lib/jellyfin-auth goes through the mocked client
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(JELLYFIN_SERVER)
})

describe('Jellyfin authorize for Jellyfin members', () => {
  it('creates a new user as a Jellyfin member', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue(buildUser({ id: 'new', plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' }))

    await expect(signIn(false)).resolves.toMatchObject({ id: 'new', isAdmin: false })

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { jellyfinUserId: 'jf-1' } })
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin', isAdmin: false }),
    })
  })

  it('finds an existing member by jellyfinUserId and never changes their service', async () => {
    const row = buildUser({ id: 'both', plexUserId: 'plex-1', jellyfinUserId: 'jf-1', primaryAuthService: 'plex' })
    prismaMock.user.findUnique.mockResolvedValue(row)
    updated(row, { name: 'jo' })

    await expect(signIn(false)).resolves.toMatchObject({ id: 'both' })

    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'both' }, data: { name: 'jo', accessEndedAt: null } })
  })

  it('refuses a disabled account (P0.5)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ jellyfinUserId: 'jf-1', disabledAt: new Date() }))

    await expect(signIn(false)).resolves.toBeNull()

    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('promotes a Jellyfin administrator and audits it (P4.7)', async () => {
    const row = buildUser({ id: 'jf-row', plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' })
    prismaMock.user.findUnique.mockResolvedValue(row)
    updated(row, { name: 'jo', isAdmin: true })

    await expect(signIn(true)).resolves.toMatchObject({ id: 'jf-row', isAdmin: true })

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'jf-row' }, data: { name: 'jo', isAdmin: true, accessEndedAt: null } })
    expect(logAuditEvent).toHaveBeenCalledWith('ADMIN_PRIVILEGE_GRANTED', 'jf-row', expect.objectContaining({ jellyfinUserId: 'jf-1' }))
  })

  it("changes nothing about the role when Jellyfin's admin lookup is unknown", async () => {
    const row = buildUser({ id: 'jf-admin', plexUserId: null, jellyfinUserId: 'jf-1', isAdmin: true, primaryAuthService: 'jellyfin' })
    prismaMock.user.findUnique.mockResolvedValue(row)
    updated(row, { name: 'jo' })

    await expect(signIn('unknown')).resolves.toMatchObject({ id: 'jf-admin', isAdmin: true })

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'jf-admin' }, data: { name: 'jo', accessEndedAt: null } })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
