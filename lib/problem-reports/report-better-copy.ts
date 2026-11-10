/**
 * "Blurry or low quality" when a member reports it about a movie or an
 * episode: the app checks first whether a better copy can come, so the member
 * gets an answer, or Look for a better copy starts, instead of a report that
 * waits for the server admin.
 *
 * | What the app finds                              | The member gets                                    |
 * |-------------------------------------------------|----------------------------------------------------|
 * | their Plex app converted their last play        | a report for the server admin (the sheet showed    |
 * |                                                 | the playback tip first)                            |
 * | the file can't be resolved, or isn't readable   | a report for the server admin, with why            |
 * | the profile wants a better copy                 | a report, and Look for a better copy starts        |
 * | the profile wants none                          | an answer: the best copy the server keeps; they    |
 * |                                                 | can still send it to the server admin              |
 *
 * @module lib/problem-reports/report-better-copy
 */

import "server-only"

import type { Evidence } from "@/lib/problem-reports/evidence"
import { resolveFile } from "@/lib/problem-reports/resolve"
import { readUpgrade } from "@/lib/problem-reports/upgrade"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

/** The answer that takes the place of a report: the file is as good as the profile asks for. */
export type BetterCopyAnswer = { kind: "BEST_COPY" }

export type MemberBetterCopyDecision = { answer: BetterCopyAnswer } | { startsFix: true } | { startsFix: false; reason: ToAdminReason }

/**
 * What a member's "Blurry or low quality" leads to.
 *
 * @param ratingKey - The movie or episode
 * @param evidence - What Tautulli says about the member's last play of it
 */
export async function decideBetterCopyForMember(server: { url: string; token: string }, ratingKey: string, evidence: Evidence): Promise<MemberBetterCopyDecision> {
  // A converted play is blurry whatever the file; the member was told how to play the original first
  if (evidence.lastPlay?.transcoded) return { startsFix: false, reason: "TRANSCODED" }
  const resolution = await resolveFile(server, ratingKey)
  if (!resolution.ok) return { startsFix: false, reason: resolution.reason }
  const upgrade = await readUpgrade(resolution.resolved)
  if (upgrade === null) return { startsFix: false, reason: "UNAVAILABLE" }
  return upgrade ? { startsFix: true } : { answer: { kind: "BEST_COPY" } }
}
