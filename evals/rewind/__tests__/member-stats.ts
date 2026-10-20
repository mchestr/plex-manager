/**
 * A golden fixture run the way the member pipeline runs it (P5.9): the
 * fixture source, the member's zone and window, every source the fixture
 * carries (the aggregate built from `server.peers`), then
 * `computeMemberStats`. The P2.9 tests and P2.16's goldens start from
 * {@link fixtureMember}; the pipeline's golden test feeds
 * {@link fixtureInputs} to `generateUserRewind`.
 */

import { createFixtureSource } from "@/lib/wrapped/sources/fixture-source"
import { directLimiter, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeMemberStats, type MemberSources, type MemberStats } from "@/lib/wrapped/stats/compute"
import { computeTotals } from "@/lib/wrapped/stats/totals"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import type { MetadataLookup } from "@/lib/wrapped/stats/metadata"
import { dataWindow, resolveZone } from "@/lib/wrapped/time/zone"

import type { Fixture } from "../fixture-schema"
import { fixtureAggregate, fixtureLibrary, fixtureLookup, fixtureRequests } from "./stats-inputs"

export interface FixtureInputs {
  ctx: StatsContext
  events: PlayEvent[]
  lifetime: PlayEvent[]
  metadata: MetadataLookup
  sources: MemberSources
}

export interface FixtureMember extends Omit<FixtureInputs, "sources"> {
  stats: MemberStats
}

/** The member's zone, window, plays and every stats source the fixture carries. */
export async function fixtureInputs(fixture: Fixture): Promise<FixtureInputs> {
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
  const sources: MemberSources = {
    lifetime: lifetime.data,
    metadata,
    requests: fixtureRequests(fixture, ctx),
    aggregate: fixtureAggregate(fixture, computeTotals(year.data, ctx).totalMinutes),
    library: fixtureLibrary(fixture),
    excludedContentRatings: [],
  }
  return { ctx, events: year.data, lifetime: lifetime.data, metadata, sources }
}

export async function fixtureMember(fixture: Fixture): Promise<FixtureMember> {
  const { sources, ...inputs } = await fixtureInputs(fixture)
  return { ...inputs, stats: computeMemberStats(inputs.events, inputs.ctx, sources) }
}
