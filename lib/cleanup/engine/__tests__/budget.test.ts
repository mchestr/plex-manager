/** The daily budget plan (TS 8.7, E17, E21): strict order, the item limit, usedToday, holdUntil, a later leaveOn, shows after their seasons and oversize. */

import { type BudgetCandidate, type BudgetInput, earliestDay, isDue, planBudget } from "@/lib/cleanup/engine/budget"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const TODAY = "2026-11-08"

const movie = (n: number, gb: number, leaveOn = TODAY): BudgetCandidate =>
  ({ itemKey: `movie:tmdb:${n}`, level: "movie", titleKey: `tmdb:${n}`, leaveOn, sizeBytes: gb * GiB })
const show = (tvdb: number, gb: number, leaveOn = TODAY): BudgetCandidate =>
  ({ itemKey: `show:tvdb:${tvdb}`, level: "show", titleKey: `tvdb:${tvdb}`, leaveOn, sizeBytes: gb * GiB })
const season = (tvdb: number, n: number, gb: number, leaveOn = TODAY): BudgetCandidate =>
  ({ itemKey: `season:tvdb:${tvdb}:${n}`, level: "season", titleKey: `tvdb:${tvdb}`, leaveOn, sizeBytes: gb * GiB })

const input = (candidates: BudgetCandidate[], overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  candidates,
  budget: { items: 20, bytes: 500 * GiB },
  usedToday: { items: 0, bytes: 0 },
  today: TODAY,
  holdUntil: null,
  ...overrides,
})

const entries = (plan: Map<string, string>) => [...plan.entries()]

describe("earliestDay and isDue", () => {
  it.each([
    ["2026-11-01", null, TODAY],
    ["2026-11-20", null, "2026-11-20"],
    ["2026-11-01", "2026-11-15", "2026-11-15"],
    ["2026-11-20", "2026-11-15", "2026-11-20"],
  ])("leaveOn %s with holdUntil %s goes from %s", (leaveOn, holdUntil, day) => {
    expect(earliestDay(leaveOn, TODAY, holdUntil)).toBe(day)
  })

  it.each([
    [TODAY, null, true],
    ["2026-11-01", null, true],
    ["2026-11-09", null, false],
    [null, null, false],
    ["2026-11-01", "2026-11-09", false],
    ["2026-11-01", TODAY, true],
  ])("leaveOn %s with holdUntil %s is due: %s", (leaveOn, holdUntil, due) => {
    expect(isDue(leaveOn, TODAY, holdUntil)).toBe(due)
  })
})

