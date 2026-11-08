/**
 * The warning rules over a fixed clock: the date helpers in four zones and
 * across clock changes, the removal gate with warnings on and off, the
 * planner's steps, every case of the plan's worked examples, and a
 * simulation of daily runs that checks the rules R1 to R8 on every removal.
 */

import { planWarnings, type NoticePlan, type PlanContext } from "@/lib/inactivity/notice-plan"
import {
  addDays,
  currentCycle,
  cycleState,
  daysBetween,
  emailUnconfirmed,
  isSingleAddress,
  MAX_NOTICE_ATTEMPTS,
  NOTICE_CODES,
  NOTICE_STATUSES,
  noticeCycleClosed,
  noticeSendDay,
  removalGate,
  removalRunDay,
  startOfDay,
  type GateContext,
  type NoticeRow,
} from "@/lib/inactivity/notices"
import { scheduledRunLimit, type InactivityMember } from "@/lib/inactivity/rules"
import { instantToWallTime, wallTimeToInstant } from "@/lib/utils/zoned-time"
import { nextSendWindow } from "@/lib/wrapped/notify/window"

const TORONTO = "America/Toronto"
const VANCOUVER = "America/Vancouver"
const TOKYO = "Asia/Tokyo"
const HONOLULU = "Pacific/Honolulu"
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const LEADS = [30, 7, 1]

/** 02:17 on `day` in Toronto: the daily run. */
const runAt = (day: string) => wallTimeToInstant(`${day}T02:17`, TORONTO)
const at = (day: string, time: string, zone = TORONTO) => wallTimeToInstant(`${day}T${time}`, zone)

/** The plan's member: last played 2026-05-01 at 20:00 in Toronto, so due 2026-10-28 at 20:00. */
function member(patch: Partial<InactivityMember> = {}): InactivityMember {
  return {
    id: "m1",
    plexUserId: "42",
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
function row(owner: InactivityMember, patch: Partial<NoticeRow> & Pick<NoticeRow, "leadDays" | "removeAfter">): NoticeRow {
  rowId += 1
  return {
    id: `n${rowId}`,
    userId: owner.id,
    cycleAt: owner.lastSeenAt ?? owner.createdAt,
    status: "sent",
    attempts: 1,
    zone: TORONTO,
    handledAt: null,
    ...patch,
  }
}

const context = (now: Date, patch: Partial<PlanContext> = {}): PlanContext => ({
  now,
  thresholdDays: 180,
  warningDays: LEADS,
  serverZone: TORONTO,
  newestPlayAt: new Date(now.getTime() - HOUR),
  sharedMembers: 40,
  ...patch,
})

const gateContext = (now: Date, patch: Partial<GateContext> = {}): GateContext => ({
  thresholdDays: 180,
  now,
  newestPlayAt: new Date(now.getTime() - HOUR),
  warnings: { warningDays: LEADS, serverZone: TORONTO },
  ...patch,
})

const plan = (m: InactivityMember, rows: NoticeRow[], ctx: PlanContext) => planWarnings([{ member: m, rows }], ctx)
const summary = (plans: NoticePlan[]) => plans.map((p) => ({ lead: p.leadDays, date: p.removeAfter.toISOString(), revive: p.reviveId }))

describe("the vocabulary", () => {
  it("lists every status and the closed code list of the plan", () => {
    expect(NOTICE_STATUSES).toEqual(["pending", "sending", "sent", "skipped", "failed", "cancelled"])
    expect(NOTICE_CODES).toEqual({
      skipped: ["no_email", "invalid_email", "email_unconfirmed", "disabled", "unsubscribed", "rejected"],
      failed: ["smtp", "smtp_refused", "timeout", "no_transport", "stalled"],
      cancelled: ["removal_off", "warnings_off", "cycle_changed", "protected", "access_ended", "stale_data", "superseded", "late"],
    })
    expect(MAX_NOTICE_ATTEMPTS).toBe(9)
  })
})

describe("date helpers", () => {
  it("counts calendar days across months, years and clock changes", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(daysBetween("2026-10-28", "2026-11-27")).toBe(30)
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2)
  })

  it.each([
    [TORONTO, "2026-12-10"],
    [VANCOUVER, "2026-12-10"],
    [TOKYO, "2026-12-10"],
    [HONOLULU, "2026-12-10"],
  ])("puts the send day of a 02:17 Toronto run in %s on %s", (zone, day) => {
    expect(noticeSendDay(runAt("2026-12-10"), zone)).toBe(day)
  })

  it("sends at once inside the window and the next morning after it closes", () => {
    expect(noticeSendDay(at("2026-12-10", "19:30"), TORONTO)).toBe("2026-12-10")
    expect(noticeSendDay(at("2026-12-10", "20:00"), TORONTO)).toBe("2026-12-11")
    expect(noticeSendDay(new Date("2026-12-10T12:00:00Z"), TOKYO)).toBe("2026-12-11")
  })

  it("finds the daily run at or after an instant, on a daylight saving day too", () => {
    expect(removalRunDay(at("2026-12-11", "00:00"), TORONTO)).toBe("2026-12-11")
    expect(removalRunDay(at("2026-12-11", "02:17"), TORONTO)).toBe("2026-12-11")
    expect(removalRunDay(at("2026-12-11", "02:18"), TORONTO)).toBe("2026-12-12")
    // 2026-11-01: Toronto's clocks go back from 02:00 to 01:00
    expect(removalRunDay(at("2026-11-01", "00:00"), TORONTO)).toBe("2026-11-01")
    expect(removalRunDay(at("2026-11-01", "03:00"), TORONTO)).toBe("2026-11-02")
    // A Los Angeles midnight is 03:00 in Toronto, after the run
    expect(removalRunDay(startOfDay("2026-12-11", "America/Los_Angeles"), TORONTO)).toBe("2026-12-12")
  })

  it("starts a day at its first instant where midnight does not happen", () => {
    // Havana moves its clocks from 00:00 to 01:00 on 2026-03-08
    expect(startOfDay("2026-03-08", "America/Havana").toISOString()).toBe("2026-03-08T05:00:00.000Z")
    expect(startOfDay("2026-11-01", TORONTO).toISOString()).toBe("2026-11-01T04:00:00.000Z")
  })
})

