/**
 * @jest-environment node
 */

/**
 * The archetype scorers: the two new real scorers win their own members,
 * every scorer returns a 0-100 score, and every evidence id is a catalogue
 * fact that `buildFacts` emits for the member.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { ARCHETYPE_IDS } from "@/lib/wrapped/archetypes/catalogue"
import { scoreArchetypes } from "@/lib/wrapped/archetypes/scorers"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import { FACT_IDS } from "@/lib/wrapped/facts/catalogue"

import { context, plainViewer, premiereChaser, statsOf } from "./members"

const pick = (events: ReturnType<typeof plainViewer>) => selectArchetype(statsOf(events), { userId: "u1", year: 2026, counts: null })

describe("scoreArchetypes", () => {
  it("makes a member who finishes everything, with no other strong habit, a Credits Roller", () => {
    const stats = statsOf(plainViewer())

    expect(stats.titles.completion?.share).toBe(1)
    expect(pick(plainViewer())).toMatchObject({
      id: "credits-roller",
      evidence: ["records.completionShare", "films.finishedShare"],
    })
  })

  it("drops the Credits Roller once half the films are abandoned", () => {
    const scores = scoreArchetypes(statsOf(plainViewer({ abandonFilms: true })))

    expect(scores["credits-roller"].score).toBeLessThan(scoreArchetypes(statsOf(plainViewer()))["credits-roller"].score)
    expect(pick(plainViewer({ abandonFilms: true }))?.id).not.toBe("credits-roller")
  })

  it("makes a member who starts everything within days of release a Premiere Chaser", () => {
    const stats = statsOf(premiereChaser())

    expect(stats.freshShare).toBe(1)
    expect(pick(premiereChaser())).toMatchObject({ id: "premiere-chaser", evidence: ["taste.freshShare"] })
  })

  it("gives no Premiere Chaser score without release dates", () => {
    expect(scoreArchetypes(statsOf(plainViewer()))["premiere-chaser"]).toEqual({ score: 0, evidence: [] })
  })

  it("scores all twelve archetypes from 0 to 100", () => {
    const scores = scoreArchetypes(statsOf(plainViewer()))

    expect(Object.keys(scores).sort()).toEqual([...ARCHETYPE_IDS].sort())
    for (const { score } of Object.values(scores)) {
      expect(Number.isInteger(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it.each(loadFixtures().map((fixture) => [fixture.id, fixture] as const))(
    "%s: every evidence id is a catalogue fact the member has",
    async (_id, fixture) => {
      const { stats, ctx } = await fixtureMember(fixture)
      const facts = buildFacts(stats, {
        member: { name: fixture.member.displayName },
        window: { ...ctx.window, year: 2026, finalCut: ctx.finalCut },
        archetype: null,
        locale: "en-US",
      })

      for (const [id, { evidence }] of Object.entries(scoreArchetypes(stats))) {
        for (const fact of evidence) {
          expect(FACT_IDS).toContain(fact)
          expect([id, fact, facts[fact] !== undefined]).toEqual([id, fact, true])
        }
      }
    }
  )

  it("reads the member's own zone: a 23:00 UTC habit is after dark in UTC, not in Los Angeles", () => {
    const events = plainViewer().map((e) => ({ ...e, startedAt: e.startedAt - (e.startedAt % 86_400_000) + 23 * 3_600_000 }))
    const utc = scoreArchetypes(statsOf(events, context))["midnight-marathoner"].score
    const la = scoreArchetypes(statsOf(events, { ...context, zone: "America/Los_Angeles" }))["midnight-marathoner"].score

    expect(utc).toBe(100)
    expect(la).toBe(0)
  })
})
