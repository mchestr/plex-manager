/**
 * The data of each admin screen of media cleanup (UX 12.2 to 12.6 with the TS
 * 10.5 changes and the X12 names). The tab roots take them as their only prop
 * (plan 2.3). Bytes are decimal strings, dates ISO instants, days day keys.
 * Types only, client-safe.
 *
 * No turn-on or batch shape holds an item key list (E28): pages send `count`
 * and `keysHash` back.
 *
 * @module lib/cleanup/types/screens
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { ItemStatus } from "@/lib/cleanup/constants"
import type { WhyPart } from "@/lib/cleanup/engine/types"
import type { ExitCounts } from "@/lib/cleanup/outcomes"
import type { RuntimeNotice } from "@/lib/cleanup/schema/runtime"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { BatchData, HistoryRun, HistoryTitle, LeavingGroup, LeavingRow } from "@/lib/cleanup/types/list-parts"
import type { ProtectionRow, ProtectionTiles, SettingsCollection, SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { CountBytes, EditorField, EditorGlobalProtection, EditorLibrary, NamedRule, OverviewBatch } from "@/lib/cleanup/types/rule-parts"
import type { PersonRef, RecipeCardData, RequesterOption, RuleCardData } from "@/lib/cleanup/types/rule-parts"
import type { TurnOnCheck, TurnOnLargestRow, TurnOnMode } from "@/lib/cleanup/types/rule-parts"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { ActionId, Level, Mode } from "@/lib/validations/cleanup-vocabulary"

/** The feature switch and the pause, as every tab reads them. `redis`: the job queue is set up. */
export interface CleanupFeatureState {
  enabled: boolean
  enabledAt: string | null
  pausedAt: string | null
  pausedBy: PersonRef | null
  redis: boolean
}

/** The library data header: null fields while no complete read exists. */
export interface CleanupSnapshotState {
  id: string | null
  takenAt: string | null
  finishedAt: string | null
  reading: boolean
}

/** `getCleanupOverview(now)`: the Rules tab (UX 12.3). */
export interface CleanupOverviewData {
  feature: CleanupFeatureState
  sources: SourceStatus[]
  snapshot: CleanupSnapshotState
  /** Page-level stops, for the page alerts (UX 4.1.4). */
  blocks: Block[]
  kometa?: { collection: string; removedAt: string; recreatedAt: string | null }
  library: {
    movies: CountBytes
    shows: CountBytes & { seasons: number }
    freeBytes: string | null
    totalBytes: string | null
    growthBytesPerMonth: string | null
  }
  stats: {
    leaving: CountBytes & { nextLeaveAt: string | null }
    /** Every deletion batch item. Level null for mixed levels. */
    waiting: (CountBytes & { dueAt: string; dueToday: boolean; level: Level | null }) | null
    freed30d: CountBytes & { level: Level | null }
  }
  batches: OverviewBatch[]
  /** Rules with a waiting batch first, then by name (UX 4.1.2). */
  rules: RuleCardData[]
  /** The gallery, evaluated with their defaults (TS 12.7 item 2). */
  recipes: RecipeCardData[]
  /** The Settings defaults of a new rule: the New rule Sheet preselects the grace chip of `graceDays` (TS 6.10). */
  defaults: { graceDays: number }
}

/** `getCleanupRuleEditor(...)`: the editor of a saved rule or a new rule (UX 12.2, TS 10.4). */
export interface CleanupEditorData {
  rule: {
    /** Null for a new rule. */
    id: string | null
    name: string
    mode: Mode
    /** The compare-and-set revision (E25). Null for a new rule. */
    revision: number | null
    definition: RuleDraft
    turnedOnAt: string | null
    lastDryRun: { at: string; matches: number } | null
  }
  fields: EditorField[]
  libraries: EditorLibrary[]
  globalProtections: EditorGlobalProtection[]
  /** Audited (`cleanup-requesters`). */
  requesterOptions: RequesterOption[]
  options: Pick<CleanupOptions, "automaticMinGraceDays" | "defaults">
  /** The movies and shows of the newest library data whose arr record came from an import list (UX 5.5, 8.4 hint). Null with no library data. */
  importListCount: { movie: number; show: number } | null
  /** The server zone, for the computed dates (UX 8.4). */
  zone: string
  initialPreview: PreviewResponse
}

