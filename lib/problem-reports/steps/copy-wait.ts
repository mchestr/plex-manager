/**
 * What the fixes that bring in a new copy share: Look for a better copy,
 * Swap the copy, and Remove the file and search (docs/problem-reports.md,
 * "Fixes"). They record against the same target, search the same way, and
 * wait with the same check, which reads the file, then the queue, then the
 * history since the run acted:
 *
 * ```
 * a new file ─► imported: the step finishes the run
 * the queue says the download is stuck ─► the server admin (IMPORT_BLOCKED)
 * the latest step is a failed download ─► the server admin (DOWNLOAD_FAILED)
 * a copy is downloading or was just grabbed ─► wait, until the deadline (STILL_DOWNLOADING)
 * nothing is downloading ─► idle: the step decides what nothing means
 * Radarr or Sonarr didn't answer ─► wait, until the deadline (UNAVAILABLE)
 * ```
 *
 * Every check is 10 minutes after the last, and a run waits a day.
 *
 * @module lib/problem-reports/steps/copy-wait
 */

import "server-only"

import { getArrCommandState, listTitleHistory, listTitleQueue, type ArrHistoryRecord, type ArrQueueItem } from "@/lib/connections/arr-upgrade"
import { searchSonarrEpisodes, startRadarrMovieSearch } from "@/lib/connections/arr-writes"
import { getRadarrMovieFile } from "@/lib/connections/radarr-movie"
import { listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import type { ArrConfig, ResolvedFile } from "@/lib/problem-reports/resolve"
import type { StepOutcome } from "@/lib/problem-reports/steps/types"
import type { CopyWatch, ProblemReportFixPayload } from "@/lib/queue/types"

const MINUTE_MS = 60 * 1000
const CHECK_MS = 10 * MINUTE_MS

/** How long a run waits for its new copy, or to start. */
export const WAIT_MS = 24 * 60 * MINUTE_MS

/** Tracked states of a download that won't import without the server admin. */
const STUCK = new Set(["importBlocked", "importFailed", "failedPending", "failed"])

/** Check again in 10 minutes, with these payload changes. */
export const checkAgain = (now: Date, data: Partial<ProblemReportFixPayload> = {}): StepOutcome => ({ next: { at: now.getTime() + CHECK_MS, data } })

/** What the ledger records the run against: the movie, or the file's episodes, which keep their ids when the file changes. */
export const fileTarget = (resolved: ResolvedFile) => (resolved.service === "radarr" ? `radarr:movie:${resolved.titleId}` : `sonarr:episode:${resolved.episodeIds.join(",")}`)

/** The movie, or the file's episodes in a series, as a resolved file and a watch both name them. */
type FileTitle = Pick<CopyWatch, "service" | "titleId" | "episodeIds">

/** Radarr's `MoviesSearch` for the movie, or Sonarr's `EpisodeSearch` for the file's episodes. */
export async function searchForFile(config: ArrConfig, title: FileTitle) {
  return title.service === "radarr" ? startRadarrMovieSearch(config, title.titleId) : searchSonarrEpisodes(config, title.episodeIds)
}

/** What a run watches for the file it resolved, from `at`. */
export const watchFor = (resolved: ResolvedFile, commandId: number | null, at: number): CopyWatch => ({
  service: resolved.service,
  titleId: resolved.titleId,
  fileId: resolved.file.id,
  episodeIds: resolved.episodeIds,
  commandId,
  since: at,
  sectionId: resolved.plex.sectionId,
  folder: resolved.plex.folder,
})

/** What one check found: the new copy is in, nothing is downloading, or the outcome already. */
export type CopyCheck = { imported: true; config: ArrConfig } | { idle: true; config: ArrConfig; pastDeadline: boolean } | { outcome: StepOutcome }

/** Whether Radarr or Sonarr has replaced the file the run started with; null when it can't be read. */
async function hasNewFile(config: ArrConfig, watch: CopyWatch): Promise<boolean | null> {
  if (watch.service === "radarr") {
    const movie = await getRadarrMovieFile(config, watch.titleId)
    return movie.success ? movie.data.file !== null && movie.data.file.id !== watch.fileId : null
  }
  const episodes = await listSonarrEpisodes(config, watch.titleId)
  if (!episodes.success) return null
  const inFile = episodes.data.filter((episode) => watch.episodeIds.includes(episode.id))
  return inFile.length > 0 && inFile.every((episode) => episode.episodeFileId !== null && episode.episodeFileId !== watch.fileId)
}

/** Only the run's own episodes count in Sonarr; everything for the movie counts in Radarr. */
const ours = (watch: CopyWatch) => (record: ArrQueueItem | ArrHistoryRecord) => watch.service === "radarr" || (record.episodeId !== null && watch.episodeIds.includes(record.episodeId))

/** What the queue and the history since the run acted say; null when either can't be read. */
async function downloads(config: ArrConfig, watch: CopyWatch): Promise<{ queue: ArrQueueItem[]; latest: ArrHistoryRecord | null } | null> {
  const title = { service: watch.service, id: watch.titleId }
  const [queue, history] = await Promise.all([listTitleQueue(config, title), listTitleHistory(config, title)])
  if (!queue.success || !history.success) return null
  const counts = (record: ArrHistoryRecord) => ours(watch)(record) && record.at >= watch.since && !(watch.skipDownloadId && record.downloadId === watch.skipDownloadId)
  const since = history.data.filter(counts).sort((a, b) => b.at - a.at)
  return { queue: queue.data.filter(ours(watch)), latest: since[0] ?? null }
}

/** One check; see the module comment. */
export async function checkCopy(watch: CopyWatch, deadline: number | undefined, now: Date): Promise<CopyCheck> {
  const pastDeadline = now.getTime() >= (deadline ?? 0)
  const row = await getActiveService(watch.service)
  if (!row) return { outcome: { toAdmin: watch.service === "radarr" ? "NO_RADARR" : "NO_SONARR" } }
  const config = { name: row.name, url: row.url, apiKey: row.apiKey }

  const replaced = await hasNewFile(config, watch)
  if (replaced) return { imported: true, config }
  const seen = replaced === null ? null : await downloads(config, watch)
  if (!seen) return { outcome: pastDeadline ? { toAdmin: "UNAVAILABLE" } : checkAgain(now) }
  if (seen.queue.some((item) => item.trackedDownloadState !== null && STUCK.has(item.trackedDownloadState))) return { outcome: { toAdmin: "IMPORT_BLOCKED" } }
  if (seen.latest?.eventType === "downloadFailed") return { outcome: { toAdmin: "DOWNLOAD_FAILED" } }
  if (seen.queue.length > 0 || seen.latest?.eventType === "grabbed") return { outcome: pastDeadline ? { toAdmin: "STILL_DOWNLOADING" } : checkAgain(now) }
  return { idle: true, config, pastDeadline }
}

/** A search that grabbed nothing: still running, failed, or finished with no better copy (a command Radarr or Sonarr no longer knows counts as finished). */
export async function searchEnded(config: ArrConfig, watch: CopyWatch, pastDeadline: boolean, now: Date): Promise<StepOutcome | "finished"> {
  const service = watch.service === "radarr" ? "Radarr" : "Sonarr"
  const command = watch.commandId === null ? { success: true as const, data: "gone" as const } : await getArrCommandState(service, config, watch.commandId)
  if (!command.success) return pastDeadline ? { toAdmin: "UNAVAILABLE" } : checkAgain(now)
  if (command.data === "running") return pastDeadline ? { toAdmin: "SEARCH_FAILED" } : checkAgain(now)
  return command.data === "failed" ? { toAdmin: "SEARCH_FAILED" } : "finished"
}
