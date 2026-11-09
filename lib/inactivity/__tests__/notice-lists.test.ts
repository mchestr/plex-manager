/**
 * The admin warning lists over a fixed clock: the newest warning of a cycle,
 * why the app cannot email a member, and who waits for a date or gets a first
 * warning at the next daily run, warnings on and off, with the run's spread
 * of first warning dates.
 */

import { cannotEmail, latestNotice, openRemovalDay, warningLists, type ListContext, type MailFacts, type NoticeDetail } from "@/lib/inactivity/notice-lists"
import { CANNOT_EMAIL_LABELS, noticeStageLabel, noticeStatusLabel } from "@/lib/inactivity/notice-labels"
import { cycleState } from "@/lib/inactivity/notices"
import type { InactivityMember } from "@/lib/inactivity/rules"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"

const TORONTO = "America/Toronto"
const LEADS = [30, 7, 1]
const at = (day: string, time = "12:00") => wallTimeToInstant(`${day}T${time}`, TORONTO)
const start = (day: string) => wallTimeToInstant(`${day}T00:00`, TORONTO)

/** Last played 2026-05-01 at 20:00 in Toronto: due 2026-10-28 at 20:00 with a threshold of 180. */
function member(id: string, patch: Partial<InactivityMember> = {}): InactivityMember {
  return {
    id,
    plexUserId: `plex-${id}`,
    isAdmin: false,
    role: null,
    inactivityExcluded: false,
    subscriptionStatus: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    lastSeenAt: at("2026-05-01", "20:00"),
    lastSeenReadAt: null,
    accessEndedAt: null,
    accessRestoredAt: null,
    timezone: TORONTO,
    ...patch,
  }
}

let rowId = 0
function row(owner: InactivityMember, patch: Partial<NoticeDetail> & Pick<NoticeDetail, "leadDays" | "removeAfter">): NoticeDetail {
  rowId += 1
  return {
    id: `n${rowId}`,
    userId: owner.id,
    cycleAt: owner.lastSeenAt ?? owner.createdAt,
    status: "sent",
    code: null,
    attempts: 1,
    zone: TORONTO,
    handledAt: at("2026-09-28", "09:00"),
    updatedAt: at("2026-09-28", "09:00"),
    ...patch,
  }
}

const context = (now: Date, patch: Partial<ListContext> = {}): ListContext => ({
  now,
  thresholdDays: 180,
  warningDays: LEADS,
  serverZone: TORONTO,
  newestPlayAt: null,
  sharedMembers: 40,
  warningsOn: false,
  ...patch,
})

const lists = (entries: { member: InactivityMember; rows?: NoticeDetail[] }[], ctx: ListContext) => {
  const { waiting, firstWarnings } = warningLists(
    entries.map(({ member, rows }) => ({ member, rows: rows ?? [] })),
    ctx
  )
  return {
    waiting: waiting.map((entry) => ({ id: entry.member.id, day: entry.removalDay, last: entry.last })),
    first: firstWarnings.map((entry) => ({ id: entry.member.id, day: entry.removalDay })),
  }
}

describe("latestNotice", () => {
  it("is null without rows", () => {
    expect(latestNotice([], LEADS)).toBeNull()
  })

  it("takes the latest removal date, then the smallest lead, and says when it was handled or planned", () => {
    const m = member("m1")
    const rows = [
      row(m, { leadDays: 30, removeAfter: start("2026-10-28") }),
      row(m, { leadDays: 1, removeAfter: start("2026-10-28"), status: "pending", handledAt: null, updatedAt: at("2026-10-27", "02:17") }),
      row(m, { leadDays: 7, removeAfter: start("2026-10-28"), handledAt: at("2026-10-21", "09:00") }),
      row(m, { leadDays: 30, removeAfter: start("2026-10-20"), status: "cancelled", code: "superseded" }),
    ]

    expect(latestNotice(rows, LEADS)).toEqual({ leadDays: 1, lastWarning: true, status: "pending", code: null, at: at("2026-10-27", "02:17") })
    expect(latestNotice(rows.slice(0, 1), LEADS)).toEqual({ leadDays: 30, lastWarning: false, status: "sent", code: null, at: at("2026-09-28", "09:00") })
    // A smaller lead than the smallest saved one is a last warning too
    expect(latestNotice(rows.slice(2, 3), [30, 14, 7])).toMatchObject({ leadDays: 7, lastWarning: true })
  })

  it("dates a revived or failed row by its last change, not by when a run first made it", () => {
    const m = member("m1")
    // Cancelled for stale data, then put back to pending by the Oct 24 run
    const revived = row(m, { leadDays: 7, removeAfter: start("2026-10-28"), status: "pending", handledAt: null, updatedAt: at("2026-10-24", "02:17") })
    const failed = row(m, { leadDays: 7, removeAfter: start("2026-10-28"), status: "failed", code: "smtp", handledAt: null, updatedAt: at("2026-10-21", "09:05") })

    expect(latestNotice([revived], LEADS)).toMatchObject({ status: "pending", at: at("2026-10-24", "02:17") })
    expect(latestNotice([failed], LEADS)).toMatchObject({ status: "failed", code: "smtp", at: at("2026-10-21", "09:05") })
  })
})

