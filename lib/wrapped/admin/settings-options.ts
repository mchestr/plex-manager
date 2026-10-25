/**
 * What the Rewind settings section (P7.12) offers and checks against: the Plex
 * libraries Tautulli lists, the content ratings the metadata cache has seen,
 * and the season's LLM spend so far.
 *
 * @module lib/wrapped/admin/settings-options
 */

import "server-only"

import { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { tautulliLibrarySchema } from "@/lib/wrapped/sources/schemas"
import { getActiveService } from "@/lib/data/active-service"

interface RewindLibraryOption {
  id: string
  name: string
}

export type RewindLibraries =
  | { status: "connected"; libraries: RewindLibraryOption[] }
  | { status: "not-configured" | "unreachable"; libraries: null }

const librariesSchema = z.union([
  z.array(tautulliLibrarySchema),
  z.looseObject({ data: z.array(tautulliLibrarySchema) }).transform((page) => page.data),
])

/** The Plex sections from Tautulli `get_libraries`, or why there are none. */
export async function getRewindLibraries(): Promise<RewindLibraries> {
  const tautulli = await getActiveService("tautulli")
  if (!tautulli) return { status: "not-configured", libraries: null }
  const result = await tautulliCommand(tautulli, "get_libraries", {}, librariesSchema, { attempts: 1, timeoutMs: 5000 })
  if (!result.ok) return { status: "unreachable", libraries: null }
  const libraries = result.data
    .map((row) => ({ id: row.section_id, name: row.section_name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { status: "connected", libraries }
}

/** The distinct `MediaMetadataCache.contentRating` values, sorted. */
export async function getRewindContentRatings(): Promise<string[]> {
  const rows = await prisma.mediaMetadataCache.findMany({
    where: { contentRating: { not: null } },
    distinct: ["contentRating"],
    select: { contentRating: true },
  })
  return rows.flatMap((row) => (row.contentRating?.trim() ? [row.contentRating.trim()] : [])).sort()
}
