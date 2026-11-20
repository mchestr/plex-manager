/**
 * The limits on members' own swaps: each rule in the order the member hears
 * it, its boundary, and the allowance over the rolling 7 days.
 */

import { allowance, decideSwap, type SwapFacts } from "@/lib/problem-reports/gate"

const NOW = new Date("2026-11-09T20:00:00Z")
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

const FACTS: SwapFacts = {
  mode: "ON",
  limits: { weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 },
  ledger: { memberSwaps: [], titleRecent: 0, titleTwoMonths: 0, serverToday: 0 },
  breakerTripped: false,
  needsApproval: false,
  playedRecently: true,
}
const facts = (change: Partial<SwapFacts> = {}, ledger: Partial<SwapFacts["ledger"]> = {}): SwapFacts => ({ ...FACTS, ...change, ledger: { ...FACTS.ledger, ...ledger } })

describe("allowance", () => {
  it("has every swap left with none spent, and nothing coming back", () => {
    expect(allowance([], 3, NOW)).toEqual({ left: 3, of: 3, nextBack: null })
  })

  it("brings a swap back 7 days after it began, the oldest first", () => {
    expect(allowance([ago(2), ago(5)], 3, NOW)).toEqual({ left: 1, of: 3, nextBack: new Date(ago(5).getTime() + 7 * DAY) })
  })

  it("stops counting a swap 7 days after it began, to the millisecond", () => {
    expect(allowance([new Date(NOW.getTime() - 7 * DAY)], 3, NOW).left).toBe(3)
    expect(allowance([new Date(NOW.getTime() - 7 * DAY + 1)], 3, NOW).left).toBe(2)
  })

  it("comes back once enough swaps age out when the limit was lowered below what's spent", () => {
    expect(allowance([ago(1), ago(2), ago(3)], 2, NOW)).toEqual({ left: 0, of: 2, nextBack: new Date(ago(2).getTime() + 7 * DAY) })
  })
})

describe("decideSwap", () => {
  it("lets a member swap within every limit, with their allowance", () => {
    expect(decideSwap(facts({}, { memberSwaps: [ago(3)] }), NOW)).toEqual({
      ok: true,
      dryRun: false,
      allowance: { left: 2, of: 3, nextBack: new Date(ago(3).getTime() + 7 * DAY) },
    })
  })

  it("runs the same checks in Dry run, and says so", () => {
    expect(decideSwap(facts({ mode: "DRY_RUN" }), NOW)).toMatchObject({ ok: true, dryRun: true })
    expect(decideSwap(facts({ mode: "DRY_RUN", needsApproval: true }), NOW)).toMatchObject({ ok: false, reason: "NEEDS_APPROVAL" })
  })

  it("swaps nothing while automatic swaps are off", () => {
    expect(decideSwap(facts({ mode: "OFF" }), NOW)).toEqual({ ok: false, reason: "OFF", until: null })
  })

  it("pauses at the day's server-wide cap and while the breaker is tripped", () => {
    expect(decideSwap(facts({}, { serverToday: 9 }), NOW)).toMatchObject({ ok: true })
    expect(decideSwap(facts({}, { serverToday: 10 }), NOW)).toEqual({ ok: false, reason: "PAUSED", until: null })
    expect(decideSwap(facts({ breakerTripped: true }), NOW)).toEqual({ ok: false, reason: "PAUSED", until: null })
  })

  it("leaves a member whose swaps need approval to the server admin", () => {
    expect(decideSwap(facts({ needsApproval: true }), NOW)).toEqual({ ok: false, reason: "NEEDS_APPROVAL", until: null })
  })

  it("swaps only titles the member played recently or is watching", () => {
    expect(decideSwap(facts({ playedRecently: false }), NOW)).toEqual({ ok: false, reason: "NOT_PLAYED", until: null })
  })

  it("swaps a title once in its cooldown, and leaves a title swapped twice in 60 days to the server admin", () => {
    expect(decideSwap(facts({}, { titleRecent: 1 }), NOW)).toEqual({ ok: false, reason: "TITLE_RECENT", until: null })
    expect(decideSwap(facts({}, { titleTwoMonths: 1 }), NOW)).toMatchObject({ ok: true })
    expect(decideSwap(facts({}, { titleTwoMonths: 2 }), NOW)).toEqual({ ok: false, reason: "TITLE_RECENT", until: null })
  })

  it("says when the next swap comes back once the member is out of them", () => {
    expect(decideSwap(facts({}, { memberSwaps: [ago(1), ago(4), ago(6)] }), NOW)).toEqual({ ok: false, reason: "OUT_OF_SWAPS", until: new Date(ago(6).getTime() + 7 * DAY) })
  })

  it("names the first rule that applies, in the order the member hears them", () => {
    const everything = facts({ mode: "ON", breakerTripped: true, needsApproval: true, playedRecently: false }, { titleRecent: 1, memberSwaps: [ago(1), ago(2), ago(3)] })
    expect(decideSwap(everything, NOW)).toMatchObject({ reason: "PAUSED" })
    expect(decideSwap({ ...everything, breakerTripped: false }, NOW)).toMatchObject({ reason: "NEEDS_APPROVAL" })
    expect(decideSwap({ ...everything, breakerTripped: false, needsApproval: false }, NOW)).toMatchObject({ reason: "NOT_PLAYED" })
    expect(decideSwap({ ...everything, breakerTripped: false, needsApproval: false, playedRecently: true }, NOW)).toMatchObject({ reason: "TITLE_RECENT" })
  })
})
