"use server"

import { z } from "zod"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { enqueueServerAggregate } from "@/lib/queue/rewind-batch-queue"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { batchWindowAt, throughFor } from "@/lib/wrapped/aggregate/window"

const logger = createLogger("REWIND_SEASON")

const yearSchema = z.object({ year: z.number().int().min(2000).max(2100) })

export type PrepareSeasonDataResult =
  | { success: true; alreadyQueued: boolean; through: string }
  | { success: false; error: string }

/**
 * Queues the server-wide aggregate for `year` (admin only, audit-logged),
 * which queues the metadata warm when it finishes. The batch covers the
 * season's data (through 30 November) until the year has ended in the server
 * zone, and the full year after. A press while a run for the same batch is
 * waiting or running joins it.
 */
export async function prepareRewindSeasonData(input: { year: number }): Promise<PrepareSeasonDataResult> {
  const session = await requireAdmin()
  const parsed = yearSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid year" }
  const { year } = parsed.data

  const infra = await checkRewindInfra()
  if (!infra.ok) return { success: false, error: rewindInfraMessage(infra.code, "admin") }

  try {
    const through = throughFor(year, batchWindowAt(year, await serverZone(), Date.now()))
    const { jobId, alreadyQueued } = await enqueueServerAggregate({ year, through })
    logAuditEvent(AuditEventType.REWIND_SEASON_DATA_PREPARED, session.user.id, { year, through, jobId, alreadyQueued })
    return { success: true, alreadyQueued, through }
  } catch (error) {
    logger.error("Could not queue the Rewind server aggregate", error, { year })
    return { success: false, error: rewindInfraMessage("REDIS_UNAVAILABLE", "admin") }
  }
}

/** When the newest aggregate for `year` was computed, as an ISO string, or null (admin only). */
export async function getRewindSeasonDataPreparedAt(year: number): Promise<string | null> {
  await requireAdmin()
  const parsed = yearSchema.safeParse({ year })
  if (!parsed.success) return null
  const latest = await prisma.rewindServerAggregate.findFirst({
    where: { year: parsed.data.year },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  })
  return latest?.computedAt.toISOString() ?? null
}
