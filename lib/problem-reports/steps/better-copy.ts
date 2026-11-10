/**
 * Look for a better copy: the fix for "Blurry or low quality", a search with
 * the file in place, so Radarr or Sonarr grabs a release only when the
 * quality profile counts it as an upgrade, and the old file stays until the
 * new one imports.
 *
 * ```
 * start ─ resolve the file again (resolveFile), read its profile (readUpgrade)
 *   ├─ the file can't be resolved, or the profile wants no better copy ─► the server admin
 *   └─ gate (daily search cap), record, MoviesSearch or EpisodeSearch ─► wait (every 10 minutes)
 * wait ─ read the file, then the queue, then the history since the search
 *   ├─ a new file ─► ask Plex to scan its folder ─► fixed
 *   ├─ the queue says the download is stuck ─► the server admin
 *   ├─ the latest step is a failed download ─► the server admin
 *   ├─ a copy is downloading or was just grabbed ─► wait, until a day after the search ─► the server admin
 *   ├─ nothing grabbed and the search is still running ─► wait, until the same deadline
 *   ├─ nothing grabbed and the search finished ─► no better copy right now
 *   └─ Radarr or Sonarr didn't answer ─► wait, until the deadline
 * ```
 *
 * A step that runs again after a crash finds its ledger row and doesn't
 * search twice. With no command to ask about, its wait reads the search as
 * finished, so a crash between the record and the search ends as no better
 * copy rather than a second search. "No better copy right now" closes a
 * member's run and goes back to the admin who ran it (`lib/problem-reports/run.ts`).
 *
 * @module lib/problem-reports/steps/better-copy
 */

import "server-only"

import { getArrCommandState, listTitleHistory, listTitleQueue, type ArrHistoryRecord, type ArrQueueItem } from "@/lib/connections/arr-upgrade"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { getRadarrMovieFile, startRadarrMovieSearch } from "@/lib/connections/radarr-movie"
import { listSonarrEpisodes, searchSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { resolveFile, type ArrConfig, type ResolvedFile } from "@/lib/problem-reports/resolve"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import { readUpgrade } from "@/lib/problem-reports/upgrade"
import type { BetterCopyWatch, ProblemReportFixPayload } from "@/lib/queue/types"

const MINUTE_MS = 60 * 1000
const CHECK_MS = 10 * MINUTE_MS
const WAIT_MS = 24 * 60 * MINUTE_MS
/** History up to this long before the search counts too: Radarr's or Sonarr's clock may be a little behind the worker's. */
const CLOCK_SLACK_MS = MINUTE_MS

/** Tracked states of a download that won't import without the server admin. */
const STUCK = new Set(["importBlocked", "importFailed", "failedPending", "failed"])

type PlexServer = { url: string; token: string }

const later = (now: Date, data: Partial<ProblemReportFixPayload> = {}): StepOutcome => ({ next: { at: now.getTime() + CHECK_MS, data } })

/** What the ledger records the run against: the movie, or the file's episodes, which keep their ids when the file changes. */
const target = (resolved: ResolvedFile) => (resolved.service === "radarr" ? `radarr:movie:${resolved.titleId}` : `sonarr:episode:${resolved.episodeIds.join(",")}`)

async function search(resolved: ResolvedFile) {
  return resolved.service === "radarr" ? startRadarrMovieSearch(resolved.config, resolved.titleId) : searchSonarrEpisodes(resolved.config, resolved.episodeIds)
}

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const resolution = await resolveFile(server, report.plexRatingKey)
  if (!resolution.ok) return { toAdmin: resolution.reason }
  const { resolved } = resolution
  const upgrade = await readUpgrade(resolved)
  if (upgrade === null) return { toAdmin: "UNAVAILABLE" }
  if (!upgrade) return { toAdmin: "NO_UPGRADE" }

  const gate = await gateAndRecord(
    {
      reportId: report.id,
      runToken: report.runToken,
      reporterId: report.reporterId,
      actorUserId: data.actorUserId,
      trigger: data.trigger,
      target: target(resolved),
      action: "BETTER_COPY",
      traits: fixTraits("BETTER_COPY"),
    },
    now
  )
  if (gate !== null && gate !== "ALREADY_RAN") return { toAdmin: gate }
  let commandId: number | null = null
  if (gate === null) {
    const sent = await search(resolved)
    if (!sent.success) return { toAdmin: "UNAVAILABLE" }
    commandId = sent.data.id
  }
  const at = now.getTime()
  const watch: BetterCopyWatch = {
    service: resolved.service,
    titleId: resolved.titleId,
    fileId: resolved.file.id,
    episodeIds: resolved.episodeIds,
    commandId,
    since: at,
    sectionId: resolved.plex.sectionId,
    folder: resolved.plex.folder,
  }
  return later(now, { step: "wait", deadline: at + WAIT_MS, watch })
}

