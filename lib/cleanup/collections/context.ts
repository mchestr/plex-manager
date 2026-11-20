/**
 * The state of one round of the Plex collection sync (TS 8.10), shared by
 * `sync.ts`, `collection.ts` and `adopt.ts`. Server-only: it holds the Plex
 * token.
 *
 * The round works on a copy of `CleanupSettings.runtime` and writes it once
 * at its end (the sync is its only writer, E8). Each step that fails adds its
 * code to `errors`, and the first code becomes `lastSync.errorCode`.
 *
 * @module lib/cleanup/collections/context
 */

import "server-only"

import type { HubFlags } from "@/lib/cleanup/collections/plan"
import type { RuntimeCollection, RuntimeNotice } from "@/lib/cleanup/schema/runtime"
import { createLogger } from "@/lib/utils/logger"

export const logger = createLogger("CLEANUP_COLLECTIONS")

/** What a sync changed in Plex, summed over its rounds. */
export interface SyncCounts {
  /** Collections stored after the last round. */
  collections: number
  added: number
  removed: number
  moved: number
  /** Collections made again after a `collectionRemoved` notice. */
  recreated: number
  /** Collections deleted because nothing of their section and level was leaving. */
  deleted: number
}

/**
 * A code a round records: a transport code of `lib/connections/http.ts`,
 * `INVALID_KEY`, or `GUARD`, `HUB`, `NO_MACHINE_ID` and `NO_PLEX_SERVER`.
 */
export type SyncErrorCode = string

export interface SyncContext {
  plex: { url: string; token: string; machineIdentifier: string | null }
  /** The wanted hub flags (`options.plex`). */
  hub: HubFlags
  /** The collection summary, or null when the app URL is not set. */
  summary: string | null
  signal: AbortSignal
  /** The runtime this round writes. Keys are `"<sectionId>:<level>"`. */
  collections: Record<string, RuntimeCollection>
  notices: RuntimeNotice[]
  counts: SyncCounts
  errors: SyncErrorCode[]
}

/** Zero counts. */
export function zeroCounts(): SyncCounts {
  return { collections: 0, added: 0, removed: 0, moved: 0, recreated: 0, deleted: 0 }
}

/** Records a failed step: the code for `lastSync`, and a log line with the key and the step. */
export function failStep(ctx: SyncContext, key: string, step: string, code: SyncErrorCode): void {
  ctx.errors.push(code)
  logger.warn("cleanup.collection_sync_failed", { key, step, code })
}

/** {@link failStep}, then `value`: the `return` of a step whose call failed. */
export function failWith<T>(ctx: SyncContext, key: string, step: string, code: SyncErrorCode, value: T): T {
  failStep(ctx, key, step, code)
  return value
}

/** Whether a failed call was a 404, which proves the thing is gone. */
export function isGone(result: { ok: boolean; code?: string; status?: number }): boolean {
  return !result.ok && result.code === "HTTP" && result.status === 404
}
