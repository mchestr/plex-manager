"use server"

/**
 * "Notify me" on a Rewind that is still generating (design 9.7, P7.14).
 *
 * @module actions/rewind-notify
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { yearSchema } from "@/lib/validations/shared-schemas"

/**
 * Turns on `RewindPrefs.notify` for the member's own Rewind of `year`, the
 * field `/account`'s switch writes. The year must have a Rewind row of
 * theirs, so a request for another year changes nothing.
 */
export const notifyWhenRewindReady = memberAction({
  input: z.strictObject({ year: yearSchema }),
  fallbackError: "Could not turn on the notification",
  handler: async ({ year }, { userId }) => {
    const rewind = await prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true } })
    if (!rewind) return fail("NOT_FOUND", "There is no Rewind for that year")

    await prisma.rewindPrefs.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, notify: true },
      update: { notify: true },
    })
    revalidatePath("/account")
    return ok({ notify: true })
  },
})
