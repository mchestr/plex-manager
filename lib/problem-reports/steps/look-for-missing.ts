/**
 * Look for the episodes: the fix for "Episodes are missing" (`decideMissing`).
 *
 * ```
 * start ─ read Sonarr and Plex again
 *   ├─ Sonarr has files Plex lacks ─► gate, record, scan the show's folder ─► wait (check every 2 minutes)
 *   ├─ monitored episodes aired with no file ─► gate (daily search cap), record, EpisodeSearch ─► wait (every 10 minutes)
 *   └─ anything else (nothing missing, not monitored, not aired, too many, no Sonarr) ─► the server admin
 * wait ─ read them again, for the episodes the run started with
 *   ├─ none missing ─► fixed
 *   ├─ Sonarr has files Plex lacks ─► scan once; still lacking 30 minutes after the scan ─► the server admin
 *   │    (the scan's 30 minutes count from the scan, so a late one can outlast the search's day by that much)
 *   ├─ still no file ─► wait, until a day after the start ─► the server admin
 *   └─ Sonarr or Plex didn't answer ─► wait, until the deadline
 * ```
 *
 * Nothing is removed. The run has one ledger row, written at the start: a
 * scan in the wait belongs to it, and needs no gate of its own, since a scan
 * neither searches nor replaces a file. A step that runs again after a crash
 * finds its row and doesn't search or scan twice, so a crash between the
 * record and the search means no search goes out, and the report goes back
 * to the server admin as not found after a day.
 *
 * @module lib/problem-reports/steps/look-for-missing
 */

import "server-only"

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { PlexItemMetadata } from "@/lib/connections/plex"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { searchSonarrEpisodes } from "@/lib/connections/arr-writes"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { readMissingState } from "@/lib/problem-reports/steps/missing-state"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

const MINUTE_MS = 60 * 1000
const SEARCH_CHECK_MS = 10 * MINUTE_MS
const SEARCH_WAIT_MS = 24 * 60 * MINUTE_MS
const SCAN_CHECK_MS = 2 * MINUTE_MS
const SCAN_WAIT_MS = 30 * MINUTE_MS

type PlexServer = { url: string; token: string }

/** Scans every folder of the show; false when Plex refused one or the show has none. */
async function scanShow(server: PlexServer, show: PlexItemMetadata): Promise<boolean> {
  if (!show.librarySectionId || show.locations.length === 0) return false
  const scans = await Promise.all(show.locations.map((folder) => scanPlexFolder(server, show.librarySectionId ?? "", folder)))
  return scans.every(Boolean)
}

const later = (now: Date, everyMs: number, data: Partial<ProblemReportFixPayload> = {}): StepOutcome => ({ next: { at: now.getTime() + everyMs, data } })

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const state = await readMissingState(server, report.plexRatingKey, now)
  if (!state.ok) return { toAdmin: state.reason }
  const { decision } = state
  if (decision.kind !== "SCAN" && decision.kind !== "SEARCH") return { toAdmin: decision.kind }

  const search = decision.kind === "SEARCH"
  const gate = await gateAndRecord(
    {
      reportId: report.id,
      runToken: report.runToken,
      reporterId: report.reporterId,
      actorUserId: data.actorUserId,
      trigger: data.trigger,
      target: `sonarr:series:${state.seriesId}`,
      action: search ? "LOOK_FOR_MISSING" : "SCAN",
      traits: search ? fixTraits("LOOK_FOR_MISSING") : { searches: false, replacesFile: false },
    },
    now
  )
  if (gate !== null && gate !== "ALREADY_RAN") return { toAdmin: gate }
  if (gate === null) {
    const acted = search ? (await searchSonarrEpisodes(state.sonarr, decision.episodeIds)).success : await scanShow(server, state.show)
    if (!acted) return { toAdmin: "UNAVAILABLE" }
  }
  const at = now.getTime()
  return search
    ? later(now, SEARCH_CHECK_MS, { step: "wait", targets: decision.episodeIds, deadline: at + SEARCH_WAIT_MS })
    : later(now, SCAN_CHECK_MS, { step: "wait", targets: decision.episodeIds, deadline: at + SCAN_WAIT_MS, scannedAt: at })
}

async function wait(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const pastDeadline = now.getTime() >= (data.deadline ?? 0)
  const state = await readMissingState(server, report.plexRatingKey, now, data.targets)
  if (!state.ok) return pastDeadline ? { toAdmin: state.reason } : later(now, SEARCH_CHECK_MS)

  switch (state.decision.kind) {
    case "NOTHING_MISSING":
      return { fixed: true }
    case "SCAN":
      if (data.scannedAt === undefined) {
        await scanShow(server, state.show)
        return later(now, SCAN_CHECK_MS, { scannedAt: now.getTime() })
      }
      return now.getTime() - data.scannedAt >= SCAN_WAIT_MS ? { toAdmin: "PLEX_DIDNT_ADD" } : later(now, SCAN_CHECK_MS)
    case "SEARCH":
      return pastDeadline ? { toAdmin: "NOT_FOUND" } : later(now, SEARCH_CHECK_MS)
    default:
      // Sonarr changed under the run: the episodes stopped being monitored, or more went missing
      return { toAdmin: state.decision.kind }
  }
}

export async function runLookForMissing(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  return data.step === "start" ? start(server, report, data, now) : wait(server, report, data, now)
}
