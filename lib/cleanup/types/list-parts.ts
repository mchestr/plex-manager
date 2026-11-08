/**
 * The parts of the Leaving soon, Kept and excluded, History and Settings data
 * (UX 12.5 and 12.6, TS 10.5). `lib/cleanup/types/screens.ts` holds the
 * screen roots. Bytes are decimal strings, dates ISO instants, days day keys.
 * Types only.
 *
 * @module lib/cleanup/types/list-parts
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { ItemState, ItemStatus } from "@/lib/cleanup/constants"
import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import type { OutcomeKind } from "@/lib/cleanup/outcomes"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import type { CountBytes, NamedRule, PersonRef } from "@/lib/cleanup/types/rule-parts"
import type { ActionId, Level, Service } from "@/lib/validations/cleanup-vocabulary"

/** A batch row. Each row carries its own merged action and exclusion (E35). */
export interface BatchRow extends ItemRef {
  action: ActionId
  importListExclusion: boolean
  lastPlayedAt: string | "never" | null
}

/** A deletion batch card (UX 4.7.1, TS 10.5). `keysHash` covers `{itemKey}|{action}|{importListExclusion}` of each item. */
export interface DeletionBatchData extends CountBytes {
  kind: "deletion"
  id: string
  ruleId: string
  ruleName: string
  level: Level
  /** The least careful action of the batch items (lowest `ACTION_CARE`). */
  action: ActionId
  /** True when any item has the import list exclusion. */
  importListExclusion: boolean
  actionCounts: Partial<Record<ActionId, number>>
  exclusionCount: number
  keysHash: string
  /** Server time of the render. An approval sends it back (E36). */
  reviewedAt: string
  /** The newest and the oldest leave date of the batch items ("Due today", "Due since {day}"). */
  dueAt: string
  dueSince: string
  /** When the items were last checked ("Checked again at 3:07 AM today"). */
  checkedAt: string | null
  /** The budget plan (TS 8.7): today's items, and the last day of the rest (null when all go today). */
  plan: { today: CountBytes; lastDay: string | null }
  oversize: { title: string; day: string }[]
  /** Largest first, 50 a page (`batchPage`). */
  rows: BatchRow[]
  rowsPage: number
  rowsPageCount: number
}

/** An entry batch card: new matches that the entry check held (UX 4.7.1, X3). It has no selection table. */
export interface EntryBatchData extends CountBytes {
  kind: "entry"
  id: string
  ruleId: string
  ruleName: string
  level: Level
  keysHash: string
  reviewedAt: string
  /** The run that held it: "last night" for the schedule, "in the run at {time}" for an admin run. */
  heldBy: { trigger: "scheduled" | "admin"; at: string }
  /** The entry check count that the run passed ("more than {limit}"). */
  limit: number
}

export type BatchData = DeletionBatchData | EntryBatchData

/** One leave-date group of the list. `inBatch`: its items show in a batch card ("Shown above"). */
export interface LeavingGroup extends CountBytes {
  date: string | "due"
  inBatch: boolean
  /** The level of every item of the group, or null for mixed levels ("titles"). */
  level: Level | null
}

export interface LeavingRow extends ItemRef {
  /** The library title. */
  library: string
  rules: NamedRule[]
  /** A season row whose show is also leaving ("The whole show is also leaving, after this season"). */
  showAlsoLeaving: boolean
  state: ItemState
  /** The leave date, a day key (`CleanupItem.leaveOn`). */
  leaveAt: string | null
  group: string | "due"
  status: ItemStatus
  /** The status placeholders: `{day}` and `{note}` (UX 4.12.6). */
  statusValues: { day?: string; note?: string }
  holdCode: string | null
  failCode: string | null
  deferredAt: string | null
  /** The admin who postponed it, by name. */
  postponedBy: string | null
  /** The day the budget plans it (TS 8.7), for automatic or approved items. */
  plannedDay: string | null
  plexUrl: string | null
}

/** The four tiles of the Kept and excluded tab (UX 4.8). */
export interface ProtectionTiles {
  keeps: { count: number; members: number; keepDays: number }
  excludes: { count: number; withEnd: number }
  keepForever: { count: number }
  endingSoon: { count: number }
}

export interface ProtectionRow extends ItemRef {
  id: string
  kind: "keep" | "exclude"
  /** The member who kept it, or the admin who excluded it. Audited (`cleanup-keeps`). */
  by: PersonRef | null
  until: string | null
  since: string
  /** Exclusions only, admins only. */
  note: string | null
}

export interface HistoryRun {
  id: string
  kind: "dryRun" | "run" | "act"
  startedAt: string
  /** Null: the run did not finish, so it reads as stopped. */
  finishedAt: string | null
  trigger: "scheduled" | "admin" | "create" | "approval"
  actor: PersonRef | null
  rules: NamedRule[]
  checked: number
  joined: number
  rescued: number
  deleted: number
  failed: number
  freedBytes: string
  /** A `RUN_OUTCOMES` code; an unknown stored code shows raw. */
  outcome: string | null
  /** The values of the outcome words ("{N} failed: {cause}", "Dry run of {rule}: {N} matches"). */
  outcomeValues: Record<string, string | number>
  blocks: Block[]
  /** An error code, never a message (`lib/ui/error-copy.ts` words). */
  errorCode: string | null
}

/** A deleted or failed title, or one left unmonitored (UX 4.9). `id` is the outcome id, the row key. */
export interface HistoryTitle extends ItemRef {
  id: string
  kind: OutcomeKind
  reason: string
  rule: NamedRule | null
  actedAt: string
  freedBytes: string
  approvedBy: PersonRef | "automatic" | null
  result: "deleted" | "failed" | "stillUnmonitored"
  /** The words of the failure or the reason, or null. */
  cause: string | null
  /** The arr app that still has the record unmonitored. */
  stillUnmonitored: "radarr" | "sonarr" | null
}

/** One global protection in the Settings tab (UX 4.10, TS 5.6). */
export interface SettingsProtection {
  id: GlobalProtectionId
  sentence: string
  alwaysOn: boolean
  /** "Protects {N} titles", or seasons for G11 and G12. Null without library data. */
  protects: number | null
  unit: "titles" | "seasons"
  /** Needed services that are not set up ("Needs {Service}"): the protection is inert. */
  needsMissing: Service[]
  /** Season rules only (G11, G12). */
  seasonsOnly: boolean
}

/** A Leaving soon collection in Plex (UX 4.10 `cleanup-plex`). */
export interface SettingsCollection {
  level: Level
  sectionId: string
  title: string
  count: number
}
