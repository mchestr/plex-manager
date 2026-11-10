/**
 * Swap the copy: the fix for "Won't start", and for any copy a better copy
 * wouldn't fix. It grabs another release of the same quality or better from
 * an interactive search, so the copy members have keeps playing until the new
 * one imports, and Radarr or Sonarr then blocklists the bad one
 * (docs/problem-reports.md, "Swap the copy").
 *
 * ```
 * start ─ resolve the file, and wait while it plays or downloads (readyToReplace)
 *   ├─ a member's swap: they're still entitled, and it's in their libraries
 *   ├─ read the quality profile and the bad copy (findBadCopy)
 *   ├─ gate (search cap, breaker, and ./recheck.ts) and record, with the bad copy for the audit
 *   ├─ the interactive search, then the pick (pickCandidate)
 *   │    └─ no other copy, or only lower ones ─► the server admin
 *   ├─ a dry run ─► the server admin, with the release it would grab
 *   ├─ gate the replacement (the breaker, and ./recheck.ts again) and mark the row replaced
 *   └─ grab the pick ─► wait (every 10 minutes, a day)
 * wait ─ the shared check (checkCopy)
 *   ├─ the new copy is in ─► mark the bad copy's grab failed, check the
 *   │                        blocklist, find the Plex item ─► fixed
 *   └─ nothing is downloading ─► wait, until the deadline ─► the server admin
 * ```
 *
 * The search counts against the daily cap and the grab against the breaker,
 * each gated in its own serializable transaction. A step that runs again
 * after a crash may search again, but never grabs twice: a row already
 * marked replaced goes to the wait without a grab. The crash may have come
 * before the grab went out, so when that wait's first check finds nothing
 * downloading, the report goes back to the server admin (INTERRUPTED).
 *
 * @module lib/problem-reports/steps/swap
 */

import "server-only"

import { getAccessLevel } from "@/lib/access"
import { getArrQualityProfile } from "@/lib/connections/arr-upgrade"
import { searchArrReleases } from "@/lib/connections/arr-swap"
import { grabArrRelease } from "@/lib/connections/arr-writes"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { readMemberItem } from "@/lib/problem-reports/access"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { pickCandidate } from "@/lib/problem-reports/candidates"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord, gateReplace } from "@/lib/problem-reports/ledger"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"
import { checkAgain, checkCopy, fileTarget, WAIT_MS, watchFor } from "@/lib/problem-reports/steps/copy-wait"
import { finishReplace, readyToReplace } from "@/lib/problem-reports/steps/replace"
import { runOf } from "@/lib/problem-reports/steps/run-record"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_SWAP")

type PlexServer = { url: string; token: string }

/** The file as the pick compares it. */
const candidateFile = (resolved: ResolvedFile) => ({
  quality: resolved.file.quality,
  customFormatScore: resolved.file.customFormatScore,
  languages: resolved.file.languages,
  episodeIds: resolved.episodeIds,
})

/** The interactive search: the movie, or the file's first episode, whose results hold the file's other episodes too. */
function searchReleases(resolved: ResolvedFile) {
  return searchArrReleases(resolved.config, resolved.service === "radarr" ? { service: "radarr", movieId: resolved.titleId } : { service: "sonarr", episodeId: resolved.episodeIds[0] })
}

/** A member's swap runs only while they're entitled and the title is in their libraries (SEC-21). */
async function memberHasAccess(report: StepReport): Promise<StepOutcome | null> {
  if ((await getAccessLevel(report.reporterId)) !== "full") return { toAdmin: "NO_ACCESS" }
  const item = await readMemberItem(report.reporterId, report.plexRatingKey)
  return item.ok ? null : { toAdmin: item.reason === "UNAVAILABLE" ? "UNAVAILABLE" : "NO_ACCESS" }
}

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const ready = await readyToReplace(server, report, data, now)
  if ("outcome" in ready) return ready.outcome
  const refused = data.trigger === "automatic" ? await memberHasAccess(report) : null
  if (refused) return refused
  const { resolved, guid } = ready
  const service = resolved.service === "radarr" ? "Radarr" : "Sonarr"
  const [profile, bad] = await Promise.all([getArrQualityProfile(service, resolved.config, resolved.qualityProfileId), findBadCopy(resolved)])
  if (!profile.success || !bad) return { toAdmin: "UNAVAILABLE" }

  const gate = await gateAndRecord(
    {
      ...runOf(report, data),
      target: fileTarget(resolved),
      action: "SWAP",
      traits: fixTraits("SWAP"),
      file: { id: resolved.file.id, release: bad.titles[0] ?? null },
    },
    now
  )
  if (gate !== null && gate !== "ALREADY_RAN") return { toAdmin: gate }

  const releases = await searchReleases(resolved)
  if (!releases.success) return { toAdmin: "UNAVAILABLE" }
  const pick = pickCandidate(releases.data, candidateFile(resolved), bad, profile.data.qualityOrder, resolved.service)
  if (!pick.ok) return { toAdmin: pick.reason }
  // A dry run stops here, with what it would grab, for the server admin to run in one tap
  if (data.dryRun) return { wouldSwap: { release: pick.release.title } }

  const replacing = await gateReplace({ ...runOf(report, data), action: "SWAP" }, now)
  if (replacing === "NO_RUN") {
    // The first gate wrote the row, so only a deleted row gets here
    logger.warn("The swap's ledger row was missing at its grab", { reportId: report.id, runToken: report.runToken })
    return { toAdmin: "UNAVAILABLE" }
  }
  if (replacing !== null && replacing !== "ALREADY_REPLACED") return { toAdmin: replacing }
  const grabbed = replacing === "ALREADY_REPLACED" ? null : pick.release
  if (grabbed && !(await grabArrRelease(service, resolved.config, grabbed)).success) return { toAdmin: "GRAB_FAILED" }

  const at = now.getTime()
  return checkAgain(now, {
    step: "wait",
    deadline: at + WAIT_MS,
    watch: watchFor(resolved, null, at),
    replace: { guid, badGrabId: bad.grab?.id ?? null, badRelease: bad.grab?.title ?? null, release: grabbed?.title ?? null },
  })
}

async function wait(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { watch, replace } = data
  if (!watch || !replace) return { toAdmin: "UNAVAILABLE" }
  const check = await checkCopy(watch, data.deadline, now)
  if ("outcome" in check) return check.outcome
  if ("imported" in check) return finishReplace(server, report, check.config, { watch, replace }, { markFailed: true })
  // A step that ran again past its grab can't say whether the grab went out; one that did would be downloading by now
  if (replace.release === null) return { toAdmin: "INTERRUPTED" }
  // The grab is in the history at once, so a day with no download means it never started
  return check.pastDeadline ? { toAdmin: "GRAB_FAILED" } : checkAgain(now)
}

export async function runSwap(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  return data.step === "start" ? start(server, report, data, now) : wait(server, report, data, now)
}
