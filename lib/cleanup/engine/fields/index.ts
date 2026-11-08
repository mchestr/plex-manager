/**
 * The field evaluators of media cleanup (TS 4.1): one `FieldEval` for each
 * of the twelve fields, keyed by field id. `buildEvalContext()` injects them
 * into `EvalContext.evals` (deviation D1). The evaluator never imports this
 * file: it calls `ctx.evals`, so its tests use stubs.
 *
 * Two fact helpers complete TS 4.5 where one `fact(item, ctx)` cannot:
 * `conditionFact()` gives the windowed play count of a `watch.plays`
 * condition, and `whySheetFact()` gives the Why Sheet forms of
 * `watch.lastPlayed` and `library.added`. Client-safe.
 *
 * @module lib/cleanup/engine/fields
 */

import { added, addedSheetFact, size } from "@/lib/cleanup/engine/fields/library"
import { age, by, exists, requesters } from "@/lib/cleanup/engine/fields/requests"
import { lastEpisodeAdded, position, seasonsOnDisk, status } from "@/lib/cleanup/engine/fields/shows"
import { lastPlayed, lastPlayedSheetFact, plays, playsWindowFact } from "@/lib/cleanup/engine/fields/watch"
import type { EvalContext, FieldEvals, WhyPart } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { Condition } from "@/lib/validations/cleanup-rule"
import type { FieldId } from "@/lib/validations/cleanup-vocabulary"

export const FIELD_EVALS: FieldEvals = {
  "watch.lastPlayed": lastPlayed,
  "watch.plays": plays,
  "request.exists": exists,
  "request.age": age,
  "request.by": by,
  "request.requesters": requesters,
  "library.added": added,
  "file.size": size,
  "show.status": status,
  "show.lastEpisodeAdded": lastEpisodeAdded,
  "show.seasonsOnDisk": seasonsOnDisk,
  "season.position": position,
}

/**
 * The fact of one condition for the Results "Why" text (TS 4.5, 6.9): the
 * field's `fact()`, but "{n} plays in the last {N}." for a `watch.plays`
 * condition with a window.
 */
export function conditionFact(c: Condition, item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  if (c.field === "watch.plays") return playsWindowFact(item, c, ctx)
  return FIELD_EVALS[c.field].fact(item, ctx)
}

/**
 * The fact of a field for the Why Sheet (TS 4.5): "Last played {date}." with
 * the history start for "never", and each added date with its source. The
 * other fields read as in the Results.
 */
export function whySheetFact(field: FieldId, item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  if (field === "watch.lastPlayed") return lastPlayedSheetFact(item, ctx)
  if (field === "library.added") return addedSheetFact(item, ctx)
  return FIELD_EVALS[field].fact(item, ctx)
}
