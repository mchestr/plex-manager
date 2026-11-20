/**
 * @jest-environment node
 */

/** `getWhySheet` (TS 10.5): History from the stored Why, and the live Sheet from a draft, a saved rule or the rule that holds the title. */

jest.mock("@/lib/cleanup/preview/load", () => ({ ...jest.requireActual("@/lib/cleanup/preview/load"), loadLevel: jest.fn(), loadContext: jest.fn() }))
jest.mock("@/lib/cleanup/preview/rules", () => ({ ...jest.requireActual("@/lib/cleanup/preview/rules"), readRule: jest.fn(), readRules: jest.fn() }))
jest.mock("@/lib/cleanup/preview/why-load", () => ({
  readWhyRow: jest.fn(), readShowFloor: jest.fn(), readArrBase: jest.fn(), readMemberWords: jest.fn(), readOutcome: jest.fn(),
}))
jest.mock("@/lib/cleanup/settings", () => ({ readCleanupSettingsRow: jest.fn(), serverZone: jest.fn() }))

import { buildCleanupOutcome } from "@/__tests__/helpers/cleanup-factories"
import { buildCondition, buildDefinition, buildMovieItem, buildOptions, buildShowItem, buildSnapshotFacts, buildSourceStatuses, buildWhySnapshot, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { buildDraft, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { type PreviewRule, readRule, readRules } from "@/lib/cleanup/preview/rules"
import type { WhyRow } from "@/lib/cleanup/preview/why-live"
import { readArrBase, readMemberWords, readOutcome, readShowFloor, readWhyRow } from "@/lib/cleanup/preview/why-load"
import { getWhySheet } from "@/lib/cleanup/preview/why-sheet"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import type { CompleteHeader } from "@/lib/cleanup/snapshot/cache"

const header: CompleteHeader = { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW - 60_000),
  finishedAt: new Date(NOW), sources: buildSourceStatuses(), facts: buildSnapshotFacts({ machineIdentifier: "machine-1" }) }
const movie = buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
const show = buildShowItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
const NEVER = buildCondition("watch.lastPlayed", { op: "never" })

const rule = (id: string, mode: PreviewRule["mode"], overrides: Partial<PreviewRule["definition"]> = {}): PreviewRule =>
  ({ id, name: `Rule ${id}`, mode, createdAt: new Date(NOW), definition: buildDefinition({ conditions: [NEVER], ...overrides }) })
const RULES = [rule("rule-1", "dryRun"), rule("rule-2", "automatic"), rule("rule-3", "reviewFirst", { level: "show", libraries: ["2"],
  then: { graceDays: 30, action: "show.delete", importListExclusion: false } })]

const leavingRow: WhyRow = { itemKey: movie.key, state: "leaving", leaveOn: "2026-12-08", needsApproval: false, failCode: null, holdCode: null, deferredAt: null,
  postponedAt: null, ruleIds: ["rule-1", "rule-2"], action: "movie.delete", importListExclusion: false, enteredAt: new Date(NOW) }

function snapshotOf(items: SnapshotItem[]) {
  return { header, items, byKey: new Map(items.map((i) => [i.key, i])), shows: [] }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(loadLevel).mockImplementation(async (level) => snapshotOf(level === "show" ? [show] : [movie]))
  jest.mocked(loadContext).mockResolvedValue({ ctx: realContext(), holdUntil: null, paused: false })
  jest.mocked(readRules).mockResolvedValue(RULES)
  jest.mocked(readRule).mockResolvedValue(RULES[0])
  jest.mocked(readWhyRow).mockResolvedValue(null)
  jest.mocked(readShowFloor).mockResolvedValue("2026-12-20")
  jest.mocked(readArrBase).mockResolvedValue("https://arr.example.com")
  jest.mocked(readMemberWords).mockResolvedValue({ memberName: () => null })
  jest.mocked(readCleanupSettingsRow).mockResolvedValue({ options: buildOptions() } as never)
  jest.mocked(serverZone).mockResolvedValue("UTC")
})

