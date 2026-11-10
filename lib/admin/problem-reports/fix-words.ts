/**
 * The admin timeline's words for a fix's steps: who started it, and why it
 * handed a report back to the server admin (`TO_ADMIN`).
 *
 * @module lib/admin/problem-reports/fix-words
 */

import type { FixTrigger } from "@/lib/problem-reports/fixes"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

/** After the fix's words: who started it. */
export const TRIGGER_WORDS: Record<FixTrigger, string> = {
  automatic: " for the member",
  web: "",
  mcp: " over MCP",
}

export const TO_ADMIN_WORDS: Record<ToAdminReason, string> = {
  OFF: "Problem reports were turned off, so the fix stopped",
  QUEUE_DOWN: "The job queue wasn't running, so the fix didn't start",
  SEARCH_CAP: "The server reached today's limit of searches, so the fix didn't run",
  BREAKER: "Fixes that replace files are paused",
  NO_SONARR: "Sonarr isn't set up, so nothing could look for the episodes",
  NOT_IN_SONARR: "Sonarr doesn't have this show",
  UNAVAILABLE: "Sonarr or Plex couldn't be reached",
  NOTHING_MISSING: "Sonarr and Plex have every episode that has aired",
  NOT_ON_SERVER: "The missing episodes aren't monitored in Sonarr",
  NOT_AIRED: "The missing episodes haven't aired yet",
  TOO_MANY: "More than 50 episodes are missing, which is too many to search for at once",
  NOT_FOUND: "Sonarr didn't find the episodes within a day",
  PLEX_DIDNT_ADD: "Plex didn't add Sonarr's files after a scan",
  REFRESHED: "Plex read the details again. Check them, then mark it fixed",
  REFRESH_FAILED: "Plex didn't refresh the details",
}