/** Whether Radarr or Sonarr has replaced the file the run started with; null when it can't be read. */
async function hasNewFile(config: ArrConfig, watch: BetterCopyWatch): Promise<boolean | null> {
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
const ours = (watch: BetterCopyWatch) => (record: ArrQueueItem | ArrHistoryRecord) => watch.service === "radarr" || (record.episodeId !== null && watch.episodeIds.includes(record.episodeId))

/** What the queue and the history since the search say; null when either can't be read. */
async function downloads(config: ArrConfig, watch: BetterCopyWatch): Promise<{ queue: ArrQueueItem[]; latest: ArrHistoryRecord | null } | null> {
  const title = { service: watch.service, id: watch.titleId }
  const [queue, history] = await Promise.all([listTitleQueue(config, title), listTitleHistory(config, title)])
  if (!queue.success || !history.success) return null
  const since = history.data.filter((record) => ours(watch)(record) && record.at >= watch.since - CLOCK_SLACK_MS).sort((a, b) => b.at - a.at)
  return { queue: queue.data.filter(ours(watch)), latest: since[0] ?? null }
}

async function wait(server: PlexServer, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { watch } = data
  if (!watch) return { toAdmin: "UNAVAILABLE" }
  const pastDeadline = now.getTime() >= (data.deadline ?? 0)
  const row = await getActiveService(watch.service)
  if (!row) return { toAdmin: watch.service === "radarr" ? "NO_RADARR" : "NO_SONARR" }
  const config = { name: row.name, url: row.url, apiKey: row.apiKey }

  const replaced = await hasNewFile(config, watch)
  if (replaced) {
    // Radarr or Sonarr may tell Plex themselves; a scan of one folder is cheap either way
    if (watch.sectionId) await scanPlexFolder(server, watch.sectionId, watch.folder)
    return { fixed: true }
  }
  const seen = replaced === null ? null : await downloads(config, watch)
  if (!seen) return pastDeadline ? { toAdmin: "UNAVAILABLE" } : later(now)
  if (seen.queue.some((item) => item.trackedDownloadState !== null && STUCK.has(item.trackedDownloadState))) return { toAdmin: "IMPORT_BLOCKED" }
  if (seen.latest?.eventType === "downloadFailed") return { toAdmin: "DOWNLOAD_FAILED" }
  if (seen.queue.length > 0 || seen.latest?.eventType === "grabbed") return pastDeadline ? { toAdmin: "STILL_DOWNLOADING" } : later(now)

  const command = watch.commandId === null ? { success: true as const, data: "gone" as const } : await getArrCommandState(watch.service === "radarr" ? "Radarr" : "Sonarr", config, watch.commandId)
  if (!command.success) return pastDeadline ? { toAdmin: "UNAVAILABLE" } : later(now)
  if (command.data === "running") return pastDeadline ? { toAdmin: "SEARCH_FAILED" } : later(now)
  return command.data === "failed" ? { toAdmin: "SEARCH_FAILED" } : { noBetterCopy: true }
}

export async function runBetterCopy(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  return data.step === "start" ? start(server, report, data, now) : wait(server, data, now)
}
