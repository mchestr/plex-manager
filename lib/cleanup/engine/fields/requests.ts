/**
 * Request fields (TS 4.2, 4.3): `request.exists`, `request.age`,
 * `request.by` and `request.requesters`. Each reads the applicable requests
 * `R` of `request-set.ts`; `requests` null means Overseerr failed. 4K
 * requests count like the others. Client-safe.
 *
 * @module lib/cleanup/engine/fields/requests
 */

import { applicableRequests, matchesRef, requesterName, requesterRequests, requestersOf } from "@/lib/cleanup/engine/fields/request-set"
import { allOf, anyOf, FAIL, monthOf, needsCheck, newest, noneOf, passWhen, phrases, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { dateForecast, dateGap, datePasses, dateTry, daysSince } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldEval, FieldVerdict, WhyPart } from "@/lib/cleanup/engine/types"
import type { RequestFact, SnapshotItem, Viewer } from "@/lib/cleanup/schema/snapshot"
import { durationDays } from "@/lib/validations/cleanup-rule"
import { FIELD_NEEDS, type FieldId } from "@/lib/validations/cleanup-vocabulary"

/** `R`, or the unknown verdict when Overseerr failed or is not set up. */
function readRequests(field: FieldId, item: SnapshotItem, ctx: EvalContext): { requests: RequestFact[] } | { verdict: FieldVerdict } {
  const down = needsCheck(ctx, FIELD_NEEDS[field])
  if (down) return { verdict: down }
  const requests = applicableRequests(item)
  return requests ? { requests } : { verdict: sourceFailed("overseerr") }
}

/** The newest request date of `R`, or null with no request or unknown requests. */
function newestAt(item: SnapshotItem, ctx: EvalContext): number | null {
  const read = readRequests("request.age", item, ctx)
  return "verdict" in read ? null : newest(read.requests.map((r) => r.at))
}

/** "Requested {month}.", or "Nobody requested it." ("Came from an import list." for an import list title). */
function requestedFact(item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  const requests = applicableRequests(item)
  if (requests === null) return []
  const at = newest(requests.map((r) => r.at))
  if (at !== null) return phrases(`Requested ${monthOf(at, ctx)}.`)
  return phrases(item.arr?.importList ? "Came from an import list." : "Nobody requested it.")
}

const unordered = { gap: () => null, forecast: () => null, tryValue: () => null, measure: () => null }

export const exists: FieldEval<"request.exists"> = {
  id: "request.exists",
  evaluate(item, c, ctx) {
    const read = readRequests("request.exists", item, ctx)
    if ("verdict" in read) return read.verdict
    const requested = read.requests.length > 0
    return passWhen(requested === c.value.exists)
  },
  ...unordered,
  fact: requestedFact,
}

export const age: FieldEval<"request.age"> = {
  id: "request.age",
  evaluate(item, c, ctx) {
    const read = readRequests("request.age", item, ctx)
    if ("verdict" in read) return read.verdict
    const at = newest(read.requests.map((r) => r.at))
    return at === null ? FAIL : passWhen(datePasses(c.op, at, durationDays(c.value.duration), ctx.now))
  },
  gap(item, c, ctx) {
    const at = newestAt(item, ctx)
    return at === null ? null : dateGap(c.op, at, durationDays(c.value.duration), ctx.now)
  },
  forecast(item, c, ctx) {
    const at = newestAt(item, ctx)
    return at === null || c.op !== "moreThan" ? null : dateForecast(at, durationDays(c.value.duration), ctx)
  },
  tryValue(item, c, ctx) {
    const at = newestAt(item, ctx)
    const duration = at === null ? null : dateTry(c.op, at, c.value.duration, ctx.now)
    return duration ? { duration } : null
  },
  measure(item, ctx) {
    const at = newestAt(item, ctx)
    return at === null ? null : daysSince(at, ctx.now)
  },
  fact: requestedFact,
}

/** "A", "A and B", "A, B and C". */
const joinNames = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`)

export const by: FieldEval<"request.by"> = {
  id: "request.by",
  evaluate(item, c, ctx) {
    const read = readRequests("request.by", item, ctx)
    if ("verdict" in read) return read.verdict
    const matches = read.requests.map((r) => anyOf(c.value.requesters.map((ref) => matchesRef(r.by, ref, ctx))))
    if (c.op === "anyOf") return anyOf(matches)
    if (c.op === "noneOf") return noneOf(matches)
    return matches.length === 0 ? FAIL : allOf(matches) // only: R not empty, and every requester matches
  },
  ...unordered,
  fact(item, ctx) {
    const requests = applicableRequests(item)
    if (requests === null) return []
    if (requests.length === 0) return phrases("Nobody requested it.")
    const people = requestersOf(requests)
    if (people.every((p) => matchesRef(p, { kind: "former" }, ctx).verdict === "pass")) return phrases("Requested only by a former member.")
    return phrases(`Requested by ${joinNames([...new Set(people.map((p) => requesterName(p, ctx)))])}.`)
  },
}

const viewerOf = (item: SnapshotItem, user: string): Viewer | undefined => item.plays?.viewers.find((v) => v.user === user)
const NO_PLEX_ID = unknown({ kind: "noValue", what: "requester" })

export const requesters: FieldEval<"request.requesters"> = {
  id: "request.requesters",
  evaluate(item, c, ctx) {
    const down = needsCheck(ctx, FIELD_NEEDS["request.requesters"])
    if (down) return down
    const requests = requesterRequests(item, ctx)
    if (requests === null) return sourceFailed("overseerr")
    if (item.plays === null) return sourceFailed("tautulli")
    if (requests.length === 0) return FAIL
    const people = requestersOf(requests)
    if (c.value.did === "neverPlayed") {
      return noneOf(people.map((p) => (p === null ? NO_PLEX_ID : passWhen((viewerOf(item, p)?.counted ?? 0) > 0))))
    }
    return allOf(people.map((p) => (p === null ? NO_PLEX_ID : passWhen(viewerOf(item, p)?.finished === true))))
  },
  ...unordered,
  fact(item, ctx) {
    const requests = requesterRequests(item, ctx)
    if (requests === null || item.plays === null) return []
    if (requests.length === 0) return phrases("Nobody requested it.")
    const viewers = requestersOf(requests).flatMap((p) => (p === null ? [] : [viewerOf(item, p)]))
    if (viewers.length === 0) return [] // only requesters with no Plex id: nothing is known
    if (viewers.every((v) => v?.finished === true)) return phrases("Every requester finished it.")
    const at = newest(viewers.map((v) => (v && v.counted > 0 ? v.lastCountedAt : null)))
    return phrases(at === null ? "The requester never played it." : `The requester played it ${monthOf(at, ctx)}.`)
  },
}