describe("cycleState", () => {
  it("takes the member zone for a cycle with no rows, and the server zone without one", () => {
    expect(cycleState(member({ timezone: TOKYO }), [], { thresholdDays: 180, serverZone: TORONTO }).zone).toBe(TOKYO)
    expect(cycleState(member({ timezone: null }), [], { thresholdDays: 180, serverZone: VANCOUVER }).zone).toBe(VANCOUVER)
  })

  it("keeps the zone stored on the cycle's rows when the member sets a new one", () => {
    const m = member({ timezone: TOKYO })
    const rows = [row(m, { leadDays: 30, removeAfter: startOfDay("2026-10-28", TORONTO), zone: TORONTO })]
    expect(cycleState(m, rows, { thresholdDays: 180, serverZone: TORONTO })).toMatchObject({ zone: TORONTO, dueDay: "2026-10-28", day: "2026-10-28" })
  })

  it("dates the cycle from the due day, or the latest date of its active rows", () => {
    const m = member()
    const later = row(m, { leadDays: 30, removeAfter: startOfDay("2026-12-11", TORONTO), status: "pending" })
    const cancelled = row(m, { leadDays: 30, removeAfter: startOfDay("2027-01-11", TORONTO), status: "cancelled" })
    const state = cycleState(m, [later, cancelled], { thresholdDays: 180, serverZone: TORONTO })
    expect(state.day).toBe("2026-12-11")
    expect(state.active).toEqual([later])
    expect(state.rows).toHaveLength(2)
  })

  it("leaves out rows of an earlier cycle and of other members", () => {
    const m = member()
    const old = row(m, { leadDays: 30, removeAfter: startOfDay("2026-01-01", TORONTO), cycleAt: new Date("2025-07-01T00:00:00Z") })
    const other = row(member({ id: "m2" }), { leadDays: 30, removeAfter: startOfDay("2026-10-28", TORONTO) })
    expect(currentCycle(m, [old, other])).toEqual([])
  })
})

describe("removalGate with warnings off", () => {
  const off = (now: Date) => gateContext(now, { warnings: null })

  it("is the sweep's own rule without rows, whatever the other inputs", () => {
    for (let days = 170; days < 190; days += 1) {
      const m = member({ lastSeenAt: new Date(runAt("2026-11-10").getTime() - days * DAY) })
      expect(removalGate(m, [], off(runAt("2026-11-10")))).toBe(days >= 180 ? null : "active")
      expect(removalGate(m, [], { ...off(runAt("2026-11-10")), newestPlayAt: null })).toBe(days >= 180 ? null : "active")
    }
  })

  it("keeps a date that a handled warning named (R4)", () => {
    const m = member()
    const rows = [row(m, { leadDays: 30, removeAfter: startOfDay("2026-12-11", TORONTO), handledAt: at("2026-11-11", "09:00") })]
    expect(removalGate(m, rows, off(runAt("2026-12-10")))).toBe("date")
    expect(removalGate(m, rows, off(runAt("2026-12-11")))).toBeNull()
  })

  it("ignores rows that were not handled, and rows of an earlier cycle", () => {
    const m = member()
    const rows = [
      row(m, { leadDays: 30, removeAfter: startOfDay("2026-12-11", TORONTO), status: "pending" }),
      row(m, { leadDays: 7, removeAfter: startOfDay("2026-12-11", TORONTO), status: "failed" }),
      row(m, { leadDays: 30, removeAfter: startOfDay("2027-01-11", TORONTO), handledAt: at("2026-06-01", "09:00"), cycleAt: new Date("2025-01-01T00:00:00Z") }),
    ]
    expect(removalGate(m, rows, off(runAt("2026-11-10")))).toBeNull()
  })
})

