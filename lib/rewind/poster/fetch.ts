/**
 * One poster from the Plex photo transcoder at a served width, for the
 * poster route and the share cards' art. The Plex token stays on the server.
 *
 * @module lib/rewind/poster/fetch
 */

import "server-only"

import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_POSTER_FETCH")

export interface PosterServer {
  url: string
  token: string
}

export type PosterFetch = { status: "ok"; body: Buffer } | { status: "missing" } | { status: "failed" }

/** The poster at width `w` (height 1.5 w); the timeout covers reading the image. */
export async function fetchPlexPoster(server: PosterServer, ratingKey: string, w: number, timeoutMs: number): Promise<PosterFetch> {
  const transcodeUrl = new URL("/photo/:/transcode", server.url)
  transcodeUrl.searchParams.set("width", String(w))
  transcodeUrl.searchParams.set("height", String(Math.round(w * 1.5)))
  transcodeUrl.searchParams.set("minSize", "1")
  transcodeUrl.searchParams.set("upscale", "1")
  transcodeUrl.searchParams.set("url", `/library/metadata/${ratingKey}/thumb`)

  try {
    const upstream = await fetchWithTimeout(transcodeUrl.toString(), {
      headers: { "X-Plex-Token": server.token },
      timeoutMs,
      timeoutCoversBody: true,
    })
    if (!upstream.ok) {
      logger.debug("Plex could not produce the poster", { ratingKey, status: upstream.status })
      return { status: "missing" }
    }
    return { status: "ok", body: Buffer.from(await upstream.arrayBuffer()) }
  } catch (error) {
    logger.debug("Poster request to Plex failed", { ratingKey, error: error instanceof Error ? error.name : String(error) })
    return { status: "failed" }
  }
}
