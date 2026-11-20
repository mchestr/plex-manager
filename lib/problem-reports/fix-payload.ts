/**
 * The payload of the `problem-report:fix` job (`lib/queue/types.ts`): one run
 * of a problem report's fix, and what each step waits for.
 *
 * @module lib/problem-reports/fix-payload
 */

/**
 * What a fix that brings in a new copy watches once it has acted: Look for a
 * better copy, Swap the copy, and Remove the file and search
 * (`lib/problem-reports/steps/copy-wait.ts`).
 */
export interface CopyWatch {
  service: "radarr" | "sonarr"
  /** The Radarr movie or the Sonarr series. */
  titleId: number
  /** The file the run started with: a new file is the new copy, imported. */
  fileId: number
  /** Sonarr: the file's episodes. */
  episodeIds: number[]
  /** The search command, or null for a swap's grab, or when the step ran again after a crash and didn't send it. */
  commandId: number | null
  /** When the run acted, in epoch milliseconds; only later history counts. */
  since: number
  /** A download whose history doesn't count: the bad copy's, which a removal marks failed. */
  skipDownloadId?: string | null
  /** Plex's library section and the file's folder, scanned once the new copy is in. */
  sectionId: string | null
  folder: string
}

/** What Swap the copy and Remove the file and search carry to their end (`lib/problem-reports/steps/replace.ts`). */
export interface ReplaceWatch {
  /** The Plex item's guid, to find it again when the new copy comes in as a new item. */
  guid: string
  /** The bad copy's grab in the history, which a swap marks failed once the new copy is in; null for a file added by hand. */
  badGrabId: number | null
  /** The bad copy's release, looked for on the blocklist at the end. */
  badRelease: string | null
  /** The release a swap grabbed; null for a removal, or a swap that ran again after a crash. */
  release: string | null
  /** A removal monitors the title again on its first check, once deleting the file can no longer unmonitor it. */
  monitored?: boolean
}

/** What Fix the Plex match checks after it asked Plex to match (`lib/problem-reports/steps/fix-match.ts`). @internal */
export interface MatchWatch {
  /** The movie or show it matched. */
  ratingKey: string
  /** The ids the match must end with: Radarr's for a movie, Sonarr's for a show. */
  expected: { tmdb: number; imdb: string | null } | { tvdb: number }
  /** What Plex had it matched to before, to match back to. */
  before: { guid: string | null; title: string }
}

/**
 * One run of a problem report's fix (lib/problem-reports/run.ts). The job
 * delays itself between steps, and the step and what it waits for travel in
 * the payload.
 */
export interface ProblemReportFixPayload {
  reportId: string
  /** The report's `runToken` when this run was claimed; a newer run stops this one. */
  runToken: number
  /** `search` is Remove the file and search's second step, a minute after the delete. */
  step: "start" | "search" | "wait"
  trigger: "automatic" | "web" | "mcp"
  /** Who asked: the reporter for an automatic run, else the admin. */
  actorUserId: string | null
  /** The Sonarr episode ids the run waits for, once it has started. */
  targets?: number[]
  /** When the run gives up waiting, in epoch milliseconds. */
  deadline?: number
  /** When the run last asked Plex to scan for files Sonarr has, in epoch milliseconds. */
  scannedAt?: number
  /** A fix that brings in a new copy: what it waits on. */
  watch?: CopyWatch
  /** Swap the copy and Remove the file and search: what their end needs. */
  replace?: ReplaceWatch
  /** Swap the copy and Remove the file and search: the file seen while they waited to start; another file means the copy changed meanwhile. */
  seenFileId?: number
  /** Fix the Plex match: what it waits to see. */
  match?: MatchWatch
}