describe("removalGate with warnings on", () => {
  const m = member()
  const D = startOfDay("2026-10-28", TORONTO)
  const sent = (leadDays: number, handledAt: Date, patch: Partial<NoticeRow> = {}) => row(m, { leadDays, removeAfter: D, handledAt, ...patch })
  const warned = () => [sent(30, at("2026-09-28", "09:00")), sent(7, at("2026-10-21", "09:00")), sent(1, at("2026-10-27", "09:00"))]

  it.each<[string, Date, () => NoticeRow[], Partial<GateContext>, ReturnType<typeof removalGate>]>([
    ["not inactive yet", runAt("2026-10-28"), warned, {}, "active"],
    ["no warning yet", runAt("2026-11-10"), () => [], {}, "unwarned"],
    ["only a pending first warning", runAt("2026-10-29"), () => [sent(30, at("2026-09-28", "09:00"), { status: "pending", handledAt: null })], {}, "last_warning"],
    ["a removal date in the future", runAt("2026-10-29"), () => [sent(30, at("2026-09-28", "09:00"), { removeAfter: startOfDay("2026-11-02", TORONTO) })], {}, "date"],
    ["a failed last warning", runAt("2026-10-29"), () => [...warned().slice(0, 2), sent(1, at("2026-10-27", "09:00"), { status: "failed", handledAt: null })], {}, "last_warning"],
    ["a last warning less than 12 hours old", runAt("2026-10-29"), () => [...warned().slice(0, 2), sent(1, at("2026-10-28", "19:30"))], {}, "notice"],
    ["no play on the server after the last warning", runAt("2026-10-29"), warned, { newestPlayAt: at("2026-10-27", "08:00") }, "idle"],
    ["no play on the server at all", runAt("2026-10-29"), warned, { newestPlayAt: null }, "idle"],
    ["a date that started more than 7 days ago", runAt("2026-11-05"), warned, {}, "expired"],
    ["a full set of warnings", runAt("2026-10-29"), warned, {}, null],
    ["a full set, 7 days into the grace", runAt("2026-11-04"), warned, {}, null],
  ])("holds a member with %s", (_name, now, rows, patch, hold) => {
    expect(removalGate(m, rows(), gateContext(now, patch))).toBe(hold)
  })

  it("counts a skipped last warning as handled (R8)", () => {
    const rows = [...warned().slice(0, 2), sent(1, at("2026-10-27", "09:00"), { status: "skipped" })]
    expect(removalGate(m, rows, gateContext(runAt("2026-10-29")))).toBeNull()
  })

  it("counts a smaller lead than the smallest as a last warning, and a larger one not", () => {
    const smaller = [sent(30, at("2026-09-28", "09:00")), sent(1, at("2026-10-27", "09:00"))]
    expect(removalGate(m, smaller, gateContext(runAt("2026-10-29"), { warnings: { warningDays: [30, 2], serverZone: TORONTO } }))).toBeNull()
    expect(removalGate(m, [sent(30, at("2026-09-28", "09:00")), sent(7, at("2026-10-21", "09:00"))], gateContext(runAt("2026-10-29")))).toBe("last_warning")
  })

  it("needs the last warning for the current date, not an older one", () => {
    const rows = [...warned(), row(m, { leadDays: 7, removeAfter: startOfDay("2026-11-27", TORONTO), status: "pending" })]
    expect(removalGate(m, rows, gateContext(runAt("2026-11-28"), { thresholdDays: 210 }))).toBe("last_warning")
  })
})

