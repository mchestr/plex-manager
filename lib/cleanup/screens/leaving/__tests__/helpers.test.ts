/**
 * @jest-environment node
 */

/**
 * The helpers of the list tab loaders: the URL params and their fallbacks,
 * titles and their last play, the failure and hold words, the display
 * plan, the batch card edges, the people names and the rule names.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildWhySnapshot } from "@/lib/cleanup/__tests__/helpers/builders"
import type { Batch } from "@/lib/cleanup/run/batches"
import { deletionCard, entryLimit, heldAtOf, readHeldBy, sortCards } from "@/lib/cleanup/screens/leaving/batch-data"
import { itemName, itemRefOf, lastPlayedOf, levelOf } from "@/lib/cleanup/screens/leaving/item-ref"
import { batchPageOf, parseHistoryParams, parseLeavingParams, parseListParams, parseProtectionsParams } from "@/lib/cleanup/screens/leaving/params"
import { readPeople } from "@/lib/cleanup/screens/leaving/people"
import { displayPlan, goesByItself } from "@/lib/cleanup/screens/leaving/plan"
import { DELETED_RULE, ruleNamer } from "@/lib/cleanup/screens/leaving/rules"
import { arrServiceOf, failureWords, holdWords } from "@/lib/cleanup/screens/leaving/words"
import type { BatchData } from "@/lib/cleanup/types/list-parts"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const NOW = new Date("2026-11-08T12:00:00.000Z")

beforeEach(() => mockReset(prismaMock))

describe("params", () => {
  it("reads URLSearchParams and repeated values, with 50 items a page by default", () => {
    expect(parseListParams(new URLSearchParams("q=%20dune%20&page=3&size=100"))).toEqual({ q: "dune", page: 3, size: 100 })
    expect(parseListParams({ q: ["first", "second"], page: ["2"] })).toEqual({ q: "first", page: 2, size: 50 })
    expect(parseListParams({})).toEqual({ q: "", page: 1, size: 50 })
  })

  it("reads the page size that the DataTable select writes, before size", () => {
    expect(parseListParams(new URLSearchParams("pageSize=25"))).toEqual({ q: "", page: 1, size: 25 })
    expect(parseListParams(new URLSearchParams("pageSize=100&size=25"))).toEqual({ q: "", page: 1, size: 100 })
    expect(parseListParams({ pageSize: "7" })).toEqual({ q: "", page: 1, size: 50 })
  })

  it("parses the Leaving soon filters and drops values that do not parse", () => {
    expect(parseLeavingParams({ rule: "rule-1", status: "onHold", library: "2", batch: "deletion-rule-1", batchPage: "3" })).toMatchObject({
      rule: "rule-1", status: "onHold", library: "2", batch: "deletion-rule-1", batchPage: 3,
    })
    expect(parseLeavingParams({ rule: "no spaces", status: "gone", library: "a/b", batch: "entry-rule-1", batchPage: "x" })).toMatchObject({
      rule: null, status: null, library: null, batch: null, batchPage: 1,
    })
    expect(parseLeavingParams({ batch: "other-thing" }).batch).toBeNull()
  })

  it("pages the named deletion batch only, or every batch without a name", () => {
    expect(batchPageOf({ batch: "deletion-a", batchPage: 2 }, "deletion-a")).toBe(2)
    expect(batchPageOf({ batch: "deletion-a", batchPage: 2 }, "deletion-b")).toBe(1)
    expect(batchPageOf({ batch: null, batchPage: 2 }, "deletion-b")).toBe(2)
  })

  it("parses the kind of the Kept tab and the rule of History", () => {
    expect(parseProtectionsParams({ kind: "keep" }).kind).toBe("keep")
    expect(parseProtectionsParams({ kind: "mark" }).kind).toBeNull()
    expect(parseHistoryParams({ rule: "rule-2", q: "x" })).toEqual({ q: "x", page: 1, size: 50, rule: "rule-2" })
  })
})

describe("item-ref", () => {
  it("reads a stored level, and an unknown one as a movie", () => {
    expect(levelOf("season")).toBe("season")
    expect(levelOf("episode")).toBe("movie")
  })

  it("builds the ItemRef of a row with no poster, section or size", () => {
    expect(itemRefOf({ itemKey: "movie:tmdb:1", level: "movie", title: "Dune", year: null, seasonNumber: null, ratingKey: null, sectionId: null }))
      .toEqual({ itemKey: "movie:tmdb:1", level: "movie", title: "Dune", year: null, seasonNumber: null, episodeCount: null, seasonCount: null,
        posterKey: null, sectionId: "", sizeBytes: null })
  })

  it("names a season with its number, and a season with no number by its title", () => {
    expect(itemName({ title: "Night Desk", level: "season", seasonNumber: 2 })).toBe("Night Desk, Season 2")
    expect(itemName({ title: "Night Desk", level: "season", seasonNumber: null })).toBe("Night Desk")
    expect(itemName({ title: "Dune", level: "movie", seasonNumber: null })).toBe("Dune")
  })

  it("reads the last play from the stored Why: an instant, never, or unknown", () => {
    const facts = buildWhySnapshot().facts
    expect(lastPlayedOf(buildWhySnapshot({ facts: { ...facts, lastCountedAt: 1_700_000_000 } }))).toBe("2023-11-14T22:13:20.000Z")
    expect(lastPlayedOf(buildWhySnapshot({ facts: { ...facts, lastCountedAt: null } }))).toBe("never")
    expect(lastPlayedOf(buildWhySnapshot({ facts: { ...facts, countedTotal: null } }))).toBeNull()
    expect(lastPlayedOf(null)).toBeNull()
  })
})

describe("words", () => {
  it("names the arr app of a level", () => {
    expect(arrServiceOf("movie")).toBe("radarr")
    expect(arrServiceOf("season")).toBe("sonarr")
  })

  it("words each kind of failure code, and never shows an unknown code raw", () => {
    expect(failureWords("sourceFailed:plex", "sonarr")).toBe("Plex did not answer")
    expect(failureWords("sourceFailed:nas", "sonarr")).toBe("The delete failed")
    expect(failureWords("noSeasonNumber", "sonarr")).toBe("The season has no number")
    expect(failureWords("noArrSeason", "sonarr")).toBe("Sonarr has no such season")
    expect(failureWords("outsideArrPath", "radarr")).toBe("The file is outside Radarr's root folders")
    expect(failureWords("TIMEOUT", "radarr")).toBe("Radarr did not respond in time")
    expect(failureWords("SOMETHING_NEW", "radarr")).toBe("The delete failed")
  })

  it("names the read time of a failed source in a hold, and no time for a source that answered", () => {
    const words = holdWords([{ service: "sonarr", state: "failed", readAt: "2026-11-08T03:07:00.000Z" },
      { service: "radarr", state: "ok", readAt: "2026-11-08T03:07:00.000Z" }], "America/Toronto")

    expect(words("sourceFailed:sonarr")).toBe("Sonarr did not answer at 10:07 PM")
    expect(words("sourceFailed:radarr")).toBe("Radarr did not answer")
    expect(words("noValue:size")).toBe("Size unknown")
  })
})

describe("plan", () => {
  it("plans titles that go by themselves, and not titles on hold or waiting for an approval", () => {
    expect(goesByItself({ state: "leaving", needsApproval: false, holdCode: null })).toBe(true)
    expect(goesByItself({ state: "leaving", needsApproval: true, holdCode: null })).toBe(false)
    expect(goesByItself({ state: "approved", needsApproval: true, holdCode: null })).toBe(true)
    expect(goesByItself({ state: "deleting", needsApproval: true, holdCode: null })).toBe(true)
    expect(goesByItself({ state: "approved", needsApproval: true, holdCode: "plexMissing" })).toBe(false)
  })

  it("plans a title with no leave date today", () => {
    const plan = displayPlan([buildCleanupItem({ leaveOn: null })], { budget: { items: 1, bytes: 1 }, usedToday: { items: 0, bytes: 0 },
      today: "2026-11-08", holdUntil: null })

    expect([...plan]).toEqual([["movie:tmdb:101", "2026-11-08"]])
  })
})

const batch = (overrides: Partial<Batch> = {}): Batch => ({
  id: "deletion-r", kind: "deletion", ruleId: "r", items: [], keysHash: "h", importListExclusion: false, dueSince: null, dueAt: null, plan: null,
  oversize: [], count: 0, bytes: 0n, action: null, actionCounts: {}, exclusionCount: 0, ...overrides,
})
const card = { now: NOW, today: "2026-11-08", ruleName: () => "Rule", page: () => 1, whys: new Map<string, unknown>() }

describe("batch cards", () => {
  it("gives no card for a batch with no item", () => {
    expect(deletionCard(batch(), card)).toBeNull()
  })

  it("falls back to today and an empty plan when a batch has no dates or plan", () => {
    const item = buildCleanupItem({ leaveOn: null })
    const data = deletionCard(batch({ items: [item], count: 1, bytes: item.sizeBytes, action: "movie.delete", oversize: [{ itemKey: "x", day: "2026-11-09" }] }), card)

    expect(data).toMatchObject({ dueAt: "2026-11-08", dueSince: "2026-11-08", plan: { today: { count: 0, bytes: "0" }, lastDay: null },
      oversize: [{ title: "x", day: "2026-11-09" }] })
  })

  it("dates a hold by heldAt, else by createdAt", () => {
    const held = buildCleanupItem({ heldAt: new Date("2026-11-08T03:09:00.000Z") })
    const old = buildCleanupItem({ heldAt: null, createdAt: new Date("2026-11-07T03:08:00.000Z") })

    expect(heldAtOf({ items: [held, old] })).toEqual(new Date("2026-11-07T03:08:00.000Z"))
  })

  it("names the count limit above it, else the percent limit of the checked items", () => {
    const check = { count: 50, percent: 10 }
    expect(entryLimit(52, check, 400)).toBe(50)
    expect(entryLimit(45, check, 400)).toBe(40)
    expect(entryLimit(45, check, null)).toBe(50)
  })

  it("reads 'last night' when no admin run held the batch", async () => {
    prismaMock.cleanupRun.findFirst.mockResolvedValue(null)

    const heldBy = await readHeldBy({ items: [buildCleanupItem({ heldAt: new Date("2026-11-08T03:09:00.000Z") })] })

    expect(heldBy).toEqual({ trigger: "scheduled", at: "2026-11-08T03:09:00.000Z" })
    expect(prismaMock.cleanupRun.findFirst.mock.calls[0][0]?.where).toEqual({ kind: "run", held: { gt: 0 },
      startedAt: { lte: new Date("2026-11-08T03:24:00.000Z") } })
  })

  it("sorts deletion cards by newest due date, then entry cards by newest hold, then by rule name", () => {
    const deletion = (id: string, dueAt: string, ruleName = "R") => ({ kind: "deletion", id, dueAt, ruleName }) as BatchData
    const entry = (id: string, at: string, ruleName = "R") => ({ kind: "entry", id, heldBy: { trigger: "scheduled", at }, ruleName }) as BatchData

    const sorted = sortCards([entry("e1", "2026-11-01"), deletion("d1", "2026-11-06"), entry("e2", "2026-11-05"), deletion("d3", "2026-11-08", "B"),
      deletion("d2", "2026-11-08", "A")])

    expect(sorted.map((b) => b.id)).toEqual(["d2", "d3", "d1", "e2", "e1"])
  })
})

describe("people and rules", () => {
  it("reads no row for no id, and names a user by name, email or Unknown member", async () => {
    expect((await readPeople([null, undefined, ""], "me")).ref(null)).toBeNull()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()

    prismaMock.user.findMany.mockResolvedValue([buildUser({ id: "a", name: null, email: "a@example.com" }), buildUser({ id: "b", name: null, email: null })])
    const people = await readPeople(["a", "b", "c", "a"], "b")

    expect(prismaMock.user.findMany.mock.calls[0][0]?.where).toEqual({ id: { in: ["a", "b", "c"] } })
    expect([people.ref("a"), people.ref("b"), people.ref("c")]).toEqual([{ id: "a", name: "a@example.com", isYou: false },
      { id: "b", name: "Unknown member", isYou: true }, { id: "c", name: "Unknown member", isYou: false }])
    expect([people.words("a"), people.words("b"), people.words(null)]).toEqual(["a@example.com", "you", null])
  })

  it("names a rule that is gone 'A deleted rule'", () => {
    const rule = ruleNamer([{ id: "r1", name: "Old movies" }])

    expect([rule("r1"), rule("r2")]).toEqual([{ id: "r1", name: "Old movies" }, { id: "r2", name: DELETED_RULE }])
  })
})
