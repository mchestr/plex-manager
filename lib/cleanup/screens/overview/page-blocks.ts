/**
 * The page-level stops of the Rules tab (UX 4.1.4, TS 8.2) and its Kometa
 * notice. Pure and client-safe.
 *
 * {@link pageBlocks} judges the newest complete snapshot alone, for every
 * service, not for one rule: each failed source (a Plex share list without
 * an owner keeps its `NO_OWNER` code), stale library data, a Tautulli that
 * recorded no play in 14 days, and each source that returned much less
 * (`sourceShrank`). The feature switch, the pause and Redis are not blocks
 * here: the page reads them from `feature`, so an alert never shows twice.
 * No snapshot gives no block: the first-use state shows the first read.
 *
 * {@link kometaNotice} is the newest removal of a Leaving soon collection
 * in the last 30 days, the window of the turn-on check (X9).
 *
 * @module lib/cleanup/screens/overview/page-blocks
 */

import type { Block } from "@/lib/cleanup/blocks"
import { STALE_DATA_HOURS, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import { type BlockSnapshot, sourceShrank } from "@/lib/cleanup/rule-blocks"
import type { CleanupRuntime } from "@/lib/cleanup/schema/runtime"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { SERVICES } from "@/lib/validations/cleanup-vocabulary"

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** A collection removal notice shows for 30 days (X9). */
export const KOMETA_NOTICE_DAYS = 30

const time = (value: Date | string) => (typeof value === "string" ? Date.parse(value) : value.getTime())

/** The stops of the snapshot at `now` (epoch ms), in the order of TS 8.2. */
export function pageBlocks(snapshot: BlockSnapshot | null, now: number): Block[] {
  if (!snapshot) return []
  const blocks: Block[] = []
  const age = now - time(snapshot.finishedAt)
  if (age > STALE_DATA_HOURS * HOUR_MS) blocks.push({ code: "dataStale", hours: Math.floor(age / HOUR_MS) })
  const seen = new Set<string>()
  for (const { service, state, readAt, errorCode } of snapshot.sources) {
    const key = `${service}:${errorCode ?? ""}`
    if (state !== "failed" || seen.has(key)) continue
    seen.add(key)
    blocks.push({ code: "sourceFailed", service, ...(readAt ? { readAt } : {}), ...(errorCode ? { errorCode } : {}) })
  }
  const tautulli = snapshot.sources.filter((s) => s.service === "tautulli")
  const { newestAt } = snapshot.facts.history
  const tautulliOk = tautulli.length > 0 && tautulli.every((s) => s.state === "ok")
  if (tautulliOk && (newestAt === null || now - newestAt * 1000 > TAUTULLI_STALE_DAYS * DAY_MS)) {
    blocks.push({ code: "tautulliStale" })
  }
  return [...blocks, ...sourceShrank(snapshot, SERVICES)]
}

/** The newest Leaving soon collection that Kometa removed in the last 30 days, or undefined. */
export function kometaNotice(runtime: Pick<CleanupRuntime, "notices">, now: number): CleanupOverviewData["kometa"] {
  const notice = runtime.notices
    .filter((n) => n.kind === "collectionRemoved" && now - time(n.detectedAt) < KOMETA_NOTICE_DAYS * DAY_MS)
    .sort((a, b) => time(b.detectedAt) - time(a.detectedAt))[0]
  return notice ? { collection: notice.title, removedAt: notice.detectedAt, recreatedAt: notice.recreatedAt } : undefined
}
