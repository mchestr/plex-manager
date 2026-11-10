import "server-only"

import { z } from "zod"

import {
  arrDiskSchema,
  arrImportListSchema,
  arrRootFolderSchema,
  arrTagSchema,
  sonarrEpisodeFileSchema,
  sonarrEpisodeSchema,
  sonarrSeriesFullSchema,
  sonarrSeriesSchema,
  type ArrDisk,
  type ArrTag,
  type SonarrEpisode,
  type SonarrEpisodeFile,
  type SonarrSeries,
  type SonarrSeriesFull,
} from "@/lib/cleanup/schema/upstream"
import type { CleanupReadOptions } from "@/lib/cleanup/snapshot/rows"
import type { ServiceResult } from "@/lib/connections/http"

import {
  ARR_LIST_TIMEOUT_MS,
  ARR_TIMEOUT_MS,
  arrRead,
  arrReadRows,
  INVALID_ID,
  isArrId,
  type ArrReadConfig,
  type ArrReadResult,
} from "./radarr-library"

/**
 * The Sonarr reads of media cleanup (TS 7.2.2 S1 to S5, A2, TS 8.8 rows 1
 * and 2, and the reads of the TS 8.9 actions), on the v3 helpers of
 * `./radarr-library`.
 *
 * - `getSonarrSeries` parses `GET /api/v3/series/{id}` with
 *   `sonarrSeriesSchema`: the ids and the season statistics that pre-delete
 *   rows 1 and 2 compare. A season whose `statistics` is null parses, and
 *   `sonarrFileCount()` counts it as 0 (integrations-r3-4).
 * - `getSonarrSeriesFull` keeps every field, for the series `PUT` (TS 8.9).
 * - The episode and episode file lists of an action parse whole: one bad row
 *   fails the call, so no file or monitored episode is ever left out.
 * - The episode file list waits 60 s, the timeout of the TS 8.9 calls.
 *   `opts.timeoutMs` and `opts.attempts` override any default.
 *
 * @module lib/connections/sonarr-library
 */

const EPISODE_FILES_TIMEOUT_MS = 60_000

function isSeasonNumber(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0
}

/** S2: every series. */
export function listSonarrSeries(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ArrReadResult<SonarrSeries[]>> {
  return arrReadRows("Sonarr", config, "/api/v3/series", sonarrSeriesSchema, ARR_LIST_TIMEOUT_MS, opts)
}

/** TS 8.8 rows 1 and 2: one series again, with its season statistics. */
export async function getSonarrSeries(config: ArrReadConfig, id: number, opts: CleanupReadOptions = {}): Promise<ArrReadResult<SonarrSeries>> {
  if (!isArrId(id)) return INVALID_ID
  return arrRead("Sonarr", config, `/api/v3/series/${id}`, sonarrSeriesSchema, ARR_TIMEOUT_MS, opts)
}

/** TS 8.9: one series with every field it has, for the `PUT` that sends it back. */
export async function getSonarrSeriesFull(
  config: ArrReadConfig,
  id: number,
  opts: CleanupReadOptions = {}
): Promise<ArrReadResult<SonarrSeriesFull>> {
  if (!isArrId(id)) return INVALID_ID
  return arrRead("Sonarr", config, `/api/v3/series/${id}`, sonarrSeriesFullSchema, ARR_TIMEOUT_MS, opts)
}

/** TS 8.9: every episode file of a series (Sonarr needs the `seriesId`). */
export async function listSonarrEpisodeFiles(
  config: ArrReadConfig,
  seriesId: number,
  opts: CleanupReadOptions = {}
): Promise<ArrReadResult<SonarrEpisodeFile[]>> {
  if (!isArrId(seriesId)) return INVALID_ID
  const path = `/api/v3/episodefile?seriesId=${seriesId}`
  return arrRead("Sonarr", config, path, z.array(sonarrEpisodeFileSchema), EPISODE_FILES_TIMEOUT_MS, opts)
}

/** A2: the episodes of one season, with their monitored flags. */
export async function listSonarrEpisodes(
  config: ArrReadConfig,
  seriesId: number,
  seasonNumber: number,
  opts: CleanupReadOptions = {}
): Promise<ArrReadResult<SonarrEpisode[]>> {
  if (!isArrId(seriesId) || !isSeasonNumber(seasonNumber)) return INVALID_ID
  const path = `/api/v3/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`
  return arrRead("Sonarr", config, path, z.array(sonarrEpisodeSchema), ARR_TIMEOUT_MS, opts)
}

/** S3: the tags, for the label map. */
export function listSonarrTags(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<ArrTag[]>> {
  return arrRead("Sonarr", config, "/api/v3/tag", arrTagSchema, ARR_TIMEOUT_MS, opts)
}

/** S4: the import lists, for the import-list tag set. */
export function listSonarrImportLists(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<{ tags: number[] }[]>> {
  return arrRead("Sonarr", config, "/api/v3/importlist", arrImportListSchema, ARR_TIMEOUT_MS, opts)
}

/** S1: the root folders, for the path fence. */
export function listSonarrRootFolders(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<{ path: string }[]>> {
  return arrRead("Sonarr", config, "/api/v3/rootfolder", arrRootFolderSchema, ARR_TIMEOUT_MS, opts)
}

/** S5: free and total space of each disk. */
export function getSonarrDisk(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<ArrDisk[]>> {
  return arrRead("Sonarr", config, "/api/v3/diskspace", arrDiskSchema, ARR_TIMEOUT_MS, opts)
}
