/**
 * The admin Privacy section's read (P11.14): when the daily retention sweep
 * last finished. Server-only and admin-checked.
 *
 * @module lib/data/retention
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

/** The last complete sweep's finish time, or null before the first (admin only). */
export async function getLastRetentionRun(): Promise<Date | null> {
  await assertAdmin()
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { lastRetentionRunAt: true } })
  return config?.lastRetentionRunAt ?? null
}
