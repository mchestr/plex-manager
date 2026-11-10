/**
 * What the Rules tab and the Settings tab evaluate on (TS 12.7 items 1 and
 * 2, TS 5.6): the settings row, the server zone, the newest complete
 * snapshot from the web cache, its live facts and one `EvalContext`. The
 * same reads as `loadReconcileContext()`, for every rule and not only the
 * live ones. Server-only: the snapshot and the live facts hold member ids.
 *
 * @module lib/cleanup/screens/overview/context
 */

import "server-only"

import { buildEvalContext } from "@/lib/cleanup/engine/context"
import type { EvalContext, LiveFacts } from "@/lib/cleanup/engine/types"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import { type CleanupSettingsRow, readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { type LoadedSnapshot, loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import { dayKey } from "@/lib/utils/zoned-time"

export interface ScreenContext {
  now: Date
  today: string
  zone: string
  settings: CleanupSettingsRow
  /** Null before the first complete library read. */
  snapshot: LoadedSnapshot | null
  /** Read also without a snapshot: the member names of the rule sentences. */
  live: LiveFacts
  /** Null without a snapshot. */
  ctx: EvalContext | null
}

/** Loads the screen context at `now`. */
export async function loadScreenContext(now: Date): Promise<ScreenContext> {
  const [settings, zone, snapshot] = await Promise.all([readCleanupSettingsRow(), serverZone(), loadNewestSnapshot()])
  const live = await loadLiveFacts(now, snapshot?.header.facts.users)
  const ctx = snapshot
    ? buildEvalContext({ now: now.getTime(), zone, facts: snapshot.header.facts, sources: snapshot.header.sources,
      shows: snapshot.levels.show?.items ?? [], live, options: settings.options })
    : null
  return { now, today: dayKey(now.getTime(), zone), zone, settings, snapshot, live, ctx }
}
