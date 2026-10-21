import { z } from "zod"

import { isWallTime } from "@/lib/utils/zoned-time"

/**
 * An announcement as the admin form sends it (P10.5), shared by the actions
 * and the dialog. `expiresAt` is a `datetime-local` value read as wall time
 * in the server zone; empty means it never expires.
 */
export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(200, "Keep the title to 200 characters"),
  content: z.string().trim().min(1, "Add the announcement text").max(5000, "Keep the text to 5,000 characters"),
  priority: z.number().int().min(0).max(100, "Priority is a whole number from 0 to 100").default(0),
  isActive: z.boolean().default(true),
  expiresAt: z
    .union([z.literal(""), z.string().refine(isWallTime, { message: "Enter a date and time" })])
    .nullish()
    .transform((value) => value || null),
})
