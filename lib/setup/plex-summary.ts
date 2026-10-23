/**
 * The setup rail's confirmation once Plex is connected (P10.25, design 6.5):
 * the server's name, its library and title counts, and six of its newest
 * titles. The poster route needs a session, so the titles show as
 * poster-palette title cards. A server that does not answer within 3 s still
 * shows its name.
 *
 * @module lib/setup/plex-summary
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { getPlexSectionRecent } from "@/lib/connections/plex-sessions"
import { prisma } from "@/lib/prisma"

const TIMEOUT_MS = 3000
const TITLES = 6

const sectionsSchema = z.object({
  MediaContainer: z.looseObject({
    Directory: z.array(z.looseObject({ key: z.string(), type: z.string() })).optional(),
  }),
})

export interface SetupPlexSummary {
  name: string
  /** Null when the server did not answer. */
  libraries: number | null
  titles: number | null
  /** Up to six titles, newest first. */
  recent: Array<{ key: string; title: string }>
}

/** The active Plex server's summary, or null before one is saved. */
export async function getSetupPlexSummary(): Promise<SetupPlexSummary | null> {
  const server = await prisma.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
  if (!server) return null
  const config = { url: server.url, token: server.token }
  const empty = { name: server.name, libraries: null, titles: null, recent: [] }

  const sections = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/sections`,
    headers: { "X-Plex-Token": server.token },
    schema: sectionsSchema,
    timeoutMs: TIMEOUT_MS,
  })
  if (!sections.ok) return empty

  const directories = sections.data.MediaContainer.Directory ?? []
  const media = directories.filter((section) => section.type === "movie" || section.type === "show")
  const pages = await Promise.all(
    media.map((section) =>
      getPlexSectionRecent(config, section.key, { type: section.type === "movie" ? "movie" : "show", size: TITLES, timeoutMs: TIMEOUT_MS })
    )
  )
  const loaded = pages.flatMap((page) => (page.ok ? [page.data] : []))
  const recent = loaded
    .flatMap((page) => page.items)
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, TITLES)
    .map((item) => ({ key: item.ratingKey, title: item.title }))

  return {
    name: server.name,
    libraries: directories.length,
    titles: loaded.length === media.length ? loaded.reduce((sum, page) => sum + (page.totalSize ?? page.items.length), 0) : null,
    recent,
  }
}
