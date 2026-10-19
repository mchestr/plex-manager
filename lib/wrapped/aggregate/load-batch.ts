/**
 * The I/O half of the server aggregate: what a batch reads before
 * `computeServerYear` runs. Every upstream call goes through `ctx.limiter`.
 *
 * @module lib/wrapped/aggregate/load-batch
 */

import "server-only"

import { UnrecoverableError } from "bullmq"
import { z } from "zod"

import { matchTautulliUser, tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"
import { fetchSectionItems, listSections, type LibraryItem, type PlexEndpoint } from "@/lib/wrapped/sources/plex-library"
import { parseRows, tooManyInvalid, type RowTally } from "@/lib/wrapped/sources/rows"
import {
  excludedContentRatingsSchema,
  excludedSectionIdsSchema,
  tautulliUserSchema,
} from "@/lib/wrapped/sources/schemas"
import { runLimited, type SourceContext } from "@/lib/wrapped/sources/watch-history-source"
import { resolveZone } from "@/lib/wrapped/time/zone"

import type { AggregateMember } from "./server-year"

/** The services, settings and members one batch reads. */
export interface BatchSetup {
  tautulli: { url: string; apiKey: string }
  overseerr: { url: string; apiKey: string } | null
  plex: PlexEndpoint
  serverZone: string
  excludedSectionIds: string[]
  excludedContentRatings: string[]
  /** Members with a Plex identity, before matching to Tautulli. */
  users: Array<{ userId: string; plexUserId: string; zone: string }>
}

/** Loads the batch's configuration. Missing Tautulli or Plex is unrecoverable: retrying cannot help. */
export async function loadBatchSetup(): Promise<BatchSetup> {
  const [config, tautulli, overseerr, plex, zone, users] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { rewindExcludedSectionIds: true, rewindExcludedContentRatings: true },
    }),
    prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true, token: true } }),
    serverZone(),
    prisma.user.findMany({ where: { plexUserId: { not: null } }, select: { id: true, plexUserId: true, timezone: true } }),
  ])
  if (!tautulli) throw new UnrecoverableError("Tautulli is not configured")
  if (!plex) throw new UnrecoverableError("Plex is not configured")

  return {
    tautulli,
    overseerr,
    plex,
    serverZone: zone,
    excludedSectionIds: excludedSectionIdsSchema.parse(config?.rewindExcludedSectionIds ?? null),
    excludedContentRatings: excludedContentRatingsSchema.parse(config?.rewindExcludedContentRatings ?? null),
    users: users.flatMap((u) =>
      u.plexUserId ? [{ userId: u.id, plexUserId: u.plexUserId, zone: resolveZone(u, zone).zone }] : []
    ),
  }
}

/**
 * Matches members to Tautulli users with P0.9's matcher (`user_id` is the
 * plex.tv account ID); members without a match are left out.
 *
 * @throws Error when `get_users` fails, so the job is retried
 */
export async function matchMembers(setup: BatchSetup, ctx: SourceContext): Promise<AggregateMember[]> {
  const result = await runLimited(ctx, "tautulli", () =>
    tautulliCommand(setup.tautulli, "get_users", {}, z.array(z.unknown()), { signal: ctx.signal })
  )
  if (!result.ok) throw new Error(`Tautulli get_users failed: ${result.code}`)
  const tally: RowTally = { read: 0, dropped: 0 }
  const rows = parseRows("tautulli get_users", tautulliUserSchema, result.data, tally)
  if (tooManyInvalid(tally)) throw new Error("Tautulli get_users rows failed validation")

  return setup.users.flatMap((user) => {
    const row = matchTautulliUser(rows, { plexUserId: user.plexUserId })
    return row ? [{ userId: user.userId, tautulliUserId: String(row.user_id), zone: user.zone }] : []
  })
}

/**
 * Every film and series in the film and TV sections the admin has not
 * excluded: one listing per batch, never per member.
 *
 * @throws Error when Plex fails, so the job is retried
 */
export async function readLibrary(setup: BatchSetup, ctx: SourceContext): Promise<LibraryItem[]> {
  const sections = await listSections(setup.plex, ctx)
  if (!sections.ok) throw new Error(`Plex section listing failed: ${sections.code}`)
  const excluded = new Set(setup.excludedSectionIds)
  const items: LibraryItem[] = []
  for (const section of sections.data) {
    if ((section.type !== "movie" && section.type !== "show") || excluded.has(section.key)) continue
    const page = await fetchSectionItems(setup.plex, section.key, ctx)
    if (!page.ok) throw new Error(`Plex section ${section.key} failed: ${page.code}`)
    items.push(...page.data)
  }
  return items
}