describe("openRemovalDay", () => {
  const ctx = { thresholdDays: 180, serverZone: TORONTO }
  const runAt = at("2026-10-30", "02:17")

  it("takes the date of the active rows with warnings on, until it is more than 7 days old", () => {
    const m = member("m1")
    const rows = [row(m, { leadDays: 7, removeAfter: start("2026-10-29"), status: "pending", handledAt: null })]

    expect(openRemovalDay(cycleState(m, rows, ctx), { warningsOn: true, runAt })).toBe("2026-10-29")
    expect(openRemovalDay(cycleState(m, [], ctx), { warningsOn: true, runAt })).toBeNull()
    expect(openRemovalDay(cycleState(m, rows, ctx), { warningsOn: true, runAt: at("2026-11-06", "02:17") })).toBeNull()
  })

  it("takes only handled rows with warnings off, never before the due day", () => {
    const m = member("m1")
    const pending = row(m, { leadDays: 7, removeAfter: start("2026-11-05"), status: "pending", handledAt: null })
    const sent = row(m, { leadDays: 30, removeAfter: start("2026-10-20") })

    expect(openRemovalDay(cycleState(m, [pending], ctx), { warningsOn: false, runAt })).toBeNull()
    // The sent date is before the due day (Oct 28), so the due day holds
    expect(openRemovalDay(cycleState(m, [pending, sent], ctx), { warningsOn: false, runAt })).toBe("2026-10-28")
    // No grace while warnings are off: an old handled date still holds
    expect(openRemovalDay(cycleState(m, [sent], ctx), { warningsOn: false, runAt: at("2027-01-30", "02:17") })).toBe("2026-10-28")
  })
})

describe("cannotEmail", () => {
  const facts: MailFacts = { email: "member@example.com", disabledAt: null, inactivityEmailsOff: false, plexEmail: "member@example.com", plexRead: true }

  it.each([
    ["no address", { email: null }, "no_email"],
    ["a blank address", { email: "  " }, "no_email"],
    ["no @", { email: "member" }, "invalid_email"],
    ["two addresses", { email: "a@example.com, b@example.com" }, "invalid_email"],
    ["another plex.tv address", { plexEmail: "new@example.com" }, "email_unconfirmed"],
    ["no plex.tv address", { plexEmail: undefined }, "email_unconfirmed"],
    ["a disabled member", { disabledAt: new Date("2026-01-01T00:00:00Z") }, "disabled"],
    ["a member who turned the emails off", { inactivityEmailsOff: true }, "unsubscribed"],
    ["no address and disabled, the first check", { email: null, disabledAt: new Date("2026-01-01T00:00:00Z") }, "no_email"],
  ] as const)("names %s", (_case, patch, code) => {
    expect(cannotEmail({ ...facts, ...patch })).toBe(code)
  })

  it("checks the address against plex.tv only when the list was read", () => {
    expect(cannotEmail({ ...facts, plexEmail: undefined, plexRead: false })).toBeNull()
    expect(cannotEmail({ ...facts, email: "Member@Example.com" })).toBeNull()
  })

  it("names a mailbox the mail server refused, from the newest warning", () => {
    const last = { leadDays: 7, lastWarning: false, status: "skipped", code: "rejected", at: new Date() }
    expect(cannotEmail(facts, last)).toBe("rejected")
    expect(cannotEmail(facts, { ...last, status: "sent", code: null })).toBeNull()
    expect(cannotEmail(facts, { ...last, code: "unsubscribed" })).toBeNull()
  })
})

