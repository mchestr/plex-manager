/**
 * @jest-environment node
 */

/**
 * Affiliate decisions racing on PostgreSQL. A revoke and a parallel
 * Serializable transaction that makes an invite (PR E's make-invite, here
 * reduced to its read and its write) leave no open invite, whichever commits
 * first. An approve and a refuse racing on one application leave exactly one
 * decision.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows it created, keyed by its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { getServerSession } from 'next-auth'

import { describePg } from '@/__tests__/helpers/integration'
import { approveAffiliate, refuseAffiliate } from '@/actions/admin/affiliates'
import { checkAffiliateEligibility } from '@/lib/affiliates/eligibility'
import { revokeAffiliate } from '@/lib/affiliates/end-status'
import { inSerializable } from '@/lib/db/serializable'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { consume } from '@/lib/security/rate-limit'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/affiliates/eligibility', () => ({ checkAffiliateEligibility: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `affdecide-${randomUUID().slice(0, 8)}`
let seq = 0

async function affiliate(status: 'PENDING' | 'APPROVED') {
  seq += 1
  const id = `${RUN}-user-${seq}`
  await mockDb.user.create({ data: { id, name: `Member ${seq}`, plexUserId: `${RUN}-plex-${seq}` } })
  const application = await mockDb.affiliateApplication.create({ data: { userId: id, openUserId: id, status, hoursAtApply: 120 } })
  return { userId: id, applicationId: application.id }
}

/** A gate one transaction waits on after its read, so the other runs in between. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

describePg('affiliate decisions on Postgres', (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  beforeEach(() => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: `${RUN}-admin`, isAdmin: true }, expires: '' })
    jest.mocked(consume).mockResolvedValue({ ok: true })
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: true, paid: false, hours: 120 })
  })

  afterAll(async () => {
    await mockDb.invite.deleteMany({ where: { code: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.auditLog.deleteMany({ where: { actorUserId: `${RUN}-admin` } })
    await mockDb.$disconnect()
  })

  it('leaves no open invite when a revoke races a make-invite', async () => {
    const { userId, applicationId } = await affiliate('APPROVED')
    const { open, opened } = gate()
    let attempts = 0

    const makeInvite = inSerializable(async (tx) => {
      attempts += 1
      const application = await tx.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { status: true } })
      if (attempts === 1) await opened
      if (application?.status !== 'APPROVED') return false
      await tx.invite.create({
        data: { code: `${RUN}-${seq}-${attempts}`, kind: 'AFFILIATE', affiliateUserId: userId, maxUses: 1, expiresAt: new Date(Date.now() + 3_600_000), librarySectionIds: '[1]' },
      })
      return true
    })
    // The revoke starts while the make-invite holds its read
    await new Promise((resolve) => setTimeout(resolve, 100))
    const revoke = revokeAffiliate(applicationId, { reason: null, actorId: `${RUN}-admin` })
    setTimeout(open, 200)

    const [revoked, made] = await Promise.all([revoke, makeInvite])
    expect(revoked.ok).toBe(true)
    // The make-invite conflicted, ran again on fresh reads and found no affiliate
    expect(attempts).toBeGreaterThan(1)
    expect(made).toBe(false)
    await expect(
      mockDb.invite.count({ where: { affiliateUserId: userId, joinedAt: null, cancelledAt: null } })
    ).resolves.toBe(0)
    await expect(mockDb.affiliateApplication.findUniqueOrThrow({ where: { id: applicationId } })).resolves.toMatchObject({ status: 'REVOKED', openUserId: null })
  }, 20_000)

  it('cancels the open invites a revoke finds', async () => {
    const { userId, applicationId } = await affiliate('APPROVED')
    await mockDb.invite.create({
      data: { code: `${RUN}-open-${seq}`, kind: 'AFFILIATE', affiliateUserId: userId, label: 'for Ana', maxUses: 1, expiresAt: new Date(Date.now() + 3_600_000), librarySectionIds: '[1]' },
    })

    await expect(revokeAffiliate(applicationId, { reason: 'Sold invites', actorId: `${RUN}-admin` })).resolves.toEqual({ ok: true, invitesCancelled: 1 })
    await expect(mockDb.invite.findUniqueOrThrow({ where: { code: `${RUN}-open-${seq}` } })).resolves.toMatchObject({ cancelledAt: expect.any(Date), label: null })
  })

  it('leaves one decision when an approve and a refuse race', async () => {
    const { applicationId } = await affiliate('PENDING')

    const results = await Promise.all([approveAffiliate({ applicationId }), refuseAffiliate({ applicationId, reason: 'No' })])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.filter((result) => !result.success && result.code === 'CONFLICT')).toHaveLength(1)
    const row = await mockDb.affiliateApplication.findUniqueOrThrow({ where: { id: applicationId } })
    expect(['APPROVED', 'REFUSED']).toContain(row.status)
    expect(row.openUserId).toBe(row.status === 'APPROVED' ? row.userId : null)
    expect(row.decidedBy).toBe(`${RUN}-admin`)
  })
})
