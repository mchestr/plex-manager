/**
 * Shared parts of the field verdicts: verdict values, the service check of
 * TS 4.3 rule 4, Kleene folds that keep the first unknown cause, and the
 * words of the fact phrases (TS 4.5). Client-safe.
 *
 * Fact phrases format dates in the server zone (`ctx.zone`) with the default
 * locale: `EvalContext` carries no locale, and the copy is English.
 *
 * @module lib/cleanup/engine/fields/shared
 */

import { all, any, none } from "@/lib/cleanup/engine/kleene"
import type { EvalContext, FieldVerdict, UnknownCause, Verdict, WhyPart } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { DEFAULT_LOCALE, formatDate } from "@/lib/utils/format"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

export const PASS: FieldVerdict = { verdict: "pass" }
export const FAIL: FieldVerdict = { verdict: "fail" }

/** Pass when `ok` holds, else fail. */
export const passWhen = (ok: boolean): FieldVerdict => (ok ? PASS : FAIL)

/** Unknown, with its cause when one is known. */
export function unknown(cause?: UnknownCause): FieldVerdict {
  return cause ? { verdict: "unknown", cause } : { verdict: "unknown" }
}

/** Unknown because `service` failed or is not set up (TS 4.3 rule 4). */
export const sourceFailed = (service: Service): FieldVerdict => unknown({ kind: "sourceFailed", service })

/** The first service of `services` that is not `ok`, as an unknown verdict; null when every one is ok (TS 4.3 rule 4). */
export function needsCheck(ctx: Pick<EvalContext, "sources">, services: readonly Service[]): FieldVerdict | null {
  const down = services.find((service) => ctx.sources[service] !== "ok")
  return down ? sourceFailed(down) : null
}

type Fold = (verdicts: Iterable<Verdict>) => Verdict

function folded(fold: Fold, parts: readonly FieldVerdict[]): FieldVerdict {
  const verdict = fold(parts.map((part) => part.verdict))
  if (verdict !== "unknown") return { verdict }
  return unknown(parts.find((part) => part.verdict === "unknown" && part.cause)?.cause)
}

/** Kleene `all` over verdicts; an unknown result keeps the first known cause. */
export const allOf = (parts: readonly FieldVerdict[]) => folded(all, parts)
/** Kleene `any` over verdicts; an unknown result keeps the first known cause. */
export const anyOf = (parts: readonly FieldVerdict[]) => folded(any, parts)
/** Kleene `none` over verdicts; an unknown result keeps the first known cause. */
export const noneOf = (parts: readonly FieldVerdict[]) => folded(none, parts)

/** The show item of a season (`ctx.showsByKey`), else null. Movies and shows have none. */
export function showOf(item: SnapshotItem, ctx: Pick<EvalContext, "showsByKey">): SnapshotItem | null {
  return item.level === "season" && item.showKey ? (ctx.showsByKey.get(item.showKey) ?? null) : null
}

const settings = (ctx: Pick<EvalContext, "zone">) => ({ timeZone: ctx.zone, locale: DEFAULT_LOCALE })

/** `{month}` of TS 4.5: "Mar 2024". `t` is in Unix seconds. */
export const monthOf = (t: number, ctx: Pick<EvalContext, "zone">) => formatDate(t * 1000, "month-year-short", settings(ctx))
/** `{date}` of TS 4.5: "Mar 3, 2024". `t` is in Unix seconds. */
export const dateOf = (t: number, ctx: Pick<EvalContext, "zone">) => formatDate(t * 1000, "short", settings(ctx))

/** One fact phrase per sentence, with no strong part: the Why text decides what is strong (TS 6.9). */
export const phrases = (...texts: string[]): WhyPart[] => texts.map((text) => ({ text }))

/** "1 season", "3 seasons". */
export const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const ARR_NAMES = { radarr: "Radarr", sonarr: "Sonarr" } as const

/** The newest of the instants, or null when there is none. */
export function newest(values: readonly (number | null | undefined)[]): number | null {
  let best: number | null = null
  for (const value of values) if (typeof value === "number" && (best === null || value > best)) best = value
  return best
}
