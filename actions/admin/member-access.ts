"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { inviterApplicationId, revokeInviterAfter } from "@/lib/affiliates/end-status"
import { type ActionErrorCode, type ActionResult, fail, ok } from "@/lib/actions/result"
import { eraseMember, type EraseCode, type EraseReport } from "@/lib/members/erase"
import { prisma } from "@/lib/prisma"
import { revokeInviterSchema } from "@/lib/validations/affiliates"
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
 * and the refusals. `block` also blocks their Plex account from affiliate
 * invites, in the removal's transaction; `revokeInviter` revokes the status of
 * the affiliate who invited them, once the removal succeeded; `inviterRevoked`
 * says how that went (`true`, `false` when it failed, `null` when not asked or
 * nothing to revoke).
 *
 * @param input - `{ userId, confirmName, block?, revokeInviter? }`
 */
export const removeMember = adminAction({
  input: z.object({
    userId: userIdSchema,
    confirmName: z.string().max(200),
    block: z.boolean().optional(),
    revokeInviter: revokeInviterSchema,
  }),
  rateLimit: { name: "admin:remove-member" },
  fallbackError: "Could not remove the member",
  handler: async (
    { userId, confirmName, block, revokeInviter },
    { userId: actorId }
  ): Promise<ActionResult<EraseReport & { inviterRevoked: boolean | null }, RemoveMemberCode>> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    if (!user) return fail("NOT_FOUND", "That member no longer exists.")
    const displayName = user.name ?? user.email ?? "Unknown member"
    if (confirmName.trim().toLowerCase() !== displayName.toLowerCase()) {
      return fail("VALIDATION", "Type the member's name exactly to confirm.", {
        fieldErrors: { confirmName: ["The name doesn't match"] },
      })
    }

    // Read before the removal, which clears the join record
    const inviter = revokeInviter ? await inviterApplicationId(userId) : null
    const result = await eraseMember(userId, { actorId, dryRun: false, block })
    if (!result.success) return result
    const inviterRevoked = await revokeInviterAfter(inviter, { reason: revokeInviter?.reason ?? null, actorId })
    revalidatePath("/admin/users")
    return ok({ ...result.data, inviterRevoked })
  },
})
