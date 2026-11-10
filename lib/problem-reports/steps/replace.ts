/**
 * What Swap the copy and Remove the file and search share
 * (docs/problem-reports.md, "Swap the copy"): how they wait to start, and how
 * they end once the new copy is in.
 *
 * ## Waiting to start
 *
 * Each resolves the file again (`resolveFile`) and needs the Plex item's
 * guid, to find the title again if it comes back as a new item. While the
 * title is playing (`/status/sessions`) or Radarr or Sonarr is downloading a
 * copy of it, the run checks again every 10 minutes, and gives up after a
 * day (`BUSY`). When the file changed meanwhile, the copy that was reported
 * is gone, and the report is fixed.
 *
 * ## The end
 *
 * 1. Plex is asked to scan the file's folder.
 * 2. A swap marks the bad copy's grab failed now (a removal did before it
 *    deleted the file), and both check that its release is on the
 *    blocklist.
 * 3. The Plex item is read again; a title that came back as a new item is
 *    found by its guid, and the report keeps the new rating key.
 *
 * @module lib/problem-reports/steps/replace
 */

import "server-only"

import { listTitleQueue } from "@/lib/connections/arr-upgrade"
import { listTitleBlocklist } from "@/lib/connections/arr-swap"
import { failArrGrab } from "@/lib/connections/arr-writes"
import { getPlexItemMetadata } from "@/lib/connections/plex"
import { findPlexItemByGuid, isPlexItemPlaying } from "@/lib/connections/plex-file-state"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { resolveFile, type ArrConfig, type ResolvedFile } from "@/lib/problem-reports/resolve"
import { checkAgain, WAIT_MS } from "@/lib/problem-reports/steps/copy-wait"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { CopyWatch, ProblemReportFixPayload, ReplaceWatch } from "@/lib/queue/types"

type PlexServer = { url: string; token: string }

/** Whether the title is playing, or Radarr or Sonarr is downloading a copy of it; unknown counts as busy. */
async function isBusy(server: PlexServer, resolved: ResolvedFile): Promise<boolean> {
  const [playing, queue] = await Promise.all([
    isPlexItemPlaying(server, resolved.plex.ratingKey),
    listTitleQueue(resolved.config, { service: resolved.service, id: resolved.titleId }),
  ])
  if (playing !== false || !queue.success) return true
  return queue.data.some((item) => resolved.service === "radarr" || (item.episodeId !== null && resolved.episodeIds.includes(item.episodeId)))
}

/** The file to replace and its Plex guid, or what the run does instead; see "Waiting to start". */
export async function readyToReplace(
  server: PlexServer,
  report: StepReport,
  data: ProblemReportFixPayload,
  now: Date
): Promise<{ resolved: ResolvedFile; guid: string } | { outcome: StepOutcome }> {
  const resolution = await resolveFile(server, report.plexRatingKey)
  if (!resolution.ok) return { outcome: { toAdmin: resolution.reason } }
  const { resolved } = resolution
  if (!resolved.plex.guid) return { outcome: { toAdmin: "NO_IDS" } }
  if (data.seenFileId !== undefined && data.seenFileId !== resolved.file.id) return { outcome: { fixed: true } }
  if (await isBusy(server, resolved)) {
    const deadline = data.deadline ?? now.getTime() + WAIT_MS
    return { outcome: now.getTime() >= deadline ? { toAdmin: "BUSY" } : checkAgain(now, { deadline, seenFileId: resolved.file.id }) }
  }
  return { resolved, guid: resolved.plex.guid }
}

/** Whether the bad copy's release is on the title's blocklist; null when it can't be read. */
async function isBlocklisted(config: ArrConfig, watch: CopyWatch, release: string): Promise<boolean | null> {
  const blocked = await listTitleBlocklist(config, { service: watch.service, id: watch.titleId })
  return blocked.success ? blocked.data.some((title) => title.toLowerCase() === release.toLowerCase()) : null
}

/** The Plex item's rating key now: the same one, the new item with the title's guid, or null when Plex can't say. */
async function currentRatingKey(server: PlexServer, ratingKey: string, sectionId: string | null, guid: string): Promise<string | null> {
  const item = await getPlexItemMetadata(server, ratingKey)
  if (item.status === "found") return ratingKey
  if (item.status === "unknown" || !sectionId) return null
  const found = await findPlexItemByGuid(server, sectionId, guid)
  return found.status === "found" ? found.ratingKey : null
}

/**
 * Ends a run once the new copy is in; see "The end".
 *
 * @param options.markFailed - A swap marks the bad copy's grab failed here; a removal did already
 */
export async function finishReplace(
  server: PlexServer,
  report: StepReport,
  config: ArrConfig,
  { watch, replace }: { watch: CopyWatch; replace: ReplaceWatch },
  options: { markFailed: boolean }
): Promise<StepOutcome> {
  if (watch.sectionId) await scanPlexFolder(server, watch.sectionId, watch.folder)
  const service = watch.service === "radarr" ? "Radarr" : "Sonarr"
  let blocklisted: boolean | null = null
  if (replace.badGrabId !== null && replace.badRelease) {
    const marked = options.markFailed ? (await failArrGrab(service, config, replace.badGrabId)).success : true
    blocklisted = marked ? await isBlocklisted(config, watch, replace.badRelease) : false
  }
  const ratingKey = await currentRatingKey(server, report.plexRatingKey, watch.sectionId, replace.guid)
  return { fixed: true, details: { release: replace.release, blocklisted, ...(ratingKey && ratingKey !== report.plexRatingKey ? { ratingKey } : {}) } }
}
