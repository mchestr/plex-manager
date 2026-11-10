/** The preview warnings (TS 6.7): each kind, in card order. */

import { buildCondition, buildMovieItem, buildOptions, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import type { RuleStatistics } from "@/lib/cleanup/engine/stats"
import type { ItemResult } from "@/lib/cleanup/engine/types"
import { buildDraft } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { previewWarnings, type WarningInput } from "@/lib/cleanup/preview/warnings"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const stats = (overrides: Partial<RuleStatistics> = {}): RuleStatistics => ({
  checked: 10, passAlone: { c1: 4, c2: 2 }, heldBack: { c1: 0, c2: 3 }, allConditions: 0, protectedAll: 0, protectedGlobal: 0, matches: 0, bytes: 0,
  tabs: { matches: 0, nearMisses: 3, protected: 0, missing: 0, cannotDelete: 0 }, notListed: 7, protectedBy: {}, keepsSafe: {}, ...overrides,
})

const result = (key: number, size: number | null, c1: "pass" | "fail", c2: "pass" | "fail"): ItemResult => ({
  item: buildMovieItem({ key: `movie:tmdb:${key}`, sizeBytes: size }), members: {}, protections: [], match: { state: "matched" },
  clauses: [{ id: "c1", verdict: c1 }, { id: "c2", verdict: c2 }],
})

function input(overrides: Partial<WarningInput> = {}): WarningInput {
  return {
    compiled: compileDraft(buildDraft({ conditions: [buildCondition("watch.lastPlayed", { id: "c1" }), buildCondition("file.size", { id: "c2" })] })),
    results: [], stats: stats(), options: buildOptions(), sources: [], now: NOW, finishedAt: NOW, notApplicable: [], ...overrides,
  }
}

describe("previewWarnings", () => {
  it("names the clause with the smallest pass count and the largest item that passes the others", () => {
    const results = [result(1, 5 * GiB, "pass", "fail"), result(2, 9 * GiB, "pass", "fail"), result(3, 50 * GiB, "fail", "fail"), result(4, null, "pass", "fail")]
    expect(previewWarnings(input({ results }))).toEqual([{ kind: "zero", conditionId: "c2", leaves: 2, of: 10, largestBytes: String(9 * GiB), nearMisses: 3 }])
    expect(previewWarnings(input({ results: [result(4, null, "pass", "fail")] }))[0]).toMatchObject({ kind: "zero", largestBytes: null })
  })

  it("gives no zero warning with matches, with nothing checked, or with no clause", () => {
    expect(previewWarnings(input({ stats: stats({ matches: 1 }) }))).toEqual([])
    expect(previewWarnings(input({ stats: stats({ checked: 0 }) }))).toEqual([])
    expect(previewWarnings(input({ compiled: compileDraft(buildDraft()) }))).toEqual([])
  })

  it("warns about a wide rule above half of the checked items only", () => {
    expect(previewWarnings(input({ stats: stats({ matches: 6 }) }))).toEqual([{ kind: "wide", percent: 60, matches: 6, checked: 10 }])
    expect(previewWarnings(input({ stats: stats({ matches: 5 }) }))).toEqual([])
  })

  it("names a failed source once, only when the rule reads it, then stale data and the left out conditions", () => {
    const readAt = new Date(NOW).toISOString()
    const sources: SourceStatus[] = [
      { service: "plex", state: "failed", readAt },
      { service: "plex", part: "shares", state: "failed", readAt: null },
      { service: "sonarr", state: "failed", readAt },
    ]
    const warnings = previewWarnings(input({ stats: stats({ matches: 1 }), sources, finishedAt: NOW - 37 * 3_600_000, notApplicable: ["c3"],
      compiled: { ...input().compiled, incomplete: ["c4"] } }))
    expect(warnings).toEqual([
      { kind: "sourceFailed", service: "plex", readAt },
      { kind: "stale", hours: 37 },
      { kind: "incomplete", conditionIds: ["c4"] },
      { kind: "notApplicable", conditionIds: ["c3"] },
    ])
  })
})
