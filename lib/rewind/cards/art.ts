/**
 * The poster art a card draws (design 6.4): the published rating keys' posters
 * from the poster disk cache, else from Plex, as PNG data URIs (Satori draws
 * PNG and JPEG, not the cache's WebP). A poster that cannot be had is null,
 * and the card draws an empty slot in its place.
 *
 * Only keys the projection published reach here, so the share's art rules
 * (the member's switch, the admin flag, hidden titles) already hold.
 *
 * @module lib/rewind/cards/art
 */

import "server-only"

import sharp from "sharp"

import { prisma } from "@/lib/prisma"
import { posterCachePath, readCachedPoster, writeCachedPoster } from "@/lib/rewind/poster/disk-cache"
import { fetchPlexPoster } from "@/lib/rewind/poster/fetch"
import { renderPoster } from "@/lib/rewind/poster/image"
import { createLogger } from "@/lib/utils/logger"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import type { CardAssets } from "./parts"

const logger = createLogger("REWIND_CARD_ART")

const WIDTH = 240
const TIMEOUT_MS = 3000

async function posterWebp(server: { url: string; token: string } | null, ratingKey: string): Promise<Buffer | null> {
  const file = posterCachePath(ratingKey, "none", WIDTH)
  const cached = await readCachedPoster(file)
  if (cached) return cached
  if (!server) return null
  const poster = await fetchPlexPoster(server, ratingKey, WIDTH, TIMEOUT_MS)
  if (poster.status !== "ok") return null
  const body = await renderPoster(poster.body, { w: WIDTH, tone: null, clash: null })
  await writeCachedPoster(file, body)
  return body
}

/** Each published poster as a PNG data URI, or null where it is missing. */
export async function loadCardArt(art: CardInput["art"]): Promise<CardAssets> {
  if (!art || art.length === 0) return { art: [] }
  const server = await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true, token: true } })
  const images = await Promise.all(
    art.map(async ({ ratingKey }) => {
      try {
        const webp = await posterWebp(server, ratingKey)
        if (!webp) return null
        const png = await sharp(webp).png().toBuffer()
        return `data:image/png;base64,${png.toString("base64")}`
      } catch (error) {
        logger.debug("Card poster unavailable", { ratingKey, error: error instanceof Error ? error.name : String(error) })
        return null
      }
    })
  )
  return { art: images }
}
