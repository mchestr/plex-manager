/**
 * Rewind's success measures for one year (design 1.4, P7.14), counted over
 * `RewindView` and `RewindShare`: who opened their Rewind, who reached the
 * centrefold, and who shared. The season dashboard (P7.8) shows them; P9.1
 * and the 2027-01-15 review read them.
 *
 * - **Opened**: members with at least one `RewindView` of their completed
 *   Rewind, out of members with one.
 * - **Reached the centrefold**: of the openers of a full edition, those
 *   with a view whose furthest page is at or past the centrefold's folio
 *   (numbered as the stage numbers it, minus `rewindDisabledPages`).
 * - **Shared**: openers with a share action of any kind, or a `RewindShare`.
 *
 * @module lib/wrapped/admin/measures
 */

import "server-only"

import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"

export interface RewindSuccessMeasures {
  /** Members with a completed Rewind of the year. */
  completed: number
  opened: number
  /** Openers whose Rewind is a full edition: the centrefold measure's base. */
  fullOpeners: number
  reachedCentrefold: number
  shared: number
}

const DisabledPagesSchema = z.array(z.string()).catch([])
const ShareCountsSchema = z.record(z.string(), z.number()).catch({})

const hasShareAction = (stored: unknown) => Object.values(ShareCountsSchema.parse(stored)).some((count) => count > 0)

/** The centrefold's 1-based folio in a stored v3 issue, or null when it has none. */
function centrefoldFolio(data: string, disabledPages: string[]): number | null {
  const parsed = parseStoredRewind(data)
  if (parsed.version !== 3) return null
  const pages = validatePagesOnRead(parsed.data.pages, { archetype: parsed.data.archetype?.id ?? null, disabledPages })
  const index = pages.findIndex((page) => page.type === "centrefold")
  return index === -1 ? null : index + 1
}

/** The measures for `year`; see the module comment. */
export async function getRewindSuccessMeasures(year: number): Promise<RewindSuccessMeasures> {
  const rows = await prisma.plexWrapped.findMany({ where: { year, status: "completed" }, select: { id: true, edition: true } })
  const ids = rows.map((row) => row.id)
  const [views, shares, config] = await Promise.all([
    prisma.rewindView.findMany({ where: { wrappedId: { in: ids } }, select: { wrappedId: true, furthestPage: true, shareActions: true } }),
    prisma.rewindShare.findMany({ where: { wrappedId: { in: ids } }, select: { wrappedId: true }, distinct: ["wrappedId"] }),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])

  const furthest = new Map<string, number>()
  const sharedIds = new Set(shares.map((share) => share.wrappedId))
  for (const view of views) {
    furthest.set(view.wrappedId, Math.max(furthest.get(view.wrappedId) ?? 0, view.furthestPage))
    if (hasShareAction(view.shareActions)) sharedIds.add(view.wrappedId)
  }

  const fullOpened = rows.filter((row) => row.edition === "full" && furthest.has(row.id)).map((row) => row.id)
  const stored = await prisma.plexWrapped.findMany({ where: { id: { in: fullOpened } }, select: { id: true, data: true } })
  const disabledPages = DisabledPagesSchema.parse(config?.rewindDisabledPages ?? [])
  const reachedCentrefold = stored.filter((row) => {
    const folio = centrefoldFolio(row.data, disabledPages)
    return folio !== null && (furthest.get(row.id) ?? 0) >= folio
  }).length

  return {
    completed: rows.length,
    opened: furthest.size,
    fullOpeners: fullOpened.length,
    reachedCentrefold,
    shared: [...sharedIds].filter((id) => furthest.has(id)).length,
  }
}
