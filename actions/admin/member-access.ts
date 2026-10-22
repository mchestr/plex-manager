"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail } from "@/lib/actions/result"
import { eraseMember, type EraseCode, type EraseReport } from "@/lib/members/erase"
import { prisma } from "@/lib/prisma"
import { userIdSchema } from "@/lib/validations/shared-schemas"

type RemoveMemberCode = ActionErrorCode | EraseCode

/**
 * What removing a member would do (admin only): `eraseMember`'s dry run, with
 * the external effects it plans and the rows it would delete or anonymise.
 * Writes nothing. The remove dialog lists it before the admin confirms.
 *
 * @param input - `{ userId }`
 */
export const previewMemberRemoval = adminAction({
  input: z.object({ userId: userIdSchema }),
  fallbackError: "Could not count the member's data",
  handler: async ({ userId }, { userId: actorId }): Promise<ActionResult<EraseReport, RemoveMemberCode>> =>
    eraseMember(userId, { actorId, dryRun: true }),
})

/**
 * Removes a member and their data (admin only, audited as `MEMBER_ERASED`;
 * P11.13, GAP-31). `confirmName` must be the member's display name, typed
 * (case and outer spaces ignored), or the action refuses with `VALIDATION`.
 * Limited to 10 per hour per admin. See `lib/members/erase.ts` for the order
 * and the refusals.
 *
 * @param input - `{ userId, confirmName }`
 */
export const removeMember = adminAction({
  input: z.object({ userId: userIdSchema, confirmName: z.string().max(200) }),
  rateLimit: { name: "admin:remove-member" },
  fallbackError: "Could not remove the member",
  handler: async ({ userId, confirmName }, { userId: actorId }): Promise<ActionResult<EraseReport, RemoveMemberCode>> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    if (!user) return fail("NOT_FOUND", "That member no longer exists.")
    const displayName = user.name ?? user.email ?? "Unknown member"
    if (confirmName.trim().toLowerCase() !== displayName.toLowerCase()) {
      return fail("VALIDATION", "Type the member's name exactly to confirm.", {
        fieldErrors: { confirmName: ["The name doesn't match"] },
      })
    }

    const result = await eraseMember(userId, { actorId, dryRun: false })
    if (result.success) {
      revalidatePath("/admin/users")
    }
    return result
  },
})
