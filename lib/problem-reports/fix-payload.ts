/**
 * The payload of the `problem-report:fix` job (`lib/queue/types.ts`): one run
 * of a problem report's fix, and what each step waits for.
 *
 * @module lib/problem-reports/fix-payload
 */

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
}
