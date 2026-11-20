/** The words and small helpers of the preview: protection sentences, thresholds, causes, the applicable draft and the row cells (X8). */

import { buildCondition, buildMovieItem, buildOptions, buildSeasonItem, buildShowItem, daysAgo } from "@/lib/cleanup/__tests__/helpers/builders"
import { GLOBAL_PROTECTION_IDS } from "@/lib/cleanup/constants"
import { cannotDeleteWords, thresholdText, tryValueLabel } from "@/lib/cleanup/preview/condition-words"
import { applicableDraft, describeContext, memberWords, ruleRequesterIds } from "@/lib/cleanup/preview/draft"
import { buildDraft, MEMBERS, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import {
  globalProtectionSentence,
  isGlobalId,
  protectionLabel,
  ruleProtectionLabel,
  seasonalCollections,
  seasonalName,
} from "@/lib/cleanup/preview/protection-words"
import { addedAt, itemRef, lastPlayedAt, namesRequesters, requestedBy } from "@/lib/cleanup/preview/rows"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const words = { memberName: (id: string) => (id === "u-avery" ? "Avery Example" : null) }

describe("protection words", () => {
  it("writes each global sentence of UX 5.4.1 with its option values", () => {
    const protections = buildOptions({ protections: { g4: { days: 1 }, g9: { tags: ["keep", "family"] }, g13: { enabled: true, collections: ["Christmas Movies", "Halloween Movies"] } } }).protections
    const sentences = GLOBAL_PROTECTION_IDS.map((id) => globalProtectionSentence(id, protections))
    expect(sentences).toEqual([
      "Kept by a member, until the Keep ends",
      "Marked Keep forever by a member",
      "Excluded by an admin, until its end date",
      "Played by anyone in the last 1 day",
      "Someone is part-way through: an unfinished play in the last 180 days",
      "Added, or new episodes added, in the last 30 days",
      "Requested in the last 90 days by a member with access who has not finished it",
      "On the watchlist of a member with access, where known",
      "Has a Radarr or Sonarr tag: keep, family",
      "In a stored Rewind, until the season closes",
      "Season rules: the newest season of a continuing show",
      "Season rules: a member who played the show in the last 365 days has not finished the season",
      "In the Plex collection Christmas Movies or Halloween Movies",
    ])
    const empty = buildOptions({ protections: { g9: { tags: [] } } }).protections
    expect(globalProtectionSentence("g9", empty)).toBe("Has a Radarr or Sonarr tag: none")
    expect(globalProtectionSentence("g13", empty)).toBe("In the Plex collection that you name")
  })

  it("labels a rule protection by its singular predicate, and an unknown id plainly", () => {
    const p = buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 3, window: { kind: "total" } } })
    expect(ruleProtectionLabel(p, "movie", words)).toBe("Has at least 3 plays in total")
    const ctx = { protections: buildOptions().protections, ruleProtections: [p], level: "movie" as const, words }
    expect(protectionLabel("p1", ctx)).toBe("Has at least 3 plays in total")
    expect(protectionLabel("g2", ctx)).toBe("Marked Keep forever by a member")
    expect(protectionLabel("p7", ctx)).toBe("This rule's protection")
    expect(isGlobalId("g13")).toBe(true)
    expect(isGlobalId("g14")).toBe(false)
  })

  it("finds Kometa's seasonal collections after a leading emoji", () => {
    expect(seasonalCollections(["Christmas Movies", "\u{1F383} Halloween Movies", "Christmas Classics", "Easter", "St. Patrick's Day Movies"]))
      .toEqual(["Christmas Movies", "\u{1F383} Halloween Movies", "St. Patrick's Day Movies"])
    expect(seasonalName("\u{1F383} Halloween Movies")).toBe("Halloween")
  })
})

describe("condition words", () => {
  it.each([
    [buildCondition("watch.lastPlayed"), "more than 365 days ago, or never"],
    [buildCondition("watch.lastPlayed", { op: "never" }), "Last played never"],
    [buildCondition("request.exists"), "Requested in Overseerr: no"],
    [buildCondition("request.requesters"), "The requesters never played it"],
    [buildCondition("show.status"), "Show status: ended"],
    [buildCondition("season.position"), "not one of the 2 newest seasons"],
    [buildCondition("request.by", { op: "anyOf", value: { requesters: [{ kind: "member", userId: "u-avery" }] } }), "any of Avery Example"],
  ])("gives the threshold of %j", (condition, threshold) => {
    expect(thresholdText(condition, words)).toBe(threshold)
  })

  it("gives a Try value without the words after it", () => {
    expect(tryValueLabel(buildCondition("watch.lastPlayed", { value: { duration: { amount: 10, unit: "months" }, orNever: true } }))).toBe("more than 10 months")
    expect(tryValueLabel(buildCondition("file.size"))).toBe("more than 20 GB")
  })

  it("words a Cannot delete cause, and a match state with none", () => {
    expect(cannotDeleteWords("arrFailed", "unknown", "sonarr")).toEqual(["Sonarr did not answer."])
    expect(cannotDeleteWords(undefined, "matched", "radarr")).toEqual(["No Radarr record matches."])
    expect(cannotDeleteWords("noIds", "unmatched", "radarr")).toEqual(["Plex has no external id."])
  })
})

