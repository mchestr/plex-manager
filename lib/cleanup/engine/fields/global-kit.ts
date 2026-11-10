/**
 * Shared parts of the global protections (TS 5.3, 5.4): the verdict values,
 * the inert rule for a service that is not set up, and the cascade of item
 * keys that the explicit protections (G1, G3) match. Client-safe.
 *
 * @module lib/cleanup/engine/fields/global-kit
 */

import { showOf } from "@/lib/cleanup/engine/fields/shared"
import type { EvalContext, FieldVerdict, GlobalProtectionEval, ProtectionVerdict, UnknownCause } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

export const CLEAR: ProtectionVerdict = { verdict: "clear" }
export const PROTECTS: ProtectionVerdict = { verdict: "protects" }

export const protectsWhen = (yes: boolean): ProtectionVerdict => (yes ? PROTECTS : CLEAR)

export function unknownP(cause?: UnknownCause): ProtectionVerdict {
  return cause ? { verdict: "unknown", cause } : { verdict: "unknown" }
}

/** A field verdict read as a protection: pass protects, fail is clear. */
export function asProtection(v: FieldVerdict): ProtectionVerdict {
  if (v.verdict === "pass") return PROTECTS
  return v.verdict === "fail" ? CLEAR : unknownP(v.cause)
}

/** What a global protection is built from: the level, the options it reads, and the collection titles read (G13). */
interface GlobalInput {
  level: Level
  options: CleanupOptions
  /** `facts.membersRead`, trimmed and in lower case. */
  membersRead: ReadonlySet<string>
}

export type GlobalBuilder = (input: GlobalInput) => GlobalProtectionEval

/**
 * A global protection with the inert rule of TS 5.3 rule 1: while one of its
 * `needs` is `notConfigured`, it is `clear`. A failed service gives the
 * unknown of its own table row.
 */
export function defineGlobal(spec: GlobalProtectionEval): GlobalProtectionEval {
  const inert = (ctx: EvalContext) => spec.needs.some((service) => ctx.sources[service] === "notConfigured")
  return { ...spec, evaluate: (item, ctx) => (inert(ctx) ? CLEAR : spec.evaluate(item, ctx)) }
}

/**
 * The cascade of TS 5.4 as a matcher. A movie matches itself. A show
 * matches itself and every one of its seasons: a key that starts with
 * `seasonPrefix` and ends in a season number, so no snapshot read is needed
 * to list the seasons. A season matches itself and its show.
 */
export interface ProtectionKeys {
  keys: readonly string[]
  seasonPrefix: string | null
}

/** `protectionKeys(item)` of TS 5.4: the item keys that a Keep or an exclusion protects the item through. */
export function protectionKeys(item: SnapshotItem): ProtectionKeys {
  if (item.level === "movie") return { keys: [item.key], seasonPrefix: null }
  if (item.level === "show") return { keys: [item.key], seasonPrefix: `season:${item.titleKey}:` }
  const show = `show:${item.titleKey}` // a season's title key is its show's (TS 5.4)
  return { keys: [...new Set([item.key, show, item.showKey ?? show])], seasonPrefix: null }
}

/** True when a Keep or an exclusion on `key` protects the item of `keys`. */
export function coversKey(keys: ProtectionKeys, key: string): boolean {
  if (keys.keys.includes(key)) return true
  const prefix = keys.seasonPrefix
  return prefix !== null && key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length))
}

/**
 * The item a show-level fact is read from (TS 5.4 rule 5, X10): a season
 * reads its show, else its own copy of the show facts. Movies and shows
 * read themselves.
 */
export const showLevel = (item: SnapshotItem, ctx: Pick<EvalContext, "showsByKey">): SnapshotItem => showOf(item, ctx) ?? item

/** The Plex rating keys of the item's copies, and of its show's copies for a season. */
export function copyKeys(item: SnapshotItem, ctx: Pick<EvalContext, "showsByKey">): string[] {
  const own = item.copies.map((copy) => copy.ratingKey)
  const show = showOf(item, ctx)
  return show ? [...own, ...show.copies.map((copy) => copy.ratingKey)] : own
}
