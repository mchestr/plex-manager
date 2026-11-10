/**
 * The pre-delete re-read (TS 8.8 table, step 5 and 6.6): the last checks of
 * an item right before its deletion, on fresh upstream data. Server-only.
 * The first check that fails decides. The result is `go`, `gone`,
 * `rescue(reason)`, `hold(code)` or `defer`.
 *
 * | # | Check | Result |
 * |---|---|---|
 * | 1 | The arr record still exists (`getRadarrMovie`, `getSonarrSeries`) | 404: `gone`. Other failure: `hold("sourceFailed:<arr>")` |
 * | 2 | The `match.by` id and every shared id, the path, strictly inside a root, no more Sonarr files than the snapshot's `arr.fileCount` | `rescue("recordChanged")`, `rescue("newContent")` |
 * | 3 | Movies: every Plex file of the managed copy inside the arr path | 404: `hold("plexMissing")`. Outside: `rescue("recordChanged")` |
 * | 4 | No play since `since(item)`: a row with `stopped ≥ since`, or a live session (`row_id` null). Seasons with G12 on: no counted play of the show | `rescue("played")`, `rescue("protected")` with `g12`, `hold("noValue:g12")` after 8 full pages |
 * | 5 | No new request since `since(item)` | `rescue("requested")` |
 * | 6 | No protection now (`pre-delete-protections.ts`): G1 and G3 through `cascadeWhere()` and shared external ids, G2 marks, G8 watchlists, G9 tags of the record of row 1 | `rescue("kept" \| "excluded" \| "markedKeepForever" \| "protected")` |
 * | 7 | Nobody plays it now (`readPlayingKeys`) | Playing or a failure: `defer` |
 *
 * `since(item) = min(why.takenAt, newest snapshot takenAt)`. The Tautulli
 * reads send `after = dayKey(since − 1 day)` in the server zone, so a play
 * that started before `since` and stopped after it is still seen (`stopped`).
 * `prepareChecks()` reads once per act step what every item shares: the root
 * folders, the tag label maps and the new Overseerr requests since the oldest
 * `since`. Every arr 401 carries `refused`, so the act step stops with
 * `arrRefused`.
 *
 * @module lib/cleanup/run/pre-delete
 */

import "server-only"

import { isCountedPlay } from "@/lib/cleanup/engine/plays"
import { isInside, rootOf } from "@/lib/cleanup/identity/path-fence"
import type { OutcomeDetail, OutcomeReason } from "@/lib/cleanup/outcomes"
import type { ArrRef } from "@/lib/cleanup/schema/runtime"
import type { SnapshotItem, SnapshotUser } from "@/lib/cleanup/schema/snapshot"
import { plexPartFiles, sonarrFileCount, type RadarrMovie, type SeerrRequest, type SonarrSeries } from "@/lib/cleanup/schema/upstream"
import { parseWhy } from "@/lib/cleanup/schema/why"
import { ID_KINDS, protectionCheck } from "@/lib/cleanup/run/pre-delete-protections"
import { DECLINED_STATUS } from "@/lib/cleanup/snapshot/requests"
import { forEachRequest } from "@/lib/connections/overseerr-cleanup"
import { getPlexMetadata } from "@/lib/connections/plex-library-read"
import { readPlayingKeys } from "@/lib/connections/plex-playing"
import { getRadarrMovie, listRadarrRootFolders, listRadarrTags } from "@/lib/connections/radarr-library"
import { getSonarrSeries, listSonarrRootFolders, listSonarrTags } from "@/lib/connections/sonarr-library"
import { forEachHistoryRow, type HistoryKeyFilter } from "@/lib/connections/tautulli-history-all"
import { getActiveService } from "@/lib/data/active-service"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { dayKey } from "@/lib/utils/zoned-time"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

type Endpoint = { url: string; apiKey: string }
type Arr = "radarr" | "sonarr"
/** The active connections of an act step. A service that is not set up is null. */
export interface ActServices { plex: { url: string; token: string } | null; radarr: Endpoint | null; sonarr: Endpoint | null; tautulli: Endpoint | null;
  overseerr: Endpoint | null }
/** What every item of one act step shares (TS 8.8 step 5). A failed roots or tags read is null. */
export interface Prepared { roots: Record<Arr, string[] | null>; tags: Record<Arr, Map<number, string> | null>; requests: SeerrRequest[] }
export type ArrRecord = RadarrMovie | SonarrSeries
export type PreDeleteResult = { kind: "go"; record: ArrRecord } | { kind: "gone" } | { kind: "rescue"; reason: OutcomeReason; detail?: OutcomeDetail }
  | { kind: "hold"; code: string; refused?: Arr } | { kind: "defer" }
