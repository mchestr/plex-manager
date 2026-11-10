/**
 * The pure preview core (TS 10.6 steps 2 to 8): tabs, sort, search, page,
 * the near-miss chip, focus, impact, warnings, blocks, incomplete ids and
 * the sentence, the abort checks, and the time and size budgets of TS 17.1.
 */

import { buildCondition, buildMovieItem, buildSeasonItem, buildShowItem, buildSourceStatuses, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { computePreview, growthWeeks } from "@/lib/cleanup/preview/compute"
import { buildDraft, buildRequest, previewData, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

/** Movie `i` of an invented library: sizes, plays, adds and requests vary with `i`. */
function movie(i: number): SnapshotItem {
  const played = i % 5 === 0 ? null : daysAgo(40 + ((i * 37) % 900))
  return buildMovieItem({
    key: `movie:tmdb:${10_000 + i}`,
    titleKey: `tmdb:${10_000 + i}`,
    title: `Invented Title ${String(i).padStart(4, "0")}`,
    ratingKey: String(20_000 + i),
    ids: { tmdb: 10_000 + i },
    sizeBytes: i % 97 === 0 ? null : (1 + (i % 60)) * GiB,
    added: { plex: daysAgo(200 + (i % 700)), arr: daysAgo(201 + (i % 700)) },
    plays: { lastCountedAt: played, countedAt: played === null ? [] : [played], viewers: [] },
    requests: i % 3 === 0 ? [{ at: daysAgo(300), by: i % 2 === 0 ? "100" : "200", status: 2, is4k: false, seasons: null }] : [],
    match: i % 50 === 0 ? { state: "unmatched", cause: "noArrRecord" } : { state: "matched", by: "tmdb" },
  })
}

const MOVIES = Array.from({ length: 120 }, (_, i) => movie(i))
const LAST_PLAYED = buildCondition("watch.lastPlayed", { id: "c1" })
const ADDED = buildCondition("library.added", { id: "c2", value: { duration: { amount: 180, unit: "days" } } })
const DRAFT = buildDraft({ conditions: [LAST_PLAYED, ADDED] })

describe("computePreview", () => {
  it("counts the classes, the clause statistics and the bytes of the matches", () => {
    const preview = computePreview(buildRequest(DRAFT), previewData(MOVIES))
    const { tabs } = preview
    expect(preview.checked).toBe(120)
    expect(tabs.matches + tabs.nearMisses + tabs.protected + tabs.missing + tabs.cannotDelete).toBeLessThanOrEqual(120)
    expect(preview.matches).toBe(tabs.matches)
    expect(preview.clauses.map((c) => c.id)).toEqual(["c1", "c2"])
    expect(preview.clauses.reduce((n, c) => n + c.heldBack, 0)).toBe(tabs.nearMisses)
    expect(preview.tabs.cannotDelete).toBeGreaterThan(0)
    expect(preview.snapshot).toEqual({ id: "snap-1", takenAt: new Date(NOW).toISOString(), historyStart: new Date(daysAgo(3 * 365) * 1000).toISOString() })
    expect(preview.sentence.map((p) => p.text).join("")).toContain("Movies in the ")
    expect(preview.sentence.map((p) => p.text).join("")).toContain("This rule is in Dry run")
    expect(preview.largest).toHaveLength(4)
    expect(Number(preview.largest[0].sizeBytes)).toBeGreaterThanOrEqual(Number(preview.largest[3].sizeBytes))
    expect(preview.largest[0].why[0].strong).toBe(true)
  })

  it("pages the active tab by 50, largest first, and gives the total of the tab", () => {
    const one = computePreview(buildRequest(DRAFT), previewData(MOVIES))
    expect(one.rows.length).toBe(Math.min(50, one.tabs.matches))
    expect(one.rows.every((r) => r.class === "match")).toBe(true)
    const sizes = one.rows.map((r) => (r.sizeBytes === null ? -1 : Number(r.sizeBytes)))
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes)
    expect(one.total).toBe(one.tabs.matches)
    expect(one.pageCount).toBe(Math.ceil(one.tabs.matches / 50))
    const last = computePreview(buildRequest(DRAFT, { page: 200 }), previewData(MOVIES))
    expect(last.page).toBe(last.pageCount)
  })

  it("sorts by title and by the oldest play, never played first", () => {
    const byTitle = computePreview(buildRequest(DRAFT, { sort: "title" }), previewData(MOVIES)).rows.map((r) => r.title)
    expect([...byTitle].sort()).toEqual(byTitle)
    const rows = computePreview(buildRequest(DRAFT, { sort: "oldestPlay" }), previewData(MOVIES)).rows
    const firstPlayed = rows.findIndex((r) => r.lastPlayedAt !== "never")
    expect(rows.slice(0, firstPlayed).every((r) => r.lastPlayedAt === "never")).toBe(true)
    const played = rows.slice(firstPlayed).map((r) => String(r.lastPlayedAt))
    expect([...played].sort()).toEqual(played)
  })

  it("lists near misses closest first with their gap, and filters them by the chip", () => {
    const all = computePreview(buildRequest(DRAFT, { tab: "nearMisses", sort: "closest" }), previewData(MOVIES))
    expect(all.rows.length).toBeGreaterThan(0)
    expect(all.rows.every((r) => r.class === "nearMiss" && r.failing !== undefined)).toBe(true)
    const gaps = all.rows.map((r) => r.gap ?? Number.MAX_SAFE_INTEGER)
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps)
    const chip = computePreview(buildRequest(DRAFT, { tab: "nearMisses", nearMissCondition: "c1" }), previewData(MOVIES))
    expect(chip.rows.every((r) => r.failing === "c1")).toBe(true)
    expect(chip.total).toBe(all.clauses.find((c) => c.id === "c1")?.heldBack)
  })

  it("searches titles without case", () => {
    const found = computePreview(buildRequest(DRAFT, { tab: "cannotDelete", search: "title 0050" }), previewData(MOVIES))
    expect(found.rows.map((r) => r.title)).toEqual(["Invented Title 0050"])
    expect(found.total).toBe(1)
  })

  it("never puts a plex.tv id in a row, and names requesters (X8)", () => {
    const preview = computePreview(buildRequest(buildDraft({ conditions: [buildCondition("request.exists", { value: { exists: true } })] }), { sort: "title" }), previewData(MOVIES))
    const json = JSON.stringify(preview.rows)
    expect(json).not.toMatch(/"by"|"user"|"plexUserId"/)
    const at = new Date(daysAgo(300) * 1000).toISOString()
    expect(preview.rows.find((r) => r.title === "Invented Title 0003")?.requestedBy).toEqual([{ name: "Blake Example", status: "former", at }])
    expect(preview.rows.find((r) => r.title === "Invented Title 0006")?.requestedBy).toEqual([{ name: "Avery Example", status: "member", at }])
  })

  it("adds the focus of an open condition", () => {
    const preview = computePreview(buildRequest(DRAFT, { focus: { conditionId: "c1" } }), previewData(MOVIES))
    expect(preview.focus?.presets).toHaveLength(4)
    expect(preview.focus?.summary).toMatch(/^\d+ of 120 movies pass this condition\./)
    expect(computePreview(buildRequest(DRAFT, { focus: { conditionId: "c9" } }), previewData(MOVIES)).focus).toBeUndefined()
  })

  it("leaves out incomplete and not applicable conditions, and warns about both", () => {
    const draft = buildDraft({ conditions: [LAST_PLAYED, { id: "c3", field: "file.size", op: "moreThan", value: {} },
      buildCondition("show.status", { id: "c4" }), { id: "a1", kind: "anyOf", conditions: [buildCondition("show.seasonsOnDisk", { id: "c5" })] }],
    protections: [buildCondition("season.position", { id: "p1" })] })
    const preview = computePreview(buildRequest(draft), previewData(MOVIES))
    expect(preview.incomplete).toEqual(["c3"])
    expect(preview.clauses.map((c) => c.id)).toEqual(["c1"])
    expect(preview.warnings).toEqual(expect.arrayContaining([{ kind: "incomplete", conditionIds: ["c3"] }, { kind: "notApplicable", conditionIds: ["c4", "c5", "p1"] }]))
  })

  it("warns about a wide rule, a contradiction, zero matches, a failed source and stale data, and gives the blocks", () => {
    const wide = computePreview(buildRequest(buildDraft({ conditions: [buildCondition("file.size", { value: { bytes: GiB, unit: "GB" } })] })), previewData(MOVIES))
    expect(wide.warnings[0]).toMatchObject({ kind: "wide", checked: 120 })
    const never = buildDraft({ conditions: [buildCondition("watch.lastPlayed", { id: "c1", op: "never" }),
      buildCondition("watch.plays", { id: "c2", op: "atLeast", value: { count: 1, window: { kind: "total" } } })] })
    const zero = computePreview(buildRequest(never), previewData(MOVIES))
    expect(zero.matches).toBe(0)
    expect(zero.warnings).toEqual(expect.arrayContaining([{ kind: "cannotMatch", conditionId: "c1", otherId: "c2" }, expect.objectContaining({ kind: "zero", of: 120 })]))
    const failed = buildSourceStatuses({ tautulli: { state: "failed", readAt: new Date(NOW).toISOString() } })
    const old = NOW - 40 * 3_600_000
    const data = previewData(MOVIES, { ctx: realContext({ sources: failed }), snapshot: { ...previewData([]).snapshot, sources: failed, finishedAt: old } })
    const broken = computePreview(buildRequest(DRAFT, { ruleId: "rule-1" }), data)
    expect(broken.warnings).toEqual(expect.arrayContaining([{ kind: "sourceFailed", service: "tautulli", readAt: new Date(NOW).toISOString() }, { kind: "stale", hours: 40 }]))
    expect(broken.blocks.map((b) => b.code)).toEqual(["dataStale", "sourceFailed", "sourceShrank"])
    expect(broken.blocks.every((b) => b.ruleId === "rule-1")).toBe(true)
    expect(broken.sources.map((s) => s.service)).toEqual(["plex", "tautulli", "overseerr", "radarr"])
    expect(broken.tabs.missing).toBeGreaterThan(0)
  })

  it("gives the impact of a live rule and the growth weeks", () => {
    const data = previewData(MOVIES, { mode: "automatic", impact: {
      rule: { id: "rule-1", mode: "automatic", createdAt: new Date(NOW), then: { graceDays: 14, action: "movie.delete", importListExclusion: false } },
      rows: [], rowKeys: new Set(), liveRules: new Map(), today: "2026-11-08", holdUntil: null } })
    const preview = computePreview(buildRequest(DRAFT, { ruleId: "rule-1" }), data)
    expect(preview.impact).toMatchObject({ leave: 0, join: preview.matches, keep: 0, actionChange: 0, joinLeaveOn: "2026-11-22" })
    expect(preview.sentence.map((p) => p.text).join("")).toContain("At the leave date, items are deleted inside the daily budget.")
    expect(growthWeeks(28 * GiB, 30 * GiB)).toBe(4)
    expect(growthWeeks(GiB, null)).toBeNull()
    expect(growthWeeks(GiB, 0)).toBeNull()
  })

  it("stops at the first abort check", () => {
    const controller = new AbortController()
    controller.abort(new Error("gone"))
    expect(() => computePreview(buildRequest(DRAFT), previewData(MOVIES), controller.signal)).toThrow("gone")
  })
})

