/**
 * One Leaving soon collection of one round (TS 8.10 steps 3 and 4).
 * Server-only.
 *
 * - Nothing wanted (step 3): a stored collection is deleted only through
 *   `deletePlexCollectionGuarded`. A guard hit forgets the key, deletes
 *   nothing and logs `cleanup.collection_guard`. A 404 counts as done.
 * - Something wanted (step 4): the stored collection is read first. A 404
 *   adds a `collectionRemoved` notice and the collection is made again. An
 *   answer that is not this section's plain collection forgets the key with
 *   no notice (safety-r2-11). Then the members, the order and the hub follow
 *   the plans of `plan.ts`.
 * - Any other failure stops this collection, keeps what is known in the
 *   runtime, and sets `lastSync.ok = false`.
 *
 * @module lib/cleanup/collections/collection
 */

import "server-only"

import { adoptOrCreate, type FoundCollection } from "@/lib/cleanup/collections/adopt"
import { failStep, failWith, isGone, logger, type SyncContext } from "@/lib/cleanup/collections/context"
import { type HubFlags, hubPlan, memberPlan, movePlan, parseCollectionKey } from "@/lib/cleanup/collections/plan"
import type { RuntimeCollection } from "@/lib/cleanup/schema/runtime"
import {
  addPlexCollectionItems,
  collectionGuardFailure,
  createPlexCollectionHub,
  deletePlexCollectionGuarded,
  getPlexCollection,
  getPlexCollectionHub,
  movePlexCollectionItem,
  removePlexCollectionItem,
  updatePlexCollectionHub,
} from "@/lib/connections/plex-collections"
import { listPlexCollectionItems } from "@/lib/connections/plex-library-read"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const NO_HUB: HubFlags = { ownHome: false, sharedHome: false, recommended: false }

/** Step 3.1: delete a stored collection that nothing wants. */
async function removeStored(ctx: SyncContext, key: string, sectionId: string, stored: RuntimeCollection): Promise<void> {
  const result = await deletePlexCollectionGuarded(ctx.plex, { ratingKey: stored.ratingKey, sectionId, title: stored.title }, { signal: ctx.signal })
  if (!result.ok) return failStep(ctx, key, "delete", result.code)
  if (result.data.guarded) {
    logger.warn("cleanup.collection_guard", { key, ratingKey: stored.ratingKey, reason: result.data.reason })
    ctx.errors.push("GUARD")
  } else if (!result.data.gone) ctx.counts.deleted++
  delete ctx.collections[key]
}

/** Step 4.1, then 4.2: the stored collection while it is still ours, else an adopted or new one. */
async function locate(ctx: SyncContext, key: string, sectionId: string, level: Level, stored: RuntimeCollection | null) {
  if (stored) {
    const got = await getPlexCollection(ctx.plex, stored.ratingKey, { signal: ctx.signal })
    if (!got.ok) return failWith(ctx, key, "get", got.code, null)
    if (got.data === null) {
      ctx.notices.push({ kind: "collectionRemoved", key, title: stored.title, sectionId, detectedAt: new Date().toISOString(), recreatedAt: null })
    } else {
      const reason = collectionGuardFailure(got.data, { ratingKey: stored.ratingKey, sectionId })
      if (reason === null) return { ratingKey: stored.ratingKey, title: stored.title, createdAt: stored.createdAt, members: null }
      logger.warn("cleanup.collection_guard", { key, ratingKey: stored.ratingKey, reason })
    }
    delete ctx.collections[key]
  }
  return adoptOrCreate(ctx, key, sectionId, level)
}

