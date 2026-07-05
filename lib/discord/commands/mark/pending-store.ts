/**
 * DB-backed store for pending media-mark selections.
 *
 * ## Why
 *
 * When a `!mark`/slash search returns multiple matches we present a chooser and
 * park the candidate results until the user picks one. This previously lived in
 * an in-memory `Map` with a `setInterval` sweeper (see the legacy
 * `pendingSelections` in `lib/discord/commands/media-marking.ts`), which does
 * not survive a restart and does not work across multiple bot pods.
 *
 * This store persists selections in the `DiscordPendingSelection` table and
 * cleans up expired rows opportunistically on read — the same pattern used by
 * `DiscordOAuthState`. There is no timer.
 *
 * The Step 12 slash + component flow routes a component interaction back to its
 * pending selection via the Discord component `custom_id`, so {@link findByCustomId}
 * is the primary lookup.
 */

import { prisma } from "@/lib/prisma"
import { type MarkType } from "@/lib/generated/prisma/client"
import { type PlexMediaItem } from "@/lib/connections/plex"
import { type Prisma } from "@/lib/generated/prisma/client"

/** How long a parked selection remains valid before it is swept. */
export const PENDING_SELECTION_TTL_MS = 5 * 60 * 1000

export interface CreatePendingSelectionParams {
  discordUserId: string
  channelId: string
  /** Discord component `custom_id` used to route the select-menu response. */
  customId: string
  markType: MarkType
  /** Candidate Plex items the user is choosing between. */
  results: PlexMediaItem[]
  /** Absolute expiry; defaults to now + {@link PENDING_SELECTION_TTL_MS}. */
  expiresAt?: Date
}

/**
 * A stored pending selection. `results` is persisted as JSON but is always the
 * {@link PlexMediaItem}[] that was written.
 */
export interface PendingSelectionRecord {
  id: string
  discordUserId: string
  channelId: string
  customId: string
  markType: MarkType
  results: PlexMediaItem[]
  createdAt: Date
  expiresAt: Date
}

/**
 * Deletes every expired pending selection. Called opportunistically on read so
 * the table self-cleans without a background timer.
 *
 * @param now - Current time (injectable for tests). Defaults to `new Date()`.
 * @returns The number of rows removed.
 */
export async function gcExpired(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.discordPendingSelection.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return count
}

/**
 * Persists a new pending selection, first sweeping any expired rows.
 */
export async function createPendingSelection(
  params: CreatePendingSelectionParams
): Promise<PendingSelectionRecord> {
  const now = new Date()
  const expiresAt = params.expiresAt ?? new Date(now.getTime() + PENDING_SELECTION_TTL_MS)

  await gcExpired(now)

  const created = await prisma.discordPendingSelection.create({
    data: {
      discordUserId: params.discordUserId,
      channelId: params.channelId,
      customId: params.customId,
      markType: params.markType,
      results: params.results as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  })

  return toRecord(created)
}

/**
 * Looks up a pending selection by its Discord component `custom_id`, sweeping
 * expired rows first. Returns `null` when there is no live match (including when
 * the matched row was itself expired and swept).
 */
export async function findByCustomId(customId: string): Promise<PendingSelectionRecord | null> {
  await gcExpired()

  const found = await prisma.discordPendingSelection.findUnique({
    where: { customId },
  })

  return found ? toRecord(found) : null
}

/**
 * Deletes a pending selection by primary key (called after a selection is
 * consumed). Safe to call for an already-deleted row.
 */
export async function deleteById(id: string): Promise<void> {
  await prisma.discordPendingSelection.deleteMany({ where: { id } })
}

/**
 * Maps a persisted row (with `results` as JSON) to a {@link PendingSelectionRecord}.
 * @internal
 */
function toRecord(row: {
  id: string
  discordUserId: string
  channelId: string
  customId: string
  markType: MarkType
  results: unknown
  createdAt: Date
  expiresAt: Date
}): PendingSelectionRecord {
  return {
    id: row.id,
    discordUserId: row.discordUserId,
    channelId: row.channelId,
    customId: row.customId,
    markType: row.markType,
    results: row.results as PlexMediaItem[],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }
}
