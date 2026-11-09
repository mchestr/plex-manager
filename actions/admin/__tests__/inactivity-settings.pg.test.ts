/**
 * @jest-environment node
 */

/**
 * The two cards of Inactive members, saved at the same time on PostgreSQL:
 * a lower threshold and a larger lead, each fine against the other card's
 * saved value, can never both land. Each save reads, checks and writes in
 * one Serializable transaction, so the second one sees the first and is
 * refused. After the race, a save that only turns removal off, or only
 * turns the emails off, still passes.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The
 * session, the cache, the audit writer and the email and Redis checks are
 * mocked; the settings row is real. The suite puts the shared settings row
 * back as it found it.
 */

import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { updateInactivitySettings, updateInactivityWarnings } from "@/actions/admin/inactivity"
import { PrismaClient, type InactivitySettings } from "@/lib/generated/prisma/client"
import { maxWarningLead } from "@/lib/validations/inactivity"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { id: "pg-admin", isAdmin: true } }) }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ emailConfigured: jest.fn(() => true) }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn(() => true) }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const ID = "inactivity"
const START = { enabled: true, thresholdDays: 180, warningsEnabled: true, warningDays: [30] }

describePg("saving the two inactivity cards at the same time", (databaseUrl) => {
  let saved: InactivitySettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    saved = await mockDb.inactivitySettings.findUnique({ where: { id: ID } })
  })

  afterAll(async () => {
    if (saved) {
      const { id, ...rest } = saved
      await mockDb.inactivitySettings.update({ where: { id }, data: rest })
    } else {
      await mockDb.inactivitySettings.deleteMany({ where: { id: ID } })
    }
    await mockDb.$disconnect()
  })

  const reset = () => mockDb.inactivitySettings.upsert({ where: { id: ID }, create: { id: ID, ...START }, update: START })

  it("lets one of a lower threshold and a larger lead through, never both", async () => {
    for (let round = 0; round < 5; round++) {
      await reset()

      const [threshold, lead] = await Promise.all([
        updateInactivitySettings({ enabled: true, thresholdDays: 100 }),
        updateInactivityWarnings({ warningsEnabled: true, warningDays: [90] }),
      ])

      expect([threshold.success, lead.success].filter(Boolean)).toHaveLength(1)
      const row = await mockDb.inactivitySettings.findUniqueOrThrow({ where: { id: ID } })
      expect(Math.max(...row.warningDays)).toBeLessThanOrEqual(maxWarningLead(row.thresholdDays))
    }
  })

  it("turns removal off, then the emails off, without the checks against the other card", async () => {
    // A state the checks no longer let anyone save: a 90-day lead with 100 days
    await mockDb.inactivitySettings.upsert({
      where: { id: ID },
      create: { id: ID, enabled: true, thresholdDays: 100, warningsEnabled: true, warningDays: [90] },
      update: { enabled: true, thresholdDays: 100, warningsEnabled: true, warningDays: [90] },
    })

    await expect(updateInactivitySettings({ enabled: false, thresholdDays: 100 })).resolves.toEqual({ success: true, data: null })
    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [90] })).resolves.toEqual({ success: true, data: null })
    await expect(mockDb.inactivitySettings.findUniqueOrThrow({ where: { id: ID } })).resolves.toMatchObject({
      enabled: false,
      warningsEnabled: false,
      updatedBy: "pg-admin",
    })
  })
})
