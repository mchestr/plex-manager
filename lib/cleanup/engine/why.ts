/**
 * The stored Why of a check (TS 3.4, TS 6.9): the verdicts, the facts, the
 * match and the sources that one evaluation saw. Reconcile writes it to
 * `CleanupItem.why`, and an exit copies it to `CleanupOutcome.why`, so
 * History can show the Why Sheet of a title that is gone. Client-safe.
 *
 * It holds no member id and no name. Each requester is only `member`,
 * `former`, `owner` or `unknown`. `whyText` and the Why Sheet data live in
 * `why-text.ts` and `lib/cleanup/preview/why-sheet.ts` (deviation D5).
 *
 * @module lib/cleanup/engine/why
 */

import type { CompiledRule, EvalContext, ItemResult, UnknownCause } from "@/lib/cleanup/engine/types"
import type { SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { REQUESTER_KINDS, WhySnapshot } from "@/lib/cleanup/schema/why"
import type { FieldId } from "@/lib/validations/cleanup-vocabulary"

export type RequesterKind = (typeof REQUESTER_KINDS)[number]

/** What the Why needs beyond the result: the snapshot, the rule and the source results that it read. */
export interface WhyMeta {
  snapshotId: string
  /** ISO instant of the snapshot. */
  takenAt: string
  /** The rule whose verdicts are stored: the first holding rule. */
  ruleId: string
  sources: readonly SourceStatus[]
}

/** The stored code of an unknown cause: `sourceFailed:<service>` or `noValue:<what>` (also the `holdCode` form). */
export function causeCode(cause: UnknownCause): string {
  return cause.kind === "sourceFailed" ? `sourceFailed:${cause.service}` : `noValue:${cause.what}`
}

/**
 * What a requester is, with no id: no plex.tv id or no entry in the snapshot
 * users is `unknown`, the server owner is `owner`, access is `member`, no
 * access is `former`, and an unknown access (the share list failed) is `unknown`.
 */
export function requesterKind(by: string | null, ctx: Pick<EvalContext, "users">): RequesterKind {
  const user = by === null ? undefined : ctx.users.get(by)
  if (!user) return "unknown"
  if (user.owner) return "owner"
  if (user.hasAccess === true) return "member"
  return user.hasAccess === false ? "former" : "unknown"
}

/** The external id that the match used, as text. */
function externalId(item: SnapshotItem): string | undefined {
  const by = item.match.by
  const value = by === undefined ? undefined : item.ids[by]
  return value === undefined ? undefined : String(value)
}

function matchOf(item: SnapshotItem): WhySnapshot["match"] {
  const match: WhySnapshot["match"] = { state: item.match.state }
  const id = externalId(item)
  if (item.match.by !== undefined) match.by = item.match.by
  if (id !== undefined) match.externalId = id
  if (item.arr) Object.assign(match, { service: item.arr.service, arrId: item.arr.id, path: item.arr.path })
  return match
}

function factsOf(item: SnapshotItem, ctx: EvalContext): WhySnapshot["facts"] {
  return {
    lastCountedAt: item.plays?.lastCountedAt ?? null,
    countedTotal: item.plays ? item.plays.countedAt.length : null,
    addedPlex: item.added.plex,
    addedArr: item.added.arr,
    sizeBytes: item.sizeBytes,
    requests: (item.requests ?? []).map((r) => ({ at: r.at, requester: requesterKind(r.by, ctx) })),
    importList: item.arr?.importList ?? false,
    showStatus: item.show?.status ?? null,
    seasonsOnDisk: item.show?.seasonsOnDisk ?? null,
    position: item.position,
    lastEpisodeAddedAt: item.show?.lastEpisodeAddedAt ?? null,
    historyStartAt: ctx.history.startAt,
  }
}

/** The field of each condition id of the rule: top-level conditions and group members. */
function fieldsOf(compiled: CompiledRule): Map<string, FieldId> {
  const fields = new Map<string, FieldId>()
  for (const clause of compiled.clauses) {
    for (const c of clause.kind === "condition" ? [clause.condition] : clause.conditions) fields.set(c.id, c.field)
  }
  return fields
}

/**
 * The verdicts of the conditions. A group stores the rows of its members
 * (`result.members`), because a stored row names one field.
 */
function conditionsOf(compiled: CompiledRule, result: ItemResult): WhySnapshot["conditions"] {
  const fields = fieldsOf(compiled)
  const rows: WhySnapshot["conditions"] = []
  for (const clause of result.clauses) {
    for (const c of result.members[clause.id] ?? [clause]) {
      const field = fields.get(c.id)
      if (field === undefined) continue
      rows.push(c.cause === undefined ? { id: c.id, field, verdict: c.verdict } : { id: c.id, field, verdict: c.verdict, cause: causeCode(c.cause) })
    }
  }
  return rows
}

/**
 * The `WhySnapshot` of one evaluated item (TS 3.4): the verdicts of its
 * conditions and protections, its facts with each requester mapped to a
 * kind, its match, and the sources. `checkedAt` is `ctx.now`.
 */
export function whySnapshot(compiled: CompiledRule, result: ItemResult, ctx: EvalContext, meta: WhyMeta): WhySnapshot {
  return {
    v: 1,
    snapshotId: meta.snapshotId,
    takenAt: meta.takenAt,
    checkedAt: new Date(ctx.now).toISOString(),
    ruleId: meta.ruleId,
    conditions: conditionsOf(compiled, result),
    protections: result.protections.map((p) => ({ id: p.id, verdict: p.verdict })),
    facts: factsOf(result.item, ctx),
    match: matchOf(result.item),
    sources: meta.sources.map((s) => ({ ...s })),
  }
}
