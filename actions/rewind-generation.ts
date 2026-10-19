"use server"

/**
 * Rewind generation requests (P2.17). Generation runs as a
 * `REWIND_GENERATE_USER` job (`lib/queue/jobs/rewind.ts`); these actions only
 * check, enqueue and report status, and return at once.
 */

import { getServerSession } from "next-auth"
import { z } from "zod"

import { getWrappedSettings } from "@/actions/admin"
import { getAccessGateStatus } from "@/lib/access"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { enqueueRewindGeneration, type RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import {
  consumeGenerationPoints,
  generationBlocker,
  hasActiveGeneration,
  refundGenerationPoints,
} from "@/lib/rewind/generation-guards"
import { rewindInfraMessage, type RewindInfraCode } from "@/lib/rewind/infra-copy"
import { deriveRewindStatus, type RewindStatus } from "@/lib/rewind/rewind-status"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { type GenerationRefusalCode, refusalCopy } from "@/lib/wrapped/generation-errors"

const logger = createLogger("REWIND_GENERATION")

export type RewindRequestResult =
  | { success: true; alreadyQueued: boolean }
  | { success: false; error: string; code?: GenerationRefusalCode | RewindInfraCode; retryAfterSec?: number }

type Audience = "admin" | "member"

function refused(code: GenerationRefusalCode, retryAfterSec?: number): RewindRequestResult {
  return { success: false, code, error: refusalCopy(code, retryAfterSec), ...(retryAfterSec && { retryAfterSec }) }
}

function unavailable(code: RewindInfraCode, audience: Audience): RewindRequestResult {
  return { success: false, code, error: rewindInfraMessage(code, audience) }
}

const BLOCKER_COPY = {
  NO_PLEX_SERVER: "No active Plex server configured",
  NO_TAUTULLI: "No active Tautulli server configured",
} as const

/**
 * The checks both actions share once the caller is allowed to ask: the
 * member's Plex identity, configuration and Tautulli match (FR-48), then Redis
 * (FR-50). Each costs no point and writes nothing.
 */
async function preflight(user: { id: string; plexUserId: string | null }, audience: Audience) {
  const blocker = await generationBlocker(user)
  if (blocker === "REWIND_NOT_ELIGIBLE") return refused(blocker)
  if (blocker) return { success: false, error: BLOCKER_COPY[blocker] } as const
  const infra = await checkRewindInfra()
  return infra.ok ? null : unavailable(infra.code, audience)
}

/** Enqueues the run; a failed add reports Redis as down. */
async function enqueue(userId: string, year: number, kind: RewindGenerationKind) {
  try {
    return await enqueueRewindGeneration({ userId, year, kind })
  } catch (error) {
    logger.error("Could not enqueue a Rewind generation", error, { userId, year })
    return null
  }
}

/**
 * Asks for the signed-in member's Rewind for the season year.
 *
 * Checks, in order: the session; the season window for members (admins
 * whenever the feature is on); `year` is the season year; entitlement
 * (`NOT_ENTITLED`); only admins regenerate a completed Rewind; a run already
 * queued answers `alreadyQueued`; the Plex identity, configuration and
 * Tautulli match (`REWIND_NOT_ELIGIBLE`); Redis (FR-50); then, for members,
 * the `rw:gen` limits (`RATE_LIMITED`). Deduplication refunds the points.
 */
export async function requestRewindGeneration(input: { year: number }): Promise<RewindRequestResult> {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id?.trim()
    if (!session || !userId) return { success: false, error: "Unauthorized" }
    const isAdmin = session.user.isAdmin
    const audience: Audience = isAdmin ? "admin" : "member"

    const { wrappedEnabled, featureEnabled, wrappedYear } = await getWrappedSettings()
    if (!wrappedEnabled && !(isAdmin && featureEnabled)) {
      return { success: false, error: "Wrapped generation is currently disabled" }
    }
    const parsed = z
      .object({ year: z.literal(wrappedYear, { error: `Rewind is only available for ${wrappedYear}` }) })
      .safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid parameters" }
    const { year } = parsed.data

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUserId: true } })
    if (!user) return { success: false, error: "User not found" }
    if (!(await getAccessGateStatus(userId))) return refused("NOT_ENTITLED")

    const wrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId, year } },
      select: { status: true },
    })
    if (wrapped?.status === "completed" && !isAdmin) {
      return { success: false, error: "Only admins can regenerate wrapped data" }
    }
    if (await hasActiveGeneration(userId, year)) return { success: true, alreadyQueued: true }

    const blocked = await preflight(user, audience)
    if (blocked) return blocked

    if (!isAdmin) {
      const limit = await consumeGenerationPoints(userId)
      if (!limit.ok) return refused("RATE_LIMITED", limit.retryAfterSec)
    }
    const queued = await enqueue(userId, year, isAdmin ? "admin" : "member")
    if (!isAdmin && (!queued || queued.alreadyQueued)) await refundGenerationPoints(userId)
    if (!queued) return unavailable("REDIS_UNAVAILABLE", audience)
    return { success: true, alreadyQueued: queued.alreadyQueued }
  } catch (error) {
    logger.error("Error requesting a Rewind generation", error)
    return { success: false, error: "Failed to start your Rewind" }
  }
}

