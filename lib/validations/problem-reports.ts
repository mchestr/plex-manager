import { z } from "zod"

import { PROBLEM_CODES } from "@/lib/problem-reports/taxonomy"
import { ratingKeySchema } from "@/lib/validations/params"

export const PROBLEM_NOTE_MAX = 500

/**
 * A member's note, which the server admin reads and Discord may echo: format
 * characters (bidi controls, zero-width spaces) dropped, other control
 * characters except line breaks as spaces, trimmed, at most 500 characters;
 * blank is null.
 */
const problemNoteSchema = z
  .string()
  .max(PROBLEM_NOTE_MAX * 4)
  .transform((value) =>
    value
      .replace(/\r\n?/g, "\n")
      .replace(/\p{Cf}/gu, "")
      .replace(/[^\P{Cc}\n]/gu, " ")
      .trim()
  )
  .pipe(z.string().max(PROBLEM_NOTE_MAX))
  .optional()
  .transform((value) => value || null)

const problemCodeSchema = z.enum(PROBLEM_CODES)

export const problemReportIdSchema = z.string().min(1).max(100)

/** The answers to "Does anything else play on {player}?". */
const DEVICE_ANSWERS = ["others_play", "nothing_plays", "not_tried"] as const
export type DeviceAnswer = (typeof DEVICE_ANSWERS)[number]

/** `reportProblem`'s input. */
export const reportProblemInputSchema = z.object({
  ratingKey: ratingKeySchema,
  problem: problemCodeSchema,
  note: problemNoteSchema,
  device: z.enum(DEVICE_ANSWERS).optional(),
})

/** A `CLOSED` event's data: why the report closed. */
export const closedEventDataSchema = z.object({ reason: z.enum(["cancelled"]) })

/** `/report`'s search parameters: a title search, and the title whose sheet is open. */
export const reportSearchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  item: ratingKeySchema.optional().catch(undefined),
})
