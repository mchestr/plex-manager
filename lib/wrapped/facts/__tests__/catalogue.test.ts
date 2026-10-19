/**
 * @jest-environment node
 */

/**
 * The fact catalogue: unique ids, a closed union that covers everything
 * `buildFacts` emits for the twenty fixtures, and a snapshot of the ids for
 * P8.1's freeze.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import { CATALOGUE_VERSION, FACT_IDS, FACTS, FactIdSchema, RewindFactsV3Schema } from "@/lib/wrapped/facts/catalogue"
import { FACT_UNITS } from "@/lib/wrapped/facts/display"

describe("the fact catalogue", () => {
  it("has unique ids, each with a known unit and group", () => {
    expect(new Set(FACT_IDS).size).toBe(FACT_IDS.length)
    for (const id of FACT_IDS) {
      expect(FACT_UNITS).toContain(FACTS[id].unit)
      expect(FACTS[id].format.length).toBeGreaterThan(0)
      expect(["H", "M", "DB"]).toContain(FACTS[id].feasibility)
    }
  })

  it("expands indexed facts and rejects ids outside the union", () => {
    expect(FACT_IDS).toEqual(expect.arrayContaining(["series[1].title", "series[5].title", "taste.genreByMonth[12]", "people.director[3].name"]))
    expect(FactIdSchema.safeParse("series[6].title").success).toBe(false)
    expect(FactIdSchema.safeParse("time.totalHours").success).toBe(true)
  })

  it("covers every fact buildFacts emits for the twenty fixtures", async () => {
    for (const fixture of loadFixtures()) {
      const { stats, ctx } = await fixtureMember(fixture)
      const facts = buildFacts(stats, {
        member: { name: fixture.member.userName ?? fixture.member.displayName, nthRewind: 1, serial: "K7Q4" },
        window: { ...ctx.window, year: 2026, finalCut: ctx.finalCut },
        archetype: selectArchetype(stats, { userId: fixture.id, year: 2026, counts: { archetypeCounts: { explorer: 1 }, scoredMembers: 12 } }),
        locale: "en-US",
      })

      expect(Object.keys(facts).filter((id) => !FACT_IDS.includes(id as never))).toEqual([])
      expect(RewindFactsV3Schema.safeParse(facts).success).toBe(true)
    }
  })

  it("keeps its ids as frozen on 2026-12-01 (P8.1)", () => {
    expect(CATALOGUE_VERSION).toBe("facts-2026.1")
    expect(FACT_IDS).toMatchSnapshot()
  })
})
