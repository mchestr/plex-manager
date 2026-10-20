"use server"

/**
 * Rewind generation requests (P2.17). Generation runs as a
 * `REWIND_GENERATE_USER` job (`lib/queue/jobs/rewind.ts`); these actions only
 * check, enqueue and report status, and return at once.
 */

import { z } from "zod"

import { getWrappedSettings } from "@/actions/admin"
import { adminAction, memberAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionErrorCode, type ActionFailure, type ActionResult } from "@/lib/actions/result"
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

/** The action codes plus the Rewind refusal and infrastructure codes the UI branches on. */
type RewindCode = ActionErrorCode | GenerationRefusalCode | RewindInfraCode

type RewindRequestResult = ActionResult<{ alreadyQueued: boolean }, RewindCode>

type Audience = "admin" | "member"

function refused(code: GenerationRefusalCode, retryAfterSec?: number): ActionFailure<RewindCode> {
  return { success: false, code, error: refusalCopy(code, retryAfterSec), ...(retryAfterSec && { retryAfterSec }) }
}

function unavailable(code: RewindInfraCode, audience: Audience): ActionFailure<RewindCode> {
  return { success: false, code, error: rewindInfraMessage(code, audience) }
}

const BLOCKER_COPY = {
  NO_PLEX_SERVER: "No active Plex server configured",
  NO_TAUTULLI: "No active Tautulli server configured",
} as const

const DISABLED = "Wrapped generation is currently disabled"

const onlySeasonYear = (wrappedYear: number) => fail("VALIDATION", `Rewind is only available for ${wrappedYear}`)

/**
 * The checks both actions share once the caller is allowed to ask: the
 * member's Plex identity, configuration and Tautulli match (FR-48), then Redis
 * (FR-50). Each costs no point and writes nothing.
 */
async function preflight(user: { id: string; plexUserId: string | null }, audience: Audience) {
  const blocker = await generationBlocker(user)
  if (blocker === "REWIND_NOT_ELIGIBLE") return refused(blocker)
  if (blocker) return fail("NOT_FOUND", BLOCKER_COPY[blocker])
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
 * No member UI calls it since P6.9: the home RewindCard offers no generate
 * action, and the season fan-out makes every issue. It stays, with its
 * limits, until it is decided whether members may ask for one.
 *
 * @public
 *
 * Checks, in order: the session and entitlement (`NOT_ENTITLED`, the action
 * helper's `full`); `{ year }`; the season window for members (admins
 * whenever the feature is on); `year` is the season year; only admins regenerate a completed Rewind; a run already
 * queued answers `alreadyQueued`; the Plex identity, configuration and
 * Tautulli match (`REWIND_NOT_ELIGIBLE`); Redis (FR-50); then, for members,
 * the `rw:gen` limits (`RATE_LIMITED`). Deduplication refunds the points.
 */
export const requestRewindGeneration = memberAction({
  entitlement: "full",
  input: z.object({ year: yearSchema }),
  fallbackError: "Failed to start your Rewind",
  handler: async ({ year }, { session, userId }): Promise<RewindRequestResult> => {
    const isAdmin = session.user.isAdmin
    const audience: Audience = isAdmin ? "admin" : "member"

    const { wrappedEnabled, featureEnabled, wrappedYear } = await getWrappedSettings()
    if (!wrappedEnabled && !(isAdmin && featureEnabled)) return fail("CONFLICT", DISABLED)
    if (year !== wrappedYear) return onlySeasonYear(wrappedYear)

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUserId: true } })
    if (!user) return fail("NOT_FOUND", "User not found")

    const wrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId, year } },
      select: { status: true },
    })
    if (wrapped?.status === "completed" && !isAdmin) {
      return fail("FORBIDDEN", "Only admins can regenerate wrapped data")
    }
    if (await hasActiveGeneration(userId, year)) return ok({ alreadyQueued: true })

    const blocked = await preflight(user, audience)
    if (blocked) return blocked

    if (!isAdmin) {
      const limit = await consumeGenerationPoints(userId)
      if (!limit.ok) return refused("RATE_LIMITED", limit.retryAfterSec)
    }
    const queued = await enqueue(userId, year, isAdmin ? "admin" : "member")
    if (!isAdmin && (!queued || queued.alreadyQueued)) await refundGenerationPoints(userId)
    if (!queued) return unavailable("REDIS_UNAVAILABLE", audience)
    return ok({ alreadyQueued: queued.alreadyQueued })
  },
})

/**
 * Regenerates a member's Rewind for the season year, for an admin. It ignores
 * the season window and the member limits, and writes an audit entry. The
 * current Rewind and its share links stay live until the new one lands (FR-40).
 */
export const adminRegenerateRewind = adminAction({
  input: z.object({ userId: userIdSchema, year: yearSchema }),
  fallbackError: "Failed to regenerate the Rewind",
  handler: async ({ userId, year }, { userId: adminId }): Promise<RewindRequestResult> => {
    const { featureEnabled, wrappedYear } = await getWrappedSettings()
    if (!featureEnabled) return fail("CONFLICT", DISABLED)
    if (year !== wrappedYear) return onlySeasonYear(wrappedYear)

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUserId: true } })
    if (!user) return fail("NOT_FOUND", "User not found")

    const blocked = await preflight(user, "admin")
    if (blocked) return blocked

    const queued = await enqueue(userId, year, "admin")
    if (!queued) return unavailable("REDIS_UNAVAILABLE", "admin")
    logAuditEvent(AuditEventType.REWIND_REGENERATE_REQUESTED, adminId, {
      targetUserId: userId,
      year,
      alreadyQueued: queued.alreadyQueued,
    })
    return ok({ alreadyQueued: queued.alreadyQueued })
  },
})

/**
 * The status the Rewind UI polls (BP-22): status columns only, never `data`.
 * A member reads their own; an admin may pass `userId` to read a member's.
 */
export const getRewindStatus = memberAction({
  input: z.object({ year: yearSchema, userId: userIdSchema.optional() }),
  fallbackError: "Failed to load the Rewind status",
  handler: async (input, { session, userId: sessionUserId }): Promise<ActionResult<RewindStatus>> => {
    const userId = input.userId ?? sessionUserId
    if (userId !== sessionUserId && !session.user.isAdmin) return fail("FORBIDDEN", "Admins only.")
    const { year } = input

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
    return ok(await deriveRewindStatus({ wrapped, latest, infra: checkRewindInfra }))
  },
})
