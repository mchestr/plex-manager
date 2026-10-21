/**
 * 14 Requests' selection (design 4.3, RWP-06): the corrected statuses, the
 * watched join through cached guids, declined requests kept off the
 * headline, and the page omitted without Overseerr.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { requestsPage } from "@/lib/rewind/pages/requests"
import { RequestsDataSchema } from "@/lib/rewind/pages/requests.schema"
import { headline } from "@/lib/wrapped/copy/templates"
import { toRequestEvent } from "@/lib/wrapped/sources/request-event"
import type { OverseerrRequestRow } from "@/lib/wrapped/sources/schemas"
import { play } from "@/lib/wrapped/stats/__tests__/build-events"
import { lookupFor, meta } from "@/lib/wrapped/stats/__tests__/build-lookups"
import { computeRequests } from "@/lib/wrapped/stats/requests"

import { factsFor, FORBIDDEN_KEY, keysOf, selectContext } from "./helpers/server-act"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues[id] = await fixtureIssue(id)
})

let nextId = 1
function row(status: number, media: Partial<OverseerrRequestRow["media"]>, type: "movie" | "tv" = "movie"): OverseerrRequestRow {
  return { id: nextId++, status, type, createdAt: "2026-03-01T12:00:00Z", requestedBy: { id: 7 }, media: { status: 1, tmdbId: 100 + nextId, ...media } }
}

/** The median member with these requests and plays: facts and page data. */
function selectWith(rows: OverseerrRequestRow[], events = [play({ at: "2026-03-02T20:00", zone: "UTC", film: "1" })], guids: string[] = []) {
  const base = issues.median
  const lookup = lookupFor(events, Object.fromEntries(events.map((e) => [e.grandparentRatingKey ?? e.ratingKey, meta({ guids })])))
  const stats = { ...base.stats, requests: computeRequests(events, rows.map(toRequestEvent), lookup) }
  const facts = factsFor(stats)
  return { facts, data: requestsPage.select(facts, selectContext(base, { stats })) }
}

describe("14 Requests select", () => {
  it.each(FIXTURE_IDS)("%s: returns valid data or null", (id) => {
    const issue = issues[id]
    const data = requestsPage.select(issue.facts, selectContext(issue))
    expect(data !== null).toBe(issue.stats.requests.eligible)
    if (data) {
      expect(RequestsDataSchema.safeParse(data).success).toBe(true)
      expect(keysOf(data).filter((key) => FORBIDDEN_KEY.test(key))).toEqual([])
    }
  })

  it("is null on no-overseerr and with no requests", () => {
    const issue = issues["no-overseerr"]
    expect(requestsPage.select(issue.facts, selectContext(issue))).toBeNull()
    expect(selectWith([]).data).toBeNull()
  })

  it("counts statuses 2 and 5 as approved, and 1 and 3 as not", () => {
    const { facts, data } = selectWith([row(1, {}), row(2, {}), row(3, {}), row(5, {})])
    expect(facts["requests.approved"]?.value).toBe(2)
    expect(facts["requests.pending"]?.value).toBe(1)
    expect(facts["requests.declined"]?.value).toBe(1)
    expect(data!.lines).toEqual(["requests.approved", "requests.pending", "requests.declined"])
  })

  it("follows media.status for available: 5 for a film, 4 or 5 for a series", () => {
    const { facts } = selectWith([row(2, { status: 4 }), row(5, { status: 5 }), row(2, { status: 4 }, "tv"), row(2, { status: 3 }, "tv")])
    expect(facts["requests.available"]?.value).toBe(2)
  })

  it("never puts a declined request in the headline", () => {
    const { facts, data } = selectWith([row(3, {}), row(3, {}), row(2, {})])
    expect(data!.lines).toContain("requests.declined")
    expect(headline("requests", facts)).not.toMatch(/declined/i)
    expect(headline("requests", facts)).toBe("You asked for {{fact:requests.made}}.")
  })

  it("joins watched through tmdb:// guids and ignores plex:// ones", () => {
    const film = play({ at: "2026-03-02T20:00", zone: "UTC", film: "1" })
    const requested = row(5, { status: 5, tmdbId: 603 })
    expect(selectWith([requested], [{ ...film, guid: "plex://movie/5d776" }], ["plex://movie/5d776"]).facts["requests.watched"]?.value).toBe(0)
    const { facts, data } = selectWith([requested], [film], ["tmdb://603"])
    expect(facts["requests.watched"]?.value).toBe(1)
    expect(data!.lines).toContain("requests.watched")
  })

  it("leaves a zero line out, and shares counts only", () => {
    const { data } = selectWith([row(2, {})])
    expect(data!.lines).toEqual(["requests.approved"])
    expect(requestsPage.share.facts.every((id) => id.startsWith("requests.") && !id.includes("genre"))).toBe(true)
    expect(requestsPage.share.titles).toBeUndefined()
  })
})
