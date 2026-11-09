/**
 * @jest-environment node
 */

/**
 * The warning email job's send-time checks: each cancel code, in order, and
 * each reason a member cannot get the email.
 */

import { noticeCancelCode, noticeRecipient } from "@/lib/inactivity/notice-checks"
import type { NoticeRow } from "@/lib/inactivity/notices"
import type { InactivityMember } from "@/lib/inactivity/rules"

const TORONTO = "America/Toronto"
/** 20:00 on May 1 in Toronto: the due time is 20:00 on October 28. */
const LAST_PLAY = new Date("2026-05-02T00:00:00Z")
/** 00:00 on October 28 in Toronto. */
const REMOVE_AFTER = new Date("2026-10-28T04:00:00Z")
/** The 02:17 run on September 28 in Toronto. */
const PLANNED = new Date("2026-09-28T06:17:00Z")
/** 09:00 on September 28 in Toronto. */
const MORNING = new Date("2026-09-28T13:00:00Z")
const DAY = 86_400_000

const member = (patch: Partial<InactivityMember> = {}): InactivityMember => ({
  id: "u1",
  plexUserId: "42",
  isAdmin: false,
  role: null,
  inactivityExcluded: false,
  subscriptionStatus: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  lastSeenAt: LAST_PLAY,
  lastSeenReadAt: null,
  accessEndedAt: null,
  accessRestoredAt: null,
  timezone: TORONTO,
  ...patch,
})

const notice = (patch: Partial<NoticeRow & { createdAt: Date; updatedAt: Date }> = {}) => ({
  id: "n1",
  userId: "u1",
  cycleAt: LAST_PLAY,
  leadDays: 30,
  removeAfter: REMOVE_AFTER,
  status: "pending",
  attempts: 0,
  zone: TORONTO,
  handledAt: null,
  createdAt: PLANNED,
  updatedAt: PLANNED,
  ...patch,
})

type Check = Parameters<typeof noticeCancelCode>[0]

const check = (patch: Partial<Check> = {}): Check => {
  const row = patch.notice ?? notice()
  return {
    notice: row,
    member: member(),
    rows: [row],
    removalEnabled: true,
    thresholdDays: 180,
    warningsEnabled: true,
    warningDays: [30, 7, 1],
    serverZone: TORONTO,
    ownerPlexUserId: "1",
    newestRun: { blocked: null, finishedAt: new Date(PLANNED.getTime() - DAY) },
    now: MORNING,
    ...patch,
  }
}

