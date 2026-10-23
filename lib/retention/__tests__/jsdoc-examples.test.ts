/**
 * @jest-environment node
 */

import { lastExpiredPreviousDataYear, retentionDays } from "@/lib/retention/policy"

describe("JSDoc Documentation Examples", () => {
  it("retentionDays", () => {
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "30" }).auditLog).toBe(30)
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "0" }).auditLog).toBe(1)
    expect(retentionDays({}).rewindLlmText).toBe(120)
  })

  it("lastExpiredPreviousDataYear", () => {
    expect(lastExpiredPreviousDataYear(new Date("2027-06-30T23:59:59Z"))).toBe(2025)
    expect(lastExpiredPreviousDataYear(new Date("2027-07-01T00:00:00Z"))).toBe(2026)
  })
})
