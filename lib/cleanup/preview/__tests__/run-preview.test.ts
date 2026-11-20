/**
 * @jest-environment node
 */

/** `runPreview` (TS 10.6): the empty preview with no library data, the rule read, the impact of a live rule, and the abort checks. */

jest.mock("@/lib/cleanup/preview/load", () => ({ ...jest.requireActual("@/lib/cleanup/preview/load"), loadLevel: jest.fn(), loadContext: jest.fn() }))
jest.mock("@/lib/cleanup/preview/rules", () => ({ ...jest.requireActual("@/lib/cleanup/preview/rules"), readRule: jest.fn(), readImpactRows: jest.fn() }))

import { buildCondition, buildDefinition, buildMovieItem, buildSnapshotFacts, buildSourceStatuses, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { buildDraft, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { readImpactRows, readRule } from "@/lib/cleanup/preview/rules"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import type { CompleteHeader } from "@/lib/cleanup/snapshot/cache"

const header: CompleteHeader = { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW - 60_000),
  finishedAt: new Date(NOW), sources: buildSourceStatuses(), facts: buildSnapshotFacts() }
const item = buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
const DRAFT = buildDraft({ conditions: [buildCondition("watch.lastPlayed", { op: "never" })], then: { action: "movie.unmonitorDeleteFiles" } })
const opts = { actorId: "admin-1", now: new Date(NOW) }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(loadLevel).mockResolvedValue({ header, items: [item], byKey: new Map([[item.key, item]]), shows: [] })
  jest.mocked(loadContext).mockResolvedValue({ ctx: realContext(), holdUntil: null, paused: false })
  jest.mocked(readRule).mockResolvedValue(null)
  jest.mocked(readImpactRows).mockResolvedValue({ rows: [], rowKeys: new Set(), liveRules: new Map() })
})

describe("runPreview", () => {
  it("answers with no library data: zero counts, the noData block, the sentence and the draft's own warnings", async () => {
    jest.mocked(loadLevel).mockResolvedValue(null)
    const draft = buildDraft({ conditions: [buildCondition("watch.lastPlayed", { id: "c1" }), { id: "c2", field: "file.size", op: "moreThan", value: null },
      buildCondition("show.status", { id: "c3" })] })
    const preview = await runPreview({ definition: draft, ruleId: "rule-1" }, opts)
    expect(preview).toMatchObject({ snapshot: null, checked: 0, matches: 0, bytes: "0", rows: [], page: 1, pageCount: 1, total: 0,
      clauses: [{ id: "c1", passAlone: 0, heldBack: 0 }], incomplete: ["c2"], blocks: [{ code: "noData", ruleId: "rule-1" }] })
    expect(preview.warnings).toEqual([{ kind: "incomplete", conditionIds: ["c2"] }, { kind: "notApplicable", conditionIds: ["c3"] }])
    expect(preview.sentence.map((p) => p.text).join("")).toContain("This rule is in Dry run")
    expect(loadContext).toHaveBeenCalledWith(null, [], opts.now)
    const plain = await runPreview({ definition: buildDraft({ conditions: [buildCondition("file.size")] }) }, opts)
    expect(plain.warnings).toEqual([])
    expect(plain.blocks).toEqual([{ code: "noData" }])
  })

  it("previews a new rule in Dry run words, with no impact", async () => {
    const preview = await runPreview({ definition: DRAFT }, opts)
    expect(preview).toMatchObject({ checked: 1, matches: 1, snapshot: { id: "snap-1" } })
    expect(preview.impact).toBeUndefined()
    expect(readRule).not.toHaveBeenCalled()
  })

  it("gives the impact of a live rule, with the draft's Then over the stored one", async () => {
    jest.mocked(readRule).mockResolvedValue({ id: "rule-1", name: "Old movies", mode: "automatic", createdAt: new Date(NOW), definition: buildDefinition() })
    jest.mocked(readImpactRows).mockResolvedValue({ rows: [{ itemKey: item.key, level: "movie", sectionId: "1", ratingKey: "5001", title: item.title, year: 2019,
      seasonNumber: null, episodeCount: null, seasonCount: null, sizeBytes: 1n, state: "leaving", ruleIds: ["rule-1"], action: "movie.delete", importListExclusion: true }],
    rowKeys: new Set([item.key]), liveRules: new Map() })
    const preview = await runPreview({ definition: DRAFT, ruleId: "rule-1" }, opts)
    expect(preview.impact).toMatchObject({ leave: 0, keep: 1, join: 0, actionChange: 0, joinLeaveOn: "2026-12-08" })
    expect(preview.sentence.map((p) => p.text).join("")).toContain("inside the daily budget")
    expect(readImpactRows).toHaveBeenCalledWith("rule-1")
  })

  it("gives a Dry run rule no impact", async () => {
    jest.mocked(readRule).mockResolvedValue({ id: "rule-1", name: "Old movies", mode: "dryRun", createdAt: new Date(NOW), definition: buildDefinition() })
    expect((await runPreview({ definition: DRAFT, ruleId: "rule-1" }, opts)).impact).toBeUndefined()
    expect(readImpactRows).not.toHaveBeenCalled()
  })

  it("stops after the loads when the request aborts", async () => {
    const controller = new AbortController()
    jest.mocked(loadLevel).mockImplementation(async () => {
      controller.abort(new Error("aborted"))
      return null
    })
    await expect(runPreview({ definition: DRAFT }, { ...opts, signal: controller.signal })).rejects.toThrow("aborted")
    expect(loadContext).not.toHaveBeenCalled()
  })

  it("stops after the item rows of a live rule when the request aborts", async () => {
    const controller = new AbortController()
    jest.mocked(readRule).mockResolvedValue({ id: "rule-1", name: "Old movies", mode: "reviewFirst", createdAt: new Date(NOW), definition: buildDefinition() })
    jest.mocked(readImpactRows).mockImplementation(async () => {
      controller.abort(new Error("late"))
      return { rows: [], rowKeys: new Set(), liveRules: new Map() }
    })
    await expect(runPreview({ definition: DRAFT, ruleId: "rule-1" }, { ...opts, signal: controller.signal })).rejects.toThrow("late")
  })
})