/** One candidate: its row and arr record, its snapshot item, and its show item for a season. */
export interface PreDeleteInput { row: CleanupItem; arr: ArrRef; item: SnapshotItem; show: SnapshotItem | null }
export interface PreDeleteEnv { services: ActServices; prepared: Prepared; options: CleanupOptions; users: Readonly<Record<string, SnapshotUser>>
  takenAt: number; zone: string; now: Date; signal?: AbortSignal }

const DAY_MS = 86_400_000

/** The active connections. */
export async function loadActServices(): Promise<ActServices> {
  const [plex, radarr, sonarr, tautulli, overseerr] = await Promise.all([getActiveService("plex"), getActiveService("radarr"),
    getActiveService("sonarr"), getActiveService("tautulli"), getActiveService("overseerr")])
  const endpoint = (row: Endpoint | null) => (row ? { url: row.url, apiKey: row.apiKey } : null)
  return { plex: plex && { url: plex.url, token: plex.token }, radarr: endpoint(radarr), sonarr: endpoint(sonarr), tautulli: endpoint(tautulli),
    overseerr: endpoint(overseerr) }
}

/** `since(item)` in epoch ms: the older of the item's Why and the newest snapshot (a play inside a refreshed snapshot counts). */
export function sinceOf(row: Pick<CleanupItem, "why">, takenAt: number): number {
  const at = Date.parse(parseWhy(row.why)?.takenAt ?? "")
  return Number.isNaN(at) ? takenAt : Math.min(at, takenAt)
}

/** Step 5: the roots, the tag maps (G9 on) and the requests after `oldestSince`. Null when Overseerr failed (TS 8.8 step 5.4). */
export async function prepareChecks(services: ActServices, input: { oldestSince: number; g9: boolean; signal?: AbortSignal }): Promise<Prepared | null> {
  const opts = { signal: input.signal }
  const roots = async (read: () => Promise<{ ok: boolean; data?: { path: string }[] }>) => {
    const result = await read()
    return result.ok && result.data ? result.data.map((root) => root.path) : null
  }
  const tags = async (read: () => Promise<{ ok: boolean; data?: { id: number; label: string }[] }>) => {
    const result = await read()
    return result.ok && result.data ? new Map(result.data.map((tag) => [tag.id, tag.label.toLowerCase()])) : null
  }
  const { radarr, sonarr, overseerr } = services
  const none = async () => null
  const [radarrRoots, sonarrRoots, radarrTags, sonarrTags] = await Promise.all([radarr ? roots(() => listRadarrRootFolders(radarr, opts)) : none(),
    sonarr ? roots(() => listSonarrRootFolders(sonarr, opts)) : none(), radarr && input.g9 ? tags(() => listRadarrTags(radarr, opts)) : none(),
    sonarr && input.g9 ? tags(() => listSonarrTags(sonarr, opts)) : none()])
  const requests: SeerrRequest[] = []
  if (overseerr) {
    const read = await forEachRequest(overseerr, (rows) => void requests.push(...rows), { until: input.oldestSince, signal: input.signal })
    if (!read.ok) return null
  }
  return { roots: { radarr: radarrRoots, sonarr: sonarrRoots }, tags: { radarr: radarrTags, sonarr: sonarrTags }, requests }
}

const refusedOf = (arr: Arr, failure: { status?: number }) => (failure.status === 401 ? { refused: arr } : {})

/** Row 2: the ids of `match.by` and every shared kind, the path, a root that strictly holds it, and no new Sonarr files. */
function recordCheck({ arr, item }: PreDeleteInput, record: ArrRecord, roots: string[]): PreDeleteResult | null {
  const ids = { tmdb: record.tmdbId ?? undefined, tvdb: "tvdbId" in record ? record.tvdbId : undefined, imdb: record.imdbId ?? undefined }
  const by = item.match.by
  const same = by !== undefined && ids[by] === item.ids[by] && ID_KINDS.every((k) => item.ids[k] === undefined || ids[k] === undefined || ids[k] === item.ids[k])
  if (!same || record.path !== arr.path || rootOf(record.path, roots) === null) return { kind: "rescue", reason: "recordChanged" }
  const stored = item.arr?.fileCount
  if (!("seasons" in record) || stored === undefined) return null
  const count = sonarrFileCount(record, item.level === "season" ? (item.seasonNumber ?? -1) : undefined)
  return count > stored ? { kind: "rescue", reason: "newContent" } : null
}

/** Row 3 (movies): every file of the managed Plex copy inside the arr path. */
async function plexCheck({ row }: PreDeleteInput, record: ArrRecord, env: PreDeleteEnv): Promise<PreDeleteResult | null> {
  if (!env.services.plex) return { kind: "hold", code: "sourceFailed:plex" }
  const meta = await getPlexMetadata(env.services.plex, row.ratingKey, { signal: env.signal })
  if (!meta.ok) return { kind: "hold", code: meta.code === "HTTP" && meta.status === 404 ? "plexMissing" : "sourceFailed:plex" }
  const files = plexPartFiles(meta.data)
  return files.length > 0 && files.every((file) => isInside(file, record.path)) ? null : { kind: "rescue", reason: "recordChanged" }
}

