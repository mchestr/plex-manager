/**
 * A golden fixture run the way the member pipeline will run it (P5.9): the
 * fixture source, the member's zone and window, every source the fixture
 * carries, then `computeMemberStats`. The P2.9 tests and P2.16's goldens
 * start from it.
 */

import { createFixtureSource } from "@/lib/wrapped/sources/fixture-source"
import { directLimiter, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeMemberStats, type MemberStats } from "@/lib/wrapped/stats/compute"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import type { MetadataLookup } from "@/lib/wrapped/stats/metadata"
import { dataWindow, resolveZone } from "@/lib/wrapped/time/zone"

import type { Fixture } from "../fixture-schema"
import { fixtureLookup, fixtureRequests } from "./stats-inputs"

export interface FixtureMember {
  ctx: StatsContext
  events: PlayEvent[]
  lifetime: PlayEvent[]
  metadata: MetadataLookup
  stats: MemberStats
}

export async function fixtureMember(fixture: Fixture): Promise<FixtureMember> {
  const { zone } = resolveZone({ timezone: fixture.member.timezone }, fixture.server.zone)
  const { finalCut } = fixture.window
  const ctx: StatsContext = {
    zone,
    window: dataWindow(fixture.window.year, zone, { finalCut }),
    finalCut,
    hiddenKeys: new Set(fixture.member.hiddenRatingKeys),
  }
  const source = createFixtureSource(fixture)
  const year = await source.fetchYear({ plexUserId: "1" }, ctx.window, { limiter: directLimiter })
  const lifetime = await source.fetchLifetime()
  if (!year.ok || !lifetime.ok) throw new Error(`${fixture.id}: the fixture source failed`)
  const metadata = fixtureLookup(fixture, [...year.data, ...lifetime.data])
  const stats = computeMemberStats(year.data, ctx, {
    lifetime: lifetime.data,
    metadata,
    requests: fixtureRequests(fixture, ctx),
    aggregate: null,
    library: null,
    excludedContentRatings: [],
  })
  return { ctx, events: year.data, lifetime: lifetime.data, metadata, stats }
}
