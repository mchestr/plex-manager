"use server"

/**
 * View tracking for the success measures (design 1.4, 7.10, P7.14).
 *
 * One `RewindView` row per open of a Rewind, keyed by `(wrappedId,
 * sessionKey)`: the stage makes the key with `crypto.randomUUID()` when the
 * story opens and keeps it in memory only. The row holds the furthest page
 * reached and share actions counted by kind, and nothing about the viewer:
 * no IP address, user agent or referer.
 *
 * @module actions/rewind-views
 */

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"

const SHARE_ACTIONS = ["image", "save", "link"] as const
type ShareAction = (typeof SHARE_ACTIONS)[number]

const ShareCountsSchema = z.record(z.string(), z.number().int().nonnegative()).catch({})

const recordViewSchema = z.strictObject({
  wrappedId: z.string().min(1).max(64),
  sessionKey: z.uuid(),
  /** 1-based folio of the page reached. */
  page: z.number().int().min(1).max(64),
  shareAction: z.enum(SHARE_ACTIONS).optional(),
})

const counted = (stored: unknown, kind: ShareAction) => {
  const counts = ShareCountsSchema.parse(stored)
  return { ...counts, [kind]: (counts[kind] ?? 0) + 1 }
}

/**
 * Records that the member reached `page` in this open, and a share action
 * when one is passed. The first call of an open creates the row; later ones
 * raise `furthestPage` (never lower it) and add to `shareActions[kind]`. The
 * Rewind must be the member's own and completed.
 */
export const recordRewindView = memberAction({
  entitlement: "read",
  input: recordViewSchema,
  fallbackError: "Could not record the view",
  handler: async ({ wrappedId, sessionKey, page, shareAction }, { userId }) => {
    const rewind = await prisma.plexWrapped.findFirst({
      where: { id: wrappedId, userId, status: "completed" },
      select: { edition: true },
    })
    if (!rewind) return fail("NOT_FOUND", "That Rewind was not found")

    const created = await prisma.rewindView.createMany({
      data: [{ wrappedId, sessionKey, edition: rewind.edition ?? "full", furthestPage: page, shareActions: shareAction ? { [shareAction]: 1 } : {} }],
      skipDuplicates: true,
    })
    if (created.count > 0) return ok(null)

    const key = { wrappedId_sessionKey: { wrappedId, sessionKey } }
    await prisma.rewindView.updateMany({ where: { wrappedId, sessionKey, furthestPage: { lt: page } }, data: { furthestPage: page } })
    if (shareAction) {
      await prisma.$transaction(async (tx) => {
        const view = await tx.rewindView.findUniqueOrThrow({ where: key, select: { shareActions: true } })
        await tx.rewindView.update({ where: key, data: { shareActions: counted(view.shareActions, shareAction) } })
      })
    }
    return ok(null)
  },
})
