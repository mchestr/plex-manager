/**
 * The two writes of an options save (TS 10.3 `updateCleanupSettings` steps
 * 1 and 4). Server-only.
 *
 * 1. {@link saveOptions}: the read, the merge and the write run in one
 *    Serializable transaction (`inSerializable()`, 3 retries with backoff).
 *    A conflict, also one that PostgreSQL finds at COMMIT, runs the whole
 *    body again on fresh reads, so two admins who save two sections at the
 *    same time keep both changes. A conflict after the last retry gives
 *    null. No compare-and-set on `updatedAt`: claim renewals and the E20
 *    guard write change it often (architecture-r2-9, architecture-r3-2).
 * 2. {@link applySettingsExits}: after a protections or members save, it
 *    tries the run claim. Claimed: reconcile every live rule on the newest
 *    snapshot with the new options (exits only), then release with the
 *    change check. Busy: skip, and the holder's change check applies the
 *    exits before it releases (TS 8.1 item 7, E19, owner-r2-3).
 *
 * @module lib/cleanup/actions/settings/save
 */

import "server-only"

import { mergeSection, type OptionsSave } from "@/lib/cleanup/actions/settings/options"
import { reconcile } from "@/lib/cleanup/run/reconcile"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { readCleanupSettingsRow, writeOptions } from "@/lib/cleanup/settings"
import { inSerializable, isTransactionConflict } from "@/lib/db/serializable"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

/** The options before and after one save. */
export interface SavedOptions {
  before: CleanupOptions
  after: CleanupOptions
}

/** Saves one section. Null when it still conflicts after the retries (`CONFLICT`). */
export async function saveOptions(save: OptionsSave, actorId: string): Promise<SavedOptions | null> {
  try {
    return await inSerializable(async (tx) => {
      const { options: before } = await readCleanupSettingsRow(tx)
      const after = await writeOptions(mergeSection(before, save), actorId, tx)
      return { before, after }
    })
  } catch (error) {
    if (isTransactionConflict(error)) return null
    throw error
  }
}

/** `exitsApplied` false: a run held the claim. `left`: the titles that left Leaving soon. */
export interface SettingsExits {
  exitsApplied: boolean
  left: number
}

/** The exits of a protections or members save, under the run claim when it is free. */
export async function applySettingsExits(actorId: string): Promise<SettingsExits> {
  const held = await takeRunClaim()
  if (!held) return { exitsApplied: false, left: 0 }
  try {
    const result = await reconcile({ ctx: await loadReconcileContext({ actorId }) })
    return { exitsApplied: true, left: result.rescued + result.released }
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
}