describe("getWhySheet from History", () => {
  it("builds the Sheet from the stored Why of the outcome", async () => {
    jest.mocked(readOutcome).mockResolvedValue(buildCleanupOutcome({ itemKey: movie.key, why: buildWhySnapshot({ ruleId: "rule-1" }) }) as never)
    const data = await getWhySheet({ itemKey: movie.key, outcomeId: "cleanup-outcome-1" })
    expect(data).toMatchObject({ state: "deleted", fromRun: { runId: "cleanup-run-1" }, item: { itemKey: movie.key, level: "movie" } })
    expect(readRule).toHaveBeenCalledWith("rule-1")
    expect(readMemberWords).toHaveBeenCalledWith([])
  })

  it("reads the names that a gone rule cannot give as none", async () => {
    jest.mocked(readRule).mockResolvedValue(null)
    jest.mocked(readOutcome).mockResolvedValue(buildCleanupOutcome({ itemKey: movie.key, why: buildWhySnapshot() }) as never)
    expect((await getWhySheet({ itemKey: movie.key, outcomeId: "o-1" }))?.conditions[0].threshold).toBe("")
  })

  it.each([
    ["no outcome", null],
    ["another title", { itemKey: "movie:tmdb:2" }],
    ["a level this build does not know", { level: "film" }],
    ["no stored Why", { why: null }],
  ])("gives null for %s", async (_name, overrides) => {
    jest.mocked(readOutcome).mockResolvedValue(overrides === null ? null : (buildCleanupOutcome({ itemKey: movie.key, why: buildWhySnapshot(), ...overrides }) as never))
    expect(await getWhySheet({ itemKey: movie.key, outcomeId: "o-1" })).toBeNull()
  })
})

describe("getWhySheet live", () => {
  it("explains a preview row with the editor's draft, and lists the other rules of the level", async () => {
    const data = await getWhySheet({ itemKey: movie.key, definition: buildDraft({ conditions: [NEVER] }) })
    expect(data).toMatchObject({ state: "match", then: { dryRun: true }, links: { arrUrl: "https://arr.example.com/movie/the-invented-movie-1001" } })
    expect(data?.links.plexUrl).toContain("machine-1")
    expect(data?.otherRules.map((r) => r.ruleId)).toEqual(["rule-1", "rule-2"])
    expect(readShowFloor).not.toHaveBeenCalled()
    expect(readArrBase).toHaveBeenCalledWith("radarr")
  })

  it("explains a Leaving soon title with the first live rule that holds it", async () => {
    jest.mocked(readWhyRow).mockResolvedValue(leavingRow)
    const data = await getWhySheet({ itemKey: movie.key }, { now: new Date(NOW) })
    expect(data).toMatchObject({ state: "leaving", then: { dryRun: false }, leaving: { leaveOn: "2026-12-08" } })
    expect(data?.otherRules.map((r) => r.ruleId)).toEqual(["rule-1"])
  })

  it("uses the saved rule of `ruleId`, and the show floor of a show", async () => {
    const data = await getWhySheet({ itemKey: show.key, ruleId: "rule-3" })
    expect(data?.then?.text[0].text).toContain("It goes on Dec 20, 2026 or later, after its seasons.")
    expect(readShowFloor).toHaveBeenCalledWith(show.titleKey, null)
    expect(data?.otherRules).toEqual([])
  })

  it("reads no arr URL for a title with no arr record", async () => {
    jest.mocked(loadLevel).mockResolvedValue(snapshotOf([{ ...movie, arr: null }]))
    expect((await getWhySheet({ itemKey: movie.key, ruleId: "rule-1" }))?.links.arrUrl).toBeNull()
    expect(readArrBase).not.toHaveBeenCalled()
  })

  it.each([
    ["an item key of no level", { itemKey: "film:tmdb:1", ruleId: "rule-1" }, null],
    ["a title that is not in the snapshot", { itemKey: "movie:tmdb:2", ruleId: "rule-1" }, null],
    ["no rule to evaluate", { itemKey: movie.key }, null],
    ["a rule of another level", { itemKey: movie.key, ruleId: "rule-3" }, null],
    ["no library data", { itemKey: movie.key, ruleId: "rule-1" }, "none"],
  ])("gives null for %s", async (_name, input, data) => {
    if (data === "none") jest.mocked(loadLevel).mockResolvedValue(null)
    expect(await getWhySheet(input)).toBeNull()
  })
})
