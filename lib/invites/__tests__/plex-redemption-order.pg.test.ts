/**
 * @jest-environment node
 */

/**
 * The Plex redemption order on PostgreSQL: the user row, its exemption and the
 * `InviteUsage` are written before the server is shared, and a failed share
 * leaves no trace of them. A new account's row is deleted, an existing row
 * loses only the use and the exemption the redemption gave it, and the
 * invite's use comes back.
 *
 * plex.tv is mocked; everything else is real. Gated by `describePg` and run
 * only by `npm run test:integration`. The suite touches only rows it created,
 * keyed by its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { acceptPlexInvite, getPlexUserInfo, inviteUserToPlexServer } from '@/lib/connections/plex'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { redeemPlexInvite } from '@/lib/invites/plex-redemption'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/connections/plex', () => ({
  getPlexUserInfo: jest.fn(),
  inviteUserToPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
}))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `redeem-${randomUUID().slice(0, 8)}`
const CODE = `${RUN}-code`
const PLEX_ID = `${RUN}-plex`
const SERVER_ID = `${RUN}-server`

const mockGetPlexUserInfo = jest.mocked(getPlexUserInfo)
const mockShare = jest.mocked(inviteUserToPlexServer)
const mockAccept = jest.mocked(acceptPlexInvite)

/** What the database holds for this run's invite and Plex account. */
async function state() {
  const invite = await mockDb.invite.findUniqueOrThrow({ where: { code: CODE }, select: { id: true, useCount: true } })
  const user = await mockDb.user.findUnique({
    where: { plexUserId: PLEX_ID },
    select: { id: true, isExempt: true, exemptNote: true },
  })
  const usages = await mockDb.inviteUsage.count({ where: { inviteId: invite.id } })
  return { useCount: invite.useCount, user, usages }
}

describePg('Plex invite redemption order on Postgres', (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    // The newest active row, so the redemption shares from this one
    await mockDb.plexServer.create({
      data: { id: SERVER_ID, name: RUN, url: 'http://plex.lan:32400', token: 'server-token', isActive: true },
    })
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    mockGetPlexUserInfo.mockResolvedValue({
      success: true,
      data: { id: PLEX_ID, username: `${RUN}-user`, email: `${RUN}@example.com` },
    })
    mockAccept.mockResolvedValue({ success: true })
    await mockDb.user.deleteMany({ where: { plexUserId: PLEX_ID } })
    await mockDb.invite.deleteMany({ where: { code: CODE } })
    await mockDb.invite.create({ data: { code: CODE, maxUses: 1, expiresAt: new Date(Date.now() + 86_400_000) } })
  })

  afterAll(async () => {
    await mockDb.user.deleteMany({ where: { plexUserId: PLEX_ID } })
    await mockDb.invite.deleteMany({ where: { code: CODE } })
    await mockDb.plexServer.deleteMany({ where: { id: SERVER_ID } })
    await mockDb.$disconnect()
  })

  it('writes the row, the exemption and the use before it shares the server', async () => {
    let atShare: Awaited<ReturnType<typeof state>> | null = null
    mockShare.mockImplementation(async () => {
      atShare = await state()
      return { success: true, inviteID: 1 }
    })

    await expect(redeemPlexInvite(CODE, 'member-token')).resolves.toEqual({ success: true, data: null })

    expect(atShare).toEqual({
      useCount: 1,
      user: expect.objectContaining({ isExempt: true, exemptNote: 'Joined by invite' }),
      usages: 1,
    })
    await expect(state()).resolves.toEqual(atShare)
  }, 15_000)

  it('deletes the new row and restores the use when the share fails', async () => {
    mockShare.mockResolvedValue({ success: false, error: 'Plex server unavailable' })

    await expect(redeemPlexInvite(CODE, 'member-token')).resolves.toMatchObject({
      success: false,
      code: 'UPSTREAM_UNAVAILABLE',
    })

    await expect(state()).resolves.toEqual({ useCount: 0, user: null, usages: 0 })
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it('keeps an existing row but removes the use and the exemption when the share fails', async () => {
    await mockDb.user.create({ data: { name: `${RUN}-user`, plexUserId: PLEX_ID, isExempt: false } })
    mockShare.mockResolvedValue({ success: false, error: 'Plex server unavailable' })

    await redeemPlexInvite(CODE, 'member-token')

    await expect(state()).resolves.toEqual({
      useCount: 0,
      user: expect.objectContaining({ isExempt: false, exemptNote: null }),
      usages: 0,
    })
  })
})
