/**
 * How a library read reaches its sources (TS 7.2.1, 7.2.2, 7.3, 7.8, E23,
 * deviation D14). Server-only. `read.ts` holds the order and the Plex server
 * listings; this module holds everything else that calls out:
 *
 * 1. {@link readPlexAccess} (P2): who has access to this server.
 * 2. {@link readArr} (R1 to R5, S1 to S5), {@link readOverseerr} (O1, O2)
 *    and {@link readTautulli} (T1).
 * 3. The shared plumbing: {@link limited} runs each call inside
 *    `redisLimiter.run` with the job's signal, {@link safe} turns a thrown
 *    call into a failure, and {@link statusOf} writes the `SourceStatus`.
 *
 * Access (P2):
 *
 * | Case | Result |
 * |---|---|
 * | An accepted share of this server | access |
 * | A managed Plex Home user (no share, no email) | access |
 * | The owner (`PlexServer.adminPlexUserId`) | access, added here: plex.tv does not list the owner |
 * | A pending invite | no access |
 * | `adminPlexUserId` null | the shares part fails with `NO_OWNER`, so every `hasAccess` is null, never "no access" |
 * | No machine identifier, or plex.tv does not answer | the shares part fails, so every `hasAccess` is null |
 *
 * The rules of "access" are `getAllPlexServerUsers()`
 * (`lib/connections/plex-user-info.ts`). `readPlexShares`
 * (`lib/inactivity/shares.ts`) stays as it is for the inactivity sweep. Only
 * ids leave this module: no name and no email.
 *
 * @module lib/cleanup/snapshot/access
 */

import "server-only"

import type { ArrRead } from "@/lib/cleanup/identity/arr"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { ArrDisk, ArrTag, RadarrMovie, SonarrSeries } from "@/lib/cleanup/schema/upstream"
import type { PlexAccessInput, SnapshotBuilder } from "@/lib/cleanup/snapshot/builder"
import type { CleanupReadOptions } from "@/lib/cleanup/snapshot/rows"
import { buildOverseerrUserIndex } from "@/lib/connections/overseerr"
import { forEachRequest } from "@/lib/connections/overseerr-cleanup"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { getAllPlexServerUsers } from "@/lib/connections/plex-user-info"
import * as radarr from "@/lib/connections/radarr-library"
import * as sonarr from "@/lib/connections/sonarr-library"
import { forEachHistoryRow } from "@/lib/connections/tautulli-history-all"
import type { PlexServer } from "@/lib/generated/prisma/client"
import { redisLimiter, type SemaphoreService } from "@/lib/queue/redis-semaphore"
import { createLogger } from "@/lib/utils/logger"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_READ")

const DIGITS = /^\d+$/

/** @internal Exported for the tests. */
export type Failure = { ok: false; code: string }
export type Result<T> = { ok: true; data: T } | Failure
type Endpoint = { url: string; apiKey: string }

/** A service that is not set up. */
export const notConfigured = (service: Service): SourceStatus => ({ service, state: "notConfigured", readAt: null })

/** The status of a service from its result, read now. */
export function statusOf(service: Service, result: Result<unknown>, rows: number): SourceStatus {
  const readAt = new Date().toISOString()
  return result.ok ? { service, state: "ok", readAt, rows } : { service, state: "failed", readAt, errorCode: result.code }
}

/** Each call of a source inside `redisLimiter.run` (TS 7.2.1 item 2), with the signal. */
export function limited(service: SemaphoreService, signal: AbortSignal): CleanupReadOptions {
  return { signal, run: <R>(call: () => Promise<R>) => redisLimiter.run(service, call, { signal }) }
}

/** A call that may throw (the limiter rejects on abort, and when Redis fails) as a failure. */
export async function safe<T>(signal: AbortSignal, call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call()
  } catch (error) {
    if (!signal.aborted) logger.error("cleanup.read_call_failed", error)
    return { ok: false, code: signal.aborted ? "ABORTED" : "REDIS_UNAVAILABLE" }
  }
}

/** The shares part of the Plex source status, and the access input of the snapshot builder. */
export interface PlexAccessRead {
  status: SourceStatus
  access: PlexAccessInput
}

