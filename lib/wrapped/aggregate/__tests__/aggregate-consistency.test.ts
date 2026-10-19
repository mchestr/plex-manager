/**
 * @jest-environment node
 */

/**
 * Rarity and the member's own archetype can never disagree (design 7.4): for
 * every golden fixture, the archetype the aggregate scores from its inputs
 * equals the one the member's own Rewind picks with every source, and a
 * server of all twenty fixtures counts exactly the members' own picks.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember, type FixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { scoreMember } from "@/lib/wrapped/aggregate/archetypes"
import { computeServerYear } from "@/lib/wrapped/aggregate/server-year"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import type { MetadataLookup } from "@/lib/wrapped/stats/metadata"

const fixtures = loadFixtures()
const members = new Map<string, FixtureMember>()

beforeAll(async () => {
  for (const fixture of fixtures) members.set(fixture.id, await fixtureMember(fixture))
})

describe.each(fixtures.map((fixture) => [fixture.id] as const))("aggregate consistency: %s", (id) => {
  it("scores the member in the aggregate as their own Rewind does", () => {
    const { stats, ctx, events, metadata } = members.get(id)!
    const own = selectArchetype(stats, { userId: id, year: 2026, counts: null })
    const { pick } = scoreMember({ userId: id, events, ctx, metadata }, 2026)

    expect(pick).toEqual(own)
  })
})

describe("a server of all twenty fixtures", () => {
  it("counts exactly the members' own archetypes, with rarity and medians", () => {
    expect(new Set(fixtures.map((f) => f.window.finalCut)).size).toBe(1)
    // Fixtures reuse rating keys with different metadata, so each play reads its own fixture's cache.
    const lookupOf = new WeakMap<PlayEvent, MetadataLookup>()
    for (const { events, metadata } of members.values()) for (const e of events) lookupOf.set(e, metadata)

    const aggregate = computeServerYear({
      eventsByTautulliUser: new Map(fixtures.map((f, i) => [String(i + 1), members.get(f.id)!.events])),
      members: fixtures.map((f, i) => ({ userId: f.id, tautulliUserId: String(i + 1), zone: members.get(f.id)!.ctx.zone })),
      window: { year: 2026, finalCut: fixtures[0].window.finalCut, serverZone: "UTC" },
      serverRequests: null,
      libraryItems: [],
      hiddenKeys: new Map(fixtures.map((f) => [f.id, members.get(f.id)!.ctx.hiddenKeys])),
      metadata: (e) => lookupOf.get(e as PlayEvent)?.(e),
    })

    const tally: Record<string, number> = {}
    for (const fixture of fixtures) {
      const own = selectArchetype(members.get(fixture.id)!.stats, { userId: fixture.id, year: 2026, counts: aggregate })
      if (!own) continue
      tally[own.id] = (tally[own.id] ?? 0) + 1
      expect(own.rarity).toEqual({ count: aggregate.archetypeCounts![own.id], of: aggregate.scoredMembers })
    }
    expect(aggregate.archetypeCounts).toEqual(tally)
    expect(aggregate.scoredMembers).toBe(18) // the postcard and seven-minutes members have no archetype
    expect(aggregate.medians?.completionShare).toBe(1)
  })
})
