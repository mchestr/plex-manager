/**
 * "Episodes are missing" when a member reports it: Sonarr and Plex are read
 * first (`readMissingState`), so a member gets an answer instead of a report
 * where one exists, and a fix starts where one can.
 *
 * | Sonarr and Plex                                 | The member gets                                   |
 * |-------------------------------------------------|---------------------------------------------------|
 * | the missing episodes haven't aired              | an answer: when the next one comes out; no report |
 * | the missing episodes aren't monitored           | an answer: which seasons aren't on the server,    |
 * |                                                 | with a link to request them; no report            |
 * | files to scan, or monitored episodes to search  | a report, and Look for the episodes starts        |
 * | anything else                                   | a report for the server admin, with why           |
 *
 * @module lib/problem-reports/report-missing
 */

import "server-only"

import type { PlexItemMetadata } from "@/lib/connections/plex"
import { getActiveService } from "@/lib/data/active-service"
import { readMissingState } from "@/lib/problem-reports/steps/missing-state"
import { overseerrSeriesHref } from "@/lib/ui/plex-links"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

/** An answer that takes the place of a report. */
export type MissingAnswer =
  | { kind: "NOT_AIRED"; season: number; episode: number; airsAt: string | null }
  | { kind: "NOT_ON_SERVER"; seasons: number[]; requestHref: string | null }

export type MemberMissingDecision = { answer: MissingAnswer } | { startsFix: true } | { startsFix: false; reason: ToAdminReason }

/** Where the member can request the show: its Overseerr page, when Overseerr has a public URL and the show a TMDB id. */
async function requestHref(show: PlexItemMetadata): Promise<string | null> {
  const overseerr = await getActiveService("overseerr")
  return show.ids.tmdb === undefined ? null : overseerrSeriesHref(overseerr?.publicUrl ?? null, show.ids.tmdb)
}

/** What a member's "Episodes are missing" leads to, for a show or one of its episodes. */
export async function decideMissingForMember(server: { url: string; token: string }, item: PlexItemMetadata, now: Date): Promise<MemberMissingDecision> {
  const state = await readMissingState(server, item.ratingKey, now)
  if (!state.ok) return { startsFix: false, reason: state.reason }
  const { decision } = state
  switch (decision.kind) {
    case "SCAN":
    case "SEARCH":
      return { startsFix: true }
    case "NOT_AIRED":
      return { answer: decision }
    case "NOT_ON_SERVER":
      return { answer: { kind: "NOT_ON_SERVER", seasons: decision.seasons, requestHref: await requestHref(state.show) } }
    default:
      return { startsFix: false, reason: decision.kind }
  }
}
