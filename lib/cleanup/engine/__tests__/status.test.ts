/** The status of a Leaving soon item (TS 8.6, UX 4.12.6): each row of the table, and its precedence. */

import { ITEM_STATUSES } from "@/lib/cleanup/constants"
import { type StatusContext, type StatusItem, itemStatus } from "@/lib/cleanup/engine/status"

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const TODAY = "2026-11-08"
const KEY = "movie:tmdb:1"

const item = (overrides: Partial<StatusItem> = {}): StatusItem => ({
  itemKey: KEY,
  state: "leaving",
  leaveOn: "2026-12-08",
  needsApproval: false,
  failCode: null,
  holdCode: null,
  deferredAt: null,
  postponedAt: null,
  ...overrides,
})

const ctx = (overrides: Partial<StatusContext> = {}): StatusContext =>
  ({ paused: false, now: NOW, today: TODAY, holdUntil: null, plan: new Map(), ...overrides })

const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000)

describe("itemStatus rows", () => {
  it.each<[string, Partial<StatusItem>, Partial<StatusContext>, ReturnType<typeof itemStatus>]>([
    ["1 paused", { state: "deleting", failCode: "x" }, { paused: true }, { status: "paused", values: {} }],
    ["2 deleting", { state: "deleting", failCode: "x" }, {}, { status: "deleting", values: {} }],
    ["3 failed", { failCode: "ARR_500", holdCode: "plexMissing" }, {}, { status: "failed", values: { note: "ARR_500" } }],
    ["4 onHold", { holdCode: "sourceFailed:tautulli", deferredAt: hoursAgo(1) }, {}, { status: "onHold", values: { note: "sourceFailed:tautulli" } }],
    ["5 deferred", { deferredAt: hoursAgo(23), leaveOn: TODAY, needsApproval: true }, {}, { status: "deferred", values: {} }],
    ["5 deferred as an ISO string", { deferredAt: hoursAgo(2).toISOString() }, {}, { status: "deferred", values: {} }],
    ["6 waitsForYou", { leaveOn: "2026-11-01", needsApproval: true, postponedAt: hoursAgo(1) }, {}, { status: "waitsForYou", values: {} }],
    [
      "7 postponed",
      { leaveOn: "2026-11-20", postponedAt: hoursAgo(1), postponedBy: "An Admin" },
      { plan: new Map([[KEY, "2026-11-20"]]) },
      { status: "postponed", values: { day: "2026-11-20", note: "An Admin" } },
    ],
    ["7 postponed by nobody known", { leaveOn: "2026-11-20", postponedAt: hoursAgo(1).toISOString() }, {}, { status: "postponed", values: { day: "2026-11-20" } }],
    ["8 deletesOn", { leaveOn: "2026-11-01" }, { plan: new Map([[KEY, TODAY]]) }, { status: "deletesOn", values: { day: TODAY } }],
    ["8 deletesOn a later leave date", { leaveOn: "2026-11-20" }, { plan: new Map([[KEY, "2026-11-20"]]) }, { status: "deletesOn", values: { day: "2026-11-20" } }],
    [
      "8 deletesOn after the hold",
      { leaveOn: "2026-11-01" },
      { holdUntil: "2026-11-15", plan: new Map([[KEY, "2026-11-15"]]) },
      { status: "deletesOn", values: { day: "2026-11-15" } },
    ],
    [
      "8 deletesOn when approved",
      { state: "approved", leaveOn: "2026-11-01", needsApproval: true },
      { plan: new Map([[KEY, TODAY]]) },
      { status: "deletesOn", values: { day: TODAY } },
    ],
    ["9 waitsForBudget", { leaveOn: "2026-11-01" }, { plan: new Map([[KEY, "2026-11-10"]]) }, { status: "waitsForBudget", values: { day: "2026-11-10" } }],
    ["10 leaving", {}, {}, { status: "leaving", values: {} }],
    ["10 leaving: Review first and not due", { needsApproval: true }, { plan: new Map([[KEY, "2026-12-08"]]) }, { status: "leaving", values: {} }],
    ["10 leaving: due, but held back by the hold", { leaveOn: "2026-11-01", needsApproval: true }, { holdUntil: "2026-11-15" }, { status: "leaving", values: {} }],
    ["10 leaving: a held item", { state: "held", leaveOn: null }, { plan: new Map([[KEY, TODAY]]) }, { status: "leaving", values: {} }],
    ["10 leaving: deferred more than a day ago", { deferredAt: hoursAgo(25) }, {}, { status: "leaving", values: {} }],
  ])("row %s", (_name, overrides, context, expected) => {
    expect(itemStatus(item(overrides), ctx(context))).toEqual(expected)
  })

  it("words the failure and the hold codes when given words", () => {
    const words = { hold: (code: string) => `hold ${code}`, failure: (code: string) => `fail ${code}` }
    expect(itemStatus(item({ failCode: "X" }), ctx({ words })).values.note).toBe("fail X")
    expect(itemStatus(item({ holdCode: "Y" }), ctx({ words })).values.note).toBe("hold Y")
    expect(itemStatus(item({ holdCode: "Y" }), ctx({ words: {} })).values.note).toBe("Y")
  })

  it("gives only statuses of the table", () => {
    const status = itemStatus(item(), ctx()).status
    expect(ITEM_STATUSES).toContain(status)
  })
})

describe("itemStatus precedence", () => {
  // Every flag set at once: each row wins over every row below it, so removing it reveals the next one
  const all: Partial<StatusItem> = {
    state: "deleting",
    failCode: "F",
    holdCode: "H",
    deferredAt: hoursAgo(1),
    leaveOn: "2026-11-01",
    needsApproval: true,
    postponedAt: hoursAgo(2),
  }
  const steps: [ReturnType<typeof itemStatus>["status"], Partial<StatusItem>, Partial<StatusContext>][] = [
    ["paused", {}, { paused: true }],
    ["deleting", {}, {}],
    ["failed", { state: "leaving" }, {}],
    ["onHold", { state: "leaving", failCode: null }, {}],
    ["deferred", { state: "leaving", failCode: null, holdCode: null }, {}],
    ["waitsForYou", { state: "leaving", failCode: null, holdCode: null, deferredAt: null }, {}],
    ["postponed", { state: "leaving", failCode: null, holdCode: null, deferredAt: null, leaveOn: "2026-11-20" }, {}],
    ["deletesOn", { state: "approved", failCode: null, holdCode: null, deferredAt: null, postponedAt: null }, { plan: new Map([[KEY, TODAY]]) }],
    ["waitsForBudget", { state: "approved", failCode: null, holdCode: null, deferredAt: null, postponedAt: null }, { plan: new Map([[KEY, "2026-11-09"]]) }],
    ["leaving", { state: "approved", failCode: null, holdCode: null, deferredAt: null, postponedAt: null }, {}],
  ]

  it.each(steps)("%s", (status, overrides, context) => {
    expect(itemStatus(item({ ...all, ...overrides }), ctx(context)).status).toBe(status)
  })

  it("follows the order of ITEM_STATUSES", () => {
    expect(steps.map(([status]) => status)).toEqual([...ITEM_STATUSES])
  })
})
