/**
 * The payload of the `problem-report:fix` job (`lib/queue/types.ts`): one run
 * of a problem report's fix, and what each step waits for.
 *
 * @module lib/problem-reports/fix-payload
 */

/** What Look for a better copy watches once its search is sent (`lib/problem-reports/steps/better-copy.ts`). */
export interface BetterCopyWatch {
  service: "radarr" | "sonarr"
  /** The Radarr movie or the Sonarr series. */
  titleId: number
  /** The file the run started with: a new file is the better copy, imported. */
  fileId: number
  /** Sonarr: the file's episodes. */
  episodeIds: number[]
  /** The search command, or null when the step ran again after a crash and didn't send it. */
  commandId: number | null
  /** When the search was sent, in epoch milliseconds; only later history counts. */
  since: number
  /** Plex's library section and the file's folder, scanned once the new copy is in. */
  sectionId: string | null
  folder: string
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
  step: "start" | "wait"
  trigger: "automatic" | "web" | "mcp"
  /** Who asked: the reporter for an automatic run, else the admin. */
  actorUserId: string | null
  /** The Sonarr episode ids the run waits for, once it has started. */
  targets?: number[]
  /** When the run gives up waiting, in epoch milliseconds. */
  deadline?: number
  /** When the run last asked Plex to scan for files Sonarr has, in epoch milliseconds. */
  scannedAt?: number
  /** Look for a better copy: what it waits on. */
  watch?: BetterCopyWatch
}
