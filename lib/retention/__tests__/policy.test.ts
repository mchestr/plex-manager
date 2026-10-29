/**
 * @jest-environment node
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import {
  lastExpiredPreviousDataYear,
  MIN_RETENTION_DAYS,
  RETENTION_WINDOWS,
  retentionDays,
} from "@/lib/retention/policy"

describe("retentionDays", () => {
  it("uses the documented defaults", () => {
    expect(retentionDays({})).toEqual({
      rewindLlmText: 120,
      assistantLlmText: 90,
      assistantChats: 90,
      chatConversations: 180,
      discordChatMessages: 1,
      discordChatSessions: 30,
      discordCommandArgs: 7,
      discordCommandLog: 90,
      shareVisitDays: 90,
      rewindViews: 120,
      watchlistRemoved: 30,
      discordOAuthStates: 1,
      auditLog: 400,
      affiliateApplications: 365,
      affiliateInvites: 365,
    })
  })

  it("reads one RETENTION_AFFILIATE_DAYS for both affiliate windows", () => {
    const days = retentionDays({ RETENTION_AFFILIATE_DAYS: "90" })
    expect(days.affiliateApplications).toBe(90)
    expect(days.affiliateInvites).toBe(90)
  })

  it("takes each RETENTION_<NAME>_DAYS override", () => {
    const days = retentionDays({ RETENTION_AUDIT_LOG_DAYS: "30", RETENTION_REWIND_VIEW_DAYS: "365" })
    expect(days.auditLog).toBe(30)
    expect(days.rewindViews).toBe(365)
    expect(days.rewindLlmText).toBe(120)
  })

  it("never goes below the minimum of one day", () => {
    expect(MIN_RETENTION_DAYS).toBe(1)
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "0" }).auditLog).toBe(1)
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "-5" }).auditLog).toBe(1)
  })

  it("keeps the default for an empty or unreadable value", () => {
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "" }).auditLog).toBe(400)
    expect(retentionDays({ RETENTION_AUDIT_LOG_DAYS: "forever" }).auditLog).toBe(400)
  })

  it("reads process.env through the environment schema", () => {
    process.env.RETENTION_DISCORD_COMMAND_LOG_DAYS = "14"
    try {
      expect(retentionDays().discordCommandLog).toBe(14)
    } finally {
      delete process.env.RETENTION_DISCORD_COMMAND_LOG_DAYS
    }
  })
})

describe("lastExpiredPreviousDataYear", () => {
  it("keeps a season's replaced Rewinds until 30 June of the next year", () => {
    expect(lastExpiredPreviousDataYear(new Date("2027-06-30T23:59:59Z"))).toBe(2025)
    expect(lastExpiredPreviousDataYear(new Date("2027-07-01T00:00:00Z"))).toBe(2026)
    expect(lastExpiredPreviousDataYear(new Date("2027-01-15T00:00:00Z"))).toBe(2025)
  })
})

describe("docs/privacy.md", () => {
  const doc = readFileSync(path.join(__dirname, "../../../docs/privacy.md"), "utf8")

  it.each(Object.values(RETENTION_WINDOWS).map((def) => [def.env]))("names %s", (name) => {
    expect(doc).toContain(name)
  })
})
