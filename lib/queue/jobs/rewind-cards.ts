/**
 * The share-card jobs on `rewind-aux` (design 6.4, P5.10).
 *
 * - `REWIND_CARD_PREWARM` renders the cover, centrefold and back cover of a
 *   completed Rewind with the member's saved `RewindPrefs` options, so the
 *   share sheet's first preview is a cache hit. `afterRewindCompleted()`
 *   enqueues it with the dedup id `rewind:cards:{wrappedId}:{factsHash}`.
 *   Pages without a card yet are skipped.
 * - `REWIND_CARD_SWEEP` runs daily and deletes cached cards unused for 30 days.
 *
 * @module lib/queue/jobs/rewind-cards
 */

import type { Job } from "bullmq"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindCardPrewarmPayload } from "@/lib/queue/types"
import { cardCacheKey, readCachedCard, sweepCards, writeCachedCard } from "@/lib/rewind/cards/cache"
import { hasCard } from "@/lib/rewind/cards/index"
import { renderCardPng } from "@/lib/rewind/cards/render"
import { completedV3, projectCard } from "@/lib/rewind/cards/serve"
import { createLogger } from "@/lib/utils/logger"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { CardFactIdSchema, type SharePageType } from "@/lib/wrapped/data/share-safe-schema"
import { onRewindCompleted, type CompletedRewind } from "@/lib/wrapped/pipeline/after-complete"

const logger = createLogger("REWIND_CARD_JOBS")

const PREWARM_PAGES: readonly SharePageType[] = ["cover", "centrefold", "back-cover"]
const SavedCardFacts = z.array(CardFactIdSchema).max(3).catch([])

/** Renders the prewarm cards that are not cached yet; returns how many it drew. */
export async function processRewindCardPrewarm(job: Job<RewindCardPrewarmPayload>): Promise<{ rendered: number }> {
  const row = await prisma.plexWrapped.findUnique({
    where: { id: job.data.wrappedId },
    select: { id: true, userId: true, year: true, status: true, data: true },
  })
  const rewind = row && completedV3(row)
  if (!row || !rewind) return { rendered: 0 }

  const stored = new Set(rewind.pages.map((page) => page.type))
  const pages = PREWARM_PAGES.filter((page) => stored.has(page) && hasCard(page))
  if (pages.length === 0) return { rendered: 0 }

  const [prefs, ctx] = await Promise.all([
    prisma.rewindPrefs.findUnique({
      where: { userId_year: { userId: row.userId, year: row.year } },
      select: { signed: true, includeArt: true, dailyDetail: true, cardFacts: true },
    }),
    loadShareContext(row),
  ])
  const options = {
    pages,
    signed: prefs?.signed ?? false,
    includeArt: prefs?.includeArt ?? false,
    dailyDetail: prefs?.dailyDetail ?? false,
    cardFacts: SavedCardFacts.parse(prefs?.cardFacts ?? []),
  }

  let rendered = 0
  for (const page of pages) {
    const input = projectCard({ rewind, options, ctx, page, size: "story" })
    if (!input) continue
    const key = cardCacheKey(input)
    if (await readCachedCard(key)) continue
    const png = await renderCardPng(input)
    if (!png) continue
    await writeCachedCard(key, png)
    rendered++
  }
  return { rendered }
}

/** Deletes cards unused for 30 days. */
export async function processRewindCardSweep(): Promise<{ removed: number }> {
  return { removed: await sweepCards() }
}

/** Enqueues the prewarm for a Rewind that just completed; one job per facts version. */
async function enqueueCardPrewarm(rewind: CompletedRewind): Promise<void> {
  await getRewindQueue("rewind-aux").add(
    JOB_TYPES.REWIND_CARD_PREWARM,
    { wrappedId: rewind.wrappedId },
    { attempts: 2, deduplication: { id: `rewind:cards:${rewind.wrappedId}:${rewind.factsHash}` } }
  )
}

const DAY_MS = 86_400_000

/** Registers the prewarm hook and schedules the daily sweep; the Rewind Workers call it once. */
export function registerCardJobs(): void {
  onRewindCompleted("card-prewarm", enqueueCardPrewarm)
  getRewindQueue("rewind-aux")
    .upsertJobScheduler("rewind-card-sweep", { every: DAY_MS }, { name: JOB_TYPES.REWIND_CARD_SWEEP, data: {}, opts: { attempts: 1 } })
    .catch((error: unknown) => logger.error("Could not schedule the Rewind card sweep", error))
}
