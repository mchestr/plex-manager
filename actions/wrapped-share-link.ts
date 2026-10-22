"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { forgetShareToken } from "@/lib/wrapped/poster-keys"
import { yearSchema } from "@/lib/validations/shared-schemas"

const shareLinkInputSchema = z.object({ year: yearSchema }, { error: "Invalid year" })

function revalidateSharePaths() {
  revalidatePath("/rewind", "layout")
  revalidatePath("/")
}

/**
 * Turns off the public v2 share link for the signed-in member's own Rewind.
 * The old URL returns 404 at once, its posters stop being served by this
 * process, and caches may keep its card and posters for at most 5 minutes.
 * No code mints a v2 token any more (P7.13 deleted `enableWrappedShareLink`;
 * v3 links are `RewindShare` rows), so a stopped link never comes back.
 *
 * It works whatever the row's status, so a member can
 * withdraw a link while an admin regenerates their Rewind or after a failed
 * regeneration. Owners of v2 links minted before sharing became opt-in use it
 * too (design 6.2).
 *
 * It is not rate-limited. It only ever clears the caller's own token, so
 * refusing it would only keep a public link alive.
 *
 * @param input - `{ year }` of the member's Rewind.
 * @returns success (also when no link was on), or a failure.
 */
export const disableWrappedShareLink = memberAction({
  input: shareLinkInputSchema,
  fallbackError: "Failed to stop sharing",
  handler: async ({ year }, { userId }) => {
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { userId_year: { userId, year } },
      select: { id: true, shareToken: true },
    })
    if (!wrapped) {
      return fail("NOT_FOUND", "No Rewind found for this year")
    }

    if (wrapped.shareToken) {
      await prisma.plexWrapped.update({
        where: { id: wrapped.id },
        data: { shareToken: null },
      })
      forgetShareToken(wrapped.shareToken)
      logAuditEvent(AuditEventType.SHARE_LINK_REVOKED, userId, {
        wrappedId: wrapped.id,
        year,
      })
    }

    revalidateSharePaths()
    return ok(null)
  },
})