/** P2: reads the plex.tv user list of `server` once. */
export async function readPlexAccess(server: PlexServer, opts: Pick<CleanupReadOptions, "run"> = {}): Promise<PlexAccessRead> {
  const run = opts.run ?? (<R>(call: () => Promise<R>) => call())
  const owner = server.adminPlexUserId?.trim() ?? ""
  const ownerId = DIGITS.test(owner) ? owner : null
  const withId = await run(() => withMachineIdentifier(server)).catch(() => server)
  const machineIdentifier = withId.machineIdentifier ?? null
  const shares = (result: Result<string[]>): PlexAccessRead => {
    if (!result.ok) logger.warn("cleanup.read_access_failed", { code: result.code })
    const status = { ...statusOf("plex", result, result.ok ? result.data.length : 0), part: "shares" as const }
    return { status, access: { userIds: result.ok ? result.data : null, ownerId, machineIdentifier } }
  }
  if (ownerId === null) return shares({ ok: false, code: "NO_OWNER" })
  if (machineIdentifier === null) return shares({ ok: false, code: "NO_MACHINE_ID" })
  const users = await run(() => getAllPlexServerUsers(withId)).catch(() => null)
  if (!users?.success || !users.data) return shares({ ok: false, code: "UPSTREAM_ERROR" })
  const ids = new Set(users.data.filter((user) => !user.pending).map((user) => user.id.trim()).filter((id) => DIGITS.test(id)))
  return shares({ ok: true, data: [...ids.add(ownerId)].sort((a, b) => Number(a) - Number(b)) })
}

type Call<T> = (config: Endpoint, opts: CleanupReadOptions) => Promise<Result<T>>
type ArrCalls<R> = [Call<{ path: string }[]>, Call<R[]>, Call<ArrTag[]>, Call<{ tags: number[] }[]>, Call<ArrDisk[]>]
const RADARR: ArrCalls<RadarrMovie> = [radarr.listRadarrRootFolders, radarr.listRadarrMovies, radarr.listRadarrTags, radarr.listRadarrImportLists,
  radarr.getRadarrDisk]
const SONARR: ArrCalls<SonarrSeries> = [sonarr.listSonarrRootFolders, sonarr.listSonarrSeries, sonarr.listSonarrTags, sonarr.listSonarrImportLists,
  sonarr.getSonarrDisk]

/** What a Radarr or Sonarr read gives: its status, and the data when every call answered. */
export interface ArrSourceRead<R> {
  status: SourceStatus
  read: ArrRead<R> | null
}

async function readArrWith<R>(service: "radarr" | "sonarr", calls: ArrCalls<R>, config: Endpoint | null, signal: AbortSignal): Promise<ArrSourceRead<R>> {
  if (!config) return { status: notConfigured(service), read: null }
  const opts = limited(service, signal)
  const [roots, records, tags, lists, disk] = calls
  const results = await Promise.all([safe(signal, () => roots(config, opts)), safe(signal, () => records(config, opts)),
    safe(signal, () => tags(config, opts)), safe(signal, () => lists(config, opts)), safe(signal, () => disk(config, opts))])
  const [rootFolders, rows, tagRows, importLists, diskRows] = results
  if (!rootFolders.ok || !rows.ok || !tagRows.ok || !importLists.ok || !diskRows.ok) {
    return { status: statusOf(service, results.find((result): result is Failure => !result.ok) ?? rows, 0), read: null }
  }
  const read: ArrRead<R> = { records: rows.data, rootFolders: rootFolders.data, tags: tagRows.data, importLists: importLists.data, disk: diskRows.data }
  return { status: statusOf(service, rows, rows.data.length), read }
}

/** R1 to R5 (Radarr) or S1 to S5 (Sonarr), in parallel. Any failure fails the service, and its data is not used. */
export function readArr(service: "radarr", config: Endpoint | null, signal: AbortSignal): Promise<ArrSourceRead<RadarrMovie>>
export function readArr(service: "sonarr", config: Endpoint | null, signal: AbortSignal): Promise<ArrSourceRead<SonarrSeries>>
export function readArr(service: "radarr" | "sonarr", config: Endpoint | null, signal: AbortSignal): Promise<ArrSourceRead<RadarrMovie | SonarrSeries>> {
  return service === "radarr" ? readArrWith(service, RADARR, config, signal) : readArrWith(service, SONARR, config, signal)
}

/** O1, then O2 into the builder. A failure of either fails Overseerr, so every item gets `requests: null`. */
export async function readOverseerr(config: Endpoint | null, builder: Pick<SnapshotBuilder, "addRequests">, signal: AbortSignal) {
  if (!config) return { status: notConfigured("overseerr"), users: null }
  const users = await safe(signal, () => redisLimiter.run("overseerr", () => buildOverseerrUserIndex(config, { signal }), { signal }))
  if (!users.ok) return { status: statusOf("overseerr", users, 0), users: null }
  const requests = await safe(signal, () => forEachRequest(config, (rows) => builder.addRequests(rows), limited("overseerr", signal)))
  return { status: statusOf("overseerr", requests, requests.ok ? requests.data.rows : 0), users: users.data }
}

/** T1 into the builder. Call it after every Plex row. A failure gives every item `plays: null`. */
export async function readTautulli(config: Endpoint | null, builder: Pick<SnapshotBuilder, "addHistory">, signal: AbortSignal): Promise<SourceStatus> {
  if (!config) return notConfigured("tautulli")
  const result = await safe(signal, () => forEachHistoryRow(config, {}, (rows) => builder.addHistory(rows), limited("tautulli", signal)))
  return statusOf("tautulli", result, result.ok ? result.data.rows : 0)
}
