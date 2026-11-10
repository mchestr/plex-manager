/**
 * The result data of each media cleanup action (TS 10.2), the `data` of
 * `ok(data)`. Bytes are decimal strings, days day keys. Types only.
 *
 * `getCleanupBatchSelection` returns `CleanupBatchSelection`
 * (lib/cleanup/types/screens.ts). The preview actions return the shapes of
 * lib/cleanup/types/preview.ts.
 *
 * @module lib/cleanup/types/actions
 */

import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** `createCleanupRule`, `createCleanupRuleFromRecipe`. `dryRunQueued` is false without Redis or on a queue failure. */
export interface CreateCleanupRuleResult {
  ruleId: string
  dryRunQueued: boolean
}

/** `saveCleanupRule`. `exitsApplied` is false while a run held the claim (the toast of UX 8.9). */
export interface SaveCleanupRuleResult {
  revision: number
  exitsApplied: boolean
  released: number
}

export interface DuplicateCleanupRuleResult {
  ruleId: string
}

export interface DeleteCleanupRuleResult {
  released: number
}

export interface TurnOnCleanupRuleResult {
  joined: number
  revision: number
}

export interface SetCleanupRuleReviewFirstResult {
  revision: number
  mode: "reviewFirst"
}

/** The editor takes `revision` and `mode` from this result (TS 12.6). */
export interface MoveCleanupRuleToDryRunResult {
  released: number
  revision: number
  mode: "dryRun"
}

/** `runCleanupRuleDryRun`, `runCleanupNow`, `refreshCleanupData`. */
export interface CleanupQueuedResult {
  queued: true
}

/** `startCleanupFirstRead`: false when a snapshot or a read exists. */
export interface CleanupFirstReadResult {
  queued: boolean
}

/** `previewCleanupProtectionImpact`. `leaves`: Leaving soon items that the new values keep safe, which leave at the save. */
export interface ProtectionImpactResult {
  rules: { ruleId: string; name: string; level: Level; delta: number }[]
  protects: Partial<Record<GlobalProtectionId, number>>
  leaves: number
}

export interface DeleteCleanupBatchResult {
  approved: number
  actQueued: boolean
}

/** `skipped` counts keys that are being deleted, or whose show is (TS 10.3). */
export interface PostponeCleanupItemsResult {
  postponed: number
  skipped: number
  firstLeaveOn: string | null
  lastLeaveOn: string | null
}

/** `skipped` counts keys refused by E33. */
export interface ExcludeCleanupItemsResult {
  excluded: number
  rescued: number
  skipped: number
}

/** Null when nothing needed the exits. False while a run held the claim. */
export interface UpdateCleanupSettingsResult {
  exitsApplied: boolean | null
}

export interface PauseCleanupResult {
  unapproved: number
}

export interface ResumeCleanupResult {
  holdUntil: string
}

export interface KeepCleanupTitleResult {
  keepId: string
  until: string
}

export interface RemoveMyCleanupKeepResult {
  restored: boolean
}
