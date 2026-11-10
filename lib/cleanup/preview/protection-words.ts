/**
 * The words of protections (UX 5.4.1, TS 5.3): the sentence of each global
 * protection with its option values, the label of a rule protection, and the
 * Kometa seasonal collections of TS 12.7 item 4. The Why text, the Why
 * Sheet and the preview read them. Pure and client-safe.
 *
 * @module lib/cleanup/preview/protection-words
 */

import type { DescribeWords, GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { describeCondition } from "@/lib/cleanup/fields/catalog"
import { durationWords, joinOr } from "@/lib/cleanup/fields/words"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"
import type { Condition } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const inDays = (days: number) => durationWords({ amount: days, unit: "days" })

/** The UI sentence of a global protection (UX 5.4.1), with the values of `protections`. No final period. */
export function globalProtectionSentence(id: GlobalProtectionId, protections: ProtectionsOptions): string {
  switch (id) {
    case "g1":
      return "Kept by a member, until the Keep ends"
    case "g2":
      return "Marked Keep forever by a member"
    case "g3":
      return "Excluded by an admin, until its end date"
    case "g4":
      return `Played by anyone in the last ${inDays(protections.g4.days)}`
    case "g5":
      return `Someone is part-way through: an unfinished play in the last ${inDays(protections.g5.days)}`
    case "g6":
      return `Added, or new episodes added, in the last ${inDays(protections.g6.days)}`
    case "g7":
      return `Requested in the last ${inDays(protections.g7.days)} by a member with access who has not finished it`
    case "g8":
      return "On the watchlist of a member with access, where known"
    case "g9":
      return `Has a Radarr or Sonarr tag: ${protections.g9.tags.join(", ") || "none"}`
    case "g10":
      return "In a stored Rewind, until the season closes"
    case "g11":
      return "Season rules: the newest season of a continuing show"
    case "g12":
      return `Season rules: a member who played the show in the last ${inDays(protections.g12.days)} has not finished the season`
    case "g13":
      return `In the Plex collection ${joinOr(protections.g13.collections) || "that you name"}`
  }
}

const GLOBAL_IDS = new Set<string>(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13"])

/** True for `g1` to `g13`. */
export const isGlobalId = (id: string): id is GlobalProtectionId => GLOBAL_IDS.has(id)

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A rule protection as a label: its singular predicate (TS 4.4 item 6), "Has at least 3 plays in total". @internal */
export function ruleProtectionLabel(p: Condition, level: Level, words: DescribeWords): string {
  return capitalise(describeCondition(p, level, words, "singular"))
}

/** The label of any protection: a global sentence, a rule protection of `protections`, else "This rule's protection". */
export function protectionLabel(
  id: string,
  ctx: { protections: ProtectionsOptions; ruleProtections: readonly Condition[]; level: Level; words: DescribeWords },
): string {
  if (isGlobalId(id)) return globalProtectionSentence(id, ctx.protections)
  const p = ctx.ruleProtections.find((c) => c.id === id)
  return p ? ruleProtectionLabel(p, ctx.level, ctx.words) : "This rule's protection"
}

const SEASONAL =
  /^(New Year's Day|Valentine's Day|St\. Patrick's Day|Easter|Mother's Day|Memorial Day|Father's Day|Independence Day|Labor Day|Halloween|Veteran's Day|Thanksgiving|Christmas) Movies$/

/** A collection title with a leading emoji and space dropped. */
const plainTitle = (title: string) => title.replace(/^(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u200D)+\s*/u, "").trim()

/**
 * The Kometa seasonal collections among the titles (TS 12.7 item 4), as
 * stored. "Christmas Movies" counts, also after an emoji; "Christmas
 * Classics" does not.
 */
export function seasonalCollections(titles: readonly string[]): string[] {
  return titles.filter((title) => SEASONAL.test(plainTitle(title)))
}

/** The name of a seasonal collection without " Movies", for the Settings hint: "Christmas". */
export const seasonalName = (title: string) => plainTitle(title).replace(/ Movies$/, "")