describe("planBudget", () => {
  it("plans nothing for no candidate", () => {
    expect(planBudget(input([]))).toEqual({ plan: new Map(), oversize: [] })
  })

  it("orders strictly: earliest day, then the largest, then the item key", () => {
    const { plan } = planBudget(input([movie(3, 10), movie(1, 40), movie(2, 10), movie(4, 90, "2026-11-10")]))
    expect(entries(plan)).toEqual([
      ["movie:tmdb:1", TODAY],
      ["movie:tmdb:2", TODAY],
      ["movie:tmdb:3", TODAY],
      ["movie:tmdb:4", "2026-11-10"],
    ])
  })

  it("never mutates the candidates", () => {
    const candidates = [movie(2, 10), movie(1, 10)]
    planBudget(input(candidates))
    expect(candidates.map((c) => c.itemKey)).toEqual(["movie:tmdb:2", "movie:tmdb:1"])
  })

  it("moves to the next day at the item limit", () => {
    const { plan } = planBudget(input([movie(1, 3), movie(2, 2), movie(3, 1)], { budget: { items: 2, bytes: 500 * GiB } }))
    expect(entries(plan)).toEqual([["movie:tmdb:1", TODAY], ["movie:tmdb:2", TODAY], ["movie:tmdb:3", "2026-11-09"]])
  })

  it("moves to the next day at the bytes limit", () => {
    const { plan, oversize } = planBudget(input([movie(1, 300), movie(2, 250)]))
    expect(entries(plan)).toEqual([["movie:tmdb:1", TODAY], ["movie:tmdb:2", "2026-11-09"]])
    expect(oversize).toEqual([])
  })

  it("counts what today already deleted (usedToday)", () => {
    const items = planBudget(input([movie(1, 1)], { budget: { items: 2, bytes: 500 * GiB }, usedToday: { items: 2, bytes: 2 * GiB } }))
    expect(items.plan.get("movie:tmdb:1")).toBe("2026-11-09")
    const bytes = planBudget(input([movie(1, 100)], { usedToday: { items: 1, bytes: BigInt(450 * GiB) } }))
    expect(bytes.plan.get("movie:tmdb:1")).toBe("2026-11-09")
    const room = planBudget(input([movie(1, 50)], { usedToday: { items: 1, bytes: 450 * GiB } }))
    expect(room.plan.get("movie:tmdb:1")).toBe(TODAY)
  })

  it("plans nothing before holdUntil", () => {
    const { plan } = planBudget(input([movie(1, 10, "2026-11-01"), movie(2, 5)], { holdUntil: "2026-11-15" }))
    expect(entries(plan)).toEqual([["movie:tmdb:1", "2026-11-15"], ["movie:tmdb:2", "2026-11-15"]])
  })

  it("starts a later leaveOn on its own day with a fresh budget", () => {
    const { plan } = planBudget(input([movie(1, 400), movie(2, 400, "2026-11-12")], { budget: { items: 1, bytes: 500 * GiB } }))
    expect(entries(plan)).toEqual([["movie:tmdb:1", TODAY], ["movie:tmdb:2", "2026-11-12"]])
  })

  it("never moves the cursor back: a later candidate after a full run of days", () => {
    const { plan } = planBudget(input([movie(1, 1), movie(2, 1), movie(3, 1), movie(4, 1, "2026-11-09")], { budget: { items: 1, bytes: 500 * GiB } }))
    expect(entries(plan)).toEqual([
      ["movie:tmdb:1", TODAY],
      ["movie:tmdb:2", "2026-11-09"],
      ["movie:tmdb:3", "2026-11-10"],
      ["movie:tmdb:4", "2026-11-11"],
    ])
  })

  it("puts an item larger than the bytes budget alone on an empty day and names it (E17)", () => {
    const { plan, oversize } = planBudget(input([movie(1, 100), show(9, 1760)]))
    expect(entries(plan)).toEqual([["show:tvdb:9", TODAY], ["movie:tmdb:1", "2026-11-09"]])
    expect(oversize).toEqual([{ itemKey: "show:tvdb:9", day: TODAY }])
  })

  it("moves an oversize item to the next empty day when today already deleted something", () => {
    const { plan, oversize } = planBudget(input([movie(1, 600)], { usedToday: { items: 1, bytes: 1 * GiB } }))
    expect(plan.get("movie:tmdb:1")).toBe("2026-11-09")
    expect(oversize).toEqual([{ itemKey: "movie:tmdb:1", day: "2026-11-09" }])
  })

  it("treats an item limit below 1 as 1", () => {
    const { plan } = planBudget(input([movie(1, 1), movie(2, 1)], { budget: { items: 0, bytes: 500 * GiB } }))
    expect(entries(plan)).toEqual([["movie:tmdb:1", TODAY], ["movie:tmdb:2", "2026-11-09"]])
  })

  it("plans the seasons of a show before the show on one day, though the show is larger (E21)", () => {
    const { plan } = planBudget(input([show(9, 200), season(9, 1, 20), season(9, 2, 30), movie(1, 50)]))
    expect(entries(plan)).toEqual([
      ["movie:tmdb:1", TODAY],
      ["season:tvdb:9:2", TODAY],
      ["season:tvdb:9:1", TODAY],
      ["show:tvdb:9", TODAY],
    ])
  })

  it("keeps other shows in size order around a show that waits for its seasons", () => {
    const { plan } = planBudget(input([show(9, 300), show(8, 100), season(9, 1, 10)]))
    expect([...plan.keys()]).toEqual(["show:tvdb:8", "season:tvdb:9:1", "show:tvdb:9"])
  })

  it("moves the show too when the budget plans its season on a later day", () => {
    const { plan } = planBudget(input([movie(1, 100), show(9, 50), season(9, 1, 3)], { budget: { items: 1, bytes: 500 * GiB } }))
    expect(entries(plan)).toEqual([["movie:tmdb:1", TODAY], ["season:tvdb:9:1", "2026-11-09"], ["show:tvdb:9", "2026-11-10"]])
    expect(plan.get("show:tvdb:9")! >= plan.get("season:tvdb:9:1")!).toBe(true)
  })

  it("never plans a show before a later season of it, even when its own leave date is earlier", () => {
    const { plan } = planBudget(input([show(9, 100), season(9, 3, 10, "2026-11-12")]))
    expect(entries(plan)).toEqual([["season:tvdb:9:3", "2026-11-12"], ["show:tvdb:9", "2026-11-12"]])
  })

  it("does not tie a season to a show of another title", () => {
    const { plan } = planBudget(input([show(9, 100), season(7, 1, 10, "2026-11-12")]))
    expect(plan.get("show:tvdb:9")).toBe(TODAY)
  })
})
