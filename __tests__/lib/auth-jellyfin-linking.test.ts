/**
 * @jest-environment node
 */

/**
 * The Jellyfin provider in lib/auth.ts matches users by Jellyfin user ID only
 * (SEC-08) and honours "Allow Jellyfin sign-in" (SEC-14).
 *
 * A Jellyfin user can rename themselves to any string, so a username that
 * looks like an email address must never select, link to or be written into
 * another row.
 */

import { authOptions } from '@/lib/auth'
import { authenticateJellyfin, isJellyfinAdmin } from '@/lib/jellyfin-auth'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    jellyfinServer: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

// The real getJellyfinLoginServer, so the toggle check runs against the
// mocked prisma; only the calls that would reach Jellyfin are stubbed.
jest.mock('@/lib/jellyfin-auth', () => ({
  ...jest.requireActual('@/lib/jellyfin-auth'),
  authenticateJellyfin: jest.fn(),
  isJellyfinAdmin: jest.fn(),
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

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}))

const mockAuthenticateJellyfin = authenticateJellyfin as jest.MockedFunction<typeof authenticateJellyfin>
const mockIsJellyfinAdmin = isJellyfinAdmin as jest.MockedFunction<typeof isJellyfinAdmin>
const mockJellyfinServerFindFirst = prisma.jellyfinServer.findFirst as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserCreate = prisma.user.create as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock

type Row = Record<string, unknown> & { id: string }

/**
 * Resolve the Jellyfin provider's raw `authorize`. next-auth renames every
 * CredentialsProvider to "credentials" and keeps the configured name at
 * `options.name`; `options.authorize` is our handler, not next-auth's wrapper.
 */
function getJellyfinAuthorize() {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { name?: string } }).options?.name === 'Jellyfin'
  ) as { options?: { authorize?: unknown } } | undefined
  const authorize = provider?.options?.authorize as (
    credentials: Record<string, string> | undefined
  ) => Promise<unknown>
  if (typeof authorize !== 'function') {
    throw new Error('Jellyfin authorize function not found on authOptions')
  }
  return authorize
}

const JELLYFIN_SERVER = {
  id: 'jf-server-1',
  url: 'http://jellyfin.local:8096',
  apiKey: 'api-key',
  adminUserId: 'jf-owner',
  isActive: true,
  enabledForLogin: true,
}

/** The owner's row, created by a Plex sign-in. */
const OWNER_ROW: Row = {
  id: 'owner-row',
  email: 'owner@example.com',
  name: 'owner',
  image: null,
  isAdmin: true,
  plexUserId: 'plex-owner',
  jellyfinUserId: null,
}

/** Serves `user.findUnique` from `rows`, matching every field in `where`. */
function givenRows(rows: Row[]) {
  mockUserFindUnique.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null
  )
}

/** Signs in through the provider as `jellyfinUser`, whom Jellyfin accepts. */
function signInAs(jellyfinUser: { id: string; username: string }, isAdmin = false) {
  mockAuthenticateJellyfin.mockResolvedValue({
    success: true,
    data: jellyfinUser,
  })
  mockIsJellyfinAdmin.mockResolvedValue(isAdmin)
  return getJellyfinAuthorize()({ username: jellyfinUser.username, password: 'correct-password' })
}

function lookedUpByEmail() {
  return mockUserFindUnique.mock.calls.some(
    ([args]: [{ where: Record<string, unknown> }]) => 'email' in args.where
  )
}

describe('Jellyfin authorize: no email-based account linking', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockJellyfinServerFindFirst.mockResolvedValue(JELLYFIN_SERVER)
    mockUserCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-row',
      email: null,
      image: null,
      ...data,
    }))
    mockUserUpdate.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        email: null,
        image: null,
        ...data,
      })
    )
  })

  it('rename attack: a Jellyfin user named after the owner email becomes a new non-admin member', async () => {
    givenRows([OWNER_ROW])

    const result = await signInAs({ id: 'jf-mallory', username: 'owner@example.com' })

    expect(result).toEqual({
      id: 'new-row',
      email: null,
      name: 'owner@example.com',
      image: null,
      isAdmin: false,
    })
    expect(mockIsJellyfinAdmin).toHaveBeenCalledWith('jf-mallory')
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { jellyfinUserId: 'jf-mallory' } })
    expect(lookedUpByEmail()).toBe(false)
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        jellyfinUserId: 'jf-mallory',
        name: 'owner@example.com',
        isAdmin: false,
        primaryAuthService: 'jellyfin',
        onboardingStatus: { plex: false, jellyfin: false },
      },
    })
  })

  it('pre-claim: an email-shaped username with no row creates one without an email', async () => {
    givenRows([])

    const result = await signInAs({ id: 'jf-eve', username: 'victim@example.com' })

    expect(result).toMatchObject({ id: 'new-row', email: null, isAdmin: false })
    expect(lookedUpByEmail()).toBe(false)
    // No email key: the column's default, NULL, is stored.
    expect(mockUserCreate.mock.calls[0][0].data).not.toHaveProperty('email')
  })

  it('updates an existing Jellyfin row whose username contains @ without touching its email', async () => {
    givenRows([
      { id: 'carol-row', jellyfinUserId: 'jf-carol', email: null, name: 'carol', image: null, isAdmin: false },
    ])

    const result = await signInAs({ id: 'jf-carol', username: 'carol@example.com' })

    expect(result).toMatchObject({ id: 'carol-row', email: null, name: 'carol@example.com' })
    expect(mockUserCreate).not.toHaveBeenCalled()
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'carol-row' },
      data: { name: 'carol@example.com', isAdmin: false },
    })
  })
})

describe('Jellyfin authorize: "Allow Jellyfin sign-in"', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null without contacting Jellyfin when sign-in is turned off', async () => {
    mockJellyfinServerFindFirst.mockResolvedValue({ ...JELLYFIN_SERVER, enabledForLogin: false })

    const result = await getJellyfinAuthorize()({ username: 'alice', password: 'correct-password' })

    expect(result).toBeNull()
    expect(mockAuthenticateJellyfin).not.toHaveBeenCalled()
    expect(mockIsJellyfinAdmin).not.toHaveBeenCalled()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith('jellyfin.login.disabled', { serverId: 'jf-server-1' })
  })

  it('returns null without contacting Jellyfin when no server is active', async () => {
    mockJellyfinServerFindFirst.mockResolvedValue(null)

    const result = await getJellyfinAuthorize()({ username: 'alice', password: 'correct-password' })

    expect(result).toBeNull()
    expect(mockAuthenticateJellyfin).not.toHaveBeenCalled()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })

  it('contacts Jellyfin when sign-in is allowed, passing only the credentials', async () => {
    mockJellyfinServerFindFirst.mockResolvedValue(JELLYFIN_SERVER)
    mockAuthenticateJellyfin.mockResolvedValue({ success: false, error: 'Invalid username or password' })

    const result = await getJellyfinAuthorize()({ username: 'alice', password: 'wrong-password' })

    expect(result).toBeNull()
    expect(mockAuthenticateJellyfin).toHaveBeenCalledWith('alice', 'wrong-password')
  })
})
