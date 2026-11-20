/** The Results "Why" text (TS 6.9): each class, each unknown cause and each Cannot delete cause. */

import {
  buildCondition,
  buildEvalContext,
  buildLiveFacts,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildSourceStatuses,
  daysAgo,
  globalsOf,
  NOW,
  stubEvals,
  stubGlobal,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import { whyText } from "@/lib/cleanup/engine/why-text"
import { buildDraft, MEMBERS, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { matchCauseSchema, type SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const words = { memberName: () => null }

function why(draft: RuleDraft, item: SnapshotItem, ctx: EvalContext = realContext(), sources = buildSourceStatuses()) {
  const compiled = compileDraft(draft)
  const result = evaluateItem(compiled, item, ctx)
  return whyText(result, classify(result), { compiled, ctx, words, sources })
}

const NEVER = buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] }, added: { plex: daysAgo(400), arr: null }, sizeBytes: 30 * GiB })
const text = (parts: { text: string; strong?: boolean }[]) => parts.map((p) => (p.strong ? `**${p.text.trim()}**` : p.text)).join("")

describe("whyText", () => {
  it("gives a match the facts of its clauses in field order, at most 3, the first in bold", () => {
    const draft = buildDraft({ conditions: [buildCondition("library.added", { id: "c1" }), buildCondition("file.size", { id: "c2" }),
      buildCondition("request.exists", { id: "c3" }), buildCondition("watch.lastPlayed", { id: "c4", op: "never" })] })
    expect(text(why(draft, NEVER))).toBe("**Never played.** Nobody requested it. Added Oct 2025.")
  })

  it("gives a group the fact of the member that passed", () => {
    const draft = buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("watch.plays", { id: "c1", op: "atLeast", value: { count: 5, window: { kind: "total" } } }),
      buildCondition("file.size", { id: "c2" })] }] })
    expect(text(why(draft, NEVER))).toBe("**30 GB.**")
  })

  it("gives a near miss the failing label, its fact, what it needs and the forecast", () => {
    const item = buildMovieItem({ plays: { lastCountedAt: daysAgo(200), countedAt: [daysAgo(200)], viewers: [] } })
    expect(text(why(buildDraft({ conditions: [buildCondition("watch.lastPlayed")] }), item))).toBe(
      "**Fails Last played:** Last played Apr 2026. Needs more than 365 days ago, or never. If nobody plays it, it passes on Apr 23, 2027.")
    const added = buildMovieItem({ added: { plex: daysAgo(10), arr: daysAgo(10) }, plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    const draft = buildDraft({ conditions: [buildCondition("library.added", { value: { duration: { amount: 60, unit: "days" } } })] })
    const ctx = realContext({ options: buildOptions({ protections: { g6: { enabled: false } } }) })
    expect(text(why(draft, added, ctx))).toBe("**Fails Added:** Added Oct 2026. Needs more than 60 days ago. It passes on Dec 29, 2026.")
  })

  it("gives a near miss with no forecast no forecast sentence, and a group no threshold", () => {
    expect(text(why(buildDraft({ conditions: [buildCondition("file.size", { value: { bytes: 40 * GiB, unit: "GB" } })] }), NEVER))).toBe(
      "**Fails Size on disk:** 30 GB. Needs more than 40 GB.")
    const group = buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c1", value: { bytes: 40 * GiB, unit: "GB" } }),
      buildCondition("watch.plays", { id: "c2", op: "atLeast", value: { count: 2, window: { kind: "total" } } })] }] })
    expect(text(why(group, NEVER))).toBe("**Fails Size on disk or Plays:** 30 GB. No counted play.")
  })

  it("gives a protected item its first protection and where it comes from", () => {
    const live = buildLiveFacts({ members: MEMBERS, keeps: [{ id: "k1", itemKey: NEVER.key, memberId: "u-avery", expiresAt: new Date(NOW + 30 * 86_400_000) }] })
    const draft = buildDraft({ conditions: [buildCondition("watch.lastPlayed", { op: "never" })] })
    expect(text(why(draft, NEVER, realContext({ live })))).toBe("**Kept by Avery Example until Dec 8, 2026.** Global protection.")
    const rule = buildDraft({ conditions: [buildCondition("file.size")], protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 0, window: { kind: "total" } } })] })
    expect(text(why(rule, NEVER))).toBe("**Has at least 0 plays in total.** This rule only.")
  })

  it("names a global protection by its sentence when it has no fact", () => {
    const ctx = buildEvalContext({ globals: globalsOf([{ ...stubGlobal("g4", {}, "protects"), fact: () => [] }]) })
    expect(text(why(buildDraft({ conditions: [buildCondition("file.size")] }), NEVER, ctx))).toBe(
      "**Played by anyone in the last 30 days.** Global protection.")
  })

  it("gives missing data the unknown label and its cause, with the read time of a failed source", () => {
    const ctx = realContext({ sources: buildSourceStatuses({ tautulli: { state: "failed" } }) })
    const failed = buildSourceStatuses({ tautulli: { state: "failed", readAt: new Date(NOW).toISOString() } })
    expect(text(why(buildDraft({ conditions: [buildCondition("watch.lastPlayed")] }), NEVER, ctx, failed))).toBe(
      "**Unknown Last played:** Tautulli did not answer at 12:00 PM.")
    expect(text(why(buildDraft({ conditions: [buildCondition("watch.lastPlayed")] }), NEVER, ctx, []))).toBe(
      "**Unknown Last played:** Tautulli did not answer.")
    const noStart = realContext({ facts: { users: {}, history: { startAt: null, newestAt: null, rows: 0, orphans: 0, usersWithPlay: 0 }, membersRead: [] } })
    expect(text(why(buildDraft({ conditions: [buildCondition("watch.lastPlayed")] }), NEVER, noStart))).toBe(
      "**Unknown Last played:** Tautulli history has no start date.")
  })

  it("names the unknown member of a group, a cause that is not known, a protection and the match", () => {
    const group = buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c1" }), buildCondition("watch.plays", { id: "c2" })] }] })
    const stub = buildEvalContext({ evals: stubEvals({ [NEVER.key]: { c1: "fail", c2: "unknown" } }) })
    expect(text(why(group, NEVER, stub))).toBe("**Unknown Plays:** The value is not known.")
    const unknownG4 = buildEvalContext({ globals: globalsOf([stubGlobal("g4", { [NEVER.key]: { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } } })]) })
    expect(text(why(buildDraft({ conditions: [buildCondition("file.size")] }), NEVER, unknownG4))).toBe(
      "**Unknown Played by anyone in the last 30 days:** Tautulli did not answer.")
    const unknownMatch = { ...NEVER, match: { state: "unknown" as const, cause: "arrFailed" as const } }
    expect(text(why(buildDraft({ conditions: [buildCondition("file.size")] }), unknownMatch, buildEvalContext()))).toBe(
      "**Unknown Radarr match:** Radarr did not answer.")
  })

  it.each(matchCauseSchema.options)("gives Cannot delete the cause %s and the never-deletes sentence", (cause) => {
    const parts = why(buildDraft({ conditions: [buildCondition("file.size")] }), { ...NEVER, match: { state: "unmatched", cause } }, buildEvalContext())
    expect(parts[0].strong).toBe(true)
    expect(parts.at(-1)?.text).toBe(" Cleanup never deletes it.")
    expect(text(parts)).not.toMatch(/undefined/)
  })

  it("words the Cannot delete causes of TS 6.9, and a match state with no cause", () => {
    const cannot = (item: SnapshotItem, draft = buildDraft({ conditions: [buildCondition("file.size")] })) => text(why(draft, item, buildEvalContext()))
    expect(cannot({ ...NEVER, match: { state: "conflicted", cause: "twoArrRecords" } })).toBe(
      "**Two Radarr records match.** Fix it in Radarr. Cleanup never deletes it.")
    expect(cannot({ ...NEVER, match: { state: "notManaged" } })).toBe("**The file is outside Radarr's root folders.** Cleanup never deletes it.")
    expect(cannot({ ...NEVER, match: { state: "conflicted" } })).toBe("**Two Radarr records match.** Fix it in Radarr. Cleanup never deletes it.")
    expect(cannot({ ...NEVER, match: { state: "unmatched" } })).toBe("**No Radarr record matches.** Cleanup never deletes it.")
    const season = { ...buildSeasonItem(), match: { state: "unmatched" as const, cause: "seasonMismatch" as const } }
    expect(cannot(season, buildDraft({ level: "season", libraries: ["2"], conditions: [buildCondition("file.size")] }))).toBe(
      "**Plex and Sonarr number the seasons of this show differently.** Cleanup never deletes it.")
    const noFile = { ...buildSeasonItem(), match: { state: "unmatched" as const, cause: "noArrFile" as const } }
    expect(cannot(noFile, buildDraft({ level: "season", libraries: ["2"], conditions: [buildCondition("file.size")] }))).toBe(
      "**Sonarr has no file for it.** Cleanup never deletes it.")
  })

  it("gives nothing for an item that is not listed, or a class without its parts", () => {
    const compiled = compileDraft(buildDraft({ conditions: [buildCondition("file.size", { id: "c1" })] }))
    const ctx = buildEvalContext()
    const result = evaluateItem(compiled, NEVER, ctx)
    const input = { compiled, ctx, words }
    expect(whyText(result, { class: "notListed" }, input)).toEqual([])
    expect(whyText(result, { class: "nearMiss" }, input)).toEqual([])
    expect(whyText(result, { class: "nearMiss", failing: "c9" }, input)).toEqual([])
    expect(whyText(result, { class: "protected" }, input)).toEqual([])
    expect(text(whyText({ ...result, clauses: [{ id: "c7", verdict: "unknown" }] }, { class: "missing" }, input))).toBe("**Unknown value:** The value is not known.")
  })
})