describe("the budgets of TS 17.1", () => {
  const LIBRARY = Array.from({ length: 780 }, (_, i) => movie(i))
  const SHOWS = Array.from({ length: 400 }, (_, i) =>
    buildShowItem({ key: `show:tvdb:${50_000 + i}`, titleKey: `tvdb:${50_000 + i}`, title: `Invented Show ${i}`, ids: { tvdb: 50_000 + i },
      show: { status: i % 2 ? "ended" : "continuing", seasonsOnDisk: 5, newestSeasonOnDisk: 5, lastEpisodeAddedAt: daysAgo(400 + i) } }))
  const SEASONS = SHOWS.flatMap((show) => [1, 2, 3, 4, 5].map((n) => buildSeasonItem(show, n, {
    sizeBytes: (5 + ((n * 7) % 40)) * GiB,
    plays: { lastCountedAt: n % 2 ? null : daysAgo(100 * n), countedAt: [], viewers: [] },
  })))

  it("previews 780 movies and 2,000 seasons each within the 1,000 ms ceiling", () => {
    expect(SEASONS).toHaveLength(2000)
    const movieStart = performance.now()
    computePreview(buildRequest(DRAFT, { focus: { conditionId: "c1" } }), previewData(LIBRARY))
    const movieMs = performance.now() - movieStart
    const seasonDraft = buildDraft({ level: "season", libraries: ["2"], then: { graceDays: 30, action: "season.unmonitorDeleteFiles" },
      conditions: [buildCondition("season.position", { id: "c1" }), buildCondition("watch.lastPlayed", { id: "c2" }), buildCondition("show.seasonsOnDisk", { id: "c3" })] })
    const ctx = realContext({ shows: SHOWS })
    const seasonStart = performance.now()
    const seasons = computePreview(buildRequest(seasonDraft, { focus: { conditionId: "c2" } }), previewData(SEASONS, { ctx }))
    const seasonMs = performance.now() - seasonStart
    expect(seasons.checked).toBe(2000)
    expect(movieMs).toBeLessThan(1000)
    expect(seasonMs).toBeLessThan(1000)
  })

  it("keeps a response of 50 rows under 150 KB", () => {
    const preview = computePreview(buildRequest(buildDraft({ conditions: [buildCondition("file.size", { value: { bytes: GiB, unit: "GB" } })] }),
      { focus: { conditionId: "c1" } }), previewData(LIBRARY))
    expect(preview.rows).toHaveLength(50)
    expect(new TextEncoder().encode(JSON.stringify(preview)).length).toBeLessThan(150_000)
  })
})
