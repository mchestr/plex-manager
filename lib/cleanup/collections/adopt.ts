/**
 * TS 8.10 steps 4.2 and 4.3: find this section's Leaving soon collection by
 * its exact title, adopt it, or make a new one. Server-only.
 *
 * 1. A found collection (not smart) is adoptable when it is empty, or when
 *    every member is the rating key of a `CleanupItem` or `CleanupOutcome`
 *    (a crash between the create and the runtime write). A collection with
 *    any other member is never adopted: it logs
 *    `cleanup.collection_title_taken`.
 * 2. Two or more adoptable ones: adopt the lowest rating key, and delete the
 *    others through `deletePlexCollectionGuarded` (step 3.1).
 * 3. Nothing to adopt: create one, empty, with the level's title.
 * 4. After a create or an adoption: set the locked summary and the custom
 *    order (an adopted collection can predate them), and mark a
 *    `collectionRemoved` notice of this key as made again.
 *
 * @module lib/cleanup/collections/adopt
 */

import "server-only"

import { failStep, failWith, logger, type SyncContext } from "@/lib/cleanup/collections/context"
import { pickAdoption } from "@/lib/cleanup/collections/plan"
import { COLLECTION_TITLES } from "@/lib/cleanup/constants"
import {
  createPlexCollection,
  deletePlexCollectionGuarded,
  setPlexCollectionCustomOrder,
  setPlexCollectionSummary,
} from "@/lib/connections/plex-collections"
import { listPlexCollectionItems, listPlexCollections } from "@/lib/connections/plex-library-read"
import { prisma } from "@/lib/prisma"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The collection a round works on, with its members when they were read here. */
export interface FoundCollection {
  ratingKey: string
  title: string
  createdAt: string
  /** The member rating keys in collection order, or null when not read yet. */
  members: string[] | null
}

/** Whether every key is the rating key of an item or an outcome of media cleanup. */
async function ownsAll(keys: readonly string[]): Promise<boolean> {
  if (keys.length === 0) return true
  const where = { ratingKey: { in: [...keys] } }
  const [items, outcomes] = await Promise.all([
    prisma.cleanupItem.findMany({ where, select: { ratingKey: true } }),
    prisma.cleanupOutcome.findMany({ where, select: { ratingKey: true } }),
  ])
  const known = new Set([...items, ...outcomes].map((row) => row.ratingKey))
  return keys.every((key) => known.has(key))
}

/** Step 4.3 for a collection this round now uses. */
async function dress(ctx: SyncContext, key: string, sectionId: string, ratingKey: string): Promise<void> {
  const opts = { signal: ctx.signal }
  if (ctx.summary !== null) {
    const summary = await setPlexCollectionSummary(ctx.plex, { sectionId, ratingKey, summary: ctx.summary }, opts)
    if (!summary.ok) failStep(ctx, key, "summary", summary.code)
  }
  const order = await setPlexCollectionCustomOrder(ctx.plex, ratingKey, opts)
  if (!order.ok) failStep(ctx, key, "order", order.code)
  const now = new Date().toISOString()
  let recreated = false
  ctx.notices = ctx.notices.map((notice) => {
    if (notice.key !== key || notice.recreatedAt !== null) return notice
    recreated = true
    return { ...notice, recreatedAt: now }
  })
  if (recreated) ctx.counts.recreated++
}

/** The adoptable collections with this title in the section, with their members. Null when a read failed. */
async function adoptable(ctx: SyncContext, key: string, sectionId: string, title: string) {
  const listed = await listPlexCollections(ctx.plex, sectionId, { signal: ctx.signal })
  if (!listed.ok) return failWith(ctx, key, "list", listed.code, null)
  const found: { ratingKey: string; members: string[] }[] = []
  for (const row of listed.data.filter((c) => c.title === title && c.smart !== true && c.smart !== 1)) {
    const read = await listPlexCollectionItems(ctx.plex, row.ratingKey, { signal: ctx.signal })
    if (!read.ok) return failWith(ctx, key, "members", read.code, null)
    const members = read.data.map((item) => item.ratingKey)
    if (await ownsAll(members)) found.push({ ratingKey: row.ratingKey, members })
    else logger.warn("cleanup.collection_title_taken", { key, ratingKey: row.ratingKey })
  }
  return found
}

/** Steps 4.2 and 4.3: the adopted or new collection of `key`, or null when a call failed. */
export async function adoptOrCreate(ctx: SyncContext, key: string, sectionId: string, level: Level): Promise<FoundCollection | null> {
  const title = COLLECTION_TITLES[level]
  const found = await adoptable(ctx, key, sectionId, title)
  if (found === null) return null
  const { adopt, extra } = pickAdoption(found)
  for (const other of extra) {
    const removed = await deletePlexCollectionGuarded(ctx.plex, { ratingKey: other.ratingKey, sectionId, title }, { signal: ctx.signal })
    if (!removed.ok) failStep(ctx, key, "deleteExtra", removed.code)
    else if (removed.data.guarded) {
      logger.warn("cleanup.collection_guard", { key, ratingKey: other.ratingKey, reason: removed.data.reason })
      ctx.errors.push("GUARD")
    } else if (!removed.data.gone) ctx.counts.deleted++
  }
  const createdAt = new Date().toISOString()
  if (adopt) {
    await dress(ctx, key, sectionId, adopt.ratingKey)
    return { ratingKey: adopt.ratingKey, title, createdAt, members: adopt.members }
  }
  const created = await createPlexCollection(ctx.plex, { sectionId, level, title }, { signal: ctx.signal })
  if (!created.ok) return failWith(ctx, key, "create", created.code, null)
  await dress(ctx, key, sectionId, created.data.ratingKey)
  return { ratingKey: created.data.ratingKey, title, createdAt, members: [] }
}
