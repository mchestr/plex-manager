"use server"

/**
 * Hiding a title from the member's Rewind, and bringing it back (P7.7,
 * FR-7, design 9.3).
 *
 * ```
 * hide / unhide
 *   ├─ Zod: { year, ratingKey (the poster route's regex), kind: film | series }
 *   ├─ ownership: hide needs the key in the member's own completed Rewind
 *   │   (ratingKeysIn); unhide needs the member's own RewindExclusion
 *   ├─ Redis (FR-50): down ─► the infra error, nothing written
 *   ├─ consume('rw:hide', userId): 20 a day, no entitlement (FR-51: a privacy action)
 *   ├─ one $transaction: create or delete the RewindExclusion, bump RewindPrefs.exclusionsVersion
 *   ├─ REWIND_GENERATE_USER: kind member, copyPolicy no-llm, dedup rewind:hide:{year}:{userId},
 *   │   a 5 s delay, no rw:gen point
 *   └─ audit REWIND_TITLE_HIDDEN / REWIND_TITLE_UNHIDDEN: key and kind, never the title
 * ```
 *
 * The share projection reads the exclusions per request and the version is
 * part of the card cache key, so a hidden title leaves every card, the share
 * page and the OG card at once; the in-app lists follow the regeneration.
 * The title is copied from the member's own page data for the unhide list,
 * and is never projected.
 *
 * @module actions/rewind-exclusions
 */

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { enqueueRewindGeneration } from "@/lib/rewind/enqueue-generation"
import { rewindInfraMessage, type RewindInfraCode } from "@/lib/rewind/infra-copy"
import { ratingKeysIn } from "@/lib/rewind/rating-keys"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { ratingKeySchema } from "@/lib/validations/params"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"

const logger = createLogger("REWIND_EXCLUSIONS")

const input = z.strictObject({ year: yearSchema, ratingKey: ratingKeySchema, kind: z.enum(["film", "series"]) })

type ExclusionResult = ActionResult<{ regenerating: boolean }, ActionErrorCode | RewindInfraCode>

const NOT_IN_REWIND = "That title is not in your Rewind"
const LIMITED = "You have hidden or brought back a lot of titles today. Try again tomorrow."
const MAX_TITLE = 200

/** The member's completed v3 Rewind of `year`, or null. */
async function completedRewind(userId: string, year: number) {
  const row = await prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, status: true, data: true } })
  if (!row || readWrappedStatus(row.status, row.id) !== "completed") return null
  const stored = parseStoredRewind(row.data)
  return stored.version === 3 ? stored.data : null
}

/** Redis, then the day's limit; null when both allow the change. */
async function gate(userId: string) {
  const infra = await checkRewindInfra()
  if (!infra.ok) return { success: false as const, code: infra.code, error: rewindInfraMessage(infra.code, "member") }
  const limit = await consume("rw:hide", userId)
  return limit.ok ? null : fail("RATE_LIMITED", LIMITED, { retryAfterSec: limit.retryAfterSec })
}

/**
 * A hide applies to the member in every year (`RewindExclusion` is keyed by
 * user and title), so every year's card cache key moves. A year without a
 * prefs row reads version 0 and would keep its cached cards, so each year
 * the member has a Rewind for gets a row first, then every row is bumped.
 */
async function bumpVersion(tx: PrismaTransactionClient, userId: string, year: number) {
  const rewinds = await tx.plexWrapped.findMany({ where: { userId }, select: { year: true } })
  const years = [...new Set([year, ...rewinds.map((row) => row.year)])]
  await tx.rewindPrefs.createMany({ data: years.map((y) => ({ userId, year: y, exclusionsVersion: 0 })), skipDuplicates: true })
  await tx.rewindPrefs.updateMany({ where: { userId }, data: { exclusionsVersion: { increment: 1 } } })
}

/** The no-LLM regeneration; a failed add is logged, since the change already holds on every card. */
async function regenerate(userId: string, year: number): Promise<boolean> {
  try {
    await enqueueRewindGeneration({ userId, year, kind: "member", exclusion: {} })
    return true
  } catch (error) {
    logger.error("Could not enqueue the exclusion regeneration", error, { userId, year })
    return false
  }
}

/** Hides a title in the member's Rewind from every card at once and from the lists after a regeneration. */
export const hideRewindTitle = memberAction({
  input,
  fallbackError: "Could not hide that title",
  handler: async ({ year, ratingKey, kind }, { userId }): Promise<ExclusionResult> => {
    const rewind = await completedRewind(userId, year)
    const title = rewind ? ratingKeysIn(rewind).get(ratingKey) : undefined
    if (!rewind || title === undefined) return fail("NOT_FOUND", NOT_IN_REWIND)
    // Already hidden: nothing to write, regenerate or spend a point on
    const existing = await prisma.rewindExclusion.findUnique({ where: { userId_ratingKey: { userId, ratingKey } }, select: { id: true } })
    if (existing) return ok({ regenerating: false })

    const blocked = await gate(userId)
    if (blocked) return blocked

    await prisma.$transaction(async (tx) => {
      await tx.rewindExclusion.upsert({
        where: { userId_ratingKey: { userId, ratingKey } },
        create: { userId, ratingKey, kind, title: title.slice(0, MAX_TITLE) },
        update: {},
      })
      await bumpVersion(tx, userId, year)
    })
    const regenerating = await regenerate(userId, year)
    logAuditEvent(AuditEventType.REWIND_TITLE_HIDDEN, userId, { year, ratingKey, kind })
    return ok({ regenerating })
  },
})

/** Brings a hidden title back: it returns to the cards at once and to the lists after a regeneration. */
export const unhideRewindTitle = memberAction({
  input,
  fallbackError: "Could not bring that title back",
  handler: async ({ year, ratingKey, kind }, { userId }): Promise<ExclusionResult> => {
    const exclusion = await prisma.rewindExclusion.findUnique({ where: { userId_ratingKey: { userId, ratingKey } }, select: { id: true } })
    if (!exclusion) return fail("NOT_FOUND", "That title is not hidden")

    const blocked = await gate(userId)
    if (blocked) return blocked

    await prisma.$transaction(async (tx) => {
      await tx.rewindExclusion.deleteMany({ where: { userId, ratingKey } })
      await bumpVersion(tx, userId, year)
    })
    const regenerating = (await completedRewind(userId, year)) !== null && (await regenerate(userId, year))
    logAuditEvent(AuditEventType.REWIND_TITLE_UNHIDDEN, userId, { year, ratingKey, kind })
    return ok({ regenerating })
  },
})
