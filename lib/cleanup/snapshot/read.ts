/**
 * `readLibrary()`: the `cleanup:read` job body (TS 7.1, 7.3, 7.8, 17.1).
 * It reads every source once into one stored snapshot. Server-only.
 *
 * 1. Take the read claim. Busy: `{ busy: true }`.
 * 2. In the Rewind season-open window (`opensAt + 15 min` to `opensAt + 8 h`
 *    of `getSeasonState(now)`), stop with `{ skipped: "seasonOpen" }`.
 * 3. Create the `reading` header.
 * 4. Read in the order of TS 7.3: Plex sections (P1), plex.tv access (P2,
 *    `access.ts`), then Radarr, Sonarr and Overseerr in parallel while the
 *    Plex pages (P3 to P6) stream into the builder, then the collections
 *    (P7, P8, `collections/read-members.ts`), then Tautulli (T1), which needs
 *    every Plex row first. Each call runs inside `redisLimiter.run`.
 * 5. Failures (TS 7.8): P1 or any Plex page fails the read, with a `failed`
 *    header and no parts, so runs keep the previous complete snapshot.
 *    Another source records `failed` with its code, and the builder gives
 *    its fields Unknown (`plays: null`, `requests: null`, `arrFailed`).
 * 6. Set `facts.rowBaseline` from the newest earlier complete snapshot
 *    (`baseline.ts`), write the parts and the `complete` header in one
 *    transaction, prune, and release the claim.
 *
 * Every source status carries `rows`: Plex the listing rows of P3 to P6,
 * plex.tv the ids with access, Radarr and Sonarr the records, Tautulli the
 * history rows and Overseerr the requests. A shutdown or a lost claim
 * leaves the header `reading` (the next read prunes it after 1 hour). After
 * 20 minutes the read stops and fails with `TIMEOUT`. The claim is released
 * on every path.
 *
 * @module lib/cleanup/snapshot/read
 */

import "server-only"

import type { z } from "zod"

import { claim, release } from "@/lib/cleanup/claims"
import { readCollectionMembers } from "@/lib/cleanup/collections/read-members"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { plexEpisodeRow, plexMovieRow, plexSeasonRow, plexShowRow, type PlexSection } from "@/lib/cleanup/schema/upstream"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { limited, notConfigured, readArr, readOverseerr, readPlexAccess, readTautulli, safe, statusOf } from "@/lib/cleanup/snapshot/access"
import { rowBaseline } from "@/lib/cleanup/snapshot/baseline"
import { createSnapshotBuilder, type SnapshotBuild, type SnapshotBuilder } from "@/lib/cleanup/snapshot/builder"
import {
  createSnapshotHeader, failSnapshot, loadPreviousCompleteHeader, pruneSnapshots, type SnapshotTrigger, writeSnapshot,
} from "@/lib/cleanup/snapshot/store"
import { forEachPlexRow, listPlexSections, PLEX_TYPE, type PlexListType, type PlexReadConfig } from "@/lib/connections/plex-library-read"
import { getActiveService } from "@/lib/data/active-service"
import { createLogger } from "@/lib/utils/logger"
import { getSeasonState } from "@/lib/wrapped/season"

const logger = createLogger("CLEANUP_READ")

/** The hard stop of a read (TS 17.1). @internal */
export const READ_TIMEOUT_MS = 20 * 60_000
const SKIP_FROM_MS = 15 * 60_000
const SKIP_TO_MS = 8 * 60 * 60_000

export interface ReadLibraryInput {
  trigger: SnapshotTrigger
  actorId?: string | null
  /** The job's shutdown signal. */
  signal?: AbortSignal
}

export type ReadLibraryResult =
  | { busy: true }
  | { skipped: "seasonOpen" }
  | { snapshotId: string; status: "complete" | "failed"; sources: SourceStatus[]; errorCode?: string }

interface SourcesRead { sources: SourceStatus[]; build: SnapshotBuild | null; errorCode?: string }

/** Whether `now` is in the window after the Rewind season opens, when reads skip (TS 7.1 step 2, R06 R10). */
export function inSeasonOpenWindow(now: Date, opensAt: Date): boolean {
  const since = now.getTime() - opensAt.getTime()
  return since >= SKIP_FROM_MS && since < SKIP_TO_MS
}

/** P3 for each movie section, then P4, P5 and P6 for each show section. The first failure stops it. */
async function readPlexRows(config: PlexReadConfig, sections: readonly PlexSection[], builder: SnapshotBuilder, signal: AbortSignal) {
  const opts = limited("plex", signal)
  let rows = 0
  const list = <T>(id: string, type: PlexListType, schema: z.ZodType<T>, add: (page: T[]) => void) => () =>
    safe(signal, () => forEachPlexRow(config, id, type, schema, add, opts))
  const steps = [
    ...sections.filter((s) => s.type === "movie").map(({ key }) => list(key, PLEX_TYPE.movie, plexMovieRow, (page) => builder.addMovies(key, page))),
    ...sections.filter((s) => s.type === "show").flatMap(({ key }) => [
      list(key, PLEX_TYPE.show, plexShowRow, (page) => builder.addShows(key, page)),
      list(key, PLEX_TYPE.season, plexSeasonRow, (page) => builder.addSeasons(key, page)),
      list(key, PLEX_TYPE.episode, plexEpisodeRow, (page) => builder.addEpisodes(key, page)),
    ]),
  ]
  for (const step of steps) {
    const result = await step()
    if (!result.ok) return result
    rows += result.data.rows
  }
  return { ok: true as const, data: rows }
}