describe("noticeCancelCode", () => {
  it("lets a first warning go out on its send day", () => {
    expect(noticeCancelCode(check())).toBeNull()
  })

  it("cancels while removal or warnings are off, removal first", () => {
    expect(noticeCancelCode(check({ removalEnabled: false, warningsEnabled: false }))).toBe("removal_off")
    expect(noticeCancelCode(check({ warningsEnabled: false }))).toBe("warnings_off")
  })

  it("cancels when a play or a return started a new cycle", () => {
    expect(noticeCancelCode(check({ member: member({ lastSeenAt: new Date(MORNING.getTime() - DAY) }) }))).toBe("cycle_changed")
    expect(noticeCancelCode(check({ member: member({ accessRestoredAt: new Date(MORNING.getTime() - DAY) }) }))).toBe("cycle_changed")
  })

  it.each<[string, Partial<InactivityMember>]>([
    ["an admin", { isAdmin: true }],
    ["the server owner", { plexUserId: " 1 " }],
    ["a role holder", { role: "support" }],
    ["a paying member", { subscriptionStatus: "ACTIVE" }],
    ["an excluded member", { inactivityExcluded: true }],
    ["a member with no Plex account", { plexUserId: null }],
  ])("cancels for %s, whom a skip protects", (_name, patch) => {
    expect(noticeCancelCode(check({ member: member(patch) }))).toBe("protected")
  })

  it("does not count not_read as protection: only a run reads Tautulli", () => {
    expect(noticeCancelCode(check({ member: member({ lastSeenReadAt: null }) }))).toBeNull()
  })

  it("cancels when the member's access ended after the row was made, not before", () => {
    expect(noticeCancelCode(check({ member: member({ accessEndedAt: new Date(PLANNED.getTime() + 1000) }) }))).toBe("access_ended")
    expect(noticeCancelCode(check({ member: member({ accessEndedAt: new Date(PLANNED.getTime() - DAY) }) }))).toBeNull()
  })

  it.each(["sync_failed", "tautulli_stale", "history_short"])("cancels after a later run that stopped on stale data (%s)", (blocked) => {
    expect(noticeCancelCode(check({ newestRun: { blocked, finishedAt: new Date(PLANNED.getTime() + 1000) } }))).toBe("stale_data")
  })

  it("sends after a stale run that finished before the row became pending: the run that planned it came later", () => {
    expect(noticeCancelCode(check({ newestRun: { blocked: "tautulli_stale", finishedAt: new Date(PLANNED.getTime() - 1000) } }))).toBeNull()
  })

  it("counts from the last time the row became pending, such as a release for a retry", () => {
    const stale = { blocked: "sync_failed", finishedAt: new Date(PLANNED.getTime() + 1000) }
    expect(noticeCancelCode(check({ notice: notice({ updatedAt: new Date(PLANNED.getTime() + 2000) }), newestRun: stale }))).toBeNull()
  })

  it("sends after a run blocked for another reason, with no finished run, or with no finish time", () => {
    expect(noticeCancelCode(check({ newestRun: { blocked: "over_limit", finishedAt: new Date(PLANNED.getTime() + 1000) } }))).toBeNull()
    expect(noticeCancelCode(check({ newestRun: null }))).toBeNull()
    expect(noticeCancelCode(check({ newestRun: { blocked: "tautulli_stale", finishedAt: null } }))).toBeNull()
  })

  it("cancels a row whose date a higher threshold moved later", () => {
    expect(noticeCancelCode(check({ thresholdDays: 240 }))).toBe("superseded")
  })

  it("keeps the row's date after a lower threshold", () => {
    expect(noticeCancelCode(check({ thresholdDays: 150 }))).toBeNull()
  })

  it("cancels a row that a later row of the cycle replaced", () => {
    const later = notice({ id: "n2", removeAfter: new Date(REMOVE_AFTER.getTime() + 2 * DAY), status: "sent", handledAt: PLANNED })
    expect(noticeCancelCode(check({ rows: [notice(), later] }))).toBe("superseded")
  })

  it("cancels a reminder that reaches its date, and sends it the day before", () => {
    const reminder = notice({ leadDays: 1 })
    expect(noticeCancelCode(check({ notice: reminder, now: new Date("2026-10-27T13:00:00Z") }))).toBeNull()
    expect(noticeCancelCode(check({ notice: reminder, now: new Date("2026-10-28T13:00:00Z") }))).toBe("late")
    expect(noticeCancelCode(check({ notice: notice({ leadDays: 7 }), now: new Date("2026-10-25T13:00:00Z") }))).toBeNull()
  })

  it("sends a first warning one day late, and cancels it more than one day late", () => {
    expect(noticeCancelCode(check({ now: new Date(MORNING.getTime() + DAY) }))).toBeNull()
    expect(noticeCancelCode(check({ now: new Date(MORNING.getTime() + 2 * DAY) }))).toBe("late")
  })

  it("counts a first warning's lateness from when it last became pending", () => {
    const revived = notice({ updatedAt: new Date(PLANNED.getTime() + 2 * DAY) })
    expect(noticeCancelCode(check({ notice: revived, now: new Date(MORNING.getTime() + 2 * DAY) }))).toBeNull()
  })
})

describe("noticeRecipient", () => {
  const user: Parameters<typeof noticeRecipient>[0] = { email: "member@example.com", disabledAt: null, inactivityEmailsOff: false }

  it("gives the stored address", () => {
    expect(noticeRecipient(user)).toEqual({ email: "member@example.com" })
  })

  it.each<[string, Partial<typeof user>, string]>([
    ["no address", { email: null }, "no_email"],
    ["an empty address", { email: "  " }, "no_email"],
    ["a user name", { email: "plexuser" }, "invalid_email"],
    ["two addresses", { email: "a@example.com,b@example.com" }, "invalid_email"],
    ["a line break", { email: "a@example.com\r\nBcc: b@example.com" }, "invalid_email"],
    ["a disabled member", { disabledAt: new Date() }, "disabled"],
    ["a member who turned the emails off", { inactivityEmailsOff: true }, "unsubscribed"],
  ])("skips %s", (_name, patch, skip) => {
    expect(noticeRecipient({ ...user, ...patch })).toEqual({ skip })
  })
})
