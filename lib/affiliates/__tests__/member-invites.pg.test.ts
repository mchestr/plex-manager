/**
 * @jest-environment node
 */

/**
 * Affiliate invites made and cancelled in parallel on PostgreSQL. Serializable
 * isolation keeps parallel makes within the member's places and the server
 * cap, a cancel never lands on an invite whose redemption has started (and a
 * committed cancel stops the redemption), and a revoke that races a make
 * leaves no open invite.
 *
 * Tautulli, plex.tv and the active-server lookup are mocked; everything else
 * is real. Gated by `describePg` and run only by `npm run test:integration`.
 * The suite touches only rows it created, keyed by its own run prefix, and
 * puts the Config affiliate fields back.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { describePg } from '@/__tests__/helpers/integration'
import { heldInvitesWhere } from '@/lib/affiliates/allowance'
import { revokeAffiliate } from '@/lib/affiliates/end-status'
import { cancelOwnAffiliateInvite, makeAffiliateInvite } from '@/lib/affiliates/member-invites'
import { readWatchHours } from '@/lib/affiliates/watch-hours'
import { acceptPlexInvite, checkUserServerAccess, getPlexUserInfo, inviteUserToPlexServer } from '@/lib/connections/plex'
import { getActiveService } from '@/lib/data/active-service'
import { Prisma, PrismaClient } from '@/lib/generated/prisma/client'
import { redeemPlexInvite } from '@/lib/invites/plex-redemption'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/affiliates/watch-hours', () => ({ readWatchHours: jest.fn() }))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
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

const RUN = `affmake-${randomUUID().slice(0, 8)}`
const MACHINE = `${RUN}-machine`
const SWITCH_ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1, 2], affiliatePlexMachineId: MACHINE, affiliateTiers: Prisma.DbNull }
const SWITCH_DEFAULTS = {
  affiliateInvitesEnabled: false,
  affiliateLibrarySectionIds: Prisma.DbNull,
  affiliatePlexMachineId: null,
  affiliateServerCap: 10,
}

let seq = 0
/** A fresh approved affiliate; 120 h is the first tier, one invite per 30 days. */
async function affiliate(): Promise<{ id: string; applicationId: string }> {
  seq += 1
  const id = `${RUN}-aff-${seq}`
  await mockDb.user.create({ data: { id, name: `Sam ${seq}`, plexUserId: `${RUN}-aff-plex-${seq}` } })
  const application = await mockDb.affiliateApplication.create({
    data: { userId: id, openUserId: id, status: 'APPROVED', hoursAtApply: 120 },
    select: { id: true },
  })
  return { id, applicationId: application.id }
}

const openInvites = (affiliateUserId: string) =>
  mockDb.invite.count({ where: { affiliateUserId, joinedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } } })

