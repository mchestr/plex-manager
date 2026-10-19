"use server"

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { getBaseUrl } from "@/lib/env"
import { generateShareToken } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { forgetShareToken } from "@/lib/wrapped/poster-keys"
import { yearSchema } from "@/lib/validations/shared-schemas"

const logger = createLogger("WRAPPED_SHARE_LINK")

const shareLinkInputSchema = z.object({ year: yearSchema })

export type EnableWrappedShareLinkResult =
  | { success: true; shareToken: string; url: string }
  | { success: false; error: string }

export type DisableWrappedShareLinkResult = { success: true } | { success: false; error: string }

type ShareActionCaller = { ok: true; userId: string; year: number } | { ok: false; error: string }

/**
 * The checks both share actions run first: Zod input and a signed-in session.
 *
 * @internal
 */
async function authorizeShareAction(input: unknown): Promise<ShareActionCaller> {
  const parsed = shareLinkInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid year" }
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" }
  }

  return { ok: true, userId: session.user.id, year: parsed.data.year }
}

function revalidateSharePaths() {
  revalidatePath("/wrapped")
  revalidatePath("/")
}

/**
 * Turns on the public share link for the signed-in member's own completed
 * Rewind and returns its URL.
 *
 * This is the only code path that mints a `PlexWrapped.shareToken` (SEC-16;
 * `__tests__/config/share-token-writers.test.ts` enforces it). Generation and
 * the admin playground never create one, so a link exists only after the
 * member asks for it.
 *
 * ## Idempotence
 *
 * An existing token is returned unchanged. A new one is written with a
 * conditional update (`shareToken: null` in the filter), so two concurrent
 * calls cannot replace each other's token: the one that loses reads back the
 * winner's.
 *
 * Every call spends a point of the `rw:share-actions` limit (ten an hour per
 * member, keyed `rw:share-actions:<userId>`). Only this action is charged:
 * stopping a link is never refused (see {@link disableWrappedShareLink}).
 *
 * @param input - `{ year }` of the member's Rewind.
 * @returns `{ success: true, shareToken, url }`, or `{ success: false, error }`.
 */
export async function enableWrappedShareLink(input: { year: number }): Promise<EnableWrappedShareLinkResult> {
  const caller = await authorizeShareAction(input)
  if (!caller.ok) {
    return { success: false, error: caller.error }
  }

  if (!(await consume("rw:share-actions", caller.userId)).ok) {
    return { success: false, error: "Too many share links created. Please try again later." }
  }

  try {
    // getBaseUrl() throws when no app URL is configured. Resolving it before
    // the write means that failure cannot leave a live link the member was
    // told was not created.
    const baseUrl = getBaseUrl()

    const wrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId: caller.userId, year: caller.year } },
      select: { id: true, status: true, shareToken: true },
    })
    if (!wrapped || wrapped.status !== "completed") {
      return { success: false, error: "Your Rewind for this year is not ready to share" }
    }

    let shareToken = wrapped.shareToken
    if (!shareToken) {
      const minted = generateShareToken()
      const { count } = await prisma.plexWrapped.updateMany({
        where: { id: wrapped.id, shareToken: null },
        data: { shareToken: minted },
      })
      if (count === 1) {
        shareToken = minted
        logAuditEvent(AuditEventType.SHARE_LINK_CREATED, caller.userId, {
          wrappedId: wrapped.id,
          year: caller.year,
        })
      } else {
        const current = await prisma.plexWrapped.findUnique({
          where: { id: wrapped.id },
          select: { shareToken: true },
        })
        shareToken = current?.shareToken ?? null
      }
    }

    if (!shareToken) {
      return { success: false, error: "Failed to create share link" }
    }

    revalidateSharePaths()
    return { success: true, shareToken, url: `${baseUrl}/wrapped/share/${shareToken}` }
  } catch (error) {
    logger.error("Error creating share link", error, { userId: caller.userId, year: caller.year })
    return { success: false, error: "Failed to create share link" }
  }
}

/**
 * Turns off the public share link for the signed-in member's own Rewind. The
 * old URL returns 404 at once, its posters stop being served by this process,
 * and caches may keep its card and posters for at most 5 minutes. A later
 * {@link enableWrappedShareLink} mints a new token rather than reviving it.
 *
 * Unlike enabling, this works whatever the row's status, so a member can
 * withdraw a link while an admin regenerates their Rewind or after a failed
 * regeneration. Owners of v2 links minted before sharing became opt-in use it
 * too (design 6.2).
 *
 * It is not rate-limited. It only ever clears the caller's own token, and each
 * token it clears took a counted enable or predates opt-in, so refusing it
 * would only keep a public link alive.
 *
 * @param input - `{ year }` of the member's Rewind.
 * @returns `{ success: true }` (also when no link was on), or `{ success: false, error }`.
 */
export async function disableWrappedShareLink(input: { year: number }): Promise<DisableWrappedShareLinkResult> {
  const caller = await authorizeShareAction(input)
  if (!caller.ok) {
    return { success: false, error: caller.error }
  }

  try {
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId: caller.userId, year: caller.year } },
      select: { id: true, shareToken: true },
    })
    if (!wrapped) {
      return { success: false, error: "No Rewind found for this year" }
    }

    if (wrapped.shareToken) {
      await prisma.plexWrapped.update({
        where: { id: wrapped.id },
        data: { shareToken: null },
      })
      forgetShareToken(wrapped.shareToken)
      logAuditEvent(AuditEventType.SHARE_LINK_REVOKED, caller.userId, {
        wrappedId: wrapped.id,
        year: caller.year,
      })
    }

    revalidateSharePaths()
    return { success: true }
  } catch (error) {
    logger.error("Error stopping share link", error, { userId: caller.userId, year: caller.year })
    return { success: false, error: "Failed to stop sharing" }
  }
}
