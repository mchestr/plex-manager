/**
 * The server's time zone, for the app and for Rewind.
 *
 * `Config.timezone` (set in the admin settings), else the `TZ` environment
 * variable when it names a zone `normalizeTimeZone` accepts, else UTC. The
 * design puts this in `lib/utils/format.ts`, but that module stays
 * client-safe, so server formatters import it from here.
 *
 * @module lib/utils/server-zone
 */

import "server-only"

import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

/** The server zone, read once per request. */
export const serverZone = cache(async (): Promise<string> => {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { timezone: true },
  })
  return normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
})
