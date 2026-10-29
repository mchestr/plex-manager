/**
 * @jest-environment node
 */

/**
 * Redeeming an affiliate invite on PostgreSQL. A join writes the record on
 * the invite (`joinedAt`, `joinedUserId`), clears the label and exempts the
 * invitee as a member invite. Removing the invitee keeps the join date, so the
 * affiliate's slot does not come back early. A revoked affiliate, the switch
 * off or a server change refuses inside the transaction and counts no use, and
 * a failed share undoes the whole join.
 *
 * plex.tv is mocked; everything else is real. Gated by `describePg` and run
 * only by `npm run test:integration`. The suite touches only rows it created,
 * keyed by its own run prefix, and puts the Config affiliate fields back.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { acceptPlexInvite, checkUserServerAccess, getPlexUserInfo, inviteUserToPlexServer } from '@/lib/connections/plex'
import { Prisma, PrismaClient } from '@/lib/generated/prisma/client'
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
  checkUserServerAccess: jest.fn(),
}))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `affredeem-${randomUUID().slice(0, 8)}`
const AFFILIATE = `${RUN}-affiliate`
const MACHINE = `${RUN}-machine`
const SWITCH_ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1, 2], affiliatePlexMachineId: MACHINE }
const SWITCH_DEFAULTS = { affiliateInvitesEnabled: false, affiliateLibrarySectionIds: Prisma.DbNull, affiliatePlexMachineId: null }

let seq = 0
/** A fresh affiliate invite and a fresh Plex account that redeems it. */
async function arrange() {
  seq += 1
  const code = `${RUN}-${seq}`
  const plexId = `${RUN}-plex-${seq}`
  await mockDb.invite.create({
    data: {
      code,
      kind: 'AFFILIATE',
      affiliateUserId: AFFILIATE,
      label: 'for my brother',
      maxUses: 1,
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
      librarySectionIds: '[1,2]',
    },
  })
  jest.mocked(getPlexUserInfo).mockResolvedValue({
    success: true,
    data: { id: plexId, username: `${RUN}-user-${seq}`, email: `${RUN}-${seq}@example.com` },
  })
  const invite = () => mockDb.invite.findUniqueOrThrow({ where: { code } })
  const invitee = () => mockDb.user.findUnique({ where: { plexUserId: plexId } })
  return { code, invite, invitee }
}

describePg('affiliate invite redemption on Postgres', (databaseUrl) => {
  let createdConfig = false

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    createdConfig = !(await mockDb.config.findUnique({ where: { id: 'config' }, select: { id: true } }))
    await mockDb.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...SWITCH_ON }, update: SWITCH_ON })
    // The newest active row, so the switch reads this server as the active one
    await mockDb.plexServer.create({
      data: { id: `${RUN}-server`, name: RUN, url: 'http://plex.lan:32400', token: 'server-token', isActive: true, machineIdentifier: MACHINE },
    })
    await mockDb.user.create({ data: { id: AFFILIATE, name: 'Sam', plexUserId: `${RUN}-affiliate-plex` } })
    await mockDb.affiliateApplication.create({
      data: { userId: AFFILIATE, openUserId: AFFILIATE, status: 'APPROVED', hoursAtApply: 120 },
    })
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.mocked(checkUserServerAccess).mockResolvedValue({ status: 'denied' })
    jest.mocked(inviteUserToPlexServer).mockResolvedValue({ success: true, inviteID: 1 })
    jest.mocked(acceptPlexInvite).mockResolvedValue({ success: true })
    await mockDb.config.update({ where: { id: 'config' }, data: SWITCH_ON })
    await mockDb.affiliateApplication.updateMany({ where: { userId: AFFILIATE }, data: { status: 'APPROVED', openUserId: AFFILIATE } })
  })

  afterAll(async () => {
    await mockDb.invite.deleteMany({ where: { code: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { OR: [{ id: AFFILIATE }, { plexUserId: { startsWith: RUN } }] } })
    await mockDb.plexServer.deleteMany({ where: { id: `${RUN}-server` } })
    if (createdConfig) await mockDb.config.delete({ where: { id: 'config' } })
    else await mockDb.config.update({ where: { id: 'config' }, data: SWITCH_DEFAULTS })
    await mockDb.$disconnect()
  })

  it('writes the join record, clears the label and exempts the invitee as a member invite', async () => {
    const { code, invite, invitee } = await arrange()

    await expect(redeemPlexInvite(code, 'member-token')).resolves.toEqual({ success: true, data: null })

    const joined = await invitee()
    expect(joined).toMatchObject({ isExempt: true, exemptNote: 'Joined by member invite' })
    await expect(invite()).resolves.toMatchObject({ useCount: 1, joinedAt: expect.any(Date), joinedUserId: joined?.id, label: null })
    expect(await mockDb.inviteUsage.count({ where: { userId: joined?.id } })).toBe(1)
    expect(jest.mocked(inviteUserToPlexServer).mock.calls[0]?.[2]).toEqual({ librarySectionIds: [1, 2], allowDownloads: false })
  }, 15_000)

  it('keeps the join date when the invitee is removed, so the slot does not come back early', async () => {
    const { code, invite, invitee } = await arrange()
    await redeemPlexInvite(code, 'member-token')

    await mockDb.user.delete({ where: { id: (await invitee())!.id } })

    await expect(invite()).resolves.toMatchObject({ useCount: 1, joinedAt: expect.any(Date), joinedUserId: null })
  }, 15_000)

  it.each([
    ['the affiliate is revoked', () => mockDb.affiliateApplication.updateMany({ where: { userId: AFFILIATE }, data: { status: 'REVOKED', openUserId: null } })],
    ['the switch is off', () => mockDb.config.update({ where: { id: 'config' }, data: { affiliateInvitesEnabled: false } })],
    ['the active server changed', () => mockDb.config.update({ where: { id: 'config' }, data: { affiliatePlexMachineId: `${RUN}-old` } })],
  ])('refuses inside the transaction and counts no use when %s', async (_label, change) => {
    const { code, invite, invitee } = await arrange()
    await change()

    await expect(redeemPlexInvite(code, 'member-token')).resolves.toMatchObject({ success: false, code: 'INVITE_INVALID' })

    await expect(invite()).resolves.toMatchObject({ useCount: 0, joinedAt: null, joinedUserId: null, label: 'for my brother' })
    await expect(invitee()).resolves.toBeNull()
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
  })

  it('undoes the whole join when the share fails', async () => {
    const { code, invite, invitee } = await arrange()
    jest.mocked(inviteUserToPlexServer).mockResolvedValue({ success: false, error: 'Plex server unavailable' })

    await expect(redeemPlexInvite(code, 'member-token')).resolves.toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })

    await expect(invite()).resolves.toMatchObject({ useCount: 0, joinedAt: null, joinedUserId: null })
    await expect(invitee()).resolves.toBeNull()
  })
})
