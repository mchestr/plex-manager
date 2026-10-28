/**
 * @jest-environment node
 */

/**
 * The audit and the apply on PostgreSQL (P11.31, the step's demo): with two
 * active Tautulli rows the audit lists both and the row the app reads today;
 * the apply keeps that row, leaves `count(*) WHERE "isActive"` at 1, records
 * the deactivated id once, and a second run changes nothing.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. It
 * empties the Tautulli table; other service tables are left as they are.
 */

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import { AuditEventType } from '@/lib/security/audit-log'
import { applyServiceRowKeeps, type ServiceRowKeeps } from '@/lib/services/duplicate-apply'
import { auditServiceRows } from '@/lib/services/duplicate-audit'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/settings/test-service', () => ({ testService: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const ACTOR = 'p1131-pg-actor'

describePg('duplicate service rows on Postgres', (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.tautulli.deleteMany({})
    await mockDb.auditLog.deleteMany({ where: { actorUserId: ACTOR } })
    await mockDb.tautulli.create({ data: { id: 'p1131-old', name: 'Old', url: 'http://tautulli.lan:8181', apiKey: 'old-key' } })
    await mockDb.tautulli.create({ data: { id: 'p1131-new', name: 'New', url: 'http://tautulli-2.lan:8181', apiKey: 'new-key' } })
  })

  afterAll(async () => {
    await mockDb.tautulli.deleteMany({})
    await mockDb.auditLog.deleteMany({ where: { actorUserId: ACTOR } })
    await mockDb.$disconnect()
  })

  it('lists both rows, keeps today’s pick, and is idempotent', async () => {
    const listed = await auditServiceRows({ test: async () => 'ok' })
    const entry = listed.find((table) => table.table === 'Tautulli')
    expect(entry?.rows.map((row) => row.id).sort()).toEqual(['p1131-new', 'p1131-old'])
    // The pre-P11.31 read, unordered, is the default keep
    const today = await mockDb.tautulli.findFirst({ where: { isActive: true }, select: { id: true } })
    expect(entry?.todaysPickId).toBe(today?.id)

    const keeps: ServiceRowKeeps = Object.fromEntries(listed.map((table) => [table.table, table.suggestedKeepId]))
    const first = await applyServiceRowKeeps({ keeps, actor: ACTOR, dump: 'p1131.dump' })
    expect(first).toMatchObject({ ok: true, kept: { Tautulli: entry?.todaysPickId } })

    const active = await mockDb.tautulli.findMany({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    expect(active).toEqual([{ id: entry?.todaysPickId }])
    const other = entry?.rows.find((row) => row.id !== entry.todaysPickId)?.id
    const audits = await mockDb.auditLog.findMany({ where: { actorUserId: ACTOR, type: AuditEventType.SERVICE_ROWS_DEDUPED } })
    expect(audits).toHaveLength(1)
    expect(audits[0].details).toMatchObject({ deactivated: { Tautulli: [other] }, dump: 'p1131.dump' })

    await expect(applyServiceRowKeeps({ keeps, actor: ACTOR, dump: 'p1131.dump' })).resolves.toEqual({ ok: true, kept: {}, deactivated: {} })
    expect(await mockDb.tautulli.count({ where: { isActive: true } })).toBe(1)
    expect(await mockDb.auditLog.count({ where: { actorUserId: ACTOR } })).toBe(1)
  })
})
