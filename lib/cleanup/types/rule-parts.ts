/**
 * The parts of the Rules tab, the editor and the turn-on page data (UX 12.2
 * to 12.4, TS 10.5). `lib/cleanup/types/screens.ts` holds the screen roots.
 * Bytes are decimal strings, dates ISO instants, days day keys. Types only.
 *
 * @module lib/cleanup/types/rule-parts
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { RecipeId, TurnOnCheckId } from "@/lib/cleanup/constants"
import type { GlobalProtectionId, OperatorId, WhyPart } from "@/lib/cleanup/engine/types"
import type { ItemRef, RequestedBy } from "@/lib/cleanup/types/preview"
import type { FieldId, Level, Mode, Service } from "@/lib/validations/cleanup-vocabulary"

/** A person named on an admin screen. `isYou` reads "you" ("by you"). */
export interface PersonRef {
  id: string
  name: string
  isYou: boolean
}

export interface NamedRule {
  id: string
  name: string
}

export interface CountBytes {
  count: number
  bytes: string
}

/** The three facts of a rule card (UX 4.1.3 item 4). The parts that a mode does not show are null. */
export interface RuleFacts {
  /** Live on the cached library data, not the stored `lastEval` (TS 12.7 item 1). */
  matches: CountBytes & { growthWeeks: number | null; newSinceLastRun: number | null }
  /** Dry runs of the saved definition only, one per library read (TS 12.7 item 12, X7). */
  dryRuns: { count: number; sinceDay: string | null; min: number | null; max: number | null; steady: boolean }
  leaving: (CountBytes & { turnedOnAt: string | null; nextLeaveOn: string | null; nextCount: number }) | null
  waiting: (CountBytes & { dueOn: string; dueToday: boolean }) | null
  deleted: (CountBytes & { since: string | null }) | null
}

/** The one footer line of a rule card, first that applies (UX 4.1.3 item 5). */
export type RuleFooter =
  | { kind: "block"; block: Block }
  | { kind: "ready"; dryRuns: number; readAt: string | null }
  | { kind: "overlap"; rule: NamedRule; count: number; overlap: "same" | "inShow" | "hasSeasons" }
  | { kind: "rescue"; title: string; at: string; reason: string }

export interface RuleCardData {
  id: string
  name: string
  mode: Mode
  level: Level
  revision: number
  /** `describeRule()`: values are strong. */
  sentence: WhyPart[]
  /** Rating keys of the largest matches. */
  posters: string[]
  facts: RuleFacts
  footer: RuleFooter | null
  /** A deletion or entry batch of this rule waits: the card sorts first and shows "Review the batch". */
  waitingBatch: "deletion" | "entry" | null
}

export interface RecipeCardData {
  id: RecipeId
  name: string
  level: Level | "movieOrShow"
  sentence: WhyPart[]
  /** The key values in the sentence, as words ("180 days"). */
  keyValues: string[]
  note: string | null
  /** Null: no library data yet. `altCount` is the show count of a two-level recipe ("38 movies or 21 shows"). */
  today: (CountBytes & { altCount?: number }) | null
  /** Services that the recipe needs and that are not set up ("Needs Sonarr"). */
  needs: Service[]
  posters: string[]
}

/** A batch line of the Rules tab alert and the stat tiles (UX 4.1.2). */
export interface OverviewBatch extends CountBytes {
  id: string
  kind: "deletion" | "entry"
  ruleId: string
  ruleName: string
  level: Level
  /** The newest leave date of its items (deletion), or the day it was held (entry). */
  dueAt: string
  /** The oldest leave date of its items: "between {day} and {day}". */
  dueSince: string
}

/** A field of the editor's level (UX 12.2), from `FIELD_CATALOG` and the services that are set up. */
export interface EditorField {
  id: FieldId
  label: string
  levels: Level[]
  operators: OperatorId[]
  /** The default for a new row at this level (TS 4.2). */
  defaultValue: { op: OperatorId; value: unknown }
  help: string
  /** "Set up Sonarr to use this", or null when the field can be used. */
  disabledReason: string | null
}

export interface EditorLibrary {
  sectionId: string
  title: string
  /** A movie library, or a TV library (whole shows and seasons). */
  level: "movie" | "show"
  arr: "radarr" | "sonarr" | null
  /** Why the library is not offered (TS 5.5), or null. */
  disabledReason: string | null
}

export interface EditorGlobalProtection {
  id: GlobalProtectionId
  sentence: string
  enabled: boolean
  appliesToLevel: boolean
}

/** A requester that a `request.by` condition can name. Audited (`cleanup-requesters`). */
export interface RequesterOption {
  userId: string
  name: string
  status: "member" | "former"
  requests: number
}

export interface TurnOnCheck {
  id: TurnOnCheckId
  state: "ok" | "warning" | "failed" | "info"
  blocks: "all" | "automatic" | "none"
  values: Record<string, string | number>
}

export interface TurnOnMode {
  mode: "reviewFirst" | "automatic"
  allowed: boolean
  reason?: string
}

export interface TurnOnLargestRow extends ItemRef {
  lastPlayedAt: string | "never" | null
  addedAt: string | null
  requestedBy: RequestedBy
  why: WhyPart[]
}
