/** The Why Sheet from History (TS 6.9, UX 4.5 item 3): the stored facts, the state of each outcome kind, and `fromRun`. */

import { buildCondition, buildDefinition, buildOptions, buildWhySnapshot, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { storedFact, storedWhy, type StoredWhyInput } from "@/lib/cleanup/preview/why-stored"
import type { WhySnapshot } from "@/lib/cleanup/schema/why"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import { FIELD_IDS, type FieldId, GiB } from "@/lib/validations/cleanup-vocabulary"

const ref: ItemRef = { itemKey: "movie:tmdb:1001", level: "movie", title: "The Invented Movie", year: 2019, seasonNumber: null, episodeCount: null,
  seasonCount: null, posterKey: "5001", sectionId: "1", sizeBytes: String(12 * GiB) }
const FACTS = buildWhySnapshot().facts

function stored(why: WhySnapshot = buildWhySnapshot(), overrides: Partial<StoredWhyInput> = {}) {
  return storedWhy({ outcome: { ref, kind: "deleted", runId: "run-1" }, why, definition: buildDefinition(), protections: buildOptions().protections,
    words: { memberName: () => null }, zone: "UTC", ...overrides })
}

describe("storedFact", () => {
  it.each<[FieldId, WhySnapshot["facts"], string[]]>([
    ["watch.lastPlayed", FACTS, ["Last played Oct 4, 2025."]],
    ["watch.lastPlayed", { ...FACTS, lastCountedAt: null }, ["Never played.", "No counted play since Tautulli history starts on Nov 9, 2023."]],
    ["watch.lastPlayed", { ...FACTS, lastCountedAt: null, historyStartAt: null }, ["Never played."]],
    ["watch.lastPlayed", { ...FACTS, countedTotal: null }, []],
    ["watch.plays", FACTS, ["1 play in total."]],
    ["watch.plays", { ...FACTS, countedTotal: 0 }, ["No counted play."]],
    ["watch.plays", { ...FACTS, countedTotal: 4 }, ["4 plays in total."]],
    ["watch.plays", { ...FACTS, countedTotal: null }, []],
    ["request.age", FACTS, ["Requested Mar 2025."]],
    ["request.exists", { ...FACTS, requests: [] }, ["Nobody requested it."]],
    ["request.exists", { ...FACTS, requests: [], importList: true }, ["Came from an import list."]],
    ["request.by", FACTS, ["Requested only by a former member."]],
    ["request.by", { ...FACTS, requests: [{ at: daysAgo(1), requester: "member" }] }, ["Requested by a member."]],
    ["request.requesters", { ...FACTS, requests: [] }, ["Nobody requested it."]],
    ["library.added", FACTS, ["Added to Plex Jun 26, 2025.", "Added to Radarr Jun 25, 2025."]],
    ["library.added", { ...FACTS, addedPlex: null, addedArr: null }, ["Added date unknown."]],
    ["file.size", FACTS, ["12 GB."]],
    ["file.size", { ...FACTS, sizeBytes: null }, ["Size unknown."]],
    ["show.status", { ...FACTS, showStatus: "ended" }, ["Ended."]],
    ["show.status", FACTS, ["Status unknown."]],
    ["show.lastEpisodeAdded", { ...FACTS, lastEpisodeAddedAt: daysAgo(30) }, ["Last episode added Oct 2026."]],
    ["show.lastEpisodeAdded", FACTS, ["No episode in Plex."]],
    ["show.seasonsOnDisk", { ...FACTS, seasonsOnDisk: 1 }, ["1 season on disk."]],
    ["show.seasonsOnDisk", { ...FACTS, seasonsOnDisk: 3 }, ["3 seasons on disk."]],
    ["show.seasonsOnDisk", FACTS, []],
    ["season.position", { ...FACTS, position: 1 }, ["The newest season."]],
    ["season.position", { ...FACTS, position: 2 }, ["2nd newest season."]],
    ["season.position", { ...FACTS, position: 3 }, ["3rd newest season."]],
    ["season.position", { ...FACTS, position: 5 }, ["5th newest season."]],
    ["season.position", FACTS, ["No season number."]],
  ])("%s from %j", (field, facts, expected) => {
    expect(storedFact(field, facts, field.startsWith("season") ? "season" : "movie", "UTC")).toEqual(expected)
  })

  it("words every field", () => {
    for (const field of FIELD_IDS) expect(Array.isArray(storedFact(field, FACTS, "show", "UTC"))).toBe(true)
  })
})

describe("storedWhy", () => {
  it("shows the stored verdicts read only, with the threshold of the rule as it is now and fromRun", () => {
    const data = stored()
    expect(data).toMatchObject({ item: ref, state: "deleted", links: { plexUrl: null, arrUrl: null }, hints: [], otherRules: [],
      fromRun: { runId: "run-1", at: new Date(NOW).toISOString() } })
    expect(data.conditions).toEqual([{ id: "c1", label: "Last played", verdict: "pass", threshold: "more than 365 days ago, or never",
      value: [{ text: "Last played Oct 4, 2025." }], sources: buildWhySnapshot().sources.filter((s) => s.service === "tautulli") }])
    expect(data.protections).toEqual([{ id: "g4", label: "Played by anyone in the last 30 days", verdict: "clear", value: [] }])
  })

  it("leaves the threshold out when the rule is gone or the condition changed field", () => {
    expect(stored(buildWhySnapshot(), { definition: null }).conditions[0].threshold).toBe("")
    const changed = buildDefinition({ conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c1" }), buildCondition("watch.plays", { id: "c2" })] }] })
    expect(stored(buildWhySnapshot(), { definition: changed }).conditions[0].threshold).toBe("")
  })

  it.each<[string, Partial<WhySnapshot>, string]>([
    ["failed", {}, "match"],
    ["rescued", { protections: [{ id: "g1", verdict: "protects" }] }, "protected"],
    ["rescued", { conditions: [{ id: "c1", field: "watch.lastPlayed", verdict: "fail" }] }, "nearMiss"],
    ["released", { conditions: [{ id: "c1", field: "watch.lastPlayed", verdict: "unknown" }] }, "missing"],
    ["released", { match: { state: "unknown" } }, "missing"],
    ["released", { match: { state: "unmatched" } }, "cannotDelete"],
    ["released", {}, "match"],
  ])("reads a %s outcome as its state", (kind, why, state) => {
    expect(stored(buildWhySnapshot(why), {}).state).toBe("deleted")
    expect(storedWhy({ outcome: { ref, kind, runId: null }, why: buildWhySnapshot(why), definition: null, protections: buildOptions().protections,
      words: { memberName: () => null }, zone: "UTC" }).state).toBe(state)
  })
})
