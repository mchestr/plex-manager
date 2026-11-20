/** Request fields (TS 4.3, 4.5): applicable requests by level, `matchesRef` with Kleene logic, and the unknown causes. */

import {
  buildCondition,
  buildEvalContext,
  buildLiveFacts,
  buildMovieItem,
  buildSeasonItem,
  buildShowItem,
  daysAgo,
  NOW,
  NOW_S,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { conditionFact, whySheetFact } from "@/lib/cleanup/engine/fields"
import { applicableRequests, DECLINED, matchesRef, requesterRequests } from "@/lib/cleanup/engine/fields/request-set"
import { age, by, exists, requesters } from "@/lib/cleanup/engine/fields/requests"
import type { EvalContext, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { RequestFact, SnapshotItem, SnapshotUser, Viewer } from "@/lib/cleanup/schema/snapshot"
import type { ConditionOf, RequesterRef } from "@/lib/validations/cleanup-rule"

const OVERSEERR_FAILED: FieldVerdict = { verdict: "unknown", cause: { kind: "sourceFailed", service: "overseerr" } }
const NO_PLEX_ID: FieldVerdict = { verdict: "unknown", cause: { kind: "noValue", what: "requester" } }
const NO_ACCESS: FieldVerdict = { verdict: "unknown", cause: { kind: "noValue", what: "access" } }

const req = (overrides: Partial<RequestFact> = {}): RequestFact => ({ at: daysAgo(200), by: "100", status: 2, is4k: false, seasons: null, ...overrides })
const movie = (requests: RequestFact[] | null, overrides: Partial<SnapshotItem> = {}) => buildMovieItem({ requests, ...overrides })
const viewer = (user: string, overrides: Partial<Viewer> = {}): Viewer => ({
  user, lastCountedAt: daysAgo(20), lastCountedFinished: false, counted: 1, finished: false, finishedEpisodes: 0, ...overrides,
})
const withViewers = (item: SnapshotItem, viewers: Viewer[]): SnapshotItem => ({ ...item, plays: { lastCountedAt: daysAgo(20), countedAt: [daysAgo(20)], viewers } })

const user = (overrides: Partial<SnapshotUser> = {}): SnapshotUser => ({ hasAccess: true, lastPlayAt: daysAgo(10), owner: false, ...overrides })
const USERS = new Map<string, SnapshotUser>([
  ["100", user()], // a member with access, played 10 days ago
  ["200", user({ hasAccess: false, lastPlayAt: daysAgo(400) })], // a former member
  ["300", user({ hasAccess: null, lastPlayAt: null })], // access unknown
  ["1", user({ owner: true, lastPlayAt: daysAgo(2) })], // the owner
])
const MEMBERS = [
  { userId: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null },
  { userId: "u-blake", plexUserId: "200", name: "Blake Example", accessEndedAt: new Date(NOW - 50 * 86_400_000) },
  { userId: "u-casey", plexUserId: null, name: "Casey Example", accessEndedAt: null },
]
const ctx = buildEvalContext({ users: USERS, memberPlexIds: new Map([["u-avery", "100"], ["u-blake", "200"]]), live: buildLiveFacts({ members: MEMBERS }) })
const down = (overrides: Partial<EvalContext["sources"]>) => buildEvalContext({ ...ctx, sources: { ...ctx.sources, ...overrides } })

describe("applicable requests by level (TS 4.3)", () => {
  it("drops declined requests and counts 4K requests", () => {
    const item = movie([req({ status: DECLINED }), req({ is4k: true, at: daysAgo(5) })])
    expect(applicableRequests(item)).toEqual([req({ is4k: true, at: daysAgo(5) })])
    expect(exists.evaluate(movie([req({ status: DECLINED })]), buildCondition("request.exists"), ctx, "condition").verdict).toBe("pass")
    expect(exists.evaluate(movie([req({ is4k: true })]), buildCondition("request.exists", { value: { exists: true } }), ctx, "condition").verdict).toBe("pass")
  })

  it("gives a season the show's requests that name it, or name no season", () => {
    const requests = [req({ seasons: [1], at: daysAgo(10) }), req({ seasons: null, at: daysAgo(20) }), req({ seasons: [2, 3], at: daysAgo(30) })]
    const show = buildShowItem({ requests })
    expect(applicableRequests(show)).toHaveLength(3)
    expect(applicableRequests(buildSeasonItem(show, 1))?.map((r) => r.at)).toEqual([daysAgo(10), daysAgo(20)])
    expect(applicableRequests(buildSeasonItem(show, 3))?.map((r) => r.at)).toEqual([daysAgo(20), daysAgo(30)])
    expect(applicableRequests(buildSeasonItem(show, 4, { requests: [req({ seasons: [1] })] }))).toEqual([])
    expect(applicableRequests(buildSeasonItem(show, 1, { seasonNumber: null }))?.map((r) => r.at)).toEqual([daysAgo(20)])
    expect(applicableRequests(movie(null))).toBeNull()
  })

  it("reads the requesters of a season from the show's requests of any season", () => {
    const show = buildShowItem({ requests: [req({ seasons: [1] }), req({ seasons: [2], status: DECLINED })] })
    const season = buildSeasonItem(show, 3, { requests: [] })
    expect(requesterRequests(season, buildEvalContext({ showsByKey: new Map([[show.key, show]]) }))).toEqual([req({ seasons: [1] })])
    expect(requesterRequests(season, buildEvalContext())).toEqual([])
    expect(requesterRequests(season, buildEvalContext({ showsByKey: new Map([[show.key, { ...show, requests: null }]]) }))).toBeNull()
  })
})

describe("request.exists and request.age", () => {
  it.each<[string, SnapshotItem, boolean, FieldVerdict["verdict"]]>([
    ["no request: exists false passes", movie([]), false, "pass"],
    ["no request: exists true fails", movie([]), true, "fail"],
    ["a request: exists true passes", movie([req()]), true, "pass"],
    ["a request: exists false fails", movie([req()]), false, "fail"],
  ])("%s", (_name, item, wanted, expected) => {
    expect(exists.evaluate(item, buildCondition("request.exists", { value: { exists: wanted } }), ctx, "condition").verdict).toBe(expected)
  })

  const ageC = (op: "moreThan" | "lessThan", amount: number) => buildCondition("request.age", { op, value: { duration: { amount, unit: "days" } } })
  it.each<[string, SnapshotItem, ConditionOf<"request.age">, FieldVerdict["verdict"]]>([
    ["more than: an old request passes", movie([req({ at: daysAgo(200) })]), ageC("moreThan", 120), "pass"],
    ["more than: the newest request decides", movie([req({ at: daysAgo(200) }), req({ at: daysAgo(50) })]), ageC("moreThan", 120), "fail"],
    ["more than: no request fails", movie([]), ageC("moreThan", 120), "fail"],
    ["less than: a recent request passes", movie([req({ at: daysAgo(10) })]), ageC("lessThan", 30), "pass"],
    ["less than: an old request fails", movie([req({ at: daysAgo(40) })]), ageC("lessThan", 30), "fail"],
    ["less than: no request fails", movie([]), ageC("lessThan", 30), "fail"],
  ])("%s", (_name, item, c, expected) => {
    expect(age.evaluate(item, c, ctx, "condition").verdict).toBe(expected)
  })

  it("compares instants at the boundary", () => {
    const item = movie([req({ at: NOW_S - 120 * 86_400 })])
    expect(age.evaluate(item, ageC("moreThan", 120), buildEvalContext({ now: NOW }), "condition").verdict).toBe("fail")
    expect(age.evaluate(item, ageC("moreThan", 120), buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("pass")
  })

  it("is unknown while Overseerr failed or is not set up", () => {
    expect(exists.evaluate(movie(null), buildCondition("request.exists"), ctx, "condition")).toEqual(OVERSEERR_FAILED)
    expect(age.evaluate(movie(null), ageC("moreThan", 120), ctx, "condition")).toEqual(OVERSEERR_FAILED)
    expect(exists.evaluate(movie([]), buildCondition("request.exists"), down({ overseerr: "notConfigured" }), "condition")).toEqual(OVERSEERR_FAILED)
    expect(age.evaluate(movie([req()]), ageC("moreThan", 1), down({ overseerr: "failed" }), "protection")).toEqual(OVERSEERR_FAILED)
  })

  it("gives the near-miss values of a date field", () => {
    const item = movie([req({ at: daysAgo(100) })])
    expect(age.gap?.(item, ageC("moreThan", 120), ctx)).toBe(20)
    expect(age.gap?.(movie([]), ageC("moreThan", 120), ctx)).toBeNull()
    expect(age.forecast?.(item, ageC("moreThan", 120), ctx)).toBe("2026-11-29") // Jul 31, 2026 plus 121 days
    expect(age.forecast?.(item, ageC("lessThan", 120), ctx)).toBeNull()
    expect(age.forecast?.(movie(null), ageC("moreThan", 120), ctx)).toBeNull()
    expect(age.tryValue?.(item, ageC("moreThan", 120), ctx)).toEqual({ duration: { amount: 99, unit: "days" } })
    expect(age.tryValue?.(item, ageC("lessThan", 30), ctx)).toEqual({ duration: { amount: 101, unit: "days" } })
    expect(age.tryValue?.(movie([]), ageC("lessThan", 30), ctx)).toBeNull()
    expect(age.tryValue?.(movie([req({ at: daysAgo(0.5) })]), ageC("moreThan", 30), ctx)).toBeNull()
    expect(age.measure?.(item, ctx)).toBe(100)
    expect(age.measure?.(movie([]), ctx)).toBeNull()
    expect(exists.gap?.(item, buildCondition("request.exists"), ctx)).toBeNull()
  })

  it("states when it was requested (TS 4.5)", () => {
    const march = Date.parse("2024-03-10T12:00:00Z") / 1000
    expect(exists.fact(movie([req({ at: march })]), ctx)).toEqual([{ text: "Requested Mar 2024." }])
    expect(age.fact(movie([req({ at: march - 9_000_000 }), req({ at: march })]), ctx)).toEqual([{ text: "Requested Mar 2024." }])
    expect(age.fact(movie([]), ctx)).toEqual([{ text: "Nobody requested it." }])
    const arr = buildMovieItem().arr
    const listed = movie([], { arr: arr && { ...arr, importList: true } })
    expect(exists.fact(listed, ctx)).toEqual([{ text: "Came from an import list." }])
    expect(conditionFact(buildCondition("request.age"), movie(null), ctx)).toEqual([])
  })
})

describe("matchesRef (TS 4.3)", () => {
  it.each<[string, string | null, RequesterRef, FieldVerdict]>([
    ["any member: a requester passes", "100", { kind: "anyMember" }, { verdict: "pass" }],
    ["any member: no Plex id is unknown", null, { kind: "anyMember" }, NO_PLEX_ID],
    ["former: no access passes", "200", { kind: "former" }, { verdict: "pass" }],
    ["former: access fails", "100", { kind: "former" }, { verdict: "fail" }],
    ["former: the owner fails", "1", { kind: "former" }, { verdict: "fail" }],
    ["former: access null is unknown", "300", { kind: "former" }, NO_ACCESS],
    ["former: no entry fails", "999", { kind: "former" }, { verdict: "fail" }],
    ["former: no Plex id is unknown", null, { kind: "former" }, NO_PLEX_ID],
    ["inactive: an old play passes", "200", { kind: "inactive", days: 90 }, { verdict: "pass" }],
    ["inactive: a recent play fails", "100", { kind: "inactive", days: 90 }, { verdict: "fail" }],
    ["inactive: no play passes", "300", { kind: "inactive", days: 90 }, { verdict: "pass" }],
    ["inactive: no entry passes", "999", { kind: "inactive", days: 90 }, { verdict: "pass" }],
    ["inactive: no Plex id is unknown", null, { kind: "inactive", days: 90 }, NO_PLEX_ID],
    ["member: the member's account passes", "100", { kind: "member", userId: "u-avery" }, { verdict: "pass" }],
    ["member: another account fails", "200", { kind: "member", userId: "u-avery" }, { verdict: "fail" }],
    ["member: an unknown member fails", "100", { kind: "member", userId: "u-gone" }, { verdict: "fail" }],
    ["member: no Plex id is unknown", null, { kind: "member", userId: "u-avery" }, NO_PLEX_ID],
  ])("%s", (_name, requester, ref, expected) => {
    expect(matchesRef(requester, ref, ctx)).toEqual(expected)
  })

  it("is unknown for inactive members while Tautulli is not ok", () => {
    const failed = { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }
    expect(matchesRef("200", { kind: "inactive", days: 90 }, down({ tautulli: "failed" }))).toEqual(failed)
    expect(matchesRef("200", { kind: "inactive", days: 90 }, down({ tautulli: "notConfigured" }))).toEqual(failed)
  })

  it("compares the last play as an instant", () => {
    const users = new Map([["400", user({ lastPlayAt: NOW_S - 90 * 86_400 })]])
    expect(matchesRef("400", { kind: "inactive", days: 90 }, buildEvalContext({ users, now: NOW })).verdict).toBe("fail")
    expect(matchesRef("400", { kind: "inactive", days: 90 }, buildEvalContext({ users, now: NOW + 1 })).verdict).toBe("pass")
  })
})

describe("request.by", () => {
  const byC = (op: ConditionOf<"request.by">["op"], refs: RequesterRef[] = [{ kind: "former" }]) =>
    buildCondition("request.by", { op, value: { requesters: refs } })
  const who = (...ids: (string | null)[]) => movie(ids.map((id, i) => req({ by: id, at: daysAgo(10 + i) })))

  it.each<[string, SnapshotItem, ConditionOf<"request.by">, FieldVerdict]>([
    ["any of: no request fails", who(), byC("anyOf"), { verdict: "fail" }],
    ["any of: a former requester passes", who("100", "200"), byC("anyOf"), { verdict: "pass" }],
    ["any of: a member only fails", who("100"), byC("anyOf"), { verdict: "fail" }],
    ["any of: an unknown requester and a member is unknown", who("100", null), byC("anyOf"), NO_PLEX_ID],
    ["any of: a former requester beats an unknown one", who(null, "200"), byC("anyOf"), { verdict: "pass" }],
    ["only: no request fails", who(), byC("only"), { verdict: "fail" }],
    ["only: former requesters pass", who("200", "200"), byC("only"), { verdict: "pass" }],
    ["only: a member among them fails", who("200", "100"), byC("only"), { verdict: "fail" }],
    ["only: an unknown requester is unknown", who("200", null), byC("only"), NO_PLEX_ID],
    ["only: a member beats an unknown requester", who("100", null), byC("only"), { verdict: "fail" }],
    ["only: a former member with access null is unknown", who("300"), byC("only"), NO_ACCESS],
    ["none of: no request passes", who(), byC("noneOf"), { verdict: "pass" }],
    ["none of: members pass", who("100", "1"), byC("noneOf"), { verdict: "pass" }],
    ["none of: a former requester fails", who("100", "200"), byC("noneOf"), { verdict: "fail" }],
    ["none of: an unknown requester is unknown", who("100", null), byC("noneOf"), NO_PLEX_ID],
    ["none of: a former requester beats an unknown one", who("200", null), byC("noneOf"), { verdict: "fail" }],
    ["two refs: either can match", who("100", "200"), byC("only", [{ kind: "former" }, { kind: "member", userId: "u-avery" }]), { verdict: "pass" }],
    ["inactive members", who("200"), byC("only", [{ kind: "inactive", days: 90 }]), { verdict: "pass" }],
  ])("%s", (_name, item, c, expected) => {
    expect(by.evaluate(item, c, ctx, "condition")).toEqual(expected)
  })

  it("is unknown while Overseerr failed", () => {
    expect(by.evaluate(movie(null), byC("noneOf"), ctx, "condition")).toEqual(OVERSEERR_FAILED)
    expect(by.evaluate(who("200"), byC("only"), down({ overseerr: "notConfigured" }), "condition")).toEqual(OVERSEERR_FAILED)
  })

  it("names the requesters on admin surfaces (TS 4.5, X8)", () => {
    expect(by.fact(who(), ctx)).toEqual([{ text: "Nobody requested it." }])
    expect(by.fact(who("200", "200"), ctx)).toEqual([{ text: "Requested only by a former member." }])
    expect(by.fact(who("100"), ctx)).toEqual([{ text: "Requested by Avery Example." }])
    expect(by.fact(who("100", "999", null), ctx)).toEqual([{ text: "Requested by Avery Example and Unknown member." }])
    expect(by.fact(who("100", "200", "999"), ctx)).toEqual([{ text: "Requested by Avery Example, Blake Example and Unknown member." }])
    expect(by.fact(movie(null), ctx)).toEqual([])
    expect(by.gap?.(who("100"), byC("only"), ctx)).toBeNull()
    expect(by.tryValue?.(who("100"), byC("only"), ctx)).toBeNull()
  })
})

describe("request.requesters", () => {
  const never = buildCondition("request.requesters", { value: { did: "neverPlayed" } })
  const done = buildCondition("request.requesters", { value: { did: "allFinished" } })
  const item = (ids: (string | null)[], viewers: Viewer[]) => withViewers(movie(ids.map((id) => req({ by: id }))), viewers)

  it.each<[string, SnapshotItem, ConditionOf<"request.requesters">, FieldVerdict]>([
    ["never played: no viewer row passes", item(["100"], []), never, { verdict: "pass" }],
    ["never played: a row with no counted play passes", item(["100"], [viewer("100", { counted: 0, lastCountedAt: null })]), never, { verdict: "pass" }],
    ["never played: another viewer does not count", item(["100"], [viewer("200")]), never, { verdict: "pass" }],
    ["never played: a counted play fails", item(["100", "200"], [viewer("200")]), never, { verdict: "fail" }],
    ["never played: no request fails", item([], []), never, { verdict: "fail" }],
    ["never played: an unknown requester is unknown", item(["100", null], []), never, NO_PLEX_ID],
    ["never played: a known play beats an unknown requester", item(["100", null], [viewer("100")]), never, { verdict: "fail" }],
    ["all finished: every requester finished", item(["100", "200"], [viewer("100", { finished: true }), viewer("200", { finished: true })]), done,
      { verdict: "pass" }],
    ["all finished: one did not", item(["100", "200"], [viewer("100", { finished: true }), viewer("200")]), done, { verdict: "fail" }],
    ["all finished: no viewer row fails", item(["100"], []), done, { verdict: "fail" }],
    ["all finished: no request fails", item([], []), done, { verdict: "fail" }],
    ["all finished: an unknown requester is unknown", item(["100", null], [viewer("100", { finished: true })]), done, NO_PLEX_ID],
    ["all finished: a known unfinished beats an unknown requester", item(["100", null], [viewer("100")]), done, { verdict: "fail" }],
  ])("%s", (_name, subject, c, expected) => {
    expect(requesters.evaluate(subject, c, ctx, "condition")).toEqual(expected)
  })

  it("is unknown while Overseerr or Tautulli failed", () => {
    expect(requesters.evaluate(movie(null), never, ctx, "condition")).toEqual(OVERSEERR_FAILED)
    expect(requesters.evaluate(movie([req()], { plays: null }), never, ctx, "condition")).toEqual({
      verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" },
    })
    expect(requesters.evaluate(item(["100"], []), never, down({ tautulli: "notConfigured" }), "condition").verdict).toBe("unknown")
  })

  it("reads a season's requesters from the show, and their plays from the season", () => {
    const show = buildShowItem({ requests: [req({ by: "100", seasons: [1] })] })
    const season = withViewers(buildSeasonItem(show, 3, { requests: [] }), [])
    const seasonCtx = buildEvalContext({ ...ctx, showsByKey: new Map([[show.key, show]]) })
    expect(requesters.evaluate(season, never, seasonCtx, "condition").verdict).toBe("pass")
    expect(requesters.evaluate(withViewers(season, [viewer("100")]), never, seasonCtx, "condition").verdict).toBe("fail")
    expect(requesters.evaluate(season, never, ctx, "condition").verdict).toBe("fail") // no show item: the season's own requests
  })

  it("states what the requesters did (TS 4.5)", () => {
    const july = Date.parse("2026-07-04T12:00:00Z") / 1000
    expect(requesters.fact(item([], []), ctx)).toEqual([{ text: "Nobody requested it." }])
    expect(requesters.fact(item(["100"], [viewer("100", { counted: 0, lastCountedAt: null })]), ctx)).toEqual([{ text: "The requester never played it." }])
    expect(requesters.fact(item(["100"], [viewer("100", { finished: true })]), ctx)).toEqual([{ text: "Every requester finished it." }])
    expect(requesters.fact(item(["100", "200"], [viewer("100", { lastCountedAt: july }), viewer("200", { lastCountedAt: july - 86_400 * 40 })]), ctx))
      .toEqual([{ text: "The requester played it Jul 2026." }])
    expect(requesters.fact(item([null], []), ctx)).toEqual([])
    expect(requesters.fact(movie(null), ctx)).toEqual([])
    expect(whySheetFact("request.requesters", movie([req()], { plays: null }), ctx)).toEqual([])
    expect(requesters.measure?.(item(["100"], []), ctx)).toBeNull()
  })
})