/** Step 4.8: the hub flags after the sync. A failed hub call keeps the collection, with `errorCode: "HUB"`. */
async function syncHub(ctx: SyncContext, key: string, sectionId: string, ratingKey: string, before: HubFlags): Promise<HubFlags> {
  const opts = { signal: ctx.signal }
  const current = await getPlexCollectionHub(ctx.plex, sectionId, ratingKey, opts)
  if (!current.ok) return failWith(ctx, key, "hub", "HUB", before)
  const plan = hubPlan(current.data, ctx.hub)
  if (plan === null) return ctx.hub
  const sent = current.data === null
    ? await createPlexCollectionHub(ctx.plex, sectionId, ratingKey, ctx.hub, opts)
    : await updatePlexCollectionHub(ctx.plex, sectionId, current.data.identifier, ctx.hub, opts)
  if (sent.ok) return ctx.hub
  failStep(ctx, key, "hub", "HUB")
  return current.data ?? NO_HUB
}

/** Steps 4.4 to 4.7. Returns the members as they stand, and whether every call worked. */
async function fill(ctx: SyncContext, key: string, found: FoundCollection, wanted: readonly string[]): Promise<{ members: string[]; ok: boolean }> {
  const opts = { signal: ctx.signal }
  let members = found.members
  if (members === null) {
    const read = await listPlexCollectionItems(ctx.plex, found.ratingKey, opts)
    if (!read.ok) return failWith(ctx, key, "members", read.code, { members: [], ok: false })
    members = read.data.map((item) => item.ratingKey)
  }
  const { remove, add } = memberPlan(members, wanted)
  for (const item of remove) {
    const removed = await removePlexCollectionItem(ctx.plex, found.ratingKey, item, opts)
    if (!removed.ok && !isGone(removed)) return failWith(ctx, key, "remove", removed.code, { members, ok: false })
    members = members.filter((member) => member !== item)
    if (removed.ok) ctx.counts.removed++
  }
  if (add.length > 0) {
    const { machineIdentifier } = ctx.plex
    if (!machineIdentifier) return failWith(ctx, key, "add", "NO_MACHINE_ID", { members, ok: false })
    const added = await addPlexCollectionItems({ ...ctx.plex, machineIdentifier }, found.ratingKey, add, opts)
    if (!added.ok) return failWith(ctx, key, "add", added.code, { members, ok: false })
    ctx.counts.added += add.length
    const read = await listPlexCollectionItems(ctx.plex, found.ratingKey, opts)
    if (!read.ok) return failWith(ctx, key, "members", read.code, { members: [...members, ...add], ok: false })
    members = read.data.map((item) => item.ratingKey)
  }
  for (const move of movePlan(members, wanted)) {
    const moved = await movePlexCollectionItem(ctx.plex, found.ratingKey, move.key, move.after, opts)
    if (!moved.ok) return failWith(ctx, key, "move", moved.code, { members, ok: false })
    ctx.counts.moved++
  }
  return { members: [...wanted], ok: true }
}

/**
 * Syncs the collection of `key` (`"<sectionId>:<level>"`) to `wanted`, the
 * rating keys in order. Updates `ctx.collections`, `ctx.notices`, the counts
 * and the errors. Never throws for an upstream failure.
 */
export async function syncCollection(ctx: SyncContext, key: string, wanted: readonly string[]): Promise<void> {
  const parsed = parseCollectionKey(key)
  const stored = ctx.collections[key] ?? null
  if (!parsed) {
    logger.warn("cleanup.collection_key_invalid", { key })
    delete ctx.collections[key]
    return
  }
  if (wanted.length === 0) return stored ? removeStored(ctx, key, parsed.sectionId, stored) : undefined
  const found = await locate(ctx, key, parsed.sectionId, parsed.level, stored)
  if (!found) return
  const kept = stored?.ratingKey === found.ratingKey ? stored : null
  const { members, ok } = await fill(ctx, key, found, wanted)
  const hub = ok ? await syncHub(ctx, key, parsed.sectionId, found.ratingKey, kept?.hub ?? NO_HUB) : (kept?.hub ?? NO_HUB)
  ctx.collections[key] = {
    ratingKey: found.ratingKey, title: found.title, createdAt: found.createdAt, lastSyncAt: new Date().toISOString(), count: members.length, hub,
  }
}
