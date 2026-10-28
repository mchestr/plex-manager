/**
 * @jest-environment node
 */

import { issuePages } from "@/lib/rewind/registry"
import { ARCHETYPE_IDS, POSTER_LINE_IDS, posterLineIds } from "@/lib/wrapped/archetypes/catalogue"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { groundSlot, type GroundingIssue } from "../grounding"
import { POSTER_LINES } from "../poster-lines"
import { renderCopyText, tokenIds } from "../render-copy"
import { slotsForPages } from "../slots"
import {
  copyLocals, coverLines, headline, POCKET_NOTE, posterLineTemplate, quizCallback, quizHeadline, quizReveal, SLOT_TEMPLATES, slotTemplate, windowLine,
} from "../templates"
import { fixtureCopyInputs, type FixtureCopyInput } from "./fixture-facts"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const USER = "fixture-member"
let inputs: FixtureCopyInput[]

beforeAll(async () => {
  inputs = await fixtureCopyInputs()
})

const issuesOf = (result: ReturnType<typeof groundSlot>) => (result.ok ? [] : result.issues)
const rules = (issues: GroundingIssue[], keep: number[]) => issues.filter((i) => keep.includes(i.rule))

describe("slot templates", () => {
  it("render for every fixture with every token resolved, passing rules 4 to 7", () => {
    const failures: string[] = []
    for (const input of inputs) {
      const locals = copyLocals({ year: input.year })
      for (const slot of slotsForPages(input.selected)) {
        if (slot.id === "archetype.posterLineId") continue
        const text = slotTemplate(slot.id, { facts: input.facts, userId: USER, locals })
        for (const id of tokenIds(text)) {
          if (!input.facts[id as keyof RewindFactsV3]) failures.push(`${input.id} ${slot.id}: ${id} is missing`)
        }
        const result = groundSlot(slot.id, text, { facts: input.facts, selected: input.selected, source: "template", locals })
        for (const issue of rules(issuesOf(result), [4, 5, 6, 7])) failures.push(`${input.id} ${slot.id}: ${issue.message}`)
      }
    }
    expect(failures).toEqual([])
  })

  it("pick the same variant for a member every time, and spread across members", () => {
    const heavy = inputs.find((i) => i.id === "heavy")!
    const ctx = (userId: string) => ({ facts: heavy.facts, userId })
    expect(slotTemplate("deck.clock", ctx("a"))).toBe(slotTemplate("deck.clock", ctx("a")))
    const picks = new Set(Array.from({ length: 30 }, (_, n) => slotTemplate("deck.clock", ctx(`member-${n}`))))
    expect(picks.size).toBeGreaterThan(1)
  })

  it("fall back to the token-free variant when the member lacks every fact", () => {
    expect(slotTemplate("deck.taste", { facts: {}, userId: USER })).toBe("Your kind of thing.")
  })

  it("never cite a count or share of zero, but cite a Sunday or midnight", () => {
    const zero = { "hours.afterDarkShare": { value: 0, display: "0%", unit: "share" } } satisfies RewindFactsV3
    const picks = new Set(Array.from({ length: 30 }, (_, n) => slotTemplate("deck.clock", { facts: zero, userId: `member-${n}` })))
    expect([...picks]).toEqual(["Any time is a good time."])
    const sunday = {
      "hours.latestStart.time": { value: 0, display: "12:00 AM", unit: "time" },
      "hours.latestStart.weekday": { value: 0, display: "Sunday", unit: "weekday" },
    } satisfies RewindFactsV3
    const sundayPicks = new Set(Array.from({ length: 30 }, (_, n) => slotTemplate("deck.clock", { facts: sunday, userId: `member-${n}` })))
    expect(sundayPicks).toContain("Your latest start was {{fact:hours.latestStart.time}} on a {{fact:hours.latestStart.weekday}}.")

    const failures: string[] = []
    for (const input of inputs) {
      for (const slot of slotsForPages(input.selected)) {
        if (slot.id === "archetype.posterLineId") continue
        const text = slotTemplate(slot.id, { facts: input.facts, userId: USER, locals: copyLocals({ year: input.year }) })
        for (const id of tokenIds(text)) {
          const fact = input.facts[id as keyof RewindFactsV3]
          if (fact?.value === 0 && !["weekday", "time", "hour"].includes(fact.unit)) failures.push(`${input.id} ${slot.id}: ${id} is zero`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it("reads as a finished issue in either window, with the same line for both and no \"so far\"", () => {
    const facts = (finalCut: 0 | 1): RewindFactsV3 => ({
      "window.finalCut": { value: finalCut, display: String(finalCut), unit: "count" },
      "window.through": { value: "2026-11-30", display: "November\u00A030", unit: "date" },
      "time.daysHours": { value: 78420, display: "54\u00A0days, 11\u00A0hours", unit: "days-hours" },
      "time.perDay": { value: 234, display: "3\u00A0h 54\u00A0m", unit: "duration" },
    })
    const users = ["a", "b", "c", "d", "e", "f"]
    for (const slot of ["deck.number", "deck.calendar", "deck.standing", "signOff"] as const) {
      for (const userId of users) {
        const lines = ([0, 1] as const).map((cut) => slotTemplate(slot, { facts: facts(cut), userId }))
        expect(lines[0]).toBe(lines[1])
        expect(lines[0]).not.toMatch(/so far|final cut|not over/i)
      }
    }
    for (const variants of Object.values(SLOT_TEMPLATES)) for (const line of variants) expect(line).not.toMatch(/so far|final cut|not over/i)
    expect(renderCopyText(windowLine(), facts(0))).toBe("Data through November\u00A030")
  })

  it("signs off as a finished issue, whatever the window", () => {
    const facts = (finalCut: 0 | 1): RewindFactsV3 => ({
      "window.finalCut": { value: finalCut, display: String(finalCut), unit: "count" },
      "member.firstName": { value: "Mike", display: "Mike", unit: "name" },
    })
    const lines = ["a", "b", "c", "d", "e", "f"].flatMap((userId) => [0, 1].map((cut) => renderCopyText(slotTemplate("signOff", { facts: facts(cut as 0 | 1), userId }), facts(cut as 0 | 1))))
    expect(new Set(lines)).toEqual(new Set(["See you next year, Mike.", "That was the year. Thanks for pressing play."]))
  })
})

describe("poster lines", () => {
  it("has sixty lines, five per archetype", () => {
    expect(Object.keys(POSTER_LINES).sort()).toEqual([...POSTER_LINE_IDS].sort())
    for (const id of ARCHETYPE_IDS) expect(posterLineIds(id).every((line) => POSTER_LINES[line])).toBe(true)
  })

  it("passes rules 1, 2, 4, 6 and 7 as the tagline, and is unique", () => {
    const failures = Object.entries(POSTER_LINES).flatMap(([id, line]) =>
      rules(issuesOf(groundSlot("archetype.tagline", line, { facts: {}, selected: [] })), [1, 2, 4, 6, 7]).map((i) => `${id}: ${i.message}`)
    )
    expect(failures).toEqual([])
    expect(new Set(Object.values(POSTER_LINES)).size).toBe(60)
  })

  it("picks a template poster line from the archetype's own five, stably", () => {
    const pick = posterLineTemplate("loyalist", USER)
    expect(posterLineIds("loyalist")).toContain(pick)
    expect(posterLineTemplate("loyalist", USER)).toBe(pick)
  })
})

describe("headlines and page lines", () => {
  it("render every selected page's headline for every fixture with rules 4 and 6 passing", () => {
    const failures: string[] = []
    for (const input of inputs) {
      const locals = copyLocals({ year: input.year, firstTitle: "Severance" })
      for (const page of input.selected.filter((p) => p !== "short-list")) {
        const text = headline(page as (typeof issuePages)[number]["type"], input.facts)
        for (const id of tokenIds(text)) {
          if (!input.facts[id as keyof RewindFactsV3] && !locals[id]) failures.push(`${input.id} ${page}: ${id} is missing`)
        }
        // Headlines are not slots; deck.number stands in to run the word rules on them.
        const result = groundSlot("deck.number", text, { facts: input.facts, selected: input.selected, source: "template", locals })
        for (const issue of rules(issuesOf(result), [4, 6])) failures.push(`${input.id} ${page}: ${issue.message}`)
      }
    }
    expect(failures).toEqual([])
  })

  it("renders the quiz lines for every fixture with a quiz, passing rules 4, 6 and 7", () => {
    const failures: string[] = []
    for (const input of inputs.filter((i) => i.facts["quiz.gapMinutes"])) {
      const locals = copyLocals({ year: input.year, guess: "Severance" })
      for (const rank of [1, 2, 3, 4]) {
        for (const text of [quizCallback(rank), quizReveal(rank)]) {
          for (const id of tokenIds(text)) if (!input.facts[id as keyof RewindFactsV3] && !locals[id]) failures.push(`${input.id}: ${id} is missing`)
          const result = groundSlot("deck.topShows", text, { facts: input.facts, selected: input.selected, source: "template", locals })
          for (const issue of rules(issuesOf(result), [4, 6, 7])) failures.push(`${input.id} rank ${rank}: ${issue.message}`)
        }
      }
    }
    expect(failures).toEqual([])
    expect(quizHeadline("series")).toBe(headline("guess", {}))
    expect(quizHeadline("mixed")).toBe("Which title did you watch most this year?")
    expect(quizReveal(4)).toBe("Not quite: that was your number four.")
  })

  it("names the member on the cover only when there is a name", () => {
    expect(headline("cover", {})).toBe("Your year in film and television")
    expect(headline("cover", { "member.firstName": { value: "Mike", display: "Mike", unit: "name" } })).toBe(
      "{{fact:member.firstName}}'s year in film and television"
    )
  })

  it("builds four cover lines with the selected folios, in folio order", () => {
    const pages = issuePages.map((p, i) => ({ type: p.type, folio: i + 1 }))
    expect(coverLines(pages)).toEqual([
      { folio: 2, text: "One very large number" },
      { folio: 4, text: "Guess your top show. No peeking." },
      { folio: 11, text: "The race for your attention" },
      { folio: 16, text: "Who you turned out to be" },
    ])
    const short = [{ type: "number" as const, folio: 2 }, { type: "centrefold" as const, folio: 5 }]
    expect(coverLines(short).map((l) => l.folio)).toEqual([2, 5])
  })

  it("keeps the pocket note to what the edition is", () => {
    expect(POCKET_NOTE).toBe("The six pages that sum up your year.")
  })
})