/** Steps 4 and 5: every source, in order. `build` is null when the read fails. */
async function readSources(takenAt: string, signal: AbortSignal): Promise<SourcesRead> {
  const [plex, tautulli, overseerr, radarr, sonarr] = await Promise.all(
    [getActiveService("plex"), getActiveService("tautulli"), getActiveService("overseerr"), getActiveService("radarr"), getActiveService("sonarr")])
  if (!plex) return { sources: [{ ...notConfigured("plex"), part: "server" }], build: null, errorCode: "NO_PLEX_SERVER" }
  const config = { url: plex.url, token: plex.token }
  const sections = await safe(signal, () => listPlexSections(config, limited("plex", signal)))
  if (!sections.ok) return { sources: [{ ...statusOf("plex", sections, 0), part: "server" }], build: null, errorCode: sections.code }
  const names = (await readCleanupSettingsRow()).options.protections.g13.collections
  const builder = createSnapshotBuilder({ takenAt, sections: sections.data })
  const shares = await readPlexAccess(plex, limited("plex", signal))
  const side = new AbortController()
  const sideSignal = AbortSignal.any([signal, side.signal])
  const parallel = Promise.all([readArr("radarr", radarr, sideSignal), readArr("sonarr", sonarr, sideSignal), readOverseerr(overseerr, builder, sideSignal)])
  const rows = await readPlexRows(config, sections.data, builder, signal)
  if (rows.ok) await readCollectionMembers(config, sections.data, names, builder, limited("plex", signal))
  else side.abort()
  const watched = rows.ok ? [await readTautulli(tautulli, builder, signal)] : []
  const [radarrRead, sonarrRead, seerr] = await parallel
  const sources: SourceStatus[] = [{ ...statusOf("plex", rows, rows.ok ? rows.data : 0), part: "server" }, shares.status, ...watched,
    seerr.status, radarrRead.status, sonarrRead.status]
  if (!rows.ok) return { sources, build: null, errorCode: rows.code }
  return { sources, build: builder.finish({ sources, access: shares.access, radarr: radarrRead.read, sonarr: sonarrRead.read, overseerrUsers: seerr.users }) }
}

/** Step 6, or the failure of TS 7.8. */
async function finish(
  snapshotId: string,
  trigger: SnapshotTrigger,
  signals: { job: AbortSignal; deadline: AbortSignal },
  read: SourcesRead
): Promise<ReadLibraryResult> {
  const failed = (sources: SourceStatus[], errorCode: string) => ({ snapshotId, status: "failed" as const, sources, errorCode })
  if (signals.deadline.aborted) {
    const sources = read.sources.map((s) => (s.errorCode === "ABORTED" ? { ...s, errorCode: "TIMEOUT" } : s))
    await failSnapshot(snapshotId, sources)
    return failed(sources, "TIMEOUT")
  }
  if (signals.job.aborted) return failed(read.sources, "ABORTED")
  if (!read.build) {
    await failSnapshot(snapshotId, read.sources)
    return failed(read.sources, read.errorCode ?? "UPSTREAM_ERROR")
  }
  const prev = await loadPreviousCompleteHeader(snapshotId)
  const { items, facts } = read.build
  const baseline = rowBaseline(prev?.facts ? { sources: prev.sources, facts: prev.facts } : null, { trigger, sources: read.sources, facts })
  const written = await writeSnapshot(snapshotId, { parts: items, sources: read.sources, facts: { ...facts, rowBaseline: baseline } })
  if (!written.ok) return failed(read.sources, written.code)
  await pruneSnapshots().catch((error: unknown) => logger.error("cleanup.snapshot_prune_failed", error))
  return { snapshotId, status: "complete", sources: read.sources }
}

/** Runs one library read (TS 7.1 steps 1 to 8). */
export async function readLibrary(input: ReadLibraryInput): Promise<ReadLibraryResult> {
  const startedAt = new Date()
  const held = await claim("readClaimAt", startedAt)
  if (!held) return { busy: true }
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), READ_TIMEOUT_MS)
  try {
    if (inSeasonOpenWindow(startedAt, (await getSeasonState(startedAt)).opensAt)) return { skipped: "seasonOpen" }
    const snapshotId = await createSnapshotHeader({ trigger: input.trigger, actorId: input.actorId, startedAt })
    const job = AbortSignal.any([held.lost, ...(input.signal ? [input.signal] : [])])
    const signal = AbortSignal.any([job, deadline.signal])
    try {
      return await finish(snapshotId, input.trigger, { job, deadline: deadline.signal }, await readSources(startedAt.toISOString(), signal))
    } catch (error) {
      logger.error("cleanup.read_failed", error, { snapshotId })
      await failSnapshot(snapshotId, []).catch(() => false)
      return { snapshotId, status: "failed", sources: [], errorCode: "INTERNAL" }
    }
  } finally {
    clearTimeout(timer)
    await release(held).catch((error: unknown) => logger.error("cleanup.claim_release_failed", error, { column: "readClaimAt" }))
  }
}