describe("planWarnings steps", () => {
  const m = member()

  it("plans nothing outside the window, and a first warning on its edge", () => {
    expect(plan(m, [], context(runAt("2026-09-27")))).toEqual([])
    expect(summary(plan(m, [], context(runAt("2026-09-28"))))).toEqual([{ lead: 30, date: startOfDay("2026-10-28", TORONTO).toISOString(), revive: null }])
  })

  it("stores the cycle, the zone and the member on the plan", () => {
    expect(plan(member({ timezone: VANCOUVER }), [], context(runAt("2026-09-28")))).toEqual([
      { userId: "m1", cycleAt: m.lastSeenAt, leadDays: 30, removeAfter: startOfDay("2026-10-28", VANCOUVER), zone: VANCOUVER, reviveId: null },
    ])
  })

  it("plans each stage once, on its day", () => {
    const first = row(m, { leadDays: 30, removeAfter: startOfDay("2026-10-28", TORONTO), handledAt: at("2026-09-28", "09:00") })
    expect(plan(m, [first], context(runAt("2026-10-20")))).toEqual([])
    expect(summary(plan(m, [first], context(runAt("2026-10-21"))))).toEqual([{ lead: 7, date: first.removeAfter.toISOString(), revive: null }])
    const reminder = row(m, { leadDays: 7, removeAfter: first.removeAfter, status: "pending" })
    expect(plan(m, [first, reminder], context(runAt("2026-10-22")))).toEqual([])
  })

  it("sends only the most urgent stage after missed runs", () => {
    const first = row(m, { leadDays: 30, removeAfter: startOfDay("2026-10-28", TORONTO), handledAt: at("2026-09-28", "09:00") })
    expect(summary(plan(m, [first], context(runAt("2026-10-25"))))).toEqual([{ lead: 7, date: first.removeAfter.toISOString(), revive: null }])
    expect(summary(plan(m, [first], context(runAt("2026-10-27"))))).toEqual([{ lead: 1, date: first.removeAfter.toISOString(), revive: null }])
  })

  it("plans a new last warning when the one for the date is not handled (R6)", () => {
    const D = startOfDay("2026-10-28", TORONTO)
    const rows = [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-09-28", "09:00") }), row(m, { leadDays: 1, removeAfter: D, status: "failed", handledAt: null })]
    expect(summary(plan(m, rows, context(runAt("2026-10-28"))))).toEqual([{ lead: 1, date: startOfDay("2026-10-29", TORONTO).toISOString(), revive: null }])
  })

  it("plans one new last warning a cycle when no one played after it (R7)", () => {
    const D = startOfDay("2026-10-28", TORONTO)
    const rows = [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-09-28", "09:00") }), row(m, { leadDays: 1, removeAfter: D, handledAt: at("2026-10-27", "09:00") })]
    const idle = { newestPlayAt: at("2026-10-27", "08:00") }
    expect(plan(m, rows, context(runAt("2026-10-29"), { newestPlayAt: at("2026-10-28", "08:00") }))).toEqual([])
    expect(summary(plan(m, rows, context(runAt("2026-10-29"), idle)))).toEqual([{ lead: 1, date: startOfDay("2026-10-30", TORONTO).toISOString(), revive: null }])
    // Less than 12 hours after a late last warning: wait for the next run
    const late = [rows[0], { ...rows[1], handledAt: at("2026-10-27", "19:30") }]
    expect(plan(m, late, context(runAt("2026-10-28"), { newestPlayAt: at("2026-10-27", "08:00") }))).toEqual([])

    const again = [...rows, row(m, { leadDays: 1, removeAfter: startOfDay("2026-10-30", TORONTO), handledAt: at("2026-10-29", "09:00") })]
    expect(plan(m, again, context(runAt("2026-10-31"), idle))).toEqual([])
  })

  it("starts the warnings again when the date started more than 7 days ago (R5)", () => {
    const D = startOfDay("2026-10-28", TORONTO)
    const rows = [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-09-28", "09:00") }), row(m, { leadDays: 1, removeAfter: D, handledAt: at("2026-10-27", "09:00") })]
    expect(plan(m, rows, context(runAt("2026-11-04")))).toEqual([])
    expect(summary(plan(m, rows, context(runAt("2026-11-05"))))).toEqual([{ lead: 30, date: startOfDay("2026-12-05", TORONTO).toISOString(), revive: null }])
  })

  it("revives a cancelled row or a failed row with attempts left, and leaves one at 9 attempts", () => {
    const D = startOfDay("2026-10-28", TORONTO)
    const first = row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-09-28", "09:00") })
    const failed = row(m, { leadDays: 7, removeAfter: D, status: "failed", attempts: 3 })
    expect(summary(plan(m, [first, failed], context(runAt("2026-10-22"))))).toEqual([{ lead: 7, date: D.toISOString(), revive: failed.id }])
    expect(plan(m, [first, { ...failed, attempts: MAX_NOTICE_ATTEMPTS }], context(runAt("2026-10-22")))).toEqual([])
    const cancelled = { ...failed, status: "cancelled" }
    expect(summary(plan(m, [first, cancelled], context(runAt("2026-10-22"))))).toEqual([{ lead: 7, date: D.toISOString(), revive: failed.id }])
  })

  it("keeps the date when the threshold goes down, and moves it later when it goes up (R3)", () => {
    const D = startOfDay("2026-12-11", TORONTO)
    const rows = [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-11-11", "09:00") })]
    // 150 days: due on Sep 28, long past, but the date stays Dec 11
    expect(summary(plan(m, rows, context(runAt("2026-12-04"), { thresholdDays: 150 })))).toEqual([{ lead: 7, date: D.toISOString(), revive: null }])
    const reminded = [...rows, row(m, { leadDays: 7, removeAfter: D, handledAt: at("2026-12-04", "09:00") })]
    expect(plan(m, reminded, context(runAt("2026-12-05"), { thresholdDays: 150 }))).toEqual([])
    expect(summary(plan(m, reminded, context(runAt("2026-12-10"), { thresholdDays: 150 })))).toEqual([{ lead: 1, date: D.toISOString(), revive: null }])
    // 240 days: due day 2026-12-27, 22 days left on Dec 5, so email 1 for the new date
    expect(summary(plan(m, rows, context(runAt("2026-12-05"), { thresholdDays: 240 })))).toEqual([
      { lead: 30, date: startOfDay("2026-12-27", TORONTO).toISOString(), revive: null },
    ])
    // 300 days: the new date is too far away for any stage yet
    expect(plan(m, rows, context(runAt("2026-12-05"), { thresholdDays: 300 }))).toEqual([])
  })

  it("adds a stage for a lead added to an open cycle, and blocks a duplicate with a smaller lead", () => {
    const D = startOfDay("2026-10-28", TORONTO)
    const rows = [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-09-28", "09:00") }), row(m, { leadDays: 7, removeAfter: D, handledAt: at("2026-10-21", "09:00") })]
    expect(summary(plan(m, rows, context(runAt("2026-10-25"), { warningDays: [30, 14, 3, 1] })))).toEqual([{ lead: 3, date: D.toISOString(), revive: null }])
    expect(plan(m, rows, context(runAt("2026-10-24"), { warningDays: [30, 14, 1] }))).toEqual([])
  })

  it("starts a new cycle after a play, with no rows of the old one in the way", () => {
    const old = [row(m, { leadDays: 30, removeAfter: startOfDay("2026-10-28", TORONTO), handledAt: at("2026-09-28", "09:00") })]
    const played = member({ lastSeenAt: at("2026-10-01", "20:00") })
    expect(plan(played, old, context(runAt("2026-10-21")))).toEqual([])
  })

  it("spreads first warnings over the safety limit, the longest inactive first", () => {
    const now = runAt("2026-11-11")
    const batch = Array.from({ length: 5 }, (_, i) => member({ id: `m${i}`, lastSeenAt: new Date(now.getTime() - (300 + i) * DAY) }))
    const plans = planWarnings(
      batch.map((m) => ({ member: m, rows: [] })),
      context(now, { sharedMembers: 40 })
    )
    expect(plans.map((p) => [p.userId, p.removeAfter.toISOString()])).toEqual([
      ["m4", startOfDay("2026-12-11", TORONTO).toISOString()],
      ["m3", startOfDay("2026-12-11", TORONTO).toISOString()],
      // 5% of the 38 members left after Dec 11 is 1
      ["m2", startOfDay("2026-12-12", TORONTO).toISOString()],
      ["m1", startOfDay("2026-12-13", TORONTO).toISOString()],
      ["m0", startOfDay("2026-12-14", TORONTO).toISOString()],
    ])
  })

  it("spreads restarts over the safety limit too (R5), the longest inactive first", () => {
    const D = startOfDay("2026-12-11", TORONTO)
    const batch = Array.from({ length: 5 }, (_, i) => member({ id: `r${i}`, lastSeenAt: new Date(at("2026-05-01", "20:00").getTime() - i * DAY) }))
    const warned = batch.map((m) => ({
      member: m,
      rows: [row(m, { leadDays: 30, removeAfter: D, handledAt: at("2026-11-11", "09:00") }), row(m, { leadDays: 1, removeAfter: D, handledAt: at("2026-12-10", "09:00") })],
    }))
    // Dec 18 is still inside the grace: it is the sweep's turn, not the planner's
    expect(planWarnings(warned, context(runAt("2026-12-18")))).toEqual([])
    const plans = planWarnings(warned, context(runAt("2026-12-19")))
    expect(plans.map((p) => [p.userId, p.leadDays, dayKeyOf(p.removeAfter, TORONTO), p.reviveId])).toEqual([
      ["r4", 30, "2027-01-18", null],
      ["r3", 30, "2027-01-18", null],
      ["r2", 30, "2027-01-19", null],
      ["r1", 30, "2027-01-20", null],
      ["r0", 30, "2027-01-21", null],
    ])
  })

  it("counts open cycles toward the removal runs, and lets a new last warning ignore the count", () => {
    const now = runAt("2026-11-11")
    const waiting = Array.from({ length: 2 }, (_, i) => member({ id: `w${i}`, lastSeenAt: new Date(now.getTime() - 400 * DAY) }))
    const waitingRows = waiting.map((m) => row(m, { leadDays: 30, removeAfter: startOfDay("2026-12-11", TORONTO), handledAt: at("2026-11-10", "09:00") }))
    const fresh = member({ id: "new", lastSeenAt: new Date(now.getTime() - 300 * DAY) })
    const plans = planWarnings([...waiting.map((m, i) => ({ member: m, rows: [waitingRows[i]] })), { member: fresh, rows: [] }], context(now))
    expect(plans.map((p) => [p.userId, p.removeAfter.toISOString()])).toEqual([["new", startOfDay("2026-12-12", TORONTO).toISOString()]])
  })
})

describe("the address check", () => {
  it.each([
    ["member@example.com", true],
    ["a@b", true],
    ["no-at-sign", false],
    ["two@@example.com", false],
    ["a@example.com, b@example.com", false],
    ["<a@example.com>", false],
    ["a@example.com\r\nBcc: b@example.com", false],
    [" a@example.com", false],
  ])("treats %p as one address: %p", (value, expected) => {
    expect(isSingleAddress(value)).toBe(expected)
  })

  it("flags only one address that differs from the plex.tv email", () => {
    expect(emailUnconfirmed("Member@Example.com", "member@example.com")).toBe(false)
    expect(emailUnconfirmed("old@example.com", "new@example.com")).toBe(true)
    expect(emailUnconfirmed("member@example.com", undefined)).toBe(true)
    expect(emailUnconfirmed(null, "member@example.com")).toBe(false)
    expect(emailUnconfirmed("not an address", "member@example.com")).toBe(false)
  })
})

describe("noticeCycleClosed", () => {
  const user = { lastSeenAt: new Date("2026-05-01T00:00:00Z"), createdAt: new Date("2025-01-01T00:00:00Z"), accessRestoredAt: null, accessEndedAt: null }
  const notice = { cycleAt: new Date("2026-05-01T00:00:00Z"), createdAt: new Date("2026-09-28T00:00:00Z") }

  it("is open while the cycle goes on, at any age", () => {
    expect(noticeCycleClosed(notice, user)).toBe(false)
    expect(noticeCycleClosed(notice, { ...user, accessEndedAt: new Date("2026-09-01T00:00:00Z") })).toBe(false)
  })

  it("is closed after a play, a return, or an end of access after the row", () => {
    expect(noticeCycleClosed(notice, { ...user, lastSeenAt: new Date("2026-10-01T00:00:00Z") })).toBe(true)
    expect(noticeCycleClosed(notice, { ...user, accessRestoredAt: new Date("2026-10-01T00:00:00Z") })).toBe(true)
    expect(noticeCycleClosed(notice, { ...user, accessEndedAt: new Date("2026-10-29T00:00:00Z") })).toBe(true)
  })
})

/* ------------------------------------------------------------------------ */
/* Simulation: the planner, a model of the warning email job and the gate    */
/* over many daily runs. Every removal is checked against the rules.         */
/* ------------------------------------------------------------------------ */

interface SimMember {
  member: InactivityMember
  /** `User.email`; null for a member without an address. */
  email: string | null
  /** The plex.tv email of the share; the stored address by default. */
  plexEmail?: string
  /** Plays every evening at 20:00, server time. */
  playsDaily?: boolean
  /** Single plays. */
  plays?: Date[]
}

interface SimConfig {
  serverZone?: string
  start: string
  days: number
  threshold?: (day: string) => number
  leads?: number[]
  warnings?: (day: string) => boolean
  /** Automatic removal on; off means the sweep stops before the warning step. */
  removal?: (day: string) => boolean
  /** Whether the run on `day` happens at all. */
  runs?: (day: string) => boolean
  /** Whether anyone played on the server the evening before the run on `day`. */
  serverPlays?: (day: string) => boolean
  /** Whether the mail server refuses `row` on `day`. */
  sendFails?: (row: NoticeRow, day: string) => boolean
  /** Whether the safety limit blocks every removal of the run on `day` (`over_limit`). */
  limitBlocks?: (day: string) => boolean
  /** When `row`, sent on `day`, went out, if not at the send window (a late send after a Run now). */
  sentAt?: (row: NoticeRow, day: string) => Date | undefined
}

interface SimRemoval {
  id: string
  at: Date
  day: string
}

interface SimResult {
  removals: SimRemoval[]
  overLimit: string[]
  rows: (NoticeRow & { createdAt: Date })[]
  /** Each email that went out: member, lead, the date it named and the day it went out. */
  sent: { id: string; lead: number; date: string; sendDay: string; daysLeft: number }[]
  violations: string[]
}

const latest = (...dates: (Date | null | undefined)[]) => dates.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null)

function simulate(sims: SimMember[], config: SimConfig): SimResult {
  const zone = config.serverZone ?? TORONTO
  const leads = config.leads ?? LEADS
  const [largest, smallest] = [leads[0], leads[leads.length - 1]]
  const result: SimResult = { removals: [], overLimit: [], rows: [], sent: [], violations: [] }
  const removed = new Set<string>()
  const members = new Map(sims.map((sim) => [sim.member.id, { ...sim.member }]))
  const fail = (message: string) => result.violations.push(message)
  let serverPlay: Date | null = null
  let ids = 0

  for (let index = 0; index < config.days; index += 1) {
    const day = addDays(config.start, index)
    const now = wallTimeToInstant(`${day}T02:17`, zone)
    const evening = wallTimeToInstant(`${addDays(day, -1)}T20:00`, zone)
    if (config.serverPlays?.(day) ?? true) serverPlay = evening
    for (const sim of sims) {
      const m = members.get(sim.member.id)!
      const plays = [...(sim.plays ?? []).filter((play) => play < now), ...(sim.playsDaily ? [evening] : [])]
      m.lastSeenAt = latest(m.lastSeenAt, ...plays)
      serverPlay = latest(serverPlay, ...plays)
    }
    if (!(config.runs?.(day) ?? true) || !(config.removal?.(day) ?? true)) continue
    if (!serverPlay || now.getTime() - serverPlay.getTime() > 14 * DAY) continue

    const thresholdDays = config.threshold?.(day) ?? 180
    const warningsOn = config.warnings?.(day) ?? true
    const rules = warningsOn ? { warningDays: leads, serverZone: zone } : null
    const eligible = sims.filter((sim) => !removed.has(sim.member.id)).map((sim) => ({ sim, member: members.get(sim.member.id)! }))
    const rowsOf = (id: string) => result.rows.filter((row) => row.userId === id)

    if (rules) {
      const before = new Map(eligible.map(({ member: m }) => [m.id, cycleState(m, rowsOf(m.id), { thresholdDays, serverZone: zone })]))
      const plans = planWarnings(
        eligible.map(({ member: m }) => ({ member: m, rows: rowsOf(m.id) })),
        { ...rules, now, thresholdDays, newestPlayAt: serverPlay, sharedMembers: eligible.length }
      )
      for (const planned of plans) {
        const { sim } = eligible.find((entry) => entry.member.id === planned.userId)!
        const state = before.get(planned.userId)!
        const sendDay = noticeSendDay(now, planned.zone)
        const named = dayKeyOf(planned.removeAfter, planned.zone)
        // R3: dates never move earlier
        if (planned.removeAfter < state.removeAfter) fail(`${day} ${planned.userId}: date ${named} before ${state.day}`)
        const first = state.active.length === 0 || daysBetween(state.day, dayKeyOf(now, state.zone)) > 7
        // R2: a first warning gives the full lead
        if (first && (planned.leadDays !== largest || daysBetween(sendDay, named) < largest)) fail(`${day} ${planned.userId}: first warning ${named} too soon`)
        // Only the most urgent stage: a later warning never claims more days than its lead
        if (!first && daysBetween(sendDay, named) > planned.leadDays) fail(`${day} ${planned.userId}: lead ${planned.leadDays} for ${named}`)
        const unconfirmed = emailUnconfirmed(sim.email, sim.plexEmail ?? sim.email?.toLowerCase())
        const outcome = { status: unconfirmed ? "skipped" : "pending", handledAt: unconfirmed ? now : null }
        if (planned.reviveId) {
          Object.assign(result.rows.find((r) => r.id === planned.reviveId)!, outcome)
        } else if (!result.rows.some((r) => r.userId === planned.userId && r.cycleAt.getTime() === planned.cycleAt.getTime() && r.leadDays === planned.leadDays && r.removeAfter.getTime() === planned.removeAfter.getTime())) {
          ids += 1
          result.rows.push({ id: `s${ids}`, userId: planned.userId, cycleAt: planned.cycleAt, leadDays: planned.leadDays, removeAfter: planned.removeAfter, zone: planned.zone, attempts: 0, createdAt: now, ...outcome })
        }
      }
    }

    const gate: GateContext = { thresholdDays, now, newestPlayAt: serverPlay, warnings: rules }
    const candidates = eligible.filter(({ member: m }) => removalGate(m, rowsOf(m.id), gate) === null)
    const limit = config.limitBlocks?.(day) ? 0 : scheduledRunLimit(eligible.length)
    if (candidates.length > limit) result.overLimit.push(day)
    else {
      for (const { member: m } of candidates) {
        const cycle = currentCycle(m, rowsOf(m.id))
        const handled = cycle.filter((r) => (r.status === "sent" || r.status === "skipped") && r.handledAt)
        const named = latest(...handled.map((r) => r.removeAfter))
        if (now.getTime() - m.lastSeenAt!.getTime() < thresholdDays * DAY) fail(`${day} ${m.id}: removed while active`)
        // R1 and R4: never before a date that a handled warning named
        if (named && now < named) fail(`${day} ${m.id}: removed before ${named.toISOString()}`)
        if (rules) {
          const D = cycleState(m, cycle, { thresholdDays, serverZone: zone })
          const lastWarning = handled.filter((r) => r.leadDays <= smallest && r.removeAfter.getTime() === D.removeAfter.getTime())
          // R1: a handled last warning for the date, 12 hours before, with a play on the server after it
          if (!lastWarning.some((r) => now.getTime() - r.handledAt!.getTime() >= 12 * HOUR && serverPlay! > r.handledAt!)) fail(`${day} ${m.id}: no last warning`)
          if (now < D.removeAfter) fail(`${day} ${m.id}: removed before its date`)
          // R2: the cycle had a first warning with the full lead
          if (!handled.some((r) => r.leadDays === largest && daysBetween(dayKeyOf(r.handledAt!, r.zone), dayKeyOf(r.removeAfter, r.zone)) >= largest)) fail(`${day} ${m.id}: no full first warning`)
        }
        removed.add(m.id)
        result.removals.push({ id: m.id, at: now, day })
      }
    }

    // The job: each pending row, at the send window, with the plan's cancel rules
    for (const r of result.rows.filter((candidate) => candidate.status === "pending")) {
      const m = members.get(r.userId)!
      const sendAt = nextSendWindowOf(now, r.zone)
      const sendDay = dayKeyOf(sendAt, r.zone)
      const current = cycleState(m, rowsOf(m.id), { thresholdDays, serverZone: zone })
      const cancel = removed.has(m.id) || !warningsOn || r.cycleAt.getTime() !== current.cycleAt.getTime() || r.removeAfter < current.removeAfter || sendDay >= dayKeyOf(r.removeAfter, r.zone)
      if (cancel) r.status = "cancelled"
      else if (config.sendFails?.(r, day)) Object.assign(r, { status: "failed", attempts: r.attempts + 3 })
      else {
        Object.assign(r, { status: "sent", handledAt: config.sentAt?.(r, day) ?? sendAt, attempts: r.attempts + 1 })
        result.sent.push({ id: r.userId, lead: r.leadDays, date: dayKeyOf(r.removeAfter, r.zone), sendDay, daysLeft: daysBetween(sendDay, dayKeyOf(r.removeAfter, r.zone)) })
      }
    }
  }
  return result
}

const dayKeyOf = (instant: Date, zone: string) => instantToWallTime(instant, zone).slice(0, 10)
const nextSendWindowOf = nextSendWindow

/** A deterministic random number generator (mulberry32). */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const simMember = (id: string, lastSeenAt: Date, timezone: string | null, patch: Partial<SimMember> = {}): SimMember => ({
  member: member({ id, plexUserId: id, lastSeenAt, timezone }),
  email: `${id}@example.com`,
  ...patch,
})

describe("the plan's worked examples", () => {
  const normal = () => [simMember("m1", at("2026-05-01", "20:00"), TORONTO)]
  const emails = (result: SimResult) => result.sent.map((email) => `${email.sendDay} ${email.lead} ${email.date}`)

  it("normal: warnings on Sep 28, Oct 21 and Oct 27, removal at the Oct 29 run", () => {
    const result = simulate(normal(), { start: "2026-09-20", days: 45 })
    expect(emails(result)).toEqual(["2026-09-28 30 2026-10-28", "2026-10-21 7 2026-10-28", "2026-10-27 1 2026-10-28"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-10-29"])
    expect(result.violations).toEqual([])
  })

  it("warnings on from Nov 10: first warning Nov 11 for Dec 11, Dec 4 reminder, Dec 10 last warning, removal at the Dec 11 run", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40 })
    expect(emails(result)).toEqual(["2026-11-11 30 2026-12-11", "2026-12-04 7 2026-12-11", "2026-12-10 1 2026-12-11"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-11"])
    expect(result.violations).toEqual([])
  })

  it("the mail server is down on Dec 10: a new last warning for Dec 12, removal at the Dec 12 run (R6)", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40, sendFails: (r, day) => day === "2026-12-10" && r.leadDays === 1 })
    expect(emails(result).slice(-1)).toEqual(["2026-12-11 1 2026-12-12"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-12"])
    expect(result.violations).toEqual([])
  })

  it("the last warning goes out at 19:30 on Dec 10, after a Run now: the member waits, removal at the Dec 12 run", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40, sentAt: (r, day) => (day === "2026-12-10" && r.leadDays === 1 ? at("2026-12-10", "19:30") : undefined) })
    expect(emails(result)).toEqual(["2026-11-11 30 2026-12-11", "2026-12-04 7 2026-12-11", "2026-12-10 1 2026-12-11"])
    // The Dec 11 run comes less than 12 hours after it, so no new email either
    expect(result.rows.filter((r) => r.createdAt > runAt("2026-12-10"))).toEqual([])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-12"])
    expect(result.violations).toEqual([])
  })

  it("Plex is down after the last warning: a new last warning for Dec 12, removal at the Dec 12 run (R7)", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40, serverPlays: (day) => day !== "2026-12-11" })
    expect(emails(result).slice(-1)).toEqual(["2026-12-11 1 2026-12-12"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-12"])
    expect(result.violations).toEqual([])
  })

  it("threshold 150 on Dec 5: the date stays Dec 11", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40, threshold: (day) => (day >= "2026-12-05" ? 150 : 180) })
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-11"])
    expect(result.violations).toEqual([])
  })

  it("threshold 240 on Dec 5: email 1 for Dec 27, reminder Dec 20, last warning Dec 26, removal at the Dec 28 run", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 60, threshold: (day) => (day >= "2026-12-05" ? 240 : 180) })
    expect(emails(result)).toEqual([
      "2026-11-11 30 2026-12-11",
      "2026-12-04 7 2026-12-11",
      "2026-12-05 30 2026-12-27",
      "2026-12-20 7 2026-12-27",
      "2026-12-26 1 2026-12-27",
    ])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-28"])
    expect(result.violations).toEqual([])
  })

  it("the member plays on Dec 6: no more email and no removal", () => {
    const result = simulate([simMember("m1", at("2026-05-01", "20:00"), TORONTO, { plays: [at("2026-12-06", "21:00")] })], { start: "2026-11-11", days: 60 })
    expect(emails(result)).toEqual(["2026-11-11 30 2026-12-11", "2026-12-04 7 2026-12-11"])
    expect(result.removals).toEqual([])
  })

  it("the safety limit blocks removals from Dec 11: nothing new until Dec 19, which plans a first warning for Jan 18 (R5)", () => {
    const blocked = (day: string) => day >= "2026-12-11" && day <= "2026-12-18"
    const result = simulate(normal(), { start: "2026-11-11", days: 80, limitBlocks: blocked })
    expect(result.overLimit).toEqual(Array.from({ length: 8 }, (_, i) => addDays("2026-12-11", i)))
    expect(result.rows.filter((r) => r.createdAt > runAt("2026-12-10") && r.createdAt < runAt("2026-12-19"))).toEqual([])
    expect(emails(result)).toEqual([
      "2026-11-11 30 2026-12-11",
      "2026-12-04 7 2026-12-11",
      "2026-12-10 1 2026-12-11",
      "2026-12-19 30 2027-01-18",
      "2027-01-11 7 2027-01-18",
      "2027-01-17 1 2027-01-18",
    ])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2027-01-18"])
    expect(result.violations).toEqual([])
  })

  it("removal off from Dec 1 to Feb 1: the Feb 2 run plans a new first warning for Mar 4 (R5)", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 130, removal: (day) => day < "2026-12-01" || day > "2027-02-01" })
    expect(emails(result).slice(1)).toEqual(["2027-02-02 30 2027-03-04", "2027-02-25 7 2027-03-04", "2027-03-03 1 2027-03-04"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2027-03-04"])
    expect(result.violations).toEqual([])
  })

  it("warnings off after a sent warning: no removal before the date it named (R4)", () => {
    const result = simulate(normal(), { start: "2026-11-11", days: 40, warnings: (day) => day < "2026-11-20" })
    expect(emails(result)).toEqual(["2026-11-11 30 2026-12-11"])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-11"])
  })

  it("an address that is not the plex.tv one is skipped, and the timeline goes on (R8)", () => {
    const sims = [simMember("m1", at("2026-05-01", "20:00"), TORONTO, { plexEmail: "new@example.com" })]
    const result = simulate(sims, { start: "2026-11-11", days: 40 })
    expect(result.sent).toEqual([])
    expect(result.removals.map((removal) => removal.day)).toEqual(["2026-12-11"])
    expect(result.violations).toEqual([])
  })

  it.each([
    [VANCOUVER, "2026-12-10"],
    [TOKYO, "2026-12-10"],
    [HONOLULU, "2026-12-10"],
  ])("lands the last warning on the day before the date in %s", (timezone, lastWarningDay) => {
    const result = simulate([simMember("m1", at("2026-05-01", "20:00"), timezone)], { start: "2026-11-11", days: 40 })
    expect(result.sent.at(-1)).toMatchObject({ lead: 1, date: "2026-12-11", sendDay: lastWarningDay })
    expect(result.violations).toEqual([])
  })
})

