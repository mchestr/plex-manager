/**
 * The Rewind poster disk cache (design 5.8): every served poster is kept at
 * `${REWIND_CACHE_DIR}/posters/{ratingKey}-{tone}-{w}.webp`, so a repeat
 * request costs one file read and no Plex call. Writes go to a temporary
 * file and are renamed into place, so a reader never sees half a poster. A
 * read-only or full disk only costs the cache: errors are logged and the
 * poster is still served.
 *
 * @module lib/rewind/poster/disk-cache
 */

import "server-only"

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("rewind-poster-cache")

/** The cache file of one variant. `tone` is the route's `tone` value, plus `~<clash>` for hero slots. */
export function posterCachePath(ratingKey: string, tone: string, w: number): string {
  return path.join(getEnv().REWIND_CACHE_DIR, "posters", `${ratingKey}-${tone}-${w}.webp`)
}

export async function readCachedPoster(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file)
  } catch {
    return null
  }
}

export async function writeCachedPoster(file: string, body: Buffer): Promise<void> {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temp, body)
    await rename(temp, file)
  } catch (error) {
    logger.warn("Could not cache a poster", { file, error: error instanceof Error ? error.name : String(error) })
  }
}