/** `getCleanupTurnOn(ruleId, mode)`: the turn-on and change-mode page (UX 12.4, TS 10.5). */
export interface CleanupTurnOnData {
  rule: NamedRule & { sentence: WhyPart[]; mode: Mode; level: Level; action: ActionId; importListExclusion: boolean; graceDays: number }
  /** The preselected mode (`?mode=automatic`). */
  mode: "reviewFirst" | "automatic"
  today: string
  batch: CountBytes & {
    matches: number
    storagePercent: number | null
    growthWeeks: number | null
    protectedCount: number
    missingCount: number
    /** Change mode only: the due items of the rule in Leaving soon. */
    dueCount: number
    posters: string[]
  }
  /** The leave date, a day key. */
  leaveAt: string
  automaticPace: { from: string; to: string; perDay: { items: number; bytes: string } } | null
  /** `membersWhoCanSee` is null when plex.tv did not answer. Counts only. */
  visibility: { collection: string; libraries: string[]; membersWhoCanSee: number | null }
  linkedMembers: number
  keeps: { enabled: boolean; days: number; limit: number }
  budget: { items: number; bytes: string; sharedWith: NamedRule[] }
  entryCheck: { count: number; percent: number }
  dryRuns: { at: string; matches: number }[]
  /** 10 rows. */
  largest: TurnOnLargestRow[]
  checks: TurnOnCheck[]
  modes: TurnOnMode[]
  typedApprovalCount: number | null
  revision: number
  count: number
  keysHash: string
  reviewedAt: string
  /** Titles larger than the daily space budget, and the day each goes alone (E17, X13). */
  budgetOversize: { title: string; day: string }[]
}

/** `getCleanupLeavingSoon(params)`: the Leaving soon tab (UX 12.5, TS 10.5). */
export interface CleanupLeavingData {
  feature: CleanupFeatureState
  /** Every deletion and entry batch. The list filters never hide one (TS 10.4). */
  batches: BatchData[]
  /** The daily deletion budget (Settings): at most `items` titles and `bytes` (a decimal string) a day. The approve dialog and the batch footer name it (UX 8.6). */
  budget: { items: number; bytes: string }
  exits7d: ExitCounts
  filters: { rules: NamedRule[]; libraries: { sectionId: string; title: string }[]; statuses: ItemStatus[] }
  groups: LeavingGroup[]
  rows: LeavingRow[]
  totals: CountBytes & { volumePercent: number | null }
  total: number
  page: number
  size: number
}

/** `getCleanupBatchSelection()`: a deletion batch and the asked keys that are still in it (E36). */
export interface CleanupBatchSelection extends CountBytes {
  keysHash: string
  actionCounts: Partial<Record<ActionId, number>>
  exclusionCount: number
  unticked: { itemKey: string; action: ActionId; importListExclusion: boolean; sizeBytes: string }[]
}

/** `getCleanupProtections(params)`: the Kept and excluded tab (UX 12.6 item 1). Audited (`cleanup-keeps`). */
export interface CleanupProtectionsData {
  tiles: ProtectionTiles
  rows: ProtectionRow[]
  total: number
  page: number
  size: number
}

/** `getCleanupHistory(params)`: the newest 30 runs and the deleted titles (UX 12.6 item 2). */
export interface CleanupHistoryData {
  runs: HistoryRun[]
  /** Deleted and failed titles, and those left unmonitored. */
  deleted: HistoryTitle[]
  total: number
  page: number
  size: number
  filters: { rules: NamedRule[] }
  /** The next nightly run, for the empty state. */
  nextRunAt: string | null
}

/** `getCleanupSettings()`: the six sections of the Settings tab (UX 12.6 item 3, UX 4.10). */
export interface CleanupSettingsData {
  options: CleanupOptions
  feature: CleanupFeatureState & { holdUntil: string | null }
  schedule: { nextRunAt: string | null; zone: string }
  libraryData: { startedAt: string | null; finishedAt: string | null; sources: SourceStatus[]; historyStart: string | null; reading: boolean }
  lastRun: { id: string; startedAt: string; outcome: string | null; blocks: Block[] } | null
  protections: SettingsProtection[]
  /** Arr tags for G9, without the Overseerr requester tags (UX 4.10 rule 2). */
  tagOptions: string[]
  /** Plex collection titles for G13. */
  collectionOptions: string[]
  /** Kometa's seasonal collections that G13 does not hold yet (TS 12.7 item 4): "Christmas and Halloween". */
  kometaSuggestion: { names: string[]; library: string } | null
  /** The members who use watchlist sync (the G8 hint). */
  watchlistMembers: number
  plex: { working: boolean; checkedAt: string | null; collections: SettingsCollection[]; summary: string; notices: RuntimeNotice[] }
}