describe("the applicable draft", () => {
  it("keeps a draft whose fields all apply, and leaves out the others", () => {
    const draft = buildDraft({ conditions: [buildCondition("file.size", { id: "c1" })] })
    expect(applicableDraft(draft)).toEqual({ draft, notApplicable: [] })
    const mixed = buildDraft({ conditions: [buildCondition("show.status", { id: "c1" }),
      { id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c2" }), buildCondition("season.position", { id: "c3" })] }],
    protections: [buildCondition("show.seasonsOnDisk", { id: "p1" })] })
    const { draft: applicable, notApplicable } = applicableDraft(mixed)
    expect(notApplicable).toEqual(["c1", "c3", "p1"])
    expect(applicable.conditions).toEqual([{ id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c2" })] }])
    expect(applicable.protections).toEqual([])
  })

  it("finds the members a rule names, and their names", () => {
    const draft = buildDraft({
      conditions: [buildCondition("request.by", { id: "c1", value: { requesters: [{ kind: "member", userId: "u-avery" }, { kind: "former" }] } }),
        { id: "a1", kind: "anyOf", conditions: [{ id: "c2", field: "request.by", op: "only", value: { requesters: [{ kind: "member", userId: "u-blake" }, "x"] } }] },
        { id: "c3", field: "request.by", op: "only", value: null }],
      protections: [buildCondition("request.by", { id: "p1", value: { requesters: [{ kind: "member", userId: "u-avery" }] } })],
    })
    expect(ruleRequesterIds(draft)).toEqual(["u-avery", "u-blake"])
    const named = memberWords({ members: MEMBERS })
    expect(named.memberName("u-blake")).toBe("Blake Example")
    expect(named.memberName("u-nobody")).toBeNull()
    const ctx = describeContext([{ sectionId: "1", title: "Movies", type: "movie", agent: null, locations: [], arr: "radarr",
      noIds: false, items: 1, seasons: 0, bytes: 1 }], { members: MEMBERS }, null)
    expect(ctx.libraryTitle("1")).toBe("Movies")
    expect(ctx.libraryTitle("9")).toBeNull()
    expect(ctx.mode).toBeNull()
  })
})

describe("rows", () => {
  const ctx = realContext()

  it("makes an item ref with bytes as a string, and a show's season count", () => {
    expect(itemRef(buildMovieItem())).toMatchObject({ itemKey: "movie:tmdb:1001", sizeBytes: String(12 * GiB), seasonCount: null, posterKey: "5001" })
    expect(itemRef(buildShowItem()).seasonCount).toBe(3)
    expect(itemRef(buildShowItem({ show: null })).seasonCount).toBeNull()
    expect(itemRef(buildSeasonItem()).seasonNumber).toBe(1)
    expect(itemRef(buildMovieItem({ sizeBytes: null })).sizeBytes).toBeNull()
  })

  it("gives the last played and added cells", () => {
    expect(lastPlayedAt(buildMovieItem({ plays: null }))).toBeNull()
    expect(lastPlayedAt(buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } }))).toBe("never")
    expect(lastPlayedAt(buildMovieItem())).toBe(new Date(daysAgo(200) * 1000).toISOString())
    expect(addedAt(buildMovieItem())).toBe(new Date(daysAgo(400) * 1000).toISOString())
    expect(addedAt(buildMovieItem({ added: { plex: null, arr: null } }))).toBeNull()
  })

  it("names requesters by their app name, newest request first, once each (X8)", () => {
    const requests = [
      { at: daysAgo(10), by: "100", status: 2, is4k: false, seasons: null },
      { at: daysAgo(5), by: "100", status: 2, is4k: false, seasons: null },
      { at: daysAgo(20), by: "300", status: 2, is4k: false, seasons: null },
      { at: daysAgo(30), by: null, status: 2, is4k: false, seasons: null },
      { at: daysAgo(40), by: "1", status: 2, is4k: false, seasons: null },
      { at: daysAgo(1), by: "200", status: 3, is4k: false, seasons: null },
    ]
    const cell = requestedBy(buildMovieItem({ requests }), ctx)
    expect(cell).toEqual([
      { name: "Avery Example", status: "member", at: new Date(daysAgo(5) * 1000).toISOString() },
      { name: "Unknown member", status: "unknown", at: new Date(daysAgo(20) * 1000).toISOString() },
      { name: "Unknown member", status: "unknown", at: new Date(daysAgo(30) * 1000).toISOString() },
      { name: "Unknown member", status: "member", at: new Date(daysAgo(40) * 1000).toISOString() },
    ])
    expect(namesRequesters(cell)).toBe(true)
  })

  it("reads none, an import list and a failed Overseerr", () => {
    expect(requestedBy(buildMovieItem({ requests: [] }), ctx)).toBe("none")
    const arr = buildMovieItem().arr
    expect(requestedBy(buildMovieItem({ requests: [], arr: arr && { ...arr, importList: true } }), ctx)).toBe("importList")
    expect(requestedBy(buildMovieItem({ requests: null }), ctx)).toBeNull()
    expect(namesRequesters("none")).toBe(false)
    expect(namesRequesters([])).toBe(false)
  })
})
