import { cannotEmail } from "@/lib/inactivity/notice-lists"
import { planWarnings } from "@/lib/inactivity/notice-plan"
import { emailUnconfirmed, nextDailyRun, noticeSendDay, removalRunDay } from "@/lib/inactivity/notices"
import { inactivitySkip } from "@/lib/inactivity/rules"

describe("JSDoc Documentation Examples", () => {
  it("inactivitySkip: a member no rule protects, and the server owner", () => {
    const member = { id: "u1", plexUserId: "42", isAdmin: false, role: null, inactivityExcluded: false,
      subscriptionStatus: null, createdAt: new Date("2025-01-01"), lastSeenAt: null, lastSeenReadAt: new Date("2026-10-31"),
      accessEndedAt: null, accessRestoredAt: null, timezone: null }
    expect(inactivitySkip(member, { ownerPlexUserId: "1", readSince: new Date("2026-10-31") })).toBeNull()
    expect(inactivitySkip({ ...member, plexUserId: " 1 " }, { ownerPlexUserId: "1", readSince: null })).toBe("owner")
  })

  it("noticeSendDay: the send day of a 02:17 Toronto run in three zones", () => {
    expect(noticeSendDay(new Date("2026-12-10T07:17:00Z"), "America/Toronto")).toBe("2026-12-10")
    expect(noticeSendDay(new Date("2026-12-10T07:17:00Z"), "America/Vancouver")).toBe("2026-12-10")
    expect(noticeSendDay(new Date("2026-12-10T12:00:00Z"), "Asia/Tokyo")).toBe("2026-12-11")
  })

  it("removalRunDay: the run at 02:17 follows midnight, and an instant after it waits for the next day", () => {
    expect(removalRunDay(new Date("2026-12-11T05:00:00Z"), "America/Toronto")).toBe("2026-12-11")
    expect(removalRunDay(new Date("2026-12-11T08:00:00Z"), "America/Toronto")).toBe("2026-12-12")
  })

  it("emailUnconfirmed: case does not count, another address does, no address is not checked", () => {
    expect(emailUnconfirmed("Member@Example.com", "member@example.com")).toBe(false)
    expect(emailUnconfirmed("old@example.com", "new@example.com")).toBe(true)
    expect(emailUnconfirmed(null, "member@example.com")).toBe(false)
  })

  it("planWarnings: the first warning goes out 30 days before the due day", () => {
    const member = { id: "u1", plexUserId: "42", isAdmin: false, role: null, inactivityExcluded: false,
      subscriptionStatus: null, createdAt: new Date("2025-01-01T00:00:00Z"), lastSeenAt: new Date("2026-05-02T00:00:00Z"),
      lastSeenReadAt: null, accessEndedAt: null, accessRestoredAt: null, timezone: "America/Toronto" }
    const plans = planWarnings([{ member, rows: [] }], { now: new Date("2026-09-28T06:17:00Z"), thresholdDays: 180,
      warningDays: [30, 7, 1], serverZone: "America/Toronto", newestPlayAt: null, sharedMembers: 40 })
    expect(plans).toEqual([expect.objectContaining({ userId: "u1", leadDays: 30, removeAfter: new Date("2026-10-28T04:00:00.000Z"), reviveId: null })])
  })

  it("nextDailyRun: after the 02:17 run, the next one is the next day", () => {
    expect(nextDailyRun(new Date("2026-12-11T15:00:00Z"), "America/Toronto")).toEqual(new Date("2026-12-12T07:17:00.000Z"))
  })

  it("cannotEmail: one good address, then each reason", () => {
    const facts = { email: "member@example.com", disabledAt: null, inactivityEmailsOff: false, plexEmail: "member@example.com", plexRead: true }
    expect(cannotEmail(facts)).toBeNull()
    expect(cannotEmail({ ...facts, email: null })).toBe("no_email")
    expect(cannotEmail({ ...facts, plexEmail: "new@example.com" })).toBe("email_unconfirmed")
    expect(cannotEmail({ ...facts, inactivityEmailsOff: true })).toBe("unsubscribed")
  })
})
