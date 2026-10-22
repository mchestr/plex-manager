/**
 * @jest-environment node
 */

/**
 * `setMemberJellyfinAccess` (P11.10): only `IsDisabled` changes on the
 * Jellyfin policy, Jellyfin administrators and the caller are refused,
 * turning access off ends the member's sessions, and each change writes one
 * audit entry. Only the HTTP calls to Jellyfin are stubbed.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildJellyfinServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { setMemberJellyfinAccess } from '@/actions/admin/member-access'
import { setJellyfinAccountDisabled } from '@/lib/connections/jellyfin-users'
import { enqueueRoleSync } from '@/lib/discord/role-sync'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { endUserSessions } from '@/lib/session-revocation'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), unstable_cache: (fn: () => unknown) => fn }))
jest.mock('@/lib/utils/fetch-with-timeout', () => ({ fetchWithTimeout: jest.fn() }))
jest.mock('@/lib/session-revocation', () => ({ endUserSessions: jest.fn() }))
jest.mock('@/lib/discord/role-sync', () => ({ enqueueRoleSync: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

const CONFIG = { url: 'http://jellyfin.local:8096', apiKey: 'api-key' }
const POLICY = { IsAdministrator: false, IsDisabled: false, EnableAllFolders: false, EnabledFolders: ['films', 'kids'], EnableContentDownloading: true }

/** Jellyfin answers the user read with `policy` (or `status`), and accepts every policy write. */
function jellyfin({ policy = POLICY, status = 200 }: { policy?: Record<string, unknown>; status?: number } = {}) {
  jest.mocked(fetchWithTimeout).mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ Id: 'jf-1', Name: 'jo', Policy: policy }), { status })
  })
}

/** The bodies of every policy write. */
const policyWrites = () =>
  jest
    .mocked(fetchWithTimeout)
    .mock.calls.filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '2099-01-01T00:00:00.000Z' })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' }))
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer(CONFIG))
})

describe('setJellyfinAccountDisabled', () => {
  it('keeps every policy field, EnabledFolders included, and changes only IsDisabled', async () => {
    jellyfin()

    await expect(setJellyfinAccountDisabled(CONFIG, 'jf-1', true)).resolves.toEqual({ success: true, status: 'changed' })

    expect(policyWrites()).toEqual([{ url: 'http://jellyfin.local:8096/Users/jf-1/Policy', body: { ...POLICY, IsDisabled: true } }])
  })

  it('writes nothing when the account is gone, has no policy or is an administrator', async () => {
    jellyfin({ status: 404 })
    await expect(setJellyfinAccountDisabled(CONFIG, 'jf-1', true)).resolves.toEqual({ success: true, status: 'not_found' })

    jellyfin({ policy: { ...POLICY, IsAdministrator: true } })
    await expect(setJellyfinAccountDisabled(CONFIG, 'jf-1', true)).resolves.toEqual({ success: false, code: 'JELLYFIN_ADMIN' })

    jellyfin({ policy: { ...POLICY, IsDisabled: true } })
    await expect(setJellyfinAccountDisabled(CONFIG, 'jf-1', true)).resolves.toEqual({ success: true, status: 'unchanged' })

    jest.mocked(fetchWithTimeout).mockResolvedValue(new Response(JSON.stringify({ Id: 'jf-1' }), { status: 200 }))
    await expect(setJellyfinAccountDisabled(CONFIG, 'jf-1', true)).resolves.toEqual({ success: false, code: 'JELLYFIN_UNAVAILABLE' })

    expect(policyWrites()).toEqual([])
  })
})

describe('setMemberJellyfinAccess', () => {
  it('turns access off, ends the sessions and writes one audit entry', async () => {
    jellyfin()

    await expect(setMemberJellyfinAccess({ userId: 'member-1', enabled: false })).resolves.toEqual({ success: true, data: null })

    expect(policyWrites()).toEqual([expect.objectContaining({ body: { ...POLICY, IsDisabled: true } })])
    expect(endUserSessions).toHaveBeenCalledWith('member-1', 'unshared', 'admin-1')
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.JELLYFIN_ACCESS_DISABLED, 'admin-1', {
      targetUserId: 'member-1',
      jellyfinUserId: 'jf-1',
    })
  })

  it('turns access on again with the same libraries and re-syncs the Discord role', async () => {
    jellyfin({ policy: { ...POLICY, IsDisabled: true } })

    await expect(setMemberJellyfinAccess({ userId: 'member-1', enabled: true })).resolves.toEqual({ success: true, data: null })

    expect(policyWrites()).toEqual([expect.objectContaining({ body: { ...POLICY, IsDisabled: false } })])
    expect(endUserSessions).not.toHaveBeenCalled()
    expect(enqueueRoleSync).toHaveBeenCalledWith('member-1', 'access_granted')
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.JELLYFIN_ACCESS_ENABLED, 'admin-1', expect.anything())
  })

  it('refuses a Jellyfin administrator', async () => {
    jellyfin({ policy: { ...POLICY, IsAdministrator: true } })

    await expect(setMemberJellyfinAccess({ userId: 'member-1', enabled: false })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })

    expect(policyWrites()).toEqual([])
    expect(endUserSessions).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('refuses when Jellyfin cannot say whether the account is an administrator', async () => {
    jellyfin({ status: 503 })

    await expect(setMemberJellyfinAccess({ userId: 'member-1', enabled: false })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })

    expect(policyWrites()).toEqual([])
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('refuses the caller and a member without a Jellyfin account', async () => {
    jellyfin()

    await expect(setMemberJellyfinAccess({ userId: 'admin-1', enabled: false })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })

    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-2', jellyfinUserId: null }))
    await expect(setMemberJellyfinAccess({ userId: 'member-2', enabled: false })).resolves.toMatchObject({ success: false, code: 'VALIDATION' })

    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('refuses a member', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-3', isAdmin: false }, expires: '2099-01-01T00:00:00.000Z' })

    await expect(setMemberJellyfinAccess({ userId: 'member-1', enabled: false })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })
})