/**
 * Regenerates a member's Rewind for the season year, for an admin. It ignores
 * the season window and the member limits, and writes an audit entry. The
 * current Rewind and its share links stay live until the new one lands (FR-40).
 */
export async function adminRegenerateRewind(input: { userId: string; year: number }): Promise<RewindRequestResult> {
  try {
    const session = await getServerSession(authOptions)
    const adminId = session?.user?.id
    if (!session || !adminId || !session.user.isAdmin) return { success: false, error: "Unauthorized" }

    const { featureEnabled, wrappedYear } = await getWrappedSettings()
    if (!featureEnabled) return { success: false, error: "Wrapped generation is currently disabled" }
    const parsed = z
      .object({
        userId: userIdSchema,
        year: z.literal(wrappedYear, { error: `Rewind is only available for ${wrappedYear}` }),
      })
      .safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid parameters" }
    const { userId, year } = parsed.data

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUserId: true } })
    if (!user) return { success: false, error: "User not found" }

    const blocked = await preflight(user, "admin")
    if (blocked) return blocked

    const queued = await enqueue(userId, year, "admin")
    if (!queued) return unavailable("REDIS_UNAVAILABLE", "admin")
    logAuditEvent(AuditEventType.REWIND_REGENERATE_REQUESTED, adminId, {
      targetUserId: userId,
      year,
      alreadyQueued: queued.alreadyQueued,
    })
    return { success: true, alreadyQueued: queued.alreadyQueued }
  } catch (error) {
    logger.error("Error regenerating a Rewind", error)
    return { success: false, error: "Failed to regenerate the Rewind" }
  }
}

/**
 * The status the Rewind UI polls (BP-22): status columns only, never `data`.
 * A member reads their own; an admin may pass `userId` to read a member's.
 */
export async function getRewindStatus(input: {
  year: number
  userId?: string
}): Promise<RewindStatus | { error: string }> {
  const session = await getServerSession(authOptions)
  const sessionUserId = session?.user?.id
  if (!session || !sessionUserId) return { error: "Unauthorized" }

  const parsed = z.object({ year: yearSchema, userId: userIdSchema.optional() }).safeParse(input)
  if (!parsed.success) return { error: "Invalid parameters" }
  const userId = parsed.data.userId ?? sessionUserId
  if (userId !== sessionUserId && !session.user.isAdmin) return { error: "Unauthorized" }
  const { year } = parsed.data

  const [wrapped, latest] = await Promise.all([
    prisma.plexWrapped.findUnique({
      where: { userId_year: { userId, year } },
      select: { status: true, error: true },
    }),
    prisma.rewindGeneration.findFirst({
      where: { userId, year, status: { not: "skipped" } },
      orderBy: { createdAt: "desc" },
      select: { status: true, error: true, startedAt: true },
    }),
  ])
  return deriveRewindStatus({ wrapped, latest, infra: checkRewindInfra })
}
