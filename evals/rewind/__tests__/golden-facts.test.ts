/**
 * @jest-environment node
 */

/**
 * Golden facts (P2.16): every fixture runs through the fixture source,
 * `computeMemberStats`, `selectArchetype` and `buildFacts` (en-US, the
 * default locale), and its hand-checked edition, archetype, omitted pages
 * and fact displays must match exactly. The hand values live in
 * `evals/rewind/profiles/*.ts`, derived with `evals/rewind/hand-facts.py`
 * and never updated by tooling; the snapshot of every fact's display
 * catches drift in the facts nobody checked by hand. CI runs this file under
 * TZ=UTC and TZ=Australia/Sydney.
 */

import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import type { Fixture } from "../fixture-schema"
import { loadFixtures } from "./load-fixtures"
import { fixtureMember, type FixtureMember } from "./member-stats"
import { editionOf, omittedPages } from "./pages"
import { FIXTURE_USER_ID } from "./stats-inputs"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function factsOf(fixture: Fixture, member: FixtureMember) {
  const archetype = selectArchetype(member.stats, { userId: FIXTURE_USER_ID, year: fixture.window.year, counts: null })
  const facts = buildFacts(member.stats, {
    member: { name: fixture.member.userName ?? fixture.member.displayName },
    window: { ...member.ctx.window, year: fixture.window.year, finalCut: fixture.window.finalCut },
    archetype,
    locale: "en-US",
  })
  return { archetype, facts }
}

const displays = (facts: RewindFactsV3, ids: readonly string[]) =>
  Object.fromEntries(ids.map((id) => [id, facts[id as keyof RewindFactsV3]?.display ?? null]))

describe.each(loadFixtures().map((fixture) => [fixture.id, fixture] as const))("golden facts: %s", (_id, fixture) => {
  const { expected } = fixture
  let member: FixtureMember
  let result: ReturnType<typeof factsOf>

  beforeAll(async () => {
    member = await fixtureMember(fixture)
    result = factsOf(fixture, member)
  })

  it("picks the hand-checked archetype", () => {
    expect(result.archetype?.id ?? null).toBe(expected.archetype)
  })

  it("omits the hand-checked pages and gets the hand-checked edition", () => {
    const omitted = omittedPages(result.facts, member.stats)
    expect(omitted).toEqual(expected.omittedPages)
    expect(editionOf(member.stats, omitted)).toBe(expected.edition)
  })

  it("displays every hand-checked fact as the hand value", () => {
    expect(displays(result.facts, Object.keys(expected.facts))).toEqual(expected.facts)
  })

  it("keeps every fact's display (snapshot)", () => {
    expect(displays(result.facts, Object.keys(result.facts).sort())).toMatchSnapshot()
  })
})
