/** The live Why Sheet (TS 6.9, 10.5, UX 4.5): state, conditions, protections, forecast, Try, Then, other rules, hints and links. */

import { buildCondition, buildDefinition, buildMovieItem, buildOptions, buildShowItem, buildSourceStatuses, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition, compileDraft } from "@/lib/cleanup/engine/compile"
import { buildDraft, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { liveWhy, type LiveWhyInput, type WhyRow } from "@/lib/cleanup/preview/why-live"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const NEVER = buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
const PLAYED = (days: number, key = 1001) =>
  buildMovieItem({ key: `movie:tmdb:${key}`, ids: { tmdb: key }, plays: { lastCountedAt: daysAgo(days), countedAt: [daysAgo(days)], viewers: [] } })
const words = { memberName: () => null }

function input(item: SnapshotItem, draft: RuleDraft, overrides: Partial<LiveWhyInput> = {}): LiveWhyInput {
  return {
    item, compiled: compileDraft(draft), rule: null, editor: true, ctx: realContext(), items: [item], sources: buildSourceStatuses(), words,
    links: { machineId: "machine-1", arrBase: "https://radarr.example.com" }, row: null, status: { paused: false, holdUntil: null },
    showFloor: null, others: [], ...overrides,
  }
}

const row = (overrides: Partial<WhyRow> = {}): WhyRow => ({
  itemKey: NEVER.key, state: "leaving", leaveOn: "2026-12-08", needsApproval: false, failCode: null, holdCode: null, deferredAt: null,
  postponedAt: null, ruleIds: ["rule-1"], action: "movie.unmonitorDeleteFiles", importListExclusion: false, enteredAt: new Date(NOW - 86_400_000), ...overrides,
})

const LAST_PLAYED = buildCondition("watch.lastPlayed")

describe("liveWhy", () => {
  it("explains a match of a new rule, with the Dry run prefix on the Then line", () => {
    const data = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED] })))
    expect(data.state).toBe("match")
    expect(data.item).toMatchObject({ itemKey: NEVER.key, sizeBytes: String(12 * GiB) })
    expect(data.links).toEqual({
      plexUrl: "https://app.plex.tv/desktop/#!/server/machine-1/details?key=%2Flibrary%2Fmetadata%2F5001",
      arrUrl: "https://radarr.example.com/movie/the-invented-movie-1001",
    })
    expect(data.conditions).toEqual([{ id: "c1", label: "Last played", verdict: "pass", threshold: "more than 365 days ago, or never",
      value: [{ text: "Never played." }, { text: "No counted play since Tautulli history starts on Nov 9, 2023." }],
      sources: buildSourceStatuses().filter((s) => s.service === "tautulli") }])
    expect(data.protections.every((p) => p.verdict === "clear")).toBe(true)
    expect(data.then).toEqual({ dryRun: true, text: [{ text: "If the rule is turned on, Radarr deletes the movie and its 12 GB file, and adds an import list exclusion. "
      + "Matched in Radarr by TMDB id 1001. The file is inside /media/movies." }] })
    expect(data.forecast).toBeUndefined()
    expect(data.leaving).toBeUndefined()
  })

  it("gives a near miss in the editor its forecast and a Try value with its effect", () => {
    const near = PLAYED(200)
    const items = [near, PLAYED(250, 2), PLAYED(300, 3), NEVER]
    const data = liveWhy(input(near, buildDraft({ conditions: [LAST_PLAYED] }), { items }))
    expect(data.state).toBe("nearMiss")
    expect(data.forecast).toEqual({ passesOn: "2027-04-23", text: "If nobody plays it, it passes on Apr 23, 2027." })
    expect(data.tryValue).toEqual({ conditionId: "c1", value: { duration: { amount: 199, unit: "days" }, orNever: true }, label: "more than 199 days",
      addsCount: 3, addsBytes: String(36 * GiB) })
    expect(data.then).toBeUndefined()
    expect(liveWhy(input(near, buildDraft({ conditions: [LAST_PLAYED] }), { items, editor: false })).tryValue).toBeUndefined()
  })

  it("words the forecast of other time fields, and a group has no forecast", () => {
    const fresh = buildMovieItem({ added: { plex: daysAgo(10), arr: daysAgo(10) }, plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    const ctx = realContext({ options: buildOptions({ protections: { g6: { enabled: false } } }) })
    const added = buildCondition("library.added", { value: { duration: { amount: 60, unit: "days" } } })
    expect(liveWhy(input(fresh, buildDraft({ conditions: [added] }), { ctx })).forecast?.text).toBe("It passes on Dec 29, 2026.")
    const group = buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [{ ...added, id: "c1" }, buildCondition("file.size", { id: "c2", value: { bytes: 40 * GiB, unit: "GB" } })] }] })
    const data = liveWhy(input(fresh, group, { ctx }))
    expect(data.forecast).toBeUndefined()
    expect(data.conditions[0]).toMatchObject({ id: "a1", label: "Any of these is true", verdict: "fail", threshold: "at least 1 of 2",
      members: [{ id: "c1", verdict: "fail" }, { id: "c2", verdict: "fail", value: [{ text: "12 GB." }] }] })
  })

  it("explains a Leaving soon title with its own action, its status and the other rules", () => {
    const others = [
      { id: "rule-2", name: "Big movies", mode: "automatic" as const, compiled: compileDefinition(buildDefinition({
        conditions: [buildCondition("file.size", { value: { bytes: GiB, unit: "GB" } })], then: { graceDays: 30, action: "movie.delete", importListExclusion: false } })) },
      { id: "rule-3", name: "Big shows", mode: "dryRun" as const, compiled: compileDraft(buildDraft({ level: "show", libraries: ["2"], conditions: [buildCondition("file.size")] })) },
    ]
    const leaving = row({ ruleIds: ["rule-1", "rule-2"] })
    const data = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED] }), { editor: false, rule: { id: "rule-1", mode: "reviewFirst" }, row: leaving, others }))
    expect(data.state).toBe("leaving")
    expect(data.then).toEqual({ dryRun: false, text: [{ text: "Radarr stops monitoring the movie and deletes its 12 GB file. The Radarr record stays. "
      + "Matched in Radarr by TMDB id 1001. The file is inside /media/movies." }] })
    expect(data.leaving).toEqual({ enteredAt: new Date(NOW - 86_400_000).toISOString(), leaveOn: "2026-12-08", status: "leaving" })
    expect(data.otherRules).toEqual([{ ruleId: "rule-2", name: "Big movies", mode: "automatic", enteredAt: new Date(NOW - 86_400_000).toISOString(), leaveOn: "2026-12-08" }])
    expect(liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED] }), { editor: false, row: row({ state: "held", leaveOn: null, enteredAt: null }), others })).otherRules)
      .toEqual([{ ruleId: "rule-2", name: "Big movies", mode: "automatic" }])
    const paused = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED] }), { editor: false, row: leaving, status: { paused: true, holdUntil: null } }))
    expect(paused.leaving?.status).toBe("paused")
  })

  it("keeps the class in the editor for a Leaving soon title, and adds the show floor to a show", () => {
    const editor = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED] }), { row: row(), rule: { id: "rule-1", mode: "dryRun" } }))
    expect(editor.state).toBe("match")
    expect(editor.then?.dryRun).toBe(false)
    const show = buildShowItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    const draft = buildDraft({ level: "show", libraries: ["2"], conditions: [LAST_PLAYED], then: { graceDays: 30, action: "show.delete", importListExclusion: false } })
    const data = liveWhy(input(show, draft, { showFloor: "2026-12-20", links: { machineId: null, arrBase: null } }))
    expect(data.then?.text[0].text).toContain("The files are inside /media/tv. It goes on Dec 20, 2026 or later, after its seasons.")
    expect(data.links).toEqual({ plexUrl: null, arrUrl: null })
  })

  it("gives no Then without an action, no arr link without a record, and leaves the Matched sentence out without an id", () => {
    const noAction = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED], then: { graceDays: 30 } })))
    expect(noAction.then).toBeUndefined()
    const bare = { ...NEVER, arr: null, match: { state: "matched" as const } }
    const data = liveWhy(input(bare, buildDraft({ conditions: [LAST_PLAYED] })))
    expect(data.links.arrUrl).toBeNull()
    expect(data.then?.text[0].text).toBe("If the rule is turned on, Radarr deletes the movie and its 12 GB file, and adds an import list exclusion.")
  })

  it("hints at a Kometa seasonal collection that G13 does not name", () => {
    const xmas = buildMovieItem({ collections: ["Christmas Movies"], plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    expect(liveWhy(input(xmas, buildDraft({ conditions: [LAST_PLAYED] }))).hints).toEqual([{ kind: "seasonalCollection", collection: "Christmas Movies" }])
    const named = realContext({ options: buildOptions({ protections: { g13: { enabled: true, collections: ["christmas movies"] } } }), facts: {
      users: {}, history: { startAt: daysAgo(1000), newestAt: daysAgo(1), rows: 1, orphans: 0, usersWithPlay: 1 }, membersRead: ["Christmas Movies"] } })
    const data = liveWhy(input(xmas, buildDraft({ conditions: [LAST_PLAYED] }), { ctx: named }))
    expect(data.hints).toEqual([])
    expect(data.state).toBe("protected")
    expect(data.protections[0]).toMatchObject({ id: "g13", verdict: "protects", label: "In the Plex collection christmas movies" })
  })

  it("lists a rule protection with its real value", () => {
    const p1 = buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 0, window: { kind: "total" } } })
    const data = liveWhy(input(NEVER, buildDraft({ conditions: [LAST_PLAYED], protections: [p1] })))
    expect(data.protections[0]).toEqual({ id: "p1", label: "Has at least 0 plays in total", verdict: "protects", value: [{ text: "No counted play." }] })
  })

  it("dates the newest add for the meta line, and names the cause of a title that cannot be deleted", () => {
    const added = buildMovieItem({ added: { plex: daysAgo(400), arr: daysAgo(300) } })
    const data = liveWhy(input(added, buildDraft({ conditions: [LAST_PLAYED] })))
    expect(data.addedAt).toBe(new Date(daysAgo(300) * 1000).toISOString())
    expect(data.cause).toBeUndefined()
    expect(liveWhy(input(buildMovieItem({ added: { plex: null, arr: null } }), buildDraft({ conditions: [LAST_PLAYED] }))).addedAt).toBeNull()

    const conflicted = buildMovieItem({ match: { state: "conflicted", cause: "twoArrRecords" }, plays: NEVER.plays })
    const blocked = liveWhy(input(conflicted, buildDraft({ conditions: [LAST_PLAYED] })))
    expect(blocked.state).toBe("cannotDelete")
    expect(blocked.cause).toBe("Two Radarr records match.")
  })
})
