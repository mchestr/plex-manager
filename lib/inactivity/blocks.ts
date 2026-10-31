/**
 * Why a run of the inactivity sweep removed no one, as stored in
 * `InactivityRun.blocked` and the `INACTIVITY_SWEEP_RUN` audit row, with the
 * words the admin pages show. Client-safe: no server imports.
 *
 * | Block             | When                                                              |
 * |-------------------|-------------------------------------------------------------------|
 * | `disabled`        | Automatic removal is off                                          |
 * | `sync_failed`     | The last seen read from Tautulli failed, so nothing is fresh      |
 * | `tautulli_stale`  | Tautulli recorded no play on the whole server in 14 days          |
 * | `history_short`   | Tautulli's oldest play is newer than the threshold, or unknown    |
 * | `no_plex_server`  | No active Plex server                                             |
 * | `plex_unavailable`| plex.tv did not answer the share list read                       |
 * | `plex_auth`       | plex.tv refused the server token                                  |
 * | `over_limit`      | A scheduled run found more inactive members than its safety limit |
 * | `not_confirmed`   | An admin run found an inactive member the admin did not confirm   |
 * | `audit_failed`    | An audit row could not be written, so the run stopped             |
 * | `offboard_failed` | A removal could not finish its clean-up, so the run stopped       |
 * | `stopped`         | The server shut down, or another run took over the claim          |
 * | `busy`            | An admin run found another run in progress, so it did not start   |
 *
 * A run that stopped part way (`plex_auth`, `audit_failed`, `offboard_failed`,
 * `stopped`) can have removed some members first; its counts say how many.
 * `busy` is only in the audit row (with no run id): such a run stores no
 * `InactivityRun`.
 *
 * @module lib/inactivity/blocks
 */

export const INACTIVITY_BLOCKS = [
  "disabled",
  "sync_failed",
  "tautulli_stale",
  "history_short",
  "no_plex_server",
  "plex_unavailable",
  "plex_auth",
  "over_limit",
  "not_confirmed",
  "audit_failed",
  "offboard_failed",
  "stopped",
  "busy",
] as const

export type InactivityBlock = (typeof INACTIVITY_BLOCKS)[number]

/** Days without a play on the whole server after which Tautulli counts as not recording. */
export const TAUTULLI_STALE_DAYS = 14

const BLOCK_LABELS: Record<InactivityBlock, string> = {
  disabled: "Automatic removal is off",
  sync_failed: "Tautulli did not answer",
  tautulli_stale: `Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days`,
  history_short: "Tautulli's history does not cover the threshold yet",
  no_plex_server: "No Plex server is set up",
  plex_unavailable: "Plex did not answer",
  plex_auth: "Plex refused the server token",
  over_limit: "More members qualified than the safety limit allows",
  not_confirmed: "A member who qualified was not confirmed",
  audit_failed: "An audit row could not be written, so the run stopped",
  offboard_failed: "A removal's clean-up did not finish, so the run stopped",
  stopped: "The server shut down or another run took over, so the run stopped",
  busy: "Another run was in progress",
}

/** The words for a stored block; an unknown value (from a newer build) shows as it is. */
export function inactivityBlockLabel(block: string): string {
  return (BLOCK_LABELS as Record<string, string | undefined>)[block] ?? block
}
