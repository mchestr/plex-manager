/**
 * @jest-environment node
 */

/**
 * The affiliate switch going off on PostgreSQL. A switch-off and a parallel
 * Serializable transaction that makes an invite (PR E's make-invite, here
 * reduced to its read of the switch and its write) leave no open invite,
 * whichever commits first. An open invite made before the switch-off is
 * cancelled; a used one stays.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The
 * suite puts the Config row back as it found it, and touches only rows it
 * created, keyed by its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { describePg } from '@/__tests__/helpers/integration'
import { readAffiliateSettings } from '@/lib/affiliates/settings'
import { saveAffiliateSettings } from '@/lib/affiliates/switch'
import { inSerializable } from '@/lib/db/serializable'
import { Prisma, PrismaClient } from '@/lib/generated/prisma/client'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `affswitch-${randomUUID().slice(0, 8)}`
const ADMIN = `${RUN}-admin`
const MACHINE = `${RUN}-machine`
const OFF = { enabled: false, tiers: [{ overHours: 50, invites: 1 }], cap: 10, libraryIds: [1] }
let seq = 0
let savedConfig: { affiliateInvitesEnabled: boolean; affiliateLibrarySectionIds: Prisma.JsonValue; affiliatePlexMachineId: string | null } | null = null
let otherActive: string[] = []

/** A gate one transaction waits on after its read, so the other runs in between. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

async function switchOn() {
  await mockDb.config.upsert({
    where: { id: 'config' },
    create: { id: 'config', affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1], affiliatePlexMachineId: MACHINE },
    update: { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1], affiliatePlexMachineId: MACHINE },
  })
}

function invite(affiliateUserId: string, data: { joinedAt?: Date } = {}) {
  seq += 1
  return mockDb.invite.create({
    data: { code: `${RUN}-${seq}`, kind: 'AFFILIATE', affiliateUserId, maxUses: 1, expiresAt: new Date(Date.now() + 3_600_000), librarySectionIds: '[1]', ...data },
  })
}

describePg('the affiliate switch on Postgres', (databaseUrl) => {
  let affiliateId = ''

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    savedConfig = await mockDb.config.findUnique({
      where: { id: 'config' },
      select: { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: true, affiliatePlexMachineId: true },
    })
    // readAffiliateSettings compares against the active server; this suite's server is the only active one until it ends
    otherActive = (await mockDb.plexServer.findMany({ where: { isActive: true }, select: { id: true } })).map((server) => server.id)
    await mockDb.plexServer.updateMany({ where: { id: { in: otherActive } }, data: { isActive: false } })
    await mockDb.plexServer.create({ data: { id: `${RUN}-plex`, name: 'Test', url: 'http://plex.test:32400', token: 'token', isActive: true, machineIdentifier: MACHINE } })
    affiliateId = `${RUN}-user`
    await mockDb.user.create({ data: { id: affiliateId, name: 'Affiliate', plexUserId: `${RUN}-plex-user` } })
  })

  afterAll(async () => {
    await mockDb.invite.deleteMany({ where: { code: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.plexServer.deleteMany({ where: { id: `${RUN}-plex` } })
    await mockDb.auditLog.deleteMany({ where: { actorUserId: ADMIN } })
    await mockDb.plexServer.updateMany({ where: { id: { in: otherActive } }, data: { isActive: true } })
    if (savedConfig) {
      await mockDb.config.update({
        where: { id: 'config' },
        data: { ...savedConfig, affiliateLibrarySectionIds: savedConfig.affiliateLibrarySectionIds ?? Prisma.DbNull },
      })
    } else {
      await mockDb.config.deleteMany({ where: { id: 'config' } })
    }
    await mockDb.$disconnect()
  })

  it('cancels an open invite and keeps a used one when the switch goes off', async () => {
    await switchOn()
    const open = await invite(affiliateId)
    const used = await invite(affiliateId, { joinedAt: new Date() })

    await expect(saveAffiliateSettings(OFF, ADMIN)).resolves.toEqual({ ok: true, invitesCancelled: 1 })
    await expect(mockDb.invite.findUniqueOrThrow({ where: { id: open.id } })).resolves.toMatchObject({ cancelledAt: expect.any(Date), label: null })
    await expect(mockDb.invite.findUniqueOrThrow({ where: { id: used.id } })).resolves.toMatchObject({ cancelledAt: null })
    await expect(mockDb.auditLog.findFirst({ where: { actorUserId: ADMIN, type: 'AFFILIATE_INVITE_CANCELLED' } })).resolves.toMatchObject({
      details: { cause: 'switch_off', count: 1 },
    })
  })

  it('leaves no open invite when a switch-off races a make-invite', async () => {
    await switchOn()
    const { open, opened } = gate()
    let attempts = 0

    const makeInvite = inSerializable(async (tx) => {
      attempts += 1
      const settings = await readAffiliateSettings(tx)
      if (attempts === 1) await opened
      if (!settings.on) return false
      seq += 1
      await tx.invite.create({
        data: { code: `${RUN}-race-${seq}`, kind: 'AFFILIATE', affiliateUserId: affiliateId, maxUses: 1, expiresAt: new Date(Date.now() + 3_600_000), librarySectionIds: '[1]' },
      })
      return true
    })
    // The switch-off starts while the make-invite holds its read
    await new Promise((resolve) => setTimeout(resolve, 100))
    const off = saveAffiliateSettings(OFF, ADMIN)
    setTimeout(open, 200)

    const [saved, made] = await Promise.all([off, makeInvite])
    expect(saved.ok).toBe(true)
    // The make-invite conflicted, ran again on fresh reads and found the switch off
    expect(attempts).toBeGreaterThan(1)
    expect(made).toBe(false)
    await expect(
      mockDb.invite.count({ where: { kind: 'AFFILIATE', affiliateUserId: affiliateId, joinedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } } })
    ).resolves.toBe(0)
    await expect(readAffiliateSettings()).resolves.toMatchObject({ on: false })
  }, 20_000)
})