describe("simulation", () => {
  it("removes all 12 of 40 overdue members at catch-up, at most 2 a run, with no over_limit", () => {
    const zones = [TORONTO, VANCOUVER, HONOLULU]
    const start = "2026-11-11"
    const sims = Array.from({ length: 40 }, (_, i) =>
      i < 12
        ? simMember(`late${i}`, new Date(runAt(start).getTime() - (200 + i * 15) * DAY), zones[i % 3])
        : simMember(`active${i}`, new Date(runAt(start).getTime() - DAY), zones[i % 3], { playsDaily: true })
    )
    const result = simulate(sims, { start, days: 70 })

    expect(result.violations).toEqual([])
    expect(result.overLimit).toEqual([])
    expect(result.removals.map((removal) => removal.id).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `late${i}`).sort())
    const perRun = Map.groupBy(result.removals, (removal) => removal.day)
    expect(Math.max(...[...perRun.values()].map((runs) => runs.length))).toBeLessThanOrEqual(2)
    expect(result.removals.every((removal) => removal.day >= addDays(start, 30))).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6])("keeps R1 to R8 over 200 days of random plays, holds, missed runs, failures and threshold changes (seed %i)", (seed) => {
    const next = random(seed)
    const zones = [TORONTO, VANCOUVER, TOKYO, HONOLULU, null]
    const start = "2026-09-01"
    const sims = Array.from({ length: 30 }, (_, i) => {
      const plays = Array.from({ length: Math.floor(next() * 3) }, () => new Date(runAt(start).getTime() + next() * 200 * DAY))
      const lastSeen = new Date(runAt(start).getTime() - (100 + next() * 300) * DAY)
      return simMember(`m${i}`, lastSeen, zones[i % zones.length], {
        plays,
        playsDaily: next() < 0.3,
        email: next() < 0.1 ? null : `m${i}@example.com`,
        plexEmail: next() < 0.1 ? "other@example.com" : undefined,
      })
    })
    const missed = new Set(Array.from({ length: 12 }, () => addDays(start, Math.floor(next() * 200))))
    const idle = new Set(Array.from({ length: 10 }, () => addDays(start, Math.floor(next() * 200))))
    const holdFrom = addDays(start, 60 + Math.floor(next() * 60))
    const holdTo = addDays(holdFrom, Math.floor(next() * 20))
    const thresholdDay = addDays(start, Math.floor(next() * 200))
    const [before, after] = [150 + Math.floor(next() * 60), 150 + Math.floor(next() * 90)]
    const warningsOff = addDays(start, 150 + Math.floor(next() * 50))

    const result = simulate(sims, {
      start,
      days: 200,
      leads: next() < 0.5 ? LEADS : [21, 3],
      threshold: (day) => (day < thresholdDay ? before : after),
      warnings: (day) => day < warningsOff,
      runs: (day) => !missed.has(day),
      removal: (day) => day < holdFrom || day > holdTo,
      serverPlays: (day) => !idle.has(day),
      sendFails: () => next() < 0.05,
    })

    expect(result.violations).toEqual([])
    expect(result.removals.length).toBeGreaterThan(0)
    // Each email names a date in the member's future
    expect(result.sent.every((email) => email.daysLeft >= 1)).toBe(true)
  })
})
