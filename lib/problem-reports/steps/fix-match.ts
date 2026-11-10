/**
 * Fix the Plex match (admins only): when Plex matched a movie or show to
 * another title than the one Radarr or Sonarr has for its file, match it to
 * that title, and check that it took (docs/problem-reports.md, "Fix the Plex
 * match"). An episode's report matches its show.
 *
 * ```
 * start ─ check the match (checkMatch)
 *   ├─ Plex agrees, it's the episode order, or it can't be told ─► the server admin
 *   ├─ ask the section's agent: `tmdb-<id>` for a movie (then its title and
 *   │  year), the title and year for a show ─ nothing found ─► the server admin
 *   ├─ another item in the section has that match, so matching would merge
 *   │  the two ─► the server admin
 *   ├─ gate (Plex changes an hour) and record
 *   └─ match ─► wait (every 5 seconds, a minute)
 * wait ─ read the item's ids
 *   ├─ Radarr's or Sonarr's ─► fixed
 *   └─ not within the minute ─► match back to what it had ─► the server admin
 * ```
 *
 * A result whose legacy guid names the expected id is taken first; the
 * current agents' guids name no id, so their first result is taken, and the
 * wait is what tells whether it was the right one. A step that runs again
 * after a crash finds its ledger row and goes to the wait without matching
 * again.
 *
 * @module lib/problem-reports/steps/fix-match
 */

import "server-only"

import { getPlexItemMetadata } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { findPlexItemByGuid } from "@/lib/connections/plex-file-state"
import { parsePlexExternalIds } from "@/lib/connections/plex-guids"
import { getPlexSectionAgent, matchPlexItem, searchPlexMatches, type PlexMatchResult } from "@/lib/connections/plex-match"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { checkMatch, idsFit, type ExpectedTitle, type MatchTarget } from "@/lib/problem-reports/match"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

const CHECK_MS = 5000
const WAIT_MS = 60_000

type PlexServer = { url: string; token: string }

/** The agent's results for the expected title: a movie by its TMDB id first, then by title and year. */
async function search(server: PlexServer, target: MatchTarget, expected: ExpectedTitle): Promise<PlexMatchResult[] | null> {
  const agent = await getPlexSectionAgent(server, target.sectionId)
  if (!agent) return null
  const byTitle = { title: expected.title, year: expected.year, ...agent }
  if (!("tmdb" in expected.ids)) return searchPlexMatches(server, target.ratingKey, byTitle)
  const byId = await searchPlexMatches(server, target.ratingKey, { title: `tmdb-${expected.ids.tmdb}`, ...agent })
  return byId === null || byId.length > 0 ? byId : searchPlexMatches(server, target.ratingKey, byTitle)
}

async function start(server: PlexServer, report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const check = await checkMatch(server, report.plexRatingKey)
  if (check.verdict === "AGREES") return { toAdmin: "IDS_AGREE" }
  if (check.verdict === "UNKNOWN") return { toAdmin: check.reason }
  const { target, expected } = check

  const results = await search(server, target, expected)
  if (results === null) return { toAdmin: "UNAVAILABLE" }
  const pick = results.find((result) => idsFit(parsePlexExternalIds(result.guid, []), expected.ids)) ?? results[0]
  if (!pick) return { toAdmin: "NO_MATCH" }
  const holder = await findPlexItemByGuid(server, target.sectionId, pick.guid)
  if (holder.status === "unknown") return { toAdmin: "UNAVAILABLE" }
  if (holder.status === "found" && holder.ratingKey !== target.ratingKey) return { toAdmin: "WOULD_MERGE" }

  const gate = await gateAndRecord(
    {
      reportId: report.id,
      runToken: report.runToken,
      reporterId: report.reporterId,
      actorUserId: data.actorUserId,
      trigger: data.trigger,
      target: `plex:${target.guid ?? report.titleKey}`,
      action: "FIX_MATCH",
      traits: fixTraits("FIX_MATCH"),
    },
    now
  )
  if (gate !== null && gate !== "ALREADY_RAN") return { toAdmin: gate }
  if (gate === null && !(await matchPlexItem(server, target.ratingKey, pick))) return { toAdmin: "MATCH_FAILED" }
  const at = now.getTime()
  return {
    next: {
      at: at + CHECK_MS,
      data: { step: "wait", deadline: at + WAIT_MS, match: { ratingKey: target.ratingKey, expected: expected.ids, before: { guid: target.guid, title: target.title } } },
    },
  }
}

async function wait(server: PlexServer, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const { match } = data
  if (!match) return { toAdmin: "UNAVAILABLE" }
  const item = await getPlexItemMetadata(server, match.ratingKey)
  if (item.status === "found" && idsFit(item.item.ids, match.expected)) return { fixed: true }
  if (now.getTime() < (data.deadline ?? 0)) return { next: { at: now.getTime() + CHECK_MS, data: {} } }

  // An item that was never matched has nothing to go back to
  const { before } = match
  const back = before.guid !== null && !before.guid.startsWith("local://") && (await matchPlexItem(server, match.ratingKey, { guid: before.guid, name: before.title }))
  return { toAdmin: back ? "MATCH_WRONG" : "MATCH_STUCK" }
}

export async function runFixMatch(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  return data.step === "start" ? start(server, report, data, now) : wait(server, data, now)
}
