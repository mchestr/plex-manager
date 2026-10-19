/**
 * @jest-environment node
 */

/**
 * The LLM fact sheet: only the requested ids, display strings only, nothing
 * that identifies the member or anyone else, and small.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import { FACT_IDS, type RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { buildFactSheet } from "@/lib/wrapped/facts/fact-sheet"

const fixtures = loadFixtures()

async function factsOf(id: string): Promise<RewindFactsV3> {
  const fixture = fixtures.find((f) => f.id === id)!
  const { stats, ctx } = await fixtureMember(fixture)
  return buildFacts(stats, {
    member: { name: fixture.member.userName ?? fixture.member.displayName },
    window: { ...ctx.window, year: 2026, finalCut: ctx.finalCut },
    archetype: selectArchetype(stats, { userId: `user-${id}`, year: 2026, counts: null }),
    locale: "en-US",
  })
}

describe("buildFactSheet", () => {
  it("holds only the requested ids the member has, as display strings", async () => {
    const facts = await factsOf("heavy")
    const sheet = buildFactSheet(facts, ["time.totalHours", "series[1].title", "next.picks[1].title", "time.totalHours"])

    expect(sheet).toEqual({
      facts: [
        { id: "time.totalHours", display: "1,307" },
        { id: "series[1].title", display: "The Lord of the Rings: The Rings of Power" },
      ],
      titles: ["The Lord of the Rings: The Rings of Power"],
    })
  })

  it("carries no email, user id or another member's data", async () => {
    const facts = await factsOf("long-and-email-name")
    const json = JSON.stringify(buildFactSheet(facts, FACT_IDS))
    const fixture = fixtures.find((f) => f.id === "long-and-email-name")!

    expect(json).not.toContain("@")
    expect(json).not.toContain(fixture.member.userName!)
    expect(json).not.toContain("user-long-and-email-name")
    for (const other of fixtures.filter((f) => f.id !== fixture.id)) {
      expect(json).not.toContain(other.member.displayName)
    }
  })

  it("keeps the heavy fixture's full sheet under 10 KB", async () => {
    const json = JSON.stringify(buildFactSheet(await factsOf("heavy"), FACT_IDS))

    expect(Buffer.byteLength(json)).toBeLessThan(10 * 1024)
  })
})
