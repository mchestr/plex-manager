/**
 * @jest-environment node
 */

import type { ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { groundArchetype, groundSlot, type GroundingContext, type GroundingIssue } from "../grounding"
import { renderCopyText } from "../render-copy"
import { fixtureCopyInputs, type FixtureCopyInput } from "./fixture-facts"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

let heavy: FixtureCopyInput
let ctx: GroundingContext

beforeAll(async () => {
  heavy = (await fixtureCopyInputs()).find((input) => input.id === "heavy")!
  ctx = { facts: heavy.facts, selected: heavy.selected }
})

const issues = (result: ReturnType<typeof groundSlot>): GroundingIssue[] => (result.ok ? [] : result.issues)
const rulesOf = (result: ReturnType<typeof groundSlot>) => [...new Set(issues(result).map((i) => i.rule))].sort()

it("the heavy fixture is the mockup member", () => {
  expect(heavy.facts["hours.afterDarkShare"]?.value).toBeCloseTo(0.34, 2)
  expect(heavy.facts["member.firstName"]?.display).toBe("Mike")
})

describe("rule 1: digits", () => {
  it("fails a digit outside a token and names the token to use", () => {
    const result = groundSlot("deck.calendar", "You pressed play on 289 of them.", ctx)
    expect(rulesOf(result)).toEqual([1])
    expect(issues(result)[0].hint).toBe("Use {{fact:days.active}}")
  })

  it("fails the year too", () => {
    expect(rulesOf(groundSlot("deck.calendar", "A big year, 2026.", ctx))).toEqual([1])
  })

  it("passes digits inside tokens", () => {
    expect(groundSlot("deck.calendar", "You pressed play on {{fact:days.active}} of them.", ctx)).toEqual({ ok: true })
  })
})

describe("rule 2: number words", () => {
  it.each(["You watched one hundred hours.", "You went three nights in a row.", "That was twice the hours.", "It took twenty-three days."])(
    "fails %p",
    (text) => {
      expect(rulesOf(groundSlot("deck.calendar", text, ctx))).toEqual([2])
    }
  )

  it("passes the mockup tagline and the idioms", () => {
    expect(groundSlot("archetype.tagline", "One more episode was never the plan. It was the whole plan.", ctx)).toEqual({ ok: true })
    expect(groundSlot("deck.clock", "No one keeps hours like these. This is the one.", ctx)).toEqual({ ok: true })
  })

  it("allows double feature only inside the archetype token", () => {
    expect(rulesOf(groundSlot("archetype.tagline", "Every weekend, a double feature.", ctx))).toEqual([2])
    expect(groundSlot("archetype.tagline", "Every weekend, {{fact:archetype.name}}.", ctx)).toEqual({ ok: true })
  })
})

describe("rule 3: quantifiers", () => {
  it("fails the personal-signature line on rules 3 and 4", () => {
    const result = groundSlot("deck.clock", "Most of it after dark, and a good share of it in Lumon's hallways.", ctx)
    expect(rulesOf(result)).toEqual([3, 4])
    expect(issues(result).find((i) => i.rule === 3)?.hint).toContain("{{fact:hours.afterDarkShare}}")
  })

  it("passes a quantifier its cited share backs, and fails one it does not", () => {
    expect(groundSlot("deck.clock", "A good share of it, {{fact:hours.afterDarkShare}}, started after dark.", ctx)).toEqual({ ok: true })
    expect(rulesOf(groundSlot("deck.clock", "A good share of it started after dark.", ctx))).toEqual([3])
    expect(rulesOf(groundSlot("deck.clock", "About a third, {{fact:hours.afterDarkShare}}, started after dark.", ctx))).toEqual([])
    expect(rulesOf(groundSlot("deck.clock", "Nearly all of it, {{fact:hours.afterDarkShare}}, started after dark.", ctx))).toEqual([3])
    expect(rulesOf(groundSlot("deck.clock", "Half of it, {{fact:hours.afterDarkShare}}, started after dark.", ctx))).toEqual([3])
  })
})

describe("rule 4: proper nouns", () => {
  it('fails "May" with the month-token hint', () => {
    const result = groundSlot("deck.calendar", "Your longest break came in May.", ctx)
    expect(rulesOf(result)).toEqual([4])
    expect(issues(result)[0].hint).toBe("Use {{fact:days.longestGap.month}}")
  })

  it("fails a capitalised word mid-sentence and an uncommon sentence start", () => {
    expect(rulesOf(groundSlot("deck.topShows", "You spent the year in Middle-earth.", ctx))).toEqual([4])
    expect(rulesOf(groundSlot("deck.topShows", "Lumon kept you busy.", ctx))).toEqual([4])
  })

  it("passes titles as tokens", () => {
    expect(groundSlot("deck.topShows", "{{fact:series[1].title}} came first. Then came {{fact:series[2].title}}.", ctx)).toEqual({ ok: true })
  })
})

describe("rule 5: tokens", () => {
  it("fails unknown, disallowed, missing and malformed tokens", () => {
    expect(rulesOf(groundSlot("deck.clock", "{{fact:hours.nope}} was the hour.", ctx))).toEqual([5])
    expect(rulesOf(groundSlot("deck.clock", "That makes {{fact:time.totalHours}} in all.", ctx))).toEqual([5])
    expect(rulesOf(groundSlot("deck.clock", "That was {{fact:hours afterDark}}.", ctx))).toEqual([5])
    const lacking: GroundingContext = { ...ctx, facts: { ...heavy.facts, "hours.goldenShare": undefined } }
    expect(rulesOf(groundSlot("deck.clock", "Prime time took {{fact:hours.goldenShare}}.", lacking))).toEqual([5])
  })

  it("fails a token from a page that was not selected", () => {
    const text = "See you next year, {{fact:member.firstName}}. Say hello to {{fact:series[1].title}}."
    expect(groundSlot("signOff", text, ctx)).toEqual({ ok: true })
    const without = { ...ctx, selected: ctx.selected.filter((p) => p !== "top-shows") }
    expect(rulesOf(groundSlot("signOff", text, without))).toEqual([5])
  })
})

describe("rule 6: voice", () => {
  it.each([
    "Your journey through the year.",
    "You watched a lot so far.",
    "You are still going.",
    "What a year \u{1F37F}.",
    "Read more at example.com today.",
    "A **big** year.",
    "The viewer watched a lot.",
  ])("fails %p", (text) => {
    expect(rulesOf(groundSlot("deck.clock", text, ctx))).toEqual([6])
  })

  it("fails the member's name outside the sign-off", () => {
    expect(rulesOf(groundSlot("deck.clock", "Well played, Mike.", ctx))).toEqual([4, 6])
  })

  it("lets templates use the window words, and the sign-off use the name", () => {
    expect(groundSlot("deck.clock", "You watched a lot so far.", { ...ctx, source: "template" })).toEqual({ ok: true })
    expect(groundSlot("signOff", "See you soon, {{fact:member.firstName}}.", ctx)).toEqual({ ok: true })
  })
})

describe("rule 7: length", () => {
  const deckOf = (length: number) => {
    let text = "About {{fact:time.perDay}} a day"
    for (let n = renderCopyText(`${text}.`, heavy.facts).length; n < length; n = renderCopyText(`${text}.`, heavy.facts).length) {
      text += length - n === 1 ? "x" : " x"
    }
    return `${text}.`
  }

  it("fails a deck that renders to 141 characters, counting tokens at display length", () => {
    const long = deckOf(141)
    expect(renderCopyText(long, heavy.facts)).toHaveLength(141)
    expect(rulesOf(groundSlot("deck.number", long, ctx))).toEqual([7])
    expect(groundSlot("deck.number", deckOf(140), ctx)).toEqual({ ok: true })
  })
})

describe("rule 8: archetype", () => {
  const selection = (llmMayChoose: boolean): Pick<ArchetypeSelection, "id" | "shortlist" | "llmMayChoose"> => ({
    id: "midnight-marathoner",
    shortlist: [
      { id: "midnight-marathoner", score: 80 },
      { id: "series-devourer", score: 78 },
      { id: "loyalist", score: 76 },
    ],
    llmMayChoose,
  })

  it("fails another archetype's poster line", () => {
    const result = groundArchetype({ id: "midnight-marathoner", posterLineId: "lo.1" }, selection(false))
    expect(result.ok ? [] : result.issues.map((i) => [i.rule, i.slot])).toEqual([[8, "archetype.posterLineId"]])
  })

  it("allows a shortlist pick only when code lets the model choose", () => {
    expect(groundArchetype({ id: "loyalist", posterLineId: "lo.2" }, selection(true))).toEqual({ ok: true })
    const refused = groundArchetype({ id: "loyalist", posterLineId: "lo.2" }, selection(false))
    expect(refused.ok ? [] : refused.issues.map((i) => i.slot)).toEqual(["archetype.id", "archetype.posterLineId"])
    expect(groundArchetype({ id: "midnight-marathoner", posterLineId: "mm.2" }, selection(false))).toEqual({ ok: true })
  })
})

it("a facts record without a name never trips the name rule", () => {
  const facts: RewindFactsV3 = {}
  expect(groundSlot("deck.clock", "When you pressed play, hour by hour.", { facts, selected: [] })).toEqual({ ok: true })
})
