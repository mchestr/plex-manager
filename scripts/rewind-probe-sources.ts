#!/usr/bin/env tsx
/**
 * Read one member's Rewind sources and print counts (P2.4). Dev-only and
 * read-only: it never writes, and never prints a title, a name or a key.
 *
 * Usage (from a checkout; the sources are server-only modules):
 *   npm run rewind:probe-sources -- --user <User.id> --year 2026 [--final-cut] [--server] [--library]
 *
 * It prints the Tautulli pages read, the plays kept, the counted plays and
 * the minutes for the member's data window in their Rewind zone, which should
 * match Tautulli's own user stats for the same dates to within a minute; then
 * lifetime plays, and the member's Overseerr requests. `--server` adds the
 * server-wide history and request passes, `--library` the Plex sections.
 * Rows that fail their schema are logged as warnings with field paths only.
 */

import "dotenv/config"

import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"
import { fetchMemberRequests, fetchServerRequests, findOverseerrUser } from "@/lib/wrapped/sources/overseerr-requests"
import { fetchSectionItems, listSections } from "@/lib/wrapped/sources/plex-library"
import { excludedSectionIdsSchema } from "@/lib/wrapped/sources/schemas"
import { createTautulliHistorySource } from "@/lib/wrapped/sources/tautulli-history"
import {
  isCountedPlay,
  type PlayEvent,
  type SourceContext,
  type SourceResult,
  type UpstreamLimiter,
  type UpstreamService,
} from "@/lib/wrapped/sources/watch-history-source"
import { dataWindow, resolveZone } from "@/lib/wrapped/time/zone"

const calls: Record<UpstreamService, number> = { tautulli: 0, overseerr: 0, plex: 0 }
const countingLimiter: UpstreamLimiter = {
  run: (service, fn) => {
    calls[service]++
    return fn()
  },
}
const ctx: SourceContext = { limiter: countingLimiter }

function unwrap<T>(label: string, result: SourceResult<T>): T | null {
  if (result.ok) return result.data
  console.log(`${label}: failed (${result.code}${result.status ? ` ${result.status}` : ""})`)
  return null
}

function describePlays(label: string, plays: PlayEvent[] | null) {
  if (!plays) return
  const minutes = Math.floor(plays.reduce((sum, e) => sum + e.playSeconds, 0) / 60)
  console.log(`${label}: ${plays.length} plays kept, ${plays.filter(isCountedPlay).length} counted, ${minutes} minutes`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: "string" },
      year: { type: "string" },
      "final-cut": { type: "boolean", default: false },
      server: { type: "boolean", default: false },
      library: { type: "boolean", default: false },
    },
  })
  const year = Number(values.year)
  if (!values.user || !Number.isInteger(year)) throw new Error("Usage: --user <User.id> --year <YYYY>")

  const user = await prisma.user.findUnique({ where: { id: values.user }, select: { plexUserId: true, timezone: true } })
  if (!user?.plexUserId) throw new Error("No such user, or the user has no Plex identity")
  const member = { plexUserId: user.plexUserId }
  const [config, tautulli, overseerr, plex] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindExcludedSectionIds: true } }),
    prisma.tautulli.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { url: true, apiKey: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { url: true, apiKey: true } }),
    prisma.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { url: true, token: true } }),
  ])

  const { zone, source } = resolveZone(user, await serverZone())
  const window = dataWindow(year, zone, { finalCut: values["final-cut"] })
  console.log(`Window: ${new Date(window.start).toISOString()} to ${new Date(window.end).toISOString()} (${zone}, ${source} zone)`)

  if (tautulli) {
    const excludedSectionIds = excludedSectionIdsSchema.parse(config?.rewindExcludedSectionIds ?? null)
    const history = createTautulliHistorySource({ config: tautulli, excludedSectionIds })
    describePlays("Year", unwrap("Year", await history.fetchYear(member, window, ctx)))
    console.log(`  Tautulli pages: ${calls.tautulli}, excluded sections: ${excludedSectionIds.length}`)
    describePlays("Lifetime", unwrap("Lifetime", await history.fetchLifetime(member, ctx)))
    if (values.server) {
      const byUser = unwrap("Server year", await history.fetchServerYear(window, ctx))
      if (byUser) {
        describePlays("Server year", [...byUser.values()].flat())
        console.log(`  Tautulli users with plays: ${byUser.size}`)
      }
    }
  } else console.log("Tautulli: not configured")

  if (overseerr) {
    const overseerrUserId = unwrap("Overseerr user", await findOverseerrUser(overseerr, member.plexUserId, ctx))
    if (overseerrUserId === null) console.log("Overseerr user: no match by plexId")
    else {
      const requests = unwrap("Requests", await fetchMemberRequests(overseerr, overseerrUserId, window, new Map(), ctx))
      if (requests) {
        const approved = requests.filter((r) => r.approved).length
        const available = requests.filter((r) => r.available).length
        console.log(`Requests: ${requests.length}, approved ${approved}, available ${available}`)
      }
    }
    if (values.server) {
      const all = unwrap("Server requests", await fetchServerRequests(overseerr, window, ctx))
      if (all) console.log(`Server requests: ${all.length}`)
    }
  } else console.log("Overseerr: not configured")

  if (values.library && plex) {
    const sections = unwrap("Plex sections", await listSections(plex, ctx)) ?? []
    for (const section of sections) {
      const items = unwrap(`Section ${section.key}`, await fetchSectionItems(plex, section.key, ctx))
      if (items) console.log(`Section ${section.key} (${section.type}): ${items.length} items, ${items.filter((i) => i.contentRating).length} rated`)
    }
  }
  console.log(`Upstream calls: tautulli ${calls.tautulli}, overseerr ${calls.overseerr}, plex ${calls.plex}`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
