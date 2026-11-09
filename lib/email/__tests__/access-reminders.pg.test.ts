/**
 * @jest-environment node
 */

/**
 * The Access reminders switch on PostgreSQL: the token's path turns
 * `User.inactivityEmailsOff` on once and audits that one change, a second
 * click changes nothing and writes no row, Account turns the emails on
 * again, and a removed member's id writes nothing. Gated by `describePg`
 * and run only by `npm run test:integration`; it touches only its own rows.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { describePg } from '@/__tests__/helpers/integration'
import { saveAccessReminders } from '@/lib/email/access-reminders'
import { PrismaClient } from '@/lib/generated/prisma/client'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MEMBER = `reminders-${randomUUID().slice(0, 8)}`

/** logAuditEvent does not wait for its row, so poll for the count. */
async function auditRows(expected: number) {
  for (let tries = 0; tries < 50; tries++) {
    const count = await mockDb.auditLog.count({ where: { type: 'EMAIL_PREFERENCE_CHANGED', targetUserId: MEMBER } })
    if (count >= expected) return count
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return mockDb.auditLog.count({ where: { type: 'EMAIL_PREFERENCE_CHANGED', targetUserId: MEMBER } })
}

const off = async () => (await mockDb.user.findUniqueOrThrow({ where: { id: MEMBER }, select: { inactivityEmailsOff: true } })).inactivityEmailsOff

describePg('saveAccessReminders on PostgreSQL', (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.create({ data: { id: MEMBER, name: 'Reminders fixture' } })
  })

  afterAll(async () => {
    await mockDb.auditLog.deleteMany({ where: { targetUserId: MEMBER } })
    await mockDb.user.deleteMany({ where: { id: MEMBER } })
    await mockDb.$disconnect()
  })

  it('turns the emails off once, and audits only the change', async () => {
    expect(await off()).toBe(false)

    await expect(saveAccessReminders(MEMBER, { enabled: false, via: 'one_click' })).resolves.toBe('changed')
    expect(await off()).toBe(true)
    expect(await auditRows(1)).toBe(1)

    await expect(saveAccessReminders(MEMBER, { enabled: false, via: 'link' })).resolves.toBe('unchanged')
    expect(await off()).toBe(true)
    expect(await auditRows(2)).toBe(1)

    const row = await mockDb.auditLog.findFirstOrThrow({ where: { type: 'EMAIL_PREFERENCE_CHANGED', targetUserId: MEMBER } })
    expect(row.actorUserId).toBe(MEMBER)
    expect(row.details).toEqual({ enabled: false, via: 'one_click' })
  })

  it('turns them on again from Account', async () => {
    await expect(saveAccessReminders(MEMBER, { enabled: true, via: 'account' })).resolves.toBe('changed')
    expect(await off()).toBe(false)
    expect(await auditRows(2)).toBe(2)
  })

  it('writes nothing for a removed member', async () => {
    await expect(saveAccessReminders(`${MEMBER}-gone`, { enabled: false, via: 'one_click' })).resolves.toBe('no_member')
    expect(await mockDb.auditLog.count({ where: { targetUserId: `${MEMBER}-gone` } })).toBe(0)
  })
})
