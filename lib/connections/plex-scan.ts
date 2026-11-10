import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The folder scan after a deletion (TS 8.11 item 1): Plex scans one folder of
 * a section, so the deleted title leaves the library without a full scan.
 *
 * The call is sent once (never through the retry helper). The caller only
 * logs a failure. This module never empties the Plex trash and never deletes
 * Plex media.
 *
 * @module lib/connections/plex-scan
 */

interface PlexScanConfig {
  url: string
  token: string
}

/** A transport failure, `INVALID_KEY` for a section id that is not a number, or `INVALID_PATH` for an empty folder. */
type PlexScanResult = ServiceResult<null, ServiceErrorCode | "INVALID_KEY" | "INVALID_PATH">

const PLEX_KEY = /^\d+$/
const PLEX_SCAN_TIMEOUT_MS = 15_000

/**
 * Scan one folder of a section: `GET /library/sections/{sectionId}/refresh?path={folder}`,
 * as python-plexapi `LibrarySection.update(path)` and Maintainerr `scanFolder`
 * send it. Plex's API page lists `POST` for this route, so an answer of 405
 * sends `POST` once.
 *
 * @param folder - The movie or series folder (its arr `path`). An empty folder is refused: without
 *   `path`, Plex scans the whole section.
 */
export async function refreshPlexPath(
  config: PlexScanConfig,
  sectionId: string,
  folder: string,
  options: { signal?: AbortSignal } = {}
): Promise<PlexScanResult> {
  if (!PLEX_KEY.test(sectionId)) return { ok: false, code: "INVALID_KEY" }
  if (!folder.trim()) return { ok: false, code: "INVALID_PATH" }

  const scan = (method: "GET" | "POST") =>
    serviceFetch({
      service: "Plex",
      url: `${config.url}/library/sections/${sectionId}/refresh?path=${encodeURIComponent(folder)}`,
      method,
      headers: { "X-Plex-Token": config.token },
      responseType: "text",
      schema: z.string(),
      timeoutMs: PLEX_SCAN_TIMEOUT_MS,
      signal: options.signal,
    })

  let result = await scan("GET")
  if (!result.ok && result.code === "HTTP" && result.status === 405) result = await scan("POST")
  return result.ok ? { ok: true, data: null } : result
}
