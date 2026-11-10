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
  NO_SONARR: "Sonarr isn't set up, so the fix couldn't run",
  NOT_IN_SONARR: "Sonarr doesn't have this show",
  NO_RADARR: "Radarr isn't set up, so the fix couldn't run",
  NOT_IN_RADARR: "Radarr doesn't have this movie",
  NO_IDS: "Plex has no TMDB, TVDB or IMDb id for it, so Radarr and Sonarr can't be asked",
  NO_FILE: "The file Plex plays isn't one Radarr or Sonarr has",
  SEVERAL_VERSIONS: "Plex has more than one version of it, so the fix can't tell which one was played",
  MULTI_PART: "Its file is split into parts",
  SPECIAL: "It's a special, which Sonarr numbers its own way",
  UNMONITORED: "It isn't monitored in Radarr or Sonarr",
  UNAVAILABLE: "Radarr, Sonarr or Plex couldn't be reached",
  NOTHING_MISSING: "Sonarr and Plex have every episode that has aired",
  NOT_ON_SERVER: "The missing episodes aren't monitored in Sonarr",
  NOT_AIRED: "The missing episodes haven't aired yet",
  TOO_MANY: "More than 50 episodes are missing, which is too many to search for at once",
  NOT_FOUND: "Sonarr didn't find the episodes within a day",
  PLEX_DIDNT_ADD: "Plex didn't add Sonarr's files after a scan",
  REFRESHED: "Plex read the details again. Check them, then mark it fixed",
  REFRESH_FAILED: "Plex didn't refresh the details",
  TRANSCODED: "Their Plex app converted the video on their last play, so nothing looked for a better copy",
  NO_UPGRADE: "The quality profile doesn't want a better copy of this file",
  NO_BETTER_COPY: "The search found no better copy",
  SEARCH_FAILED: "The search in Radarr or Sonarr didn't finish",
  IMPORT_BLOCKED: "A new copy downloaded, but Radarr or Sonarr couldn't import it",
  DOWNLOAD_FAILED: "A new copy was grabbed, but its download failed",
  STILL_DOWNLOADING: "A new copy is still downloading after a day",
  BUSY: "It was playing or downloading for a day, so the fix didn't start",
  NO_OTHER_COPY: "The search found no other copy",
  ONLY_LOWER: "The only other copies are lower quality. Remove the file and search can grab one of them",
  GRAB_FAILED: "Radarr or Sonarr didn't take the chosen copy",
  ROOT_FOLDER_MISSING: "Radarr or Sonarr couldn't delete the file: its root folder is missing. If the copy came from a download, its release is on the blocklist now",
  DELETE_FAILED: "Radarr or Sonarr didn't delete the file, so the copy is still there. If it came from a download, its release is on the blocklist now",
  NOTHING_GRABBED: "The file was removed, and the search found nothing to replace it",
  INTERRUPTED: "The fix was interrupted part way, so it stopped rather than act twice. Check the title in Radarr or Sonarr before you run it again",
  PLEX_CAP: "The server reached this hour's limit of Plex changes, so the fix didn't run",
  IDS_AGREE: "Plex has the same title as Radarr or Sonarr, so the match isn't the problem. If a different title plays, swap the copy",
  EPISODE_ORDER: "Plex numbers this episode differently from Sonarr. Check the show's episode order in Plex",
  MISMATCH: "Plex has a different title than Radarr or Sonarr for this file. Fix the Plex match",
  NO_MATCH: "Plex's agent found nothing for the title Radarr or Sonarr has",
  WOULD_MERGE: "Another item in the library already has the right match, so matching would merge the two",
  MATCH_FAILED: "Plex didn't take the match",
  MATCH_WRONG: "Plex's new match didn't have the right ids within a minute, so Plex was asked to match it back",
  MATCH_STUCK: "Plex's new match didn't have the right ids, and it couldn't be matched back. Check the match in Plex",
}
