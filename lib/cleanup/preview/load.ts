/**
 * The data every preview reads (TS 10.6 step 1): one level of the newest
 * complete snapshot from the web cache, the settings row, the server zone
 * and the live facts, as one `EvalContext`. A season preview also reads the
 * show part, because season items read their show (TS 4.1). Server-only:
 * the snapshot and the live facts hold member ids.
 *
 * @module lib/cleanup/preview/load
 */

import "server-only"

import { buildEvalContext } from "@/lib/cleanup/engine/context"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { isLive, readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { type CompleteHeader, loadNewestSnapshot, loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** One level of the newest complete snapshot, with the show items that its seasons read. */
export interface LevelData {
  header: CompleteHeader
  items: readonly SnapshotItem[]
  byKey: ReadonlyMap<string, SnapshotItem>
  shows: readonly SnapshotItem[]
}

/** The level's data, or null when there is no complete snapshot or that part failed (no library data). */
export async function loadLevel(level: Level): Promise<LevelData | null> {
  if (level === "season") {
    const snapshot = await loadNewestSnapshot()
    const seasons = snapshot?.levels.season
    if (!snapshot || !seasons) return null
    return { header: snapshot.header, items: seasons.items, byKey: seasons.byKey, shows: snapshot.levels.show?.items ?? [] }
  }
  const data = await loadSnapshotLevel(level)
  return data ? { header: data.header, items: data.items, byKey: data.byKey, shows: [] } : null
}

export interface PreviewContext {
  ctx: EvalContext
  holdUntil: string | null
  /** The feature is off or paused (the status of a Leaving soon row, TS 8.6). */
  paused: boolean
}

const NO_FACTS = { users: {}, history: { startAt: null, newestAt: null, rows: 0, orphans: 0, usersWithPlay: 0 }, membersRead: [] }

/**
 * The evaluation context at `now` on the header's facts and sources, with
 * the stored options. With no header, every source reads as failed, so the
 * context only serves words (the sentence of an empty preview).
 */
export async function loadContext(header: CompleteHeader | null, shows: Iterable<SnapshotItem>, now: Date): Promise<PreviewContext> {
  const [settings, zone, live] = await Promise.all([readCleanupSettingsRow(), serverZone(), loadLiveFacts(now, header?.facts.users)])
  const ctx = buildEvalContext({
    now: now.getTime(),
    zone,
    facts: header?.facts ?? NO_FACTS,
    sources: header?.sources ?? [],
    shows,
    live,
    options: settings.options,
  })
  return { ctx, holdUntil: settings.holdUntil, paused: !isLive(settings) }
}

/** The epoch ms of the snapshot's end: `finishedAt`, else the start of its read. */
export const finishedAtOf = (header: CompleteHeader): number => (header.finishedAt ?? new Date(header.facts.takenAt)).getTime()
