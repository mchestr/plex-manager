import { z } from "zod"

import { isWallTime } from "@/lib/utils/zoned-time"
import { recordIdSchema } from "@/lib/validations/params"

/**
 * An announcement's fields as the admin form sends them (P10.5), with no
 * defaults: `expiresAt` is a `datetime-local` value read as wall time in the
 * server zone; empty means it never expires.
 */
const announcementFields = z.object({
  title: z.string().trim().min(1, "Add a title").max(200, "Keep the title to 200 characters"),
  content: z.string().trim().min(1, "Add the announcement text").max(5000, "Keep the text to 5,000 characters"),
  priority: z.number().int().min(0).max(100, "Priority is a whole number from 0 to 100"),
  isActive: z.boolean(),
  expiresAt: z
    .union([z.literal(""), z.string().refine(isWallTime, { message: "Enter a date and time" })])
    .nullish()
    .transform((value) => value || null),
})

/** A new announcement: priority 0 and shown, unless the form says otherwise. */
export const announcementSchema = announcementFields.extend({
  priority: announcementFields.shape.priority.default(0),
  isActive: announcementFields.shape.isActive.default(true),
})

/**
 * An edit (DUP-11): the same fields with no defaults, so a missing field is a
 * `VALIDATION` failure rather than a silent reset to priority 0 or shown.
 */
export const announcementUpdateSchema = announcementFields.extend({ id: recordIdSchema })
