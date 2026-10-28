/**
 * @jest-environment node
 */

/**
 * `recordAuditEvent` against a real PostgreSQL (P4.6, SEC-55): rows land in the
 * order they were written, with sanitised JSON details.
 *
 * Gated by `describePg` (__tests__/helpers/integration.ts) and run only by
 * `npm run test:integration`. The database needs the app's migrations applied.
 * The suite only touches `AuditLog` rows whose actor is its own run id.
 *
 *   TEST_DATABASE_URL=postgresql://.../plex_manager_test npm run test:integration
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { describePg } from "@/__tests__/helpers/integration"

const RUN = `p46-${randomUUID()}`

describePg("AuditLog rows on PostgreSQL", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorUserId: RUN } })
    await db.$disconnect()
  })

  it("lands rows in order with sanitised details", async () => {
    const types = [AuditEventType.CONFIG_CHANGED, AuditEventType.USER_DISABLED, AuditEventType.USER_ENABLED]
    for (const [index, type] of types.entries()) {
      await recordAuditEvent(type, RUN, { targetUserId: `${RUN}-target`, step: index, apiKey: "never-stored" }, db)
      // Distinct timestamps, so the order below is the write order
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const rows = await db.auditLog.findMany({ where: { actorUserId: RUN }, orderBy: { createdAt: "asc" } })

    expect(rows.map((row) => row.type)).toEqual(types)
    expect(rows.map((row) => row.details)).toEqual([
      { step: 0, apiKey: "[REDACTED]" },
      { step: 1, apiKey: "[REDACTED]" },
      { step: 2, apiKey: "[REDACTED]" },
    ])
    expect(rows.every((row) => row.targetUserId === `${RUN}-target` && row.requestId === null)).toBe(true)
  })
})
