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

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { resolveFile } from "@/lib/problem-reports/resolve"
import { checkAgain, checkCopy, fileTarget, searchEnded, searchForFile, WAIT_MS, watchFor } from "@/lib/problem-reports/steps/copy-wait"
import { runOf } from "@/lib/problem-reports/steps/run-record"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import { readUpgrade } from "@/lib/problem-reports/upgrade"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

type PlexServer = { url: string; token: string }

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const resolution = await resolveFile(server, report.plexRatingKey)
  if (!resolution.ok) return { toAdmin: resolution.reason }
  const { resolved } = resolution
  const upgrade = await readUpgrade(resolved)
  if (upgrade === null) return { toAdmin: "UNAVAILABLE" }
  if (!upgrade) return { toAdmin: "NO_UPGRADE" }

  const gate = await gateAndRecord(
    {
      ...runOf(report, data),
      target: fileTarget(resolved),
      action: "BETTER_COPY",
      traits: fixTraits("BETTER_COPY"),
    },
    now
  )
  if (gate !== null && gate !== "ALREADY_RAN") return { toAdmin: gate }
  let commandId: number | null = null
  if (gate === null) {
    const sent = await searchForFile(resolved.config, resolved)
    if (!sent.success) return { toAdmin: "UNAVAILABLE" }
    commandId = sent.data.id
  }
  const at = now.getTime()
  return checkAgain(now, { step: "wait", deadline: at + WAIT_MS, watch: watchFor(resolved, commandId, at) })
}

async function wait(server: PlexServer, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { watch } = data
  if (!watch) return { toAdmin: "UNAVAILABLE" }
  const check = await checkCopy(watch, data.deadline, now)
  if ("outcome" in check) return check.outcome
  if ("imported" in check) {
    // Radarr or Sonarr may tell Plex themselves; a scan of one folder is cheap either way
    if (watch.sectionId) await scanPlexFolder(server, watch.sectionId, watch.folder)
    return { fixed: true }
  }
  const ended = await searchEnded(check.config, watch, check.pastDeadline, now)
  return ended === "finished" ? { noBetterCopy: true } : ended
}

export async function runBetterCopy(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  return data.step === "start" ? start(server, report, data, now) : wait(server, data, now)
}
