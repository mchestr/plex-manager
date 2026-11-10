/**
 * Remove the file and search (admins only, behind a confirm): for a copy
 * whose only other copies are lower quality, it deletes the file and
 * searches for any copy the quality profile allows. The title is unavailable
 * to everyone until the new copy imports (docs/problem-reports.md, "Remove
 * the file and search").
 *
 * ```
 * start ─ resolve the file, and wait while it plays or downloads (readyToReplace)
 *   ├─ read the bad copy (findBadCopy)
 *   ├─ gate (search cap and breaker) and record, replacing at once ─ its row is there already ─► the server admin
 *   ├─ mark the bad copy's grab failed, so its release is blocklisted ─ fails ─► the server admin; nothing is removed
 *   ├─ delete the file ─ fails ─► the server admin, with no retry (a 409: the root folder is missing)
 *   └─► search, a minute later
 * search ─ monitor the title again, then MoviesSearch or EpisodeSearch ─► wait (every 10 minutes, a day)
 * wait ─ the shared check (checkCopy)
 *   ├─ the new copy is in ─► check the blocklist, find the Plex item ─► fixed
 *   └─ nothing grabbed: the search is running ─► wait; it failed ─► the server admin;
 *                       it finished ─► the server admin (NOTHING_GRABBED)
 * ```
 *
 * Radarr and Sonarr can unmonitor a title a moment after its file is deleted
 * ("Unmonitor deleted movies" or "episodes"), so the search step monitors it
 * again first, and the copy keeps coming once it's released. The history of
 * the bad copy's download doesn't count while waiting, since marking it
 * failed writes a failed download there.
 *
 * A step that runs again after a crash finds its ledger row and hands the
 * report back without acting (INTERRUPTED): the file may be deleted already,
 * and a copy that came in since would read as the bad one, so nothing is
 * ever deleted twice.
 *
 * @module lib/problem-reports/steps/remove-and-search
 */

import "server-only"

import { deleteArrFile, failArrGrab, monitorRadarrMovie, monitorSonarrEpisodes } from "@/lib/connections/arr-writes"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getActiveService } from "@/lib/data/active-service"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import type { ArrConfig } from "@/lib/problem-reports/resolve"
import { checkAgain, checkCopy, fileTarget, searchEnded, searchForFile, WAIT_MS, watchFor } from "@/lib/problem-reports/steps/copy-wait"
import { finishReplace, readyToReplace } from "@/lib/problem-reports/steps/replace"
import { runOf } from "@/lib/problem-reports/steps/run-record"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { CopyWatch, ProblemReportFixPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_REMOVE")

const SEARCH_AFTER_MS = 60 * 1000

type PlexServer = { url: string; token: string }

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const ready = await readyToReplace(server, report, data, now)
  if ("outcome" in ready) return ready.outcome
  const { resolved, guid } = ready
  const service = resolved.service === "radarr" ? "Radarr" : "Sonarr"
  const bad = await findBadCopy(resolved)
  if (!bad) return { toAdmin: "UNAVAILABLE" }

  const gate = await gateAndRecord(
    {
      ...runOf(report, data),
      target: fileTarget(resolved),
      action: "REMOVE_AND_SEARCH",
      traits: fixTraits("REMOVE_AND_SEARCH"),
      replaces: true,
      file: { id: resolved.file.id, release: bad.titles[0] ?? null },
    },
    now
  )
  if (gate === "ALREADY_RAN") return { toAdmin: "INTERRUPTED" }
  if (gate !== null) return { toAdmin: gate }

  if (bad.grab && !(await failArrGrab(service, resolved.config, bad.grab.id)).success) return { toAdmin: "UNAVAILABLE" }
  const deleted = await deleteArrFile(service, resolved.config, resolved.file.id)
  if (!deleted.success) return { toAdmin: "conflict" in deleted ? "ROOT_FOLDER_MISSING" : "DELETE_FAILED" }

  return {
    next: {
      at: now.getTime() + SEARCH_AFTER_MS,
      data: {
        step: "search",
        watch: { ...watchFor(resolved, null, now.getTime()), skipDownloadId: bad.grab?.downloadId ?? null },
        replace: { guid, badGrabId: bad.grab?.id ?? null, badRelease: bad.grab?.title ?? null, release: null },
      },
    },
  }
}

async function monitorAgain(config: ArrConfig, watch: CopyWatch) {
  return watch.service === "radarr" ? monitorRadarrMovie(config, watch.titleId) : monitorSonarrEpisodes(config, watch.episodeIds)
}

async function search(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { watch, replace } = data
  if (!watch || !replace) return { toAdmin: "UNAVAILABLE" }
  const row = await getActiveService(watch.service)
  if (!row) return { toAdmin: watch.service === "radarr" ? "NO_RADARR" : "NO_SONARR" }
  const config = { name: row.name, url: row.url, apiKey: row.apiKey }

  // A title left unmonitored would never get a copy released later, but the search finds today's either way
  if (!(await monitorAgain(config, watch)).success) logger.warn("Could not monitor the title again after removing its file", { reportId: report.id })
  const sent = await searchForFile(config, watch)
  if (!sent.success) return { toAdmin: "SEARCH_FAILED" }
  const at = now.getTime()
  return checkAgain(now, { step: "wait", deadline: at + WAIT_MS, watch: { ...watch, commandId: sent.data.id, since: at } })
}

async function wait(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { watch, replace } = data
  if (!watch || !replace) return { toAdmin: "UNAVAILABLE" }
  const check = await checkCopy(watch, data.deadline, now)
  if ("outcome" in check) return check.outcome
  if ("imported" in check) return finishReplace(server, report, check.config, { watch, replace }, { markFailed: false })
  const ended = await searchEnded(check.config, watch, check.pastDeadline, now)
  return ended === "finished" ? { toAdmin: "NOTHING_GRABBED" } : ended
}

export async function runRemoveAndSearch(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  if (data.step === "start") return start(server, report, data, now)
  return data.step === "search" ? search(report, data, now) : wait(server, report, data, now)
}
