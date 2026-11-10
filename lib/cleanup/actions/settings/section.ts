/**
 * `updateCleanupSettings` (TS 10.3, 8.12, 9.4): one section per save.
 * Server-only.
 *
 * Feature section:
 *
 * 1. On takes the run claim (busy: `CONFLICT`) and applies the 7-day hold.
 *    Off takes no claim and moves only `approved` items back to `leaving`.
 *    A save that keeps the switch as it is changes nothing.
 * 2. A change writes the audit row and asks for a Plex collection sync:
 *    the collections empty while off and fill again after on.
 * 3. Then `ensureCleanupSchedule()`. Its failure gives
 *    `UPSTREAM_UNAVAILABLE` with the words of TS 9.4: the switch is saved.
 *
 * Options sections:
 *
 * 1. The Serializable save of `save.ts`. `CONFLICT` after the retries.
 * 2. A save that changes no field writes no audit row and needs no exits.
 * 3. Protections: a G13 name that no read has read yet starts a system read.
 * 4. Protections and members: the exits now, or `exitsApplied: false`
 *    while a run holds the claim. Member Keeps turned off stop new Keeps
 *    only: G1 still protects every active Keep (E30), so no Keep ends here.
 * 5. The audit row holds the changed field names and closed values.
 * 6. Plex, and any save whose exits took titles out of Leaving soon, ask
 *    for a Plex collection sync.
 *
 * @module lib/cleanup/actions/settings/section
 */

import "server-only"

import { revalidatePath } from "next/cache"

import { type ActionResult, fail, ok } from "@/lib/actions/result"
import { cleanup } from "@/lib/admin/routes"
import { readNewCollections } from "@/lib/cleanup/actions/settings/enqueue"
import { turnFeatureOff, turnFeatureOn } from "@/lib/cleanup/actions/settings/feature"
import { type OptionsSave, type OptionsSection, sectionChanges } from "@/lib/cleanup/actions/settings/options"
import { applySettingsExits, type SettingsExits, saveOptions } from "@/lib/cleanup/actions/settings/save"
import { SETTINGS_WORDS } from "@/lib/cleanup/actions/settings/words"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { CLEANUP_CONFLICT_WORDS } from "@/lib/cleanup/constants"
import { ensureCleanupSchedule } from "@/lib/cleanup/schedule"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { UpdateCleanupSettingsResult } from "@/lib/cleanup/types/actions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

type SettingsResult = ActionResult<UpdateCleanupSettingsResult>

/** The sections whose save can keep a title safe, so their exits run at once (E19). */
const EXIT_SECTIONS: ReadonlySet<OptionsSection> = new Set(["cleanup-protections", "cleanup-members"])

/** Whether this call changed the switch. Null: a run holds the claim. */
async function switchFeature(enabled: boolean, actorId: string): Promise<boolean | null> {
  const row = await readCleanupSettingsRow()
  if (row.enabled === enabled) return false
  if (!enabled) return (await turnFeatureOff()) !== null
  const on = await turnFeatureOn(new Date(), actorId)
  return on === "busy" ? null : on === "on"
}

/** The feature section: turn media cleanup on or off. */
export async function saveFeatureSection(enabled: boolean, actorId: string): Promise<SettingsResult> {
  const changed = await switchFeature(enabled, actorId)
  if (changed === null) return fail("CONFLICT", CLEANUP_CONFLICT_WORDS.run)
  if (changed) {
    logAuditEvent(AuditEventType.CLEANUP_SETTINGS_CHANGED, actorId, {
      section: "cleanup-feature", changedFields: ["enabled"], before: { enabled: !enabled }, after: { enabled },
    })
    await requestCollectionSync("feature")
  }
  revalidatePath(cleanup())
  const schedule = await ensureCleanupSchedule()
  if (!schedule.ok) return fail("UPSTREAM_UNAVAILABLE", SETTINGS_WORDS.scheduleFailed)
  return ok({ exitsApplied: null })
}

/** One of the five options sections. */
export async function saveOptionsSection(save: OptionsSave, actorId: string): Promise<SettingsResult> {
  const saved = await saveOptions(save, actorId)
  if (!saved) return fail("CONFLICT", CLEANUP_CONFLICT_WORDS.settings)
  const changes = sectionChanges(save.section, saved.before, saved.after)
  if (changes.changedFields.length === 0) {
    revalidatePath(cleanup())
    return ok({ exitsApplied: null })
  }
  if (save.section === "cleanup-protections") await readNewCollections(saved.after)
  const exits: SettingsExits | null = EXIT_SECTIONS.has(save.section) ? await applySettingsExits(actorId) : null
  logAuditEvent(AuditEventType.CLEANUP_SETTINGS_CHANGED, actorId, { section: save.section, ...changes })
  if (save.section === "cleanup-plex" || (exits?.left ?? 0) > 0) await requestCollectionSync(save.section)
  revalidatePath(cleanup())
  return ok({ exitsApplied: exits ? exits.exitsApplied : null })
}