describe("warningLists", () => {
  it("projects a first warning at the next daily run, dated from that run's send day", () => {
    // 15:00 on Sep 27: the next run is Sep 28 at 02:17, whose send day is 30 days before the due day
    expect(lists([{ member: member("m1") }], context(at("2026-09-27", "15:00"))).first).toEqual([{ id: "m1", day: "2026-10-28" }])
    // A day earlier the due day is 31 days after the next run's send day: outside the window
    expect(lists([{ member: member("m1") }], context(at("2026-09-26", "15:00")))).toEqual({ waiting: [], first: [] })
  })

  it("lists a member with an open warning before their due day as waiting, with the newest warning", () => {
    const m = member("m1")
    const sent = row(m, { leadDays: 30, removeAfter: start("2026-10-28") })

    expect(lists([{ member: m, rows: [sent] }], context(at("2026-10-10")))).toEqual({
      waiting: [{ id: "m1", day: "2026-10-28", last: { leadDays: 30, lastWarning: false, status: "sent", code: null, at: sent.handledAt } }],
      first: [],
    })
  })

  it("lists a member with only an unhandled warning as waiting with warnings on, and in no list with warnings off", () => {
    const m = member("m1")
    const rows = [row(m, { leadDays: 30, removeAfter: start("2026-10-28"), status: "pending", handledAt: null })]

    expect(lists([{ member: m, rows }], context(at("2026-10-10")))).toEqual({ waiting: [], first: [] })
    expect(lists([{ member: m, rows }], context(at("2026-10-10"), { warningsOn: true })).waiting).toEqual([
      expect.objectContaining({ id: "m1", day: "2026-10-28" }),
    ])
  })

  it("keeps a member the gate lets through out of both lists, and holds them for the last warning with warnings on", () => {
    const m = member("m1")
    const rows = [row(m, { leadDays: 30, removeAfter: start("2026-10-28") })]

    expect(lists([{ member: m, rows }], context(at("2026-10-29")))).toEqual({ waiting: [], first: [] })
    expect(lists([{ member: m, rows }], context(at("2026-10-29"), { warningsOn: true })).waiting).toEqual([
      expect.objectContaining({ id: "m1", day: "2026-10-28" }),
    ])
  })

  it("gives a new first warning when the date is more than 7 days old, or the rows are of an older cycle", () => {
    const m = member("m1")
    const expired = [row(m, { leadDays: 1, removeAfter: start("2026-10-28") })]
    const older = [row(m, { leadDays: 30, removeAfter: start("2026-10-28"), cycleAt: at("2026-01-01") })]

    // The run on Nov 11 sends at 09:00 that day: 30 days later is Dec 11
    expect(lists([{ member: m, rows: expired }], context(at("2026-11-10"), { warningsOn: true }))).toEqual({
      waiting: [],
      first: [{ id: "m1", day: "2026-12-11" }],
    })
    expect(lists([{ member: m, rows: older }], context(at("2026-11-10")))).toEqual({ waiting: [], first: [{ id: "m1", day: "2026-12-11" }] })
  })

  it("sorts the waiting by date then the longest inactive, and spreads the first warnings over the removal runs", () => {
    // Due Oct 17 and Oct 28, and Sep 28 (inactive, held for the Oct 29 date a warning named)
    const early = member("early", { lastSeenAt: at("2026-04-20") })
    const late = member("late")
    const late2 = member("late2", { lastSeenAt: at("2026-04-01") })
    const waiting = lists(
      [
        { member: late, rows: [row(late, { leadDays: 30, removeAfter: start("2026-10-29") })] },
        { member: late2, rows: [row(late2, { leadDays: 30, removeAfter: start("2026-10-29") })] },
        { member: early, rows: [row(early, { leadDays: 30, removeAfter: start("2026-10-20") })] },
      ],
      context(at("2026-10-10"))
    ).waiting
    expect(waiting.map((entry) => entry.id)).toEqual(["early", "late2", "late"])

    // Three past due with 40 shared: a run may remove 2, then 1 of the 38 left, so the third gets the next day
    const pastDue = ["c", "a", "b"].map((id, i) => member(id, { lastSeenAt: at(`2026-01-0${i + 1}`) }))
    const { first } = lists(
      pastDue.map((m) => ({ member: m })),
      context(at("2026-11-10"))
    )
    expect(first).toEqual([
      { id: "c", day: "2026-12-11" },
      { id: "a", day: "2026-12-11" },
      { id: "b", day: "2026-12-12" },
    ])
  })
})

describe("notice labels", () => {
  it("names each reason, stage and status", () => {
    expect(CANNOT_EMAIL_LABELS.email_unconfirmed).toBe("Not the plex.tv address")
    expect(noticeStageLabel({ leadDays: 30, lastWarning: false })).toBe("30-day warning")
    expect(noticeStageLabel({ leadDays: 1, lastWarning: true })).toBe("Last warning")
    expect(noticeStatusLabel({ status: "pending", code: null })).toBe("Waiting to send")
    expect(noticeStatusLabel({ status: "skipped", code: "no_email" })).toBe("Skipped (no_email)")
    expect(noticeStatusLabel({ status: "unknown", code: null })).toBe("unknown")
  })
})
