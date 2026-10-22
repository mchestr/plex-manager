/**
 * Season reads for the admin Rewind console and settings (P11.5, BP-06):
 * server-only and admin-checked next to the data.
 *
 * @module lib/data/rewind-season
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { yearSchema } from "@/lib/validations/shared-schemas"

/** When the newest aggregate for `year` was computed, as an ISO string, or null (admin only). */
export async function getRewindSeasonDataPreparedAt(year: number): Promise<string | null> {
  await assertAdmin()
  const parsed = yearSchema.safeParse(year)
  if (!parsed.success) return null
  const latest = await prisma.rewindServerAggregate.findFirst({
    where: { year: parsed.data },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  })
  return latest?.computedAt.toISOString() ?? null
}