describePg('affiliate invites made and cancelled on Postgres', (databaseUrl) => {
  let createdConfig = false

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    createdConfig = !(await mockDb.config.findUnique({ where: { id: 'config' }, select: { id: true } }))
    await mockDb.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...SWITCH_ON }, update: SWITCH_ON })
    await mockDb.plexServer.create({
      data: { id: `${RUN}-server`, name: RUN, url: 'http://plex.lan:32400', token: 'server-token', isActive: true, machineIdentifier: MACHINE },
    })
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await mockDb.config.update({ where: { id: 'config' }, data: { ...SWITCH_ON, affiliateServerCap: null } })
    jest.mocked(readWatchHours).mockResolvedValue({ ok: true, allTime: 120, last30Days: 10 })
    jest.mocked(getActiveService).mockResolvedValue({ url: 'http://plex.lan:32400', token: 'server-token', machineIdentifier: MACHINE } as never)
    // Affiliates have the server shared; a redeemer does not yet
    jest.mocked(checkUserServerAccess).mockImplementation(async (_server, plexUserId) =>
      plexUserId.includes('-aff-plex-') ? { status: 'granted' } : { status: 'denied' }
    )
    jest.mocked(inviteUserToPlexServer).mockResolvedValue({ success: true, inviteID: 1 })
    jest.mocked(acceptPlexInvite).mockResolvedValue({ success: true })
  })

  afterAll(async () => {
    await mockDb.invite.deleteMany({ where: { affiliateUserId: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { OR: [{ id: { startsWith: RUN } }, { plexUserId: { startsWith: RUN } }] } })
    await mockDb.plexServer.deleteMany({ where: { id: `${RUN}-server` } })
    if (createdConfig) await mockDb.config.delete({ where: { id: 'config' } })
    else await mockDb.config.update({ where: { id: 'config' }, data: SWITCH_DEFAULTS })
    await mockDb.$disconnect()
  })

  it('makes exactly one of 10 parallel invites with one free place', async () => {
    const { id } = await affiliate()

    const results = await Promise.all(Array.from({ length: 10 }, () => makeAffiliateInvite(id, null)))

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    for (const result of results.filter((r) => !r.ok)) {
      expect(result).toMatchObject({ ok: false, refusal: { code: expect.stringMatching(/^(NO_PLACES|BUSY)$/) } })
    }
    expect(await openInvites(id)).toBe(1)
  }, 60_000)

  it('makes exactly N invites across affiliates at a server cap of N', async () => {
    // The cap counts every held affiliate invite, earlier tests' included
    const alreadyHeld = await mockDb.invite.count({ where: heldInvitesWhere(new Date()) })
    await mockDb.config.update({ where: { id: 'config' }, data: { affiliateServerCap: alreadyHeld + 3 } })
    const affiliates = await Promise.all(Array.from({ length: 6 }, () => affiliate()))

    const results = await Promise.all(affiliates.map(({ id }) => makeAffiliateInvite(id, null)))

    expect(results.filter((result) => result.ok)).toHaveLength(3)
    const made = await mockDb.invite.count({ where: { affiliateUserId: { in: affiliates.map(({ id }) => id) } } })
    expect(made).toBe(3)
  }, 60_000)

  it('refuses a cancel while a redemption is under way, and the redemption completes', async () => {
    const { id } = await affiliate()
    const made = await makeAffiliateInvite(id, 'For Ana')
    if (!made.ok) throw new Error(`make refused: ${made.refusal.code}`)
    jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: `${RUN}-ana`, username: `${RUN}-ana`, email: `${RUN}-ana@example.com` } })
    let cancelled: boolean | undefined
    jest.mocked(inviteUserToPlexServer).mockImplementation(async () => {
      cancelled = await cancelOwnAffiliateInvite(id, made.invite.id)
      return { success: true, inviteID: 1 }
    })

    await expect(redeemPlexInvite(made.invite.code, 'ana-token')).resolves.toEqual({ success: true, data: null })

    expect(cancelled).toBe(false)
    await expect(mockDb.invite.findUniqueOrThrow({ where: { id: made.invite.id } })).resolves.toMatchObject({
      cancelledAt: null,
      useCount: 1,
      joinedAt: expect.any(Date),
    })
  }, 30_000)

  it('stops the redemption when the cancel committed first', async () => {
    const { id } = await affiliate()
    const made = await makeAffiliateInvite(id, null)
    if (!made.ok) throw new Error(`make refused: ${made.refusal.code}`)
    jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: `${RUN}-bo`, username: `${RUN}-bo`, email: `${RUN}-bo@example.com` } })

    await expect(cancelOwnAffiliateInvite(id, made.invite.id)).resolves.toBe(true)
    await expect(redeemPlexInvite(made.invite.code, 'bo-token')).resolves.toMatchObject({ success: false, code: 'INVITE_INVALID' })

    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    await expect(mockDb.invite.findUniqueOrThrow({ where: { id: made.invite.id } })).resolves.toMatchObject({ useCount: 0, joinedAt: null })
  }, 30_000)

  it('leaves no open invite when a revoke races a make', async () => {
    for (let round = 0; round < 5; round++) {
      const { id, applicationId } = await affiliate()

      const [revoked, made] = await Promise.all([
        revokeAffiliate(applicationId, { reason: null, actorId: 'admin' }),
        makeAffiliateInvite(id, null),
      ])

      expect(revoked.ok).toBe(true)
      expect(made.ok ? 'made' : made.refusal.code).toMatch(/^(made|NOT_AFFILIATE|BUSY)$/)
      expect(await openInvites(id)).toBe(0)
    }
  }, 60_000)
})
