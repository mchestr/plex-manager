/**
 * The media cleanup settings row (`CleanupSettings`, one row with id
 * {@link CLEANUP_SETTINGS_ID}, TS 2.2 and E8): whether the feature is on or
 * paused, the hold date, the three claims, the admin options and the job
 * state. Server-only.
 *
 * {@link readCleanupSettingsRow} creates the row on its first read, so every
 * later writer (a claim, the E20 guard write, a pause) can match it with
 * `updateMany`. The options and the runtime come back parsed with their
 * defaults; a bad stored section falls back to its defaults and never throws.
 *
 * The admin page loader is `getCleanupSettings()` in
 * `lib/data/cleanup-settings.ts` (deviation D13). The functions here have no
 * React `cache`, so the worker and a request read the same way, as
 * `lib/inactivity/schedule.ts` reads the zone.
 *
 * @module lib/cleanup/settings
 */

import "server-only"

import type { CleanupSettings } from "@/lib/generated/prisma/client"
import { type CleanupRuntime, parseRuntime } from "@/lib/cleanup/schema/runtime"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { dayKey, normalizeTimeZone } from "@/lib/utils/zoned-time"
import { type CleanupOptions, cleanupOptionsSchema, parseCleanupOptions } from "@/lib/validations/cleanup-options"

/** The id of the one settings row. The claims and the E20 guard write match it. */
export const CLEANUP_SETTINGS_ID = "cleanup"

const ID = { id: CLEANUP_SETTINGS_ID }

/** The settings row with its `Json` columns parsed. */
export interface CleanupSettingsRow extends Omit<CleanupSettings, "options" | "runtime"> {
  options: CleanupOptions
  runtime: CleanupRuntime
}

/**
 * The settings row, created with the schema defaults (off, not paused, no
 * claims) on the first read. Pass a transaction client to read inside it.
 */
export async function readCleanupSettingsRow(db: PrismaTransactionClient = prisma): Promise<CleanupSettingsRow> {
  const row = (await db.cleanupSettings.findUnique({ where: ID })) ?? (await db.cleanupSettings.upsert({ where: ID, create: ID, update: {} }))
  return { ...row, options: parseCleanupOptions(row.options), runtime: parseRuntime(row.runtime) }
}

/** Whether runs may change Leaving soon and delete: the feature is on and not paused. */
export function isLive(settings: Pick<CleanupSettings, "enabled" | "pausedAt">): boolean {
  return settings.enabled && settings.pausedAt === null
}

/**
 * Stores the admin options with `actorId` as `updatedBy`, and returns them
 * parsed. The values are checked with `cleanupOptionsSchema` first, so a bad
 * merge never reaches the row. `updateCleanupSettings` calls it inside its
 * Serializable transaction (TS 10.3).
 *
 * @throws A `ZodError` when `values` are not valid options.
 */
export async function writeOptions(
  values: CleanupOptions,
  actorId: string,
  db: PrismaTransactionClient = prisma
): Promise<CleanupOptions> {
  const options = cleanupOptionsSchema.parse(values)
  await db.cleanupSettings.upsert({
    where: ID,
    create: { ...ID, options, updatedBy: actorId },
    update: { options, updatedBy: actorId },
  })
  return options
}

/** The server zone: `Config.timezone`, else `TZ`, else UTC. No React `cache`: read once per call. */
export async function serverZone(): Promise<string> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
  return normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
}

/** The day key (`YYYY-MM-DD`) of `now` in the server zone, or in `zone` when given. */
export async function today(now: Date = new Date(), zone?: string): Promise<string> {
  return dayKey(now.getTime(), zone ?? (await serverZone()))
}