/** One row 4 read: `yes` for a play after `since` (counted plays only with `counted`), `incomplete` after 8 full pages. */
async function playedSince(t: Endpoint, ratingKeys: HistoryKeyFilter, since: number, counted: boolean, env: PreDeleteEnv) {
  const sinceS = Math.floor(since / 1000)
  let hit = false
  const read = await forEachHistoryRow(t, { after: dayKey(since - DAY_MS, env.zone), ratingKeys }, (rows) => {
    hit = rows.some((r) => r.row_id === null || (r.stopped !== null && r.stopped >= sinceS &&
      (!counted || isCountedPlay({ playSeconds: r.play_duration, percentComplete: r.percent_complete }))))
    return !hit
  }, { signal: env.signal })
  return !read.ok ? "failed" : hit ? "yes" : read.data.complete ? "no" : "incomplete"
}

const HISTORY_COLUMN = { movie: "rating_key", show: "grandparent_rating_key", season: "parent_rating_key" } as const

/** Row 4: the item's own plays, then, for a season while G12 is on, the counted plays of its show. */
async function playCheck({ item, show }: PreDeleteInput, since: number, env: PreDeleteEnv): Promise<PreDeleteResult | null> {
  const t = env.services.tautulli
  if (!t) return null
  const own = await playedSince(t, { column: HISTORY_COLUMN[item.level], keys: item.copies.map((c) => c.ratingKey) }, since, false, env)
  if (own !== "no") return own === "yes" ? { kind: "rescue", reason: "played" } : { kind: "hold", code: own === "failed" ? "sourceFailed:tautulli" : "noValue:history" }
  if (item.level !== "season" || !env.options.protections.g12.enabled) return null
  if (!show) return { kind: "hold", code: "noValue:g12" }
  const shows = await playedSince(t, { column: "grandparent_rating_key", keys: show.copies.map((c) => c.ratingKey) }, since, true, env)
  if (shows === "no") return null
  return shows === "yes" ? { kind: "rescue", reason: "protected", detail: { protectionId: "g12" } }
    : { kind: "hold", code: shows === "failed" ? "sourceFailed:tautulli" : "noValue:g12" }
}

/** Row 5: a request after `since` for the item (TS 4.3). A request whose date does not parse counts as new. */
function requested({ item }: PreDeleteInput, since: number, requests: readonly SeerrRequest[]): boolean {
  return requests.some((r) => {
    if (r.status === DECLINED_STATUS || Date.parse(r.createdAt) <= since) return false
    if (item.level === "movie") return r.type === "movie" && r.media.tmdbId != null && r.media.tmdbId === item.ids.tmdb
    const title = r.type === "tv" && (r.media.tvdbId != null ? r.media.tvdbId === item.ids.tvdb : r.media.tmdbId != null && r.media.tmdbId === item.ids.tmdb)
    return title && (item.level === "show" || !r.seasons?.length || r.seasons.some((s) => s.seasonNumber === item.seasonNumber))
  })
}

/** Row 7: the copy, season and episode keys against what Plex plays now. A failed read defers too. */
async function playingCheck({ item }: PreDeleteInput, env: PreDeleteEnv): Promise<PreDeleteResult | null> {
  if (!env.services.plex) return { kind: "defer" }
  const playing = await readPlayingKeys(env.services.plex, { signal: env.signal })
  if (!playing.ok) return { kind: "defer" }
  return [...item.copies.map((c) => c.ratingKey), ...item.episodeKeys].some((key) => playing.data.has(key)) ? { kind: "defer" } : null
}

/** The seven checks in order (TS 8.8). */
export async function preDelete(input: PreDeleteInput, env: PreDeleteEnv): Promise<PreDeleteResult> {
  const { arr } = input
  const config = env.services[arr.service]
  const roots = env.prepared.roots[arr.service]
  if (!config || !roots) return { kind: "hold", code: `sourceFailed:${arr.service}` }
  const read = arr.service === "radarr" ? await getRadarrMovie(config, arr.id, { signal: env.signal }) : await getSonarrSeries(config, arr.id, { signal: env.signal })
  if (!read.ok) return read.code === "HTTP" && read.status === 404 ? { kind: "gone" } : { kind: "hold", code: `sourceFailed:${arr.service}`, ...refusedOf(arr.service, read) }
  const since = sinceOf(input.row, env.takenAt)
  const checked = recordCheck(input, read.data, roots) ?? (input.item.level === "movie" ? await plexCheck(input, read.data, env) : null)
    ?? (await playCheck(input, since, env)) ?? (requested(input, since, env.prepared.requests) ? { kind: "rescue", reason: "requested" } : null)
    ?? (await protectionCheck(input, read.data, env)) ?? (await playingCheck(input, env))
  return checked ?? { kind: "go", record: read.data }
}
