/**
 * The shapes of the rule preview, the recipe preview and the Why Sheet (TS
 * 10.5, UX 12.2 with the X12 names). Bytes are decimal strings, dates ISO
 * instants, days day keys. Types only, client-safe.
 *
 * @module lib/cleanup/types/preview
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { RecipeId } from "@/lib/cleanup/constants"
import type { ItemClass, Verdict, WhyPart } from "@/lib/cleanup/engine/types"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { PreviewTab } from "@/lib/validations/cleanup-actions"
import type { Level, Mode, Service } from "@/lib/validations/cleanup-vocabulary"

/** One title on a screen. `sizeBytes` is null when unknown, and always null in member data (TS 13.3 item 8). */
export interface ItemRef {
  itemKey: string
  level: Level
  title: string
  year: number | null
  seasonNumber: number | null
  episodeCount: number | null
  seasonCount: number | null
  /** The Plex rating key for `Poster`. */
  posterKey: string | null
  sectionId: string
  sizeBytes: string | null
}

/** A requester as an admin sees it: "{name}, former member", or "Unknown member" with no app account (X8). */
export interface RequesterCell {
  name: string
  status: "member" | "former" | "unknown"
  at: string
}

export type RequestedBy = RequesterCell[] | "none" | "importList" | null

export interface PreviewRow extends ItemRef {
  class: ItemClass
  why: WhyPart[]
  lastPlayedAt: string | "never" | null
  addedAt: string | null
  requestedBy: RequestedBy
  /** Near misses: the failing clause id. */
  failing?: string
  gap?: number | null
}

/** The warnings of TS 6.7. Bytes are decimal strings. */
export type PreviewWarning =
  | { kind: "wide"; percent: number; matches: number; checked: number }
  | { kind: "cannotMatch"; conditionId: string; otherId: string }
  | { kind: "zero"; conditionId: string; leaves: number; of: number; largestBytes: string | null; nearMisses: number }
  | { kind: "sourceFailed"; service: Service; readAt: string | null }
  | { kind: "stale"; hours: number }
  | { kind: "incomplete"; conditionIds: string[] }
  | { kind: "notApplicable"; conditionIds: string[] }

export type ImpactChange = "leave" | "join" | "actionChange"
export interface ImpactItem extends ItemRef {
  change: ImpactChange
}

/** A live rule's draft against its Leaving soon items (UX 7.7, TS 10.6 step 7). */
export interface PreviewImpact {
  leave: number
  join: number
  keep: number
  joinLeaveOn: string
  /** Up to 50 titles of each group, largest first. */
  items: ImpactItem[]
  /** Leaving soon items whose merged action gets less careful, or whose import list exclusion turns on. */
  actionChange: number
}

/** A chip with its match count. `value` is the chip's value of the field's main control. */
export interface PresetCount {
  value: unknown
  label: string
  matches: number
}

/** The open condition editor (TS 6.6). */
export interface PreviewFocus {
  buckets: { label: string; count: number; passes: boolean }[]
  summary: string
  presets: PresetCount[]
  computedDate?: string
  libraryHint?: string
}

export interface PreviewResponse {
  level: Level
  /** Null: no library data yet. */
  snapshot: { id: string; takenAt: string; historyStart: string | null } | null
  sources: SourceStatus[]
  checked: number
  matches: number
  bytes: string
  growthWeeks: number | null
  /** UX "conditions": a group counts as one clause (X12). */
  clauses: { id: string; passAlone: number; heldBack: number }[]
  allConditions: number
  protectedAll: number
  /** The items that pass every condition and that one or more global protections protect: "{N} global protections keep {M} {items} safe" (TS 5.6). */
  protectedGlobal: number
  protectedBy: { protectionId: string; count: number }[]
  tabs: Record<PreviewTab, number>
  rows: PreviewRow[]
  page: number
  pageCount: number
  /** The total of the active tab after search. */
  total: number
  /** 4 rows (UX 4.3.6). */
  largest: (ItemRef & { why: WhyPart[] })[]
  focus?: PreviewFocus
  warnings: PreviewWarning[]
  /** Live rules only. */
  impact?: PreviewImpact
  /** Condition ids left out of the evaluation. */
  incomplete: string[]
  /** `ruleBlocks()` of the draft. */
  blocks: Block[]
  /** `describeRule()` of the draft. */
  sentence: WhyPart[]
}

export interface RecipePreview {
  recipeId: RecipeId
  level: Level
  checked: number
  matches: number
  bytes: string
  /** Per key value, no counts for "grace". */
  chips: Record<string, PresetCount[]>
  /** 6 posters (UX 4.2.2). */
  largest: (ItemRef & { why: WhyPart[] })[]
  protectedCount: number
  /** The global protections that are on and apply at the level (TS 5.3): "{N} global protections keep {M} {items} safe" (UX 8.3). */
  globalProtections: number
  /**
   * At 0 matches of a checked library, the condition that removes the most (UX 4.2.2 item 6, as 4.3.6): its row
   * sentence, how many items it leaves of the checked ones, and the largest item that passes the other conditions.
   */
  zero: { conditionId: string; sentence: string; leaves: number; of: number; largestBytes: string | null } | null
  sentence: WhyPart[]
  historyStart: string | null
  takenAt: string | null
  /** Services that the recipe needs and that are not set up. */
  needs: Service[]
}

export type WhySheetState = ItemClass | "leaving" | "deleted"

export interface WhySheetCondition {
  id: string
  label: string
  verdict: Verdict
  value: WhyPart[]
  threshold: string
  sources: SourceStatus[]
  /** Group members, each with its field label and threshold, so a line names what failed (UX 4.5 Conditions). */
  members?: { id: string; verdict: Verdict; label: string; threshold: string; value: WhyPart[] }[]
}

/** The Why Sheet (UX 4.5, TS 10.5). From History it is built from the stored Why of the outcome (`fromRun`). */
export interface WhySheetData {
  item: ItemRef
  state: WhySheetState
  /** The newest of the Plex and arr added dates (ISO), the meta line's "Added {date}." (UX 8.5). Null when neither is known. */
  addedAt: string | null
  /** State `cannotDelete` only: the cause sentence of TS 6.9 ("Two Radarr records match."), the summary "{Cause} Cleanup never deletes it." */
  cause?: string
  /** Admin only (TS 13.4). Arr links use `titleSlug`. */
  links: { plexUrl: string | null; arrUrl: string | null }
  conditions: WhySheetCondition[]
  forecast?: { passesOn: string; text: string }
  tryValue?: { conditionId: string; value: unknown; label: string; addsCount: number; addsBytes: string }
  hints: { kind: "seasonalCollection"; collection: string }[]
  protections: { id: string; label: string; verdict: "clear" | "protects" | "unknown"; value: WhyPart[] }[]
  /**
   * The Then line from `actionWords()`. For a Dry run rule or a draft, `text`
   * already starts with "If the rule is turned on, " (`whyThen()` owns the
   * words); `dryRun` is information only, and no reader adds the words again.
   */
  then?: { text: WhyPart[]; dryRun: boolean }
  otherRules: { ruleId: string; name: string; mode: Mode; enteredAt?: string; leaveOn?: string }[]
  leaving?: { enteredAt: string; leaveOn: string; status: string }
  sources: SourceStatus[]
  fromRun?: { runId: string | null; at: string }
}
