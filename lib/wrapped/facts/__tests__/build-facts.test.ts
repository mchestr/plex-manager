/**
 * @jest-environment node
 */

/**
 * `buildFacts` on the heavy fixture (the mockup member), the display rules,
 * the name rule, absent ineligible facts, and the facts hash.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember, type FixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts, firstName } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { display } from "@/lib/wrapped/facts/display"
import { canonicalJson, factsHash } from "@/lib/wrapped/facts/hash"

const fixtures = new Map(loadFixtures().map((f) => [f.id, f]))
const plain = (text: string | undefined) => text?.replace(/\u00A0/g, " ")

async function factsOf(id: string, locale = "en-US"): Promise<{ facts: RewindFactsV3; member: FixtureMember }> {
  const fixture = fixtures.get(id)!
  const member = await fixtureMember(fixture)
  const facts = buildFacts(member.stats, {
    member: { name: fixture.member.userName ?? fixture.member.displayName },
    window: { ...member.ctx.window, year: 2026, finalCut: member.ctx.finalCut },
    archetype: selectArchetype(member.stats, { userId: id, year: 2026, counts: null }),
    locale,
  })
  return { facts, member }
}

describe("buildFacts", () => {
  it("prints the heavy fixture's mockup numbers", async () => {
    const { facts } = await factsOf("heavy")

    expect(facts["time.totalHours"]).toEqual({ value: 1307, display: "1,307", unit: "hours" })
    expect(plain(facts["time.daysHours"]?.display)).toBe("54 days, 11 hours")
    expect(plain(facts["hours.peak"]?.display)).toBe("10 PM")
    expect(facts["hours.afterDarkShare"]?.display).toBe("34%")
    expect(plain(facts["streak.longest.days"]?.display)).toBe("23 days")
    expect(plain(facts["days.biggest.minutes"]?.display)).toBe("12 h 24 m")
    expect(facts["days.active"]?.display).toBe("289")
    expect(facts["time.vsLastYear"]?.display).toBe("+18%")
    expect(facts["member.firstName"]?.display).toBe("Mike")
  })

  it("names the heavy member's archetype with three evidence facts", async () => {
    const { facts } = await factsOf("heavy")

    expect(facts["archetype.name"]?.display).toBe("The Midnight Marathoner")
    expect(["archetype.evidence[1]", "archetype.evidence[2]", "archetype.evidence[3]"].map((id) => facts[id as keyof RewindFactsV3]?.value)).toEqual([
      "hours.afterDarkShare",
      "hours.peak",
      "hours.quietest",
    ])
    expect(plain(facts["archetype.evidence[2]"]?.display)).toBe("10 PM")
  })

  it("keeps a non-breaking space between every number and its unit", async () => {
    const { facts } = await factsOf("heavy")

    expect(facts["hours.peak"]?.display).toBe("10\u00A0PM")
    expect(facts["time.perDay"]?.display).toBe("3\u00A0h 54\u00A0m")
  })

  it("follows Config.locale", async () => {
    const { facts } = await factsOf("heavy", "en-GB")

    expect(plain(facts["days.biggest.date"]?.display)).toBe("4 July")
    expect((await factsOf("heavy")).facts["days.biggest.date"]?.display).toBe("July\u00A04")
  })

  it("leaves ineligible facts out rather than null", async () => {
    const postcard = (await factsOf("postcard")).facts
    const noOverseerr = (await factsOf("no-overseerr")).facts

    expect(postcard["time.totalMinutes"]?.display).toBe("12\u00A0minutes")
    expect(postcard["time.totalHours"]).toBeUndefined()
    expect(postcard["archetype.id"]).toBeUndefined()
    expect(noOverseerr["requests.made"]).toBeUndefined()
    expect(Object.values(postcard).every((fact) => fact?.value !== null)).toBe(true)
  })

  it("asks the Guess page only when No. 1 leads No. 2 by more than 2% (D7)", async () => {
    // Heavy's No. 1 series leads by 50 minutes, 1.5%: no quiz.
    expect((await factsOf("heavy")).facts["quiz.gapMinutes"]).toBeUndefined()
    expect(plain((await factsOf("median")).facts["quiz.gapMinutes"]?.display)).toBe("21 h")
  })

  it("never uses an email-like name", async () => {
    expect((await factsOf("long-and-email-name")).facts["member.firstName"]).toBeUndefined()
  })
})

describe("firstName", () => {
  it.each([
    ["  Mike Chester ", "Mike"],
    ["mike@example.com", null],
    [null, null],
    ["Maximilianusthegreatestofall Smith", "Maximilianusthegreatesto"],
  ])("reads %j as %j", (name, expected) => {
    expect(firstName(name)).toBe(expected)
  })
})

describe("display (JSDoc examples)", () => {
  it.each([
    ["hours", 1307, "1,307"],
    ["days-hours", 78420, "54\u00A0days, 11\u00A0hours"],
    ["hour", 22, "10\u00A0PM"],
    ["change", 0.18, "+18%"],
    ["change", -0.05, "\u22125%"],
    ["times", 2, "watched twice"],
    ["times", 3, "watched three times"],
    ["percentile", 3, "Top 3%"],
    ["rank", 1, "#1"],
    ["month", 11, "November"],
    ["year", 2023, "2023"],
    ["time", 2 * 60 + 47, "2:47\u00A0AM"],
    ["weekday", 0, "Sunday"],
    ["days", 1, "1\u00A0day"],
    ["share", 0.004, "under 1%"],
  ] as const)("%s %p reads %j", (unit, value, expected) => {
    expect(display(unit, value, { locale: "en-US" })).toBe(expected)
  })
})

describe("factsHash", () => {
  const facts: RewindFactsV3 = {
    "time.totalHours": { value: 1307, display: "1,307", unit: "hours" },
    "hours.peak": { value: 22, display: "10 PM", unit: "hour" },
  }

  it("is stable across key order", () => {
    const reordered: RewindFactsV3 = { "hours.peak": facts["hours.peak"], "time.totalHours": facts["time.totalHours"] }

    expect(factsHash(reordered)).toBe(factsHash(facts))
    expect(factsHash(facts)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when a value changes, not when only a display does", () => {
    expect(factsHash({ ...facts, "hours.peak": { value: 21, display: "9 PM", unit: "hour" } })).not.toBe(factsHash(facts))
    expect(factsHash({ ...facts, "hours.peak": { value: 22, display: "22:00", unit: "hour" } })).toBe(factsHash(facts))
  })

  it("matches the canonicalJson JSDoc example", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}')
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}')
  })
})
